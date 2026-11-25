// Asks Claude to design the readout layout for one backdrop image: it looks at
// the finished image and picks the typeface, colors, placement and scrim that
// suit it and keep the text legible. The result is the plain layout object
// described in src/lib/layout.js; the display validates it before use, and
// falls back to the built-in layout for the style if there is none.
//
// Needs ANTHROPIC_API_KEY in .env. Without it (or if a call fails) images
// simply go out without a custom layout.

import Anthropic from "@anthropic-ai/sdk";
import { FONTS, ENUMS } from "./src/lib/layout.js";

const str = (list) => ({ type: "string", enum: list });
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    rationale: { type: "string", description: "One or two sentences: what the image looks like and why this layout suits it." },
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
    stats: str(ENUMS.stats),
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
- weather block: the temperature (large) with the condition beside it (e.g. "42° Overcast"), then four small label/value pairs (Sunset in / 26m, Moon / Full Moon, Air quality / 50, UV index / 0)

You are shown the picture and choose:

arrangement: where the blocks go on the tall frame. "stack_top", "stack_center" and "stack_bottom" keep both blocks together (about half the frame height) at the top, middle or bottom. "split" puts the clock block at the top and the weather block at the bottom, leaving the middle clear. Put the type over the calmest, most even part of the picture and keep it off the subject: a skyline along the bottom wants stack_top; a picture whose interest is at the top wants stack_bottom; a subject in the middle wants split.

align: left, center or right. Offset the type away from a strong vertical element or toward open space; center when the picture is symmetrical.

display_font (time and temperature) and body_font (everything else), from this list:
${Object.entries(FONTS).map(([k, f]) => `- ${k}: ${f.about}`).join("\n")}
Choose for the medium and mood of this particular picture, not from habit. Using one family for both is usually right; a contrasting pair is fine when it suits. Italic is only available for playfair and cormorant.

time_weight, body_weight, time_size (110-340; around 250 is typical, wide faces like orbitron and press_start need about 130-190), uppercase, tracking ("wide" suits uppercase, "tight" suits heavy lowercase), and stats ("grid" is two rows of two, "row" is a single line of four).

ink (main text color), accent (the small labels and AM/PM) and scrim. The type is set flat, with no shadow, outline or glow, so its legibility comes entirely from your colors and the scrim. Take the colors from the picture's own palette so the type belongs to it, but legibility comes first: against the area behind the text, ink needs very strong contrast, which nearly always means a near-white or pale tint of a color in the picture, or on a genuinely light, even area a near-black one. The accent must be clearly readable too, not a mid-tone that sinks into the background. scrim darkens the picture behind the text ("top", "bottom", "both" ends, or "full"): with light ink, use enough of it that every line reads cleanly ("none" only if the area is already dark and even, "strong" when it is bright or busy); with dark ink on a light picture use "none", since a scrim would work against it.

Reply with the layout as JSON.`;

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
            { type: "text", text: `This picture was generated in the "${style}" style. Design the layout for it.` },
          ],
        },
      ],
    });
    if (res.stop_reason === "refusal") throw new Error("declined by the model");
    const text = res.content.find((b) => b.type === "text")?.text;
    if (!text) throw new Error(`no layout in the reply (stop_reason ${res.stop_reason})`);
    const { rationale, ...layout } = JSON.parse(text);
    return { layout, rationale, usd: usdOf(res.usage), model: res.model };
  }

  return { name: model, design };
}
