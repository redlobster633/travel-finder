// Finds a few public articles about a city and reads their text.
// The TikTok Agent Search engine only searches TikTok, and a general website
// engine is a paid Enterprise feature that still cannot search the open web.
// Search uses Tavily's free keyless API (or TAVILY_API_KEY when set). The city
// guide comes from the public Wikivoyage API. Pages are fetched directly, with
// a timeout, a size cap, and robots.txt.

import { lookup } from "node:dns/promises";
import {
  articleTextFromHtml,
  canonicalSourceUrl,
  isArticleUrl,
  isBlockedAddress,
  pickVoyageTitle,
  robotsAllows,
  selectArticleUrls,
  siteNameFromUrl,
  voyageGuideText,
  wikiPageUrl,
  type ArticlePage,
} from "./web-articles";

const USER_AGENT = "TravelFinder/0.1 (+https://travel-finder-ten.vercel.app; hobby travel guide)";
const MAX_ARTICLES = 3;
const MAX_CANDIDATES = 5;
const MAX_HTML_BYTES = 500_000;
const MIN_TEXT = 400;
const GUIDE_TEXT = 4500;

const publicHosts = new Map<string, boolean>();

export async function gatherArticlePages(city: string, query: string): Promise<ArticlePage[]> {
  const [urls, voyage] = await Promise.all([searchWeb(query), readVoyage(city)]);
  const voyageUrl = voyage ? canonicalSourceUrl(voyage.url) : null;
  const candidates = urls.filter((url) => canonicalSourceUrl(url) !== voyageUrl).slice(0, MAX_CANDIDATES);
  const robots = new Map<string, Promise<string | null>>();
  const read = await Promise.all(candidates.map((url) => readOne(url, robots)));
  const pages = read.filter((page): page is ArticlePage => !!page).slice(0, MAX_ARTICLES);
  if (voyage) pages.push(voyage);
  return pages;
}

async function searchWeb(query: string): Promise<string[]> {
  const key = process.env.TAVILY_API_KEY?.trim() ?? "";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;
  else headers["X-Tavily-Access-Mode"] = "keyless";

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
      body: JSON.stringify({
        query,
        max_results: MAX_CANDIDATES,
        search_depth: "basic",
        include_answer: false,
      }),
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return [];
    }
    const data = (await res.json()) as { results?: { url?: unknown }[] };
    const urls = (data.results ?? []).map((item) => (typeof item?.url === "string" ? item.url : ""));
    return selectArticleUrls(urls, MAX_CANDIDATES);
  } catch (err) {
    console.error(redact(err instanceof Error ? err.message : String(err), key));
    return [];
  }
}

async function readVoyage(city: string): Promise<ArticlePage | null> {
  try {
    const searchUrl = wikiEndpoint("en.wikivoyage.org");
    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("list", "search");
    searchUrl.searchParams.set("srsearch", city);
    searchUrl.searchParams.set("srlimit", "5");
    const searched = await wikiGet(searchUrl);
    const titles = wikiSearchTitles(searched);
    const title = pickVoyageTitle(city, titles);
    if (!title) return null;

    const pageUrl = wikiEndpoint("en.wikivoyage.org");
    pageUrl.searchParams.set("action", "query");
    pageUrl.searchParams.set("redirects", "1");
    pageUrl.searchParams.set("prop", "revisions");
    pageUrl.searchParams.set("rvprop", "content");
    pageUrl.searchParams.set("rvslots", "main");
    pageUrl.searchParams.set("titles", title);
    const loaded = await wikiGet(pageUrl);
    const page = firstWikiPage(loaded);
    if (!page?.title || page.missing != null) return null;
    const wikitext = revisionText(page);
    if (!wikitext || /\{\{\s*disambig/i.test(wikitext)) return null;
    const text = voyageGuideText(wikitext, GUIDE_TEXT);
    if (text.length < MIN_TEXT) return null;
    return { url: wikiPageUrl(page.title), site: "Wikivoyage", text };
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function readOne(url: string, robots: Map<string, Promise<string | null>>): Promise<ArticlePage | null> {
  try {
    if (wikiApiTitle(url)) return await readWikiExtract(url);
    return await readHtmlArticle(url, robots);
  } catch {
    return null;
  }
}

async function readWikiExtract(pageUrl: string): Promise<ArticlePage | null> {
  const info = wikiApiTitle(pageUrl);
  if (!info) return null;
  if (!(await hostIsPublic(new URL(info.api).hostname))) return null;
  const endpoint = new URL(info.api);
  endpoint.searchParams.set("action", "query");
  endpoint.searchParams.set("prop", "extracts");
  endpoint.searchParams.set("explaintext", "1");
  endpoint.searchParams.set("exchars", String(GUIDE_TEXT));
  endpoint.searchParams.set("redirects", "1");
  endpoint.searchParams.set("titles", info.title);
  const data = await wikiGet(endpoint);
  const page = firstWikiPage(data);
  const text = typeof page?.extract === "string" ? page.extract.trim().slice(0, GUIDE_TEXT) : "";
  if (!page?.title || text.length < MIN_TEXT) return null;
  return { url: wikiPageUrl(page.title, new URL(info.api).hostname), site: info.site, text };
}

async function readHtmlArticle(startUrl: string, robots: Map<string, Promise<string | null>>): Promise<ArticlePage | null> {
  let current = startUrl;
  const seen = new Set<string>();
  for (let hop = 0; hop < 4; hop++) {
    let url: URL;
    try {
      url = new URL(current);
    } catch {
      return null;
    }
    // Compare the exact request URL. A slash redirect is not a loop, and the
    // canonical source URL drops that slash later.
    if (seen.has(url.href)) return null;
    seen.add(url.href);
    if (!isArticleUrl(url.href)) return null;
    const canonical = canonicalSourceUrl(url.href);
    if (!canonical) return null;
    if (!(await hostIsPublic(url.hostname))) return null;
    if (!(await robotsAllow(url, robots))) return null;

    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en",
        "User-Agent": USER_AGENT,
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!location) return null;
      current = new URL(location, current).href;
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    const type = res.headers.get("content-type") ?? "";
    if (type && !/text\/html|application\/xhtml\+xml/i.test(type)) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    const advertised = Number(res.headers.get("content-length"));
    if (Number.isFinite(advertised) && advertised > 2_000_000) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    const html = await readLimited(res, MAX_HTML_BYTES);
    const text = articleTextFromHtml(html, GUIDE_TEXT);
    if (text.length < MIN_TEXT) return null;
    return { url: canonical, site: siteNameFromUrl(canonical), text };
  }
  return null;
}

async function robotsAllow(url: URL, cache: Map<string, Promise<string | null>>): Promise<boolean> {
  let pending = cache.get(url.origin);
  if (!pending) {
    pending = loadRobots(url.origin);
    cache.set(url.origin, pending);
  }
  const body = await pending;
  if (body == null) return true;
  return robotsAllows(body, `${url.pathname}${url.search}`, USER_AGENT);
}

async function loadRobots(origin: string): Promise<string | null> {
  try {
    const originUrl = new URL(origin);
    if (!(await hostIsPublic(originUrl.hostname))) return "";
    const res = await fetch(new URL("/robots.txt", origin), {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
      headers: { Accept: "text/plain", "User-Agent": USER_AGENT },
    });
    if (res.status === 404 || res.status === 410) {
      await res.body?.cancel().catch(() => {});
      return "";
    }
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => {});
      return "";
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    return await readLimited(res, 100_000);
  } catch {
    return null;
  }
}

async function hostIsPublic(hostname: string): Promise<boolean> {
  const host = hostname.toLowerCase().replace(/\.+$/, "").replace(/^\[|\]$/g, "");
  if (!host) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return !isBlockedAddress(host);
  const cached = publicHosts.get(host);
  if (cached !== undefined) return cached;
  if (publicHosts.size > 200) publicHosts.clear();
  try {
    const records = await lookup(host, { all: true, verbatim: true });
    const ok = records.length > 0 && records.every((record) => !isBlockedAddress(record.address));
    if (ok) publicHosts.set(host, true);
    return ok;
  } catch {
    return false;
  }
}

function wikiEndpoint(host: string): URL {
  const url = new URL(`https://${host}/w/api.php`);
  url.searchParams.set("format", "json");
  return url;
}

async function wikiGet(url: URL): Promise<unknown> {
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`Wikimedia ${res.status}`);
  }
  return res.json();
}

function wikiSearchTitles(data: unknown): string[] {
  const search = (data as { query?: { search?: { title?: unknown }[] } })?.query?.search ?? [];
  return search.map((item) => (typeof item?.title === "string" ? item.title : "")).filter(Boolean);
}

type WikiPage = {
  title?: string;
  missing?: unknown;
  extract?: unknown;
  revisions?: { slots?: { main?: { "*"?: string; content?: string } } }[];
};

function firstWikiPage(data: unknown): WikiPage | null {
  const pages = (data as { query?: { pages?: Record<string, WikiPage> } })?.query?.pages;
  if (!pages) return null;
  return Object.values(pages)[0] ?? null;
}

function revisionText(page: WikiPage): string {
  const slot = page.revisions?.[0]?.slots?.main;
  if (!slot) return "";
  if (typeof slot["*"] === "string") return slot["*"];
  return typeof slot.content === "string" ? slot.content : "";
}

function wikiApiTitle(pageUrl: string): { api: string; title: string; site: string } | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const voyage = host === "wikivoyage.org" || host.endsWith(".wikivoyage.org");
  const wikipedia = host === "wikipedia.org" || host.endsWith(".wikipedia.org");
  if (!voyage && !wikipedia) return null;
  if (!url.pathname.startsWith("/wiki/")) return null;
  let raw = "";
  try {
    raw = decodeURIComponent(url.pathname.slice("/wiki/".length));
  } catch {
    return null;
  }
  if (!raw || raw.includes(":") || raw.toLowerCase().startsWith("special")) return null;
  return {
    api: `https://${host}/w/api.php`,
    title: raw.replace(/_/g, " "),
    site: voyage ? "Wikivoyage" : "Wikipedia",
  };
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return (await res.text()).slice(0, maxBytes);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      const room = maxBytes - total;
      if (value.byteLength > room) {
        chunks.push(value.subarray(0, room));
        total += room;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(out);
}

function redact(message: string, secret: string): string {
  if (!secret) return message;
  return message.split(secret).join("[redacted]");
}
