import assert from "node:assert/strict";
import { test } from "node:test";
import {
  articleTextFromHtml,
  buildWebPicksPrompt,
  canonicalSourceUrl,
  filterWebPicks,
  isArticleUrl,
  isBlockedAddress,
  nameAppearsInText,
  pickVoyageTitle,
  robotsAllows,
  selectArticleUrls,
  siteNameFromUrl,
  voyageGuideText,
  type ArticlePage,
} from "./web-articles.ts";

const UA = "TravelFinder/0.1 (+https://travel-finder-ten.vercel.app)";

const GUIDE = `==Get in==
Fly into the airport.
==See==
Visit [[Lisbon/Belém|Belém]] and the '''Belém Tower'''.
{{see
| name=Jerónimos Monastery
| content=A vast limestone monastery by the river.
}}
[[File:Tower.jpg|thumb|Belém Tower at sunset]]
==Sleep==
Stay somewhere quiet.
{{listing
| name=Secret Hotel
| type=sleep
| content=Do not show this hotel.
}}
==Eat==
Try the tarts in Belém.
{{listing
| name=Pastéis de Belém
| type=eat
| price=€2
| address=Belém
| content=The custard tarts everyone queues for.
}}
==Drink==
A small '''ginja''' bar in Alfama.
`;

test("wikivoyage text keeps see, eat, and drink and drops other sections", () => {
  const text = voyageGuideText(GUIDE);
  assert.match(text, /Belém Tower/);
  assert.match(text, /Jerónimos Monastery/);
  assert.match(text, /limestone monastery/);
  assert.match(text, /Pastéis de Belém/);
  assert.match(text, /Price: €2/);
  assert.match(text, /ginja/);
  assert.match(text, /Belém Tower at sunset/);
  assert.doesNotMatch(text, /Secret Hotel/);
  assert.doesNotMatch(text, /Fly into the airport/);
  assert.doesNotMatch(text, /Stay somewhere quiet/);
});

test("html extraction prefers the article and drops scripts", () => {
  const html = `<html><head><script>secretToken</script><style>.x{color:red}</style></head>
<body><nav>Navigation item that should not be the readable article body.</nav>
<article><h1>Pastéis de Belém</h1><p>Eat the custard tarts &amp; coffee near the river. This sentence is long enough to count as the article.</p></article>
</body></html>`;
  const text = articleTextFromHtml(html);
  assert.match(text, /Pastéis de Belém/);
  assert.match(text, /tarts & coffee/);
  assert.doesNotMatch(text, /secretToken/);
  assert.doesNotMatch(text, /Navigation item/);
  assert.equal(articleTextFromHtml(html, 12).length <= 12, true);
});

test("robots.txt allows a longer allow and a named crawler", () => {
  const shared = `User-agent: *
Disallow: /private
Allow: /private/ok`;
  assert.equal(robotsAllows(shared, "/private/secret", UA), false);
  assert.equal(robotsAllows(shared, "/private/ok/page", UA), true);
  assert.equal(robotsAllows(shared, "/guide", UA), true);
  assert.equal(robotsAllows("", "/anywhere", UA), true);
  assert.equal(robotsAllows("User-agent: *\nDisallow:", "/anywhere", UA), true);

  const named = `User-agent: travelfinder
Allow: /

User-agent: *
Disallow: /`;
  assert.equal(robotsAllows(named, "/secret", UA), true);
  assert.equal(robotsAllows(named, "/secret", "OtherBot/1.0"), false);
});

test("robots.txt blocks a whole site and pdf urls, and allows other paths", () => {
  assert.equal(robotsAllows("User-agent: *\nDisallow: /\n", "/guide", UA), false);
  const files = "User-agent: *\nDisallow: /*.pdf$\n";
  assert.equal(robotsAllows(files, "/guide.pdf", UA), false);
  assert.equal(robotsAllows(files, "/guide.pdf.html", UA), true);
  const squarespace = `User-agent: GPTBot
User-agent: *
Disallow: /search
Allow: /api/ui-extensions/`;
  assert.equal(robotsAllows(squarespace, "/top9thingstodoinlisbon", UA), true);
  assert.equal(robotsAllows(squarespace, "/search/foo", UA), false);
});

test("article urls skip private hosts, social sites, and duplicates", () => {
  assert.equal(isBlockedAddress("8.8.8.8"), false);
  assert.equal(isBlockedAddress("10.1.2.3"), true);
  assert.equal(isBlockedAddress("192.168.0.5"), true);
  assert.equal(isBlockedAddress("127.0.0.1"), true);
  assert.equal(isBlockedAddress("::1"), true);
  assert.equal(isBlockedAddress("::ffff:127.0.0.1"), true);
  assert.equal(isArticleUrl("http://127.0.0.1/place"), false);
  assert.equal(isArticleUrl("https://www.tiktok.com/video/1"), false);
  assert.equal(isArticleUrl("https://evil.example/file.pdf"), false);
  assert.equal(isArticleUrl("http://user:pass@example.com/a"), false);
  assert.equal(isArticleUrl("https://notes.example.com/lisbon"), true);
  assert.deepEqual(
    selectArticleUrls(
      [
        "https://Example.com/path/#top",
        "https://www.example.com/path",
        "https://www.tiktok.com/@chef",
        "https://notes.example.com/eat",
        "http://192.168.1.9/secret",
      ],
      5
    ),
    ["https://example.com/path", "https://notes.example.com/eat"]
  );
});

test("source names and wikivoyage titles stay specific", () => {
  assert.equal(canonicalSourceUrl("HTTPS://WWW.Example.com/path/"), "https://www.example.com/path");
  assert.equal(siteNameFromUrl("https://en.wikivoyage.org/wiki/Lisbon"), "Wikivoyage");
  assert.equal(siteNameFromUrl("https://www.foratravel.com/guides/lisbon"), "foratravel.com");
  assert.equal(pickVoyageTitle("Tokyo", ["Tokyo/Ueno", "Tokyo"]), "Tokyo");
  assert.equal(pickVoyageTitle("New York", ["Buffalo", "New York City"]), "New York City");
  assert.equal(pickVoyageTitle("York", ["New York"]), null);
  assert.equal(pickVoyageTitle("Paris", ["Paris (France)", "Paris"]), "Paris");
});

test("picks must cite a fetched page and a name that page actually uses", () => {
  const pages: ArticlePage[] = [
    {
      url: "https://example.com/lisbon",
      site: "example.com",
      text: "Welcome to Lisbon. Pastéis de Belém in Belém costs €2. Alfama is nearby.",
    },
    {
      url: "https://other.test/guide",
      site: "other.test",
      text: "Time Out Market is a food hall in Cais do Sodré.",
    },
  ];
  const picks = filterWebPicks(
    {
      picks: [
        {
          name: "Pastéis de Belém",
          why: "Queue for the tart.",
          category: "food",
          area: "Belém",
          priceHint: "€2",
          sourceUrl: "https://example.com/lisbon/",
        },
        {
          name: "Invented Place",
          why: "Not in the article.",
          category: "food",
          area: "",
          priceHint: "",
          sourceUrl: "https://example.com/lisbon",
        },
        {
          name: "Time Out Market",
          why: "Busy hall.",
          category: "food",
          area: "Alfama",
          priceHint: "€50",
          sourceUrl: "https://evil.example/not-fetched",
        },
        {
          name: "Lisbon",
          why: "The city itself.",
          category: "things to do",
          area: "",
          priceHint: "",
          sourceUrl: "https://example.com/lisbon",
        },
        {
          name: "Time Out Market",
          why: "A busy food hall.",
          category: "things to do",
          area: "Alfama",
          priceHint: "",
          sourceUrl: "https://other.test/guide",
        },
      ],
    },
    pages,
    "Lisbon"
  );
  assert.deepEqual(
    picks.map((pick) => pick.name),
    ["Pastéis de Belém", "Time Out Market"]
  );
  assert.equal(picks[0].sourceUrl, "https://example.com/lisbon");
  assert.equal(picks[0].sourceName, "example.com");
  assert.equal(picks[0].area, "Belém");
  assert.equal(picks[0].priceHint, "€2");
  assert.equal(picks[1].category, "things to do");
  assert.equal(picks[1].area, null);
  assert.equal(picks[1].priceHint, null);
  assert.equal(nameAppearsInText("Do", "do this and do that"), false);
});

test("the web prompt quotes only the fetched pages", () => {
  const pages: ArticlePage[] = [
    { url: "https://example.com/lisbon", site: "example.com", text: "Eat the tart in Belém." },
  ];
  const plain = buildWebPicksPrompt("Lisbon", pages, "");
  assert.match(plain, /Never invent a place or a source/);
  assert.match(plain, /URL: https:\/\/example.com\/lisbon/);
  assert.match(plain, /Eat the tart in Belém/);
  assert.doesNotMatch(plain, /Dietary restrictions/);
  const noted = buildWebPicksPrompt("Lisbon", pages, "Dietary restrictions (every food pick must fit all of them): Vegan.");
  assert.match(noted, /Vegan/);
  assert.doesNotMatch(noted, /https:\/\/evil\.example/);
});
