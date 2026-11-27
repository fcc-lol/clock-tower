// "Today" facts from the Today API (https://today-api.fcc.lol): odd holidays,
// events on this date, and plants in bloom. The display shows one per slot.

const BASE = "https://today-api.fcc.lol";
const TIMEOUT_MS = 20000;

const items = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
const text = (v) => (typeof v === "string" ? v.trim() : "");

// Fetch all three lists and flatten them to { label, value, day } facts,
// interleaved by kind so consecutive slots show different kinds. `day` is the
// date the API says they are for ("November 27"), so they are never shown on
// another day. If one list fails and a full set for the same day is already
// held (`prev`), this rejects and the caller keeps that set.
export async function fetchToday(fetchFn = fetch, prev = null) {
  let failed = 0;
  const get = (path) =>
    fetchFn(`${BASE}/${path}`, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) })
      .then((r) => r.json())
      .then((j) => (j && typeof j === "object" ? j : Promise.reject(new Error("bad response"))))
      .catch(() => {
        failed++;
        return {};
      });
  const [h, e, p] = await Promise.all([get("weird-holidays"), get("historical-events"), get("blooming-plants")]);
  const day = [h, e, p].map((x) => text(x.date)).find(Boolean) || null;
  if (failed && Array.isArray(prev) && prev.length && prev[0]?.day === day) throw new Error("today incomplete");
  const lists = [
    items(h.holidays).filter((x) => text(x.name)).map((x) => ({ label: "Today is", value: text(x.name), day })),
    items(e.events).filter((x) => text(x.title) && x.year != null).map((x) => ({ label: `On this day in ${x.year}`, value: text(x.title), day })),
    items(p.plants).filter((x) => text(x.commonName)).map((x) => ({ label: "In bloom now", value: text(x.commonName), day })),
  ];
  const facts = [];
  for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++) for (const l of lists) if (l[i]) facts.push(l[i]);
  return facts;
}

// The fact for a given 15-minute slot: steps through the list one per slot.
export const factFor = (facts, slotMs) => (facts?.length ? facts[Math.floor(slotMs / (15 * 60 * 1000)) % facts.length] : null);
