// Loads the type a visualization asks for. A piece lists Google Fonts families
// in css2 form ("Space Grotesk:wght@300..700", "Fraunces:ital,wght@0,400;1,400")
// or full stylesheet URLs, plus, optionally, `fontFaces`: CSS font shorthands to
// wait for that the family list does not imply. Every face named is loaded
// before the piece mounts, so the first frame (and anything drawn to a canvas
// once) is in the right type.

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The faces a css2 family spec names, as CSS font shorthands to load.
export function facesOf(spec) {
  const [name, rest] = spec.split(":");
  const family = name.replace(/\+/g, " ").trim();
  if (!rest || !rest.includes("@")) return [`400 16px "${family}"`];
  const [axesPart, valuesPart] = rest.split("@");
  const axes = axesPart.split(",");
  const iItal = axes.indexOf("ital");
  const iWght = axes.indexOf("wght");
  const out = new Set();
  for (const tuple of valuesPart.split(";")) {
    const v = tuple.split(",");
    const italic = iItal >= 0 && v[iItal] === "1";
    const weight = (iWght >= 0 ? v[iWght] : "400").split("..")[0] || "400";
    out.add(`${italic ? "italic " : ""}${weight} 16px "${family}"`);
  }
  return [...out];
}

const added = new Set();
function addSheet(href) {
  if (added.has(href)) return Promise.resolve();
  added.add(href);
  return new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = link.onerror = () => resolve();
    document.head.append(link);
  });
}

// Resolves when the piece's fonts are ready, or after `limit` ms if they are
// not (offline, or a slow font): the piece then starts in its fallback faces.
export async function loadFonts(mod, limit = 5000) {
  const list = Array.isArray(mod.fonts) ? mod.fonts.filter((f) => typeof f === "string" && f.trim()) : [];
  const families = list.filter((f) => !/^https?:\/\//.test(f));
  const sheets = list.filter((f) => /^https?:\/\//.test(f));
  if (families.length) {
    const q = families.map((f) => `family=${f.trim().replace(/ /g, "+")}`).join("&");
    sheets.push(`https://fonts.googleapis.com/css2?${q}&display=swap`);
  }
  if (!sheets.length) return;
  const faces = [...families.flatMap(facesOf), ...(Array.isArray(mod.fontFaces) ? mod.fontFaces : [])];
  const all = (async () => {
    await Promise.all(sheets.map(addSheet));
    await Promise.allSettled(faces.map((f) => document.fonts.load(f, "0123456789 AaBbQqRr:°")));
  })();
  await Promise.race([all, wait(limit)]);
}
