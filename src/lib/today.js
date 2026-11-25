// "Today" facts from the Today API (https://today-api.fcc.lol): odd holidays,
// events on this date, and plants in bloom. The display shows one per image.

const BASE = "https://today-api.fcc.lol";

// Fetch all three lists and flatten them to { label, value } facts,
// interleaved by kind so consecutive images show different kinds.
export async function fetchToday(fetchFn = fetch) {
  const get = (path) => fetchFn(`${BASE}/${path}`).then((r) => r.json()).catch(() => ({}));
  const [h, e, p] = await Promise.all([get("weird-holidays"), get("historical-events"), get("blooming-plants")]);
  const lists = [
    (h.holidays || []).filter((x) => x.name).map((x) => ({ label: "Today is", value: x.name })),
    (e.events || []).filter((x) => x.title && x.year).map((x) => ({ label: `On this day in ${x.year}`, value: x.title })),
    (p.plants || []).filter((x) => x.commonName).map((x) => ({ label: "In bloom now", value: x.commonName })),
  ];
  const facts = [];
  for (let i = 0; i < Math.max(...lists.map((l) => l.length)); i++) for (const l of lists) if (l[i]) facts.push(l[i]);
  return facts;
}

// The fact for a given 15-minute slot: steps through the list one per slot.
export const factFor = (facts, slotMs) => (facts?.length ? facts[Math.floor(slotMs / (15 * 60 * 1000)) % facts.length] : null);
