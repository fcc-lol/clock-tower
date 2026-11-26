// Asks Claude to design the readout layout for one backdrop image: it looks at
// the finished image and picks the typeface, colors, placement and scrim that
// suit it and keep the text legible. The result is the plain layout object
// described in src/lib/layout.js; the display validates it before use, and
// falls back to the built-in layout for the style if there is none.
//
// Needs ANTHROPIC_API_KEY in .env. Without it (or if a call fails) images
// simply go out without a custom layout.

import Anthropic from "@anthropic-ai/sdk";
import { FONTS, ENUMS, STYLE_TYPE } from "./src/lib/layout.js";

const str = (list) => ({ type: "string", enum: list });
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    rationale: { type: "string", description: "One or two sentences: what the image looks like and why this layout suits it." },
    composition: str(ENUMS.composition),
    arrangement: str(ENUMS.arrangement),
    align: str(ENUMS.align),
    display_font: str(Object.keys(FONTS)),
    body_font: str(Object.keys(FONTS)),
    time_weight: str(ENUMS.weight),
    body_weight: str(ENUMS.weight),
    time_size: { type: "integer", description: "Size of the time digits in px, 110-340." },
    uppercase: { type: "boolean" },
    italic: { type: "boolean" },
    tracking: str(ENUMS.tracking),
    ink: { type: "string", description: "Main text color, #rrggbb." },
    accent: { type: "string", description: "Color of the small labels and AM/PM, #rrggbb." },
    scrim: str(ENUMS.scrim),
    scrim_strength: str(ENUMS.scrim_strength),
  },
};
SCHEMA.required = Object.keys(SCHEMA.properties);

const SYSTEM = `You are the typographer for a piece of wall art: a 4K portrait screen (authored at 1080x1920) that shows an AI-generated picture of the current weather in Long Island City, New York, with the time and weather set in type on top of it. A new picture arrives every 15 minutes, each in a different art style, and you design how the type sits on each one. The goal is that picture and type look like one designed object, the way a good poster or book cover does, and that the text is effortless to read from across a room.

The text is always the same set of readouts, in two blocks:
- clock block: the time (very large, e.g. "12:45 PM"), then the date under it (e.g. "Wednesday, November 25")
- weather block: the temperature (large) with the condition beside it (e.g. "42° Overcast"), then four small label/value pairs in one strip across (Sunset in / 26m, Moon / Full Moon, Air quality / 50, UV index / 0), then one "today" fact as a small label over a line that may wrap to two (e.g. On this day in 1783 / George Washington Resigns as Commander-in-Chief)

You are shown the picture and choose:

composition: the overall typographic idea. This is the most important choice: it decides whether the result looks designed or merely labelled. Be bold, and expect to use all four across a day of pictures.
- "masthead": the time is scaled to fill the full width of the frame like a magazine nameplate, with the weekday and date pushed to opposite margins under it and the weather justified to both margins below. Editorial, like a magazine cover. The natural choice whenever there is a broad, fairly even band of picture (a sky, a wall, open water) at the top or bottom; ignores align.
- "monument": the hour set over the minutes in enormous numerals (each line most of the frame's width) at one end of the frame, with the weather block at the other end. The boldest option: a poster where the numerals are part of the image. Choose it for abstract, graphic, diagrammatic or evenly textured pictures, and for pictures with a big empty sky and little going on at the other end.
- "caption": everything set small and quiet in one place, like the label beside a painting, so the picture has the frame almost to itself. Choose it when the picture is rich and detailed all over, or so striking that large type would spoil it, and it has one calm corner or edge.
- "stack": the clock block over the weather block, all set to one alignment. The plain option: choose it when the calm area is a column down one side or an irregular shape that the others would not fit, or when a delicate, handwritten or bitmap face needs a simple setting.

arrangement: where the blocks go on the tall frame. "stack_top", "stack_center" and "stack_bottom" keep both blocks together (a little over half the frame height, less for caption) at the top, middle or bottom. "split" puts the clock block at the top and the weather block at the bottom, leaving the middle clear. Put the type over the calmest, most even part of the picture and keep it off the subject: a skyline along the bottom wants stack_top; a picture whose interest is at the top wants stack_bottom; a subject in the middle wants split. For monument the blocks are always at opposite ends: stack_bottom puts the numerals at the bottom and the weather at the top, anything else puts the numerals at the top.

align: left, center or right. Offset the type away from a strong vertical element or toward open space; center when the picture is symmetrical.

display_font (time and temperature) and body_font (everything else), from this list:
${Object.entries(FONTS).map(([k, f]) => `- ${k}: ${f.about}`).join("\n")}
Choose for the medium and mood of this particular picture, not from habit. Using one family for both is usually right; a contrasting pair (a display serif over a plain sans, say) is fine when it suits. italic sets the date, condition and values in italic, and only works with a body_font that has one: ${Object.entries(FONTS).filter(([, f]) => f.italic).map(([k]) => k).join(", ")}. The small labels are always set in upright tracked capitals.

time_weight, body_weight, time_size (110-340; around 250 is typical, wide faces like orbitron and press_start need about 130-190, the condensed big_shoulders can take 320; masthead and monument scale the time themselves and use this only for the temperature), uppercase, tracking ("wide" suits uppercase, "tight" suits heavy lowercase).

ink (main text color), accent (the small labels and AM/PM) and scrim. The type is set flat, with no shadow, outline or glow, so its legibility comes entirely from your colors and the scrim. Take the colors from the picture's own palette so the type belongs to it, but legibility comes first: against the area behind the text, ink needs very strong contrast, which nearly always means a near-white or pale tint of a color in the picture, or on a genuinely light, even area a near-black one. The accent must be clearly readable too, not a mid-tone that sinks into the background. scrim darkens the picture behind the text ("top", "bottom", "both" ends, or "full"): with light ink, use enough of it that every line reads cleanly ("none" only if the area is already dark and even, "strong" when it is bright or busy); with dark ink on a light picture use "none", since a scrim would work against it.

Reply with the layout as JSON.`;

// For a style whose lettering is art-directed by hand (STYLE_TYPE), tell the
// designer what is already decided and what is left to it.
function direction(style) {
  const t = STYLE_TYPE[style];
  if (!t) return "";
  const fixed = Object.entries(t.pins).filter(([k]) => SCHEMA.properties[k]).map(([k, v]) => `${k} ${v}`).join(", ");
  return `Its lettering is already art-directed, so these are fixed and you must return them as given: ${fixed}. ${t.brief} `;
}

export function createLayoutDesigner(env = process.env, log = console.log) {
  if (!env.ANTHROPIC_API_KEY) {
    log("[layout] no ANTHROPIC_API_KEY in .env; using the built-in layout for each style.");
    return null;
  }
  const client = new Anthropic({ timeout: 60_000 });
  const model = env.LAYOUT_MODEL || "claude-sonnet-5-5";

  // Sonnet 5.5 in, out per million tokens.
  const usdOf = (u) => ((u.input_tokens ?? 0) * 2 + (u.output_tokens ?? 0) * 10) / 1e6;

  async function design({ buffer, ext, style }) {
    const res = await client.beta.messages.create({
      model,
      max_tokens: 4000,
      // If a safety classifier declines the request, re-run it on the fallback
      // model Anthropic recommends instead of returning nothing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: ext === "png" ? "image/png" : "image/jpeg", data: buffer.toString("base64") } },
            { type: "text", text: `This picture was generated in the "${style}" style. ${direction(style)}Design the layout for it.` },
          ],
        },
      ],
    });
    if (res.stop_reason === "refusal") throw new Error("declined by the model");
    const text = res.content.find((b) => b.type === "text")?.text;
    if (!text) throw new Error(`no layout in the reply (stop_reason ${res.stop_reason})`);
    const { rationale, ...layout } = JSON.parse(text);
    Object.assign(layout, STYLE_TYPE[style]?.pins);
    return { layout, rationale, usd: usdOf(res.usage), model: res.model };
  }

  return { name: model, design };
}
