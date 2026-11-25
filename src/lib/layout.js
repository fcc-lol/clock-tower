// The readout "layout": how the time, date and weather are set on top of a
// backdrop. Shared by the server (which asks Claude to design one per image,
// see layout.js) and the display (which renders it, see App.jsx).
//
// A layout is a small plain object:
//   display_font, body_font   keys of FONTS (time/temperature, everything else)
//   time_weight, body_weight  "light" | "regular" | "bold"
//   time_size                 px on the 1080x1920 stage (shrunk to fit if too wide)
//   uppercase, italic         booleans
//   tracking                  "tight" | "normal" | "wide"
//   align                     "left" | "center" | "right"
//   arrangement               "stack_top" | "stack_center" | "stack_bottom" | "split"
//   stats                     "grid" | "row"
//   ink, accent               "#rrggbb"
//   scrim, scrim_strength     where the image is darkened behind the text, and how much

// Typefaces loaded in index.html. `scale` evens out faces that run large or
// small at the same px size; `weights` maps our three weights to what the face
// actually has; `italic` says whether a real italic is loaded.
export const FONTS = {
  space_grotesk: { stack: `"Space Grotesk", sans-serif`, weights: [300, 500, 700], scale: 1, about: "quirky geometric grotesque; neutral, modern" },
  playfair: { stack: `"Playfair Display", serif`, weights: [400, 400, 700], scale: 1, italic: true, about: "high-contrast display serif; elegant, editorial, classic poster" },
  cormorant: { stack: `"Cormorant Garamond", serif`, weights: [400, 400, 600], scale: 1.12, italic: true, about: "delicate Garamond book serif with a lovely italic; quiet, literary" },
  shippori: { stack: `"Shippori Mincho", serif`, weights: [500, 500, 800], scale: 1, about: "Japanese Mincho serif; calm, print-like, suits woodblock and ink" },
  abril: { stack: `"Abril Fatface", serif`, weights: [400, 400, 400], scale: 1, about: "very fat didone display face; bold, playful, cut-paper posters" },
  archivo: { stack: `"Archivo", sans-serif`, weights: [500, 500, 800], scale: 1, about: "sturdy grotesque with a heavy bold; Swiss poster, strong" },
  inter: { stack: `"Inter", sans-serif`, weights: [200, 400, 700], scale: 1, about: "clean neutral sans; hairline light for cinematic, bold for signage" },
  outfit: { stack: `"Outfit", sans-serif`, weights: [300, 300, 700], scale: 1, about: "friendly geometric sans; flat illustration, contemporary" },
  orbitron: { stack: `"Orbitron", sans-serif`, weights: [500, 500, 800], scale: 0.82, about: "wide squared sci-fi sans; neon, synthwave, futuristic" },
  plex_mono: { stack: `"IBM Plex Mono", monospace`, weights: [300, 500, 500], scale: 0.95, about: "engineered monospace; instruments, data, aerial imagery" },
  dm_mono: { stack: `"DM Mono", monospace`, weights: [400, 400, 500], scale: 0.95, about: "soft monospace; film-camera date stamp, typewritten notes" },
  share_tech: { stack: `"Share Tech Mono", monospace`, weights: [400, 400, 400], scale: 1, about: "technical drafting monospace; blueprints, schematics" },
  press_start: { stack: `"Press Start 2P", monospace`, weights: [400, 400, 400], scale: 0.6, about: "8-bit bitmap font; only for pixel art" },
  caveat: { stack: `"Caveat", cursive`, weights: [500, 500, 700], scale: 1.25, about: "loose handwriting; chalk, sketchbook, charcoal" },
};

export const ENUMS = {
  weight: ["light", "regular", "bold"],
  tracking: ["tight", "normal", "wide"],
  align: ["left", "center", "right"],
  arrangement: ["stack_top", "stack_center", "stack_bottom", "split"],
  stats: ["grid", "row"],
  scrim: ["none", "top", "bottom", "both", "full"],
  scrim_strength: ["light", "medium", "strong"],
};

export const DEFAULT_LAYOUT = {
  display_font: "space_grotesk",
  body_font: "space_grotesk",
  time_weight: "bold",
  body_weight: "regular",
  time_size: 250,
  uppercase: true,
  italic: false,
  tracking: "wide",
  align: "center",
  arrangement: "stack_top",
  stats: "grid",
  ink: "#f7f6f2",
  accent: "#d9d6cc",
  scrim: "top",
  scrim_strength: "medium",
};

// Built-in layout per image style: used when no AI-designed layout came with
// the image (no ANTHROPIC_API_KEY, or the call failed).
const L = (o) => ({ ...DEFAULT_LAYOUT, ...o });
export const STYLE_LAYOUTS = {
  skyline: L({ display_font: "playfair", body_font: "playfair", time_size: 270, uppercase: false, tracking: "normal", ink: "#fbf3e4", accent: "#f0c9a0" }),
  poster: L({ display_font: "archivo", body_font: "archivo", time_size: 270, align: "left", accent: "#ffd166" }),
  lookup: L({ display_font: "inter", body_font: "inter", time_weight: "light", arrangement: "stack_center", scrim: "full" }),
  window: L({ display_font: "cormorant", body_font: "cormorant", time_weight: "regular", time_size: 300, uppercase: false, italic: true, tracking: "normal", ink: "#fff6e6", accent: "#f2d3a8" }),
  platform: L({ display_font: "inter", body_font: "inter", uppercase: false, tracking: "tight", align: "left", accent: "#c79bf2" }),
  woodblock: L({ display_font: "shippori", body_font: "shippori", ink: "#f6ecd9", accent: "#f08a6b" }),
  pixel: L({ display_font: "press_start", body_font: "press_start", time_size: 128, tracking: "normal", ink: "#ffffff", accent: "#ffe45c" }),
  satellite: L({ display_font: "plex_mono", body_font: "plex_mono", time_weight: "light", time_size: 215, align: "left", ink: "#eafff4", accent: "#7df0b0", scrim: "full" }),
  collage: L({ display_font: "abril", body_font: "outfit", body_weight: "bold", ink: "#fff8ea", accent: "#ffcf5c" }),
  watercolor: L({ display_font: "cormorant", body_font: "cormorant", time_weight: "regular", body_weight: "bold", time_size: 300, uppercase: false, italic: true, tracking: "normal" }),
  neon: L({ display_font: "orbitron", body_font: "orbitron", time_size: 180, ink: "#ffffff", accent: "#7ef9ff" }),
  charcoal: L({ display_font: "caveat", body_font: "caveat", time_size: 320, uppercase: false, tracking: "normal", ink: "#f4f1ea", accent: "#d9d4c8" }),
  flat: L({ display_font: "outfit", body_font: "outfit", body_weight: "light", time_size: 270, uppercase: false, tracking: "normal", align: "left" }),
  blueprint: L({ display_font: "share_tech", body_font: "share_tech", time_size: 230, ink: "#eaf4ff", accent: "#a9cdf5" }),
  street: L({ display_font: "dm_mono", body_font: "dm_mono", time_size: 215, align: "left", ink: "#ffb84a", accent: "#ffd79a" }),
};

const HEX = /^#[0-9a-f]{6}$/i;

// Merge an (untrusted, AI-written) layout over the built-in one for the style,
// keeping only values the renderer understands.
export function resolveLayout(layout, style) {
  const base = STYLE_LAYOUTS[style] || DEFAULT_LAYOUT;
  const out = { ...base };
  if (!layout || typeof layout !== "object") return out;
  const oneOf = (key, list) => { if (list.includes(layout[key])) out[key] = layout[key]; };
  for (const key of ["display_font", "body_font"]) if (FONTS[layout[key]]) out[key] = layout[key];
  oneOf("time_weight", ENUMS.weight);
  oneOf("body_weight", ENUMS.weight);
  oneOf("tracking", ENUMS.tracking);
  oneOf("align", ENUMS.align);
  oneOf("arrangement", ENUMS.arrangement);
  oneOf("stats", ENUMS.stats);
  oneOf("scrim", ENUMS.scrim);
  oneOf("scrim_strength", ENUMS.scrim_strength);
  for (const key of ["uppercase", "italic"]) if (typeof layout[key] === "boolean") out[key] = layout[key];
  for (const key of ["ink", "accent"]) if (HEX.test(layout[key] || "")) out[key] = layout[key];
  if (Number.isFinite(layout.time_size)) out.time_size = Math.max(110, Math.min(340, Math.round(layout.time_size)));
  return out;
}
