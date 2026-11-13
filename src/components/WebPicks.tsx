import type { WebPick } from "@/lib/web-articles";

function safePicks(value: unknown): WebPick[] {
  if (!Array.isArray(value)) return [];
  const picks: WebPick[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (record.category !== "food" && record.category !== "things to do") continue;
    if (typeof record.name !== "string" || !record.name.trim()) continue;
    if (typeof record.why !== "string" || !record.why.trim()) continue;
    if (typeof record.sourceUrl !== "string" || !/^https?:\/\//i.test(record.sourceUrl)) continue;
    const sourceName = typeof record.sourceName === "string" ? record.sourceName.trim() : "";
    const key = `${record.category}:${record.name.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picks.push({
      name: record.name.trim(),
      why: record.why.trim(),
      category: record.category,
      area: typeof record.area === "string" && record.area.trim() ? record.area.trim() : null,
      priceHint: typeof record.priceHint === "string" && record.priceHint.trim() ? record.priceHint.trim() : null,
      sourceUrl: record.sourceUrl,
      sourceName: sourceName || "Source",
    });
  }
  return picks;
}

function PickCard({ pick }: { pick: WebPick }) {
  const details = [pick.area, pick.priceHint].filter((item): item is string => !!item);
  return (
    <article className="flex flex-col rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-stone-200">
      <h5 className="font-semibold leading-snug">{pick.name}</h5>
      <p className="mt-1 text-sm text-stone-600">{pick.why}</p>
      {details.length > 0 && <p className="mt-2 text-sm text-stone-500">{details.join(" · ")}</p>}
      <a
        href={pick.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block break-words text-sm font-medium text-orange-700 hover:underline"
      >
        {pick.sourceName}
      </a>
    </article>
  );
}

export default function WebPicks({ picks }: { picks: unknown }) {
  const safe = safePicks(picks);
  const groups = [
    { id: "things to do", title: "Things to do", items: safe.filter((pick) => pick.category === "things to do") },
    { id: "food", title: "Food", items: safe.filter((pick) => pick.category === "food") },
  ].filter((group) => group.items.length > 0);

  if (!groups.length) return null;

  return (
    <section className="mt-8">
      <h3 className="text-lg font-semibold">From around the web</h3>
      <p className="mt-1 text-sm text-stone-500">Ideas from travel articles, each with a link back to the source.</p>
      {groups.map((group) => (
        <div key={group.id} className="mt-4">
          <h4 className="font-medium text-stone-800">{group.title}</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((pick) => (
              <PickCard key={`${group.id}:${pick.name}`} pick={pick} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
