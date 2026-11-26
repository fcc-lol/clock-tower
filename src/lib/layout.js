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
//   composition               "stack" | "masthead" | "monument" | "caption" (see ENUMS)
//   arrangement               "stack_top" | "stack_center" | "stack_bottom" | "split"
//   ink, accent               "#rrggbb"
//   effect, tilt              set only by a style's own type direction (STYLE_TYPE):
//                             "glow" | "comic" | "ink", and a rotation in degrees
//   scrim, scrim_strength     where the image is darkened behind the text, and how much

// Typefaces loaded in index.html. `scale` evens out faces that run large or
// small at the same px size; `weights` maps our three weights to what the face
// actually has; `italic` says whether a real italic is loaded; `caps: false`
// keeps the small labels out of tracked capitals (handwriting); `colon` is how
// far the time's colon is raised to sit centered on the figures, in em; `opsz`
// pins the optical size for the big figures (a didone's display cut has
// hairlines too fine to read from across a room).
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
  press_start: { stack: `"Press Start 2P", monospace`, weights: [400, 400, 400], scale: 0.6, colon: 0, about: "8-bit bitmap font; only for pixel art" },
  caveat: { stack: `"Caveat", cursive`, weights: [500, 500, 700], scale: 1.25, caps: false, colon: 0.02, about: "loose handwriting; chalk, sketchbook, charcoal" },
  instrument_serif: { stack: `"Instrument Serif", serif`, weights: [400, 400, 400], scale: 1.12, italic: true, about: "narrow, sharp contemporary display serif with a beautiful italic; fashion editorial, gallery poster" },
  fraunces: { stack: `"Fraunces", serif`, weights: [300, 400, 700], scale: 1, italic: true, about: "soft, characterful old-style serif; warm, crafted, storybook, stained glass and paper" },
  bodoni: { stack: `"Bodoni Moda", serif`, weights: [500, 600, 800], scale: 1, italic: true, opsz: 14, about: "high-contrast didone with hairline thins; engraving, haute magazine masthead, formal; needs a dark even ground" },
  big_shoulders: { stack: `"Big Shoulders Display", sans-serif`, weights: [500, 700, 900], scale: 1.2, about: "tall condensed poster gothic; set it very large; transit signage, deco, letterpress posters" },
  bricolage: { stack: `"Bricolage Grotesque", sans-serif`, weights: [300, 500, 800], scale: 1, about: "expressive contemporary grotesque with ink traps; editorial, graphic, flat illustration" },
  // Faces that belong to one kind of picture. The styles that use them pin
  // them in STYLE_TYPE below.
  seven_segment: { stack: `"DSEG7-Classic", "Share Tech Mono", monospace`, weights: [200, 400, 700], scale: 1, colon: 0, ghost: true, digits: true, about: "seven-segment LED display digits; display_font only (it has no real letters); cyberpunk, clocks, instruments" },
  doto: { stack: `"Doto", monospace`, weights: [400, 700, 900], scale: 0.92, colon: 0, about: "dot-matrix letters built from round dots; LED signs, departure boards" },
  vt323: { stack: `"VT323", monospace`, weights: [400, 400, 400], scale: 1.3, colon: 0, about: "terminal bitmap font; phosphor CRT screens" },
  pixelify: { stack: `"Pixelify Sans", sans-serif`, weights: [400, 400, 700], scale: 0.92, colon: 0, about: "readable proportional pixel sans; pixel art, game interfaces" },
  reenie: { stack: `"Reenie Beanie", cursive`, weights: [400, 400, 400], scale: 1.3, caps: false, colon: 0.02, about: "fast, scratchy pen-and-pencil handwriting; sketchbook notes" },
  fredericka: { stack: `"Fredericka the Great", serif`, weights: [400, 400, 400], scale: 1, about: "hand-chalked sign-painter's serif with sketched-in fills; blackboards" },
  special_elite: { stack: `"Special Elite", monospace`, weights: [400, 400, 400], scale: 0.92, colon: 0.03, about: "worn typewriter; field notes, index cards, case files" },
  bangers: { stack: `"Bangers", sans-serif`, weights: [400, 400, 400], scale: 1.1, about: "loud slanted comic-book title lettering; pop art, comics" },
  comic_neue: { stack: `"Comic Neue", sans-serif`, weights: [400, 400, 700], scale: 1, about: "clean comic-book balloon lettering" },
  pirata: { stack: `"Pirata One", serif`, weights: [400, 400, 400], scale: 1.1, about: "clear, sturdy blackletter; manuscripts, heraldry" },
  saira_stencil: { stack: `"Saira Stencil One", sans-serif`, weights: [400, 400, 400], scale: 1, about: "heavy stencil sans with bridges; spray paint, crates, street art" },
  alfa_slab: { stack: `"Alfa Slab One", serif`, weights: [400, 400, 400], scale: 1, about: "fat slab wood type; letterpress broadsides, bills" },
};

export const ENUMS = {
  weight: ["light", "regular", "bold"],
  tracking: ["tight", "normal", "wide"],
  align: ["left", "center", "right"],
  // How the readouts are composed:
  //   stack     clock block over weather block, set to one alignment
  //   masthead  the time fills the full width like a magazine nameplate, and
  //             everything under it is justified to both margins
  //   monument  hour over minutes in enormous numerals at one end of the
  //             frame, the weather at the other
  //   caption   everything small and quiet in one place, like a gallery label
  composition: ["stack", "masthead", "monument", "caption"],
  arrangement: ["stack_top", "stack_center", "stack_bottom", "split"],
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
  composition: "stack",
  arrangement: "stack_top",
  ink: "#f7f6f2",
  accent: "#d9d6cc",
  scrim: "top",
  scrim_strength: "medium",
  effect: "none",
  tilt: 0,
};

// Type direction for the styles that are designed as a matched pair of picture
// and lettering (a seven-segment clock over a neon city, pencil handwriting on
// a sketchbook page). For these the typographic idea is fixed here, by hand:
//   pins   layout values nothing may override
//   base   the rest of the built-in layout, used when no layout was designed
//   brief  what the layout designer (layout.js) is told about the choices left
//          to it: placement, size, colors, scrim
// effect: "glow" lights the type like an emitter; "comic" gives it a black
//         outline and drop; "ink" multiplies it into the paper.
export const STYLE_TYPE = {
  cyberpunk: {
    pins: { composition: "masthead", display_font: "seven_segment", body_font: "share_tech", time_weight: "bold", body_weight: "regular", uppercase: true, italic: false, tracking: "wide", effect: "glow" },
    base: { ink: "#8ef6ff", accent: "#ff5fd2", scrim: "top", scrim_strength: "medium" },
    brief: "The time is a glowing seven-segment LED display hanging over the city, with the unlit segments faintly visible. ink: one saturated neon color taken from the picture's own signs, pale enough to read easily (an icy cyan, a hot pink, an amber); accent: a second neon from the picture that contrasts with it. Use only as much scrim as the sky needs.",
  },
  sketchbook: {
    pins: { composition: "stack", display_font: "reenie", body_font: "reenie", time_weight: "regular", body_weight: "regular", uppercase: false, italic: false, tracking: "normal", scrim: "none", effect: "ink", tilt: -2 },
    base: { time_size: 320, align: "left", ink: "#2e2c2b", accent: "#6a625c" },
    brief: "The readouts are the artist's own handwritten pencil notes on the sketchbook page, tilted a little. ink: soft graphite near-black (about #2e2c2b); accent: a lighter graphite that is still clearly readable, or the red or blue of a colored pencil. Put the notes on the open paper, clear of the drawing. time_size 300-340.",
  },
  isopixel: {
    pins: { composition: "stack", display_font: "press_start", body_font: "pixelify", time_weight: "bold", body_weight: "bold", uppercase: true, italic: false, tracking: "normal" },
    base: { time_size: 132, ink: "#ffffff", accent: "#ffe45c", scrim: "top", scrim_strength: "light" },
    brief: "The readouts are the game's own on-screen text. ink: white or the palest color in the picture's palette; accent: one bright flat palette color (yellow, cyan, orange). time_size 120-150.",
  },
  dotmatrix: {
    pins: { composition: "masthead", display_font: "doto", body_font: "doto", time_weight: "bold", body_weight: "bold", uppercase: true, italic: false, tracking: "normal", effect: "glow" },
    base: { ink: "#ffd27a", accent: "#ff8a3c", scrim: "top", scrim_strength: "medium" },
    brief: "The readouts are part of the LED sign: the same dots, lit brighter. ink: the brightest, hottest color on the sign (amber-white, pale yellow); accent: a second LED color from the picture. Scrim enough that the dim sky dots do not fight the text.",
  },
  chalkboard: {
    pins: { composition: "stack", display_font: "fredericka", body_font: "caveat", time_weight: "regular", body_weight: "regular", uppercase: false, italic: false, tracking: "normal", tilt: -1.5 },
    base: { time_size: 270, align: "center", ink: "#f2f0e6", accent: "#f0d98a", scrim: "top", scrim_strength: "light" },
    brief: "The readouts are chalk lettering on the same blackboard, like a cafe's daily board. ink: chalk white (about #f2f0e6); accent: one of the colored chalks used in the drawing. Center it unless the drawing leaves the clean slate to one side. Where chalk marks run behind the text, use a scrim: on a blackboard it reads as a wiped patch.",
  },
  crt: {
    pins: { composition: "stack", align: "left", display_font: "vt323", body_font: "vt323", time_weight: "regular", body_weight: "regular", uppercase: true, italic: false, tracking: "normal", scrim: "none", effect: "glow" },
    base: { time_size: 330, ink: "#b8ffcf", accent: "#4fd67f" },
    brief: "The readouts are terminal text on the same phosphor screen. ink: a pale tint of the picture's phosphor color; accent: a deeper shade of the same hue, still clearly readable on black. time_size 300-340.",
  },
  fieldnotes: {
    pins: { composition: "stack", display_font: "special_elite", body_font: "special_elite", time_weight: "regular", body_weight: "regular", uppercase: false, italic: false, tracking: "normal", scrim: "none", effect: "ink" },
    base: { time_size: 220, align: "left", ink: "#2a2420", accent: "#8a4a36" },
    brief: "The readouts are a typewritten label on the journal page. ink: typewriter black-brown (about #2a2420); accent: a faded red or sepia ribbon color, dark enough to read. Put it on the emptiest part of the paper, clear of the studies. time_size 200-230.",
  },
  popart: {
    pins: { composition: "stack", display_font: "bangers", body_font: "comic_neue", time_weight: "bold", body_weight: "bold", uppercase: true, italic: false, tracking: "normal", scrim: "none", effect: "comic", tilt: -3 },
    base: { time_size: 330, align: "left", ink: "#ffe14a", accent: "#ffffff" },
    brief: "The readouts are comic-book title lettering with a black outline and drop, tilted. ink: one bright flat comic color that stands off the sky behind it (yellow, white, hot red); accent: white or pale yellow. time_size 320-340.",
  },
  manuscript: {
    pins: { composition: "masthead", display_font: "pirata", body_font: "cormorant", time_weight: "regular", body_weight: "bold", uppercase: false, italic: false, tracking: "normal" },
    base: { ink: "#f6ecd2", accent: "#e2bd6a", scrim: "top", scrim_strength: "light" },
    brief: "The time is set in blackletter across the heavens of the miniature. ink: vellum white or pale gold; accent: burnished gold (about #e2bd6a). Light scrim at most, the blue field should already carry it.",
  },
  handheld: {
    pins: { composition: "stack", display_font: "press_start", body_font: "press_start", time_weight: "regular", body_weight: "regular", uppercase: true, italic: false, tracking: "normal", scrim: "none" },
    base: { time_size: 132, ink: "#0f380f", accent: "#306230" },
    brief: "The readouts are drawn on the same four-shade LCD. ink must be the darkest shade of the picture's palette (about #0f380f) and accent the dark olive (about #306230); use no other colors. time_size 120-150.",
  },
  stencil: {
    pins: { composition: "monument", display_font: "saira_stencil", body_font: "archivo", time_weight: "regular", body_weight: "bold", uppercase: true, italic: false, tracking: "wide" },
    base: { time_size: 180, align: "left", ink: "#f1ede4", accent: "#ff5a36", scrim: "both", scrim_strength: "light" },
    brief: "The numerals are sprayed on the wall through a stencil, above and below the piece. ink: off-white spray paint, or the strongest paint color in the piece if it reads better; accent: another paint color from the piece. Put the numerals at whichever end has more bare wall. time_size 170-190, so the numerals stay on the bare wall and off the piece.",
  },
  letterpress: {
    pins: { composition: "masthead", display_font: "alfa_slab", body_font: "fraunces", time_weight: "regular", body_weight: "bold", uppercase: true, italic: false, tracking: "normal", scrim: "none", effect: "ink" },
    base: { ink: "#1c1917", accent: "#a33a2a" },
    brief: "The readouts are wood type printed on the same sheet, above the engraving. ink: dense black-brown printer's ink (about #1c1917); accent: the print's second color (a dull red, a deep blue), dark enough to read on the paper.",
  },
};

// Built-in layout per image style: used when no AI-designed layout came with
// the image (no ANTHROPIC_API_KEY, or the call failed).
export const STYLE_LAYOUTS = {};
for (const [style, t] of Object.entries(STYLE_TYPE)) STYLE_LAYOUTS[style] = { ...DEFAULT_LAYOUT, ...t.base, ...t.pins };

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
  oneOf("composition", ENUMS.composition);
  oneOf("arrangement", ENUMS.arrangement);
  oneOf("scrim", ENUMS.scrim);
  oneOf("scrim_strength", ENUMS.scrim_strength);
  for (const key of ["uppercase", "italic"]) if (typeof layout[key] === "boolean") out[key] = layout[key];
  for (const key of ["ink", "accent"]) if (HEX.test(layout[key] || "")) out[key] = layout[key];
  if (Number.isFinite(layout.time_size)) out.time_size = Math.max(110, Math.min(340, Math.round(layout.time_size)));
  // A style's own type direction always wins.
  return Object.assign(out, STYLE_TYPE[style]?.pins);
}
