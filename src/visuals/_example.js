// The minimal piece from README.md, kept runnable so the contract stays tested.
// Its name starts with "_", so it is not part of the rotation.
import { W, H, clamp, mix, rgba, rng, el, addStyle, canvas2d, grain, fitText } from "../lib/kit.js";

export default {
  title: "Example",
  description: "Drifting motes over the sky's color.",
  fonts: ["Archivo:wght@500;800"],
  mount(root, { seed }) {
    addStyle(root, `
      .ex { position: absolute; inset: 0; font-family: "Archivo", sans-serif; }
      .ex .time { position: absolute; left: 80px; top: 120px; font-weight: 800; font-size: 330px; line-height: 0.8; }
      .ex .cond { position: absolute; left: 84px; top: 470px; font-weight: 500; font-size: 56px; }
    `);
    const wrap = el("div", { class: "ex" });
    const layer = canvas2d(wrap, { adaptive: true }); // redrawn in full every frame
    const time = el("div", { class: "time" });
    const cond = el("div", { class: "cond" });
    wrap.append(time, cond);
    root.append(wrap);
    grain(wrap);

    const r = rng(seed);
    const N = 600;
    const motes = new Float32Array(N * 3); // x, y, speed
    for (let i = 0; i < N; i++) motes.set([r.range(0, W), r.range(0, H), r.range(0.5, 1.5)], i * 3);

    const shown = {};
    const put = (key, node, value) => {
      // write to the DOM only when the string changes
      if (shown[key] === value) return false;
      shown[key] = value;
      node.textContent = value;
      return true;
    };

    return {
      frame(s) {
        // Colors follow the real sky and the real light, continuously.
        const bg = mix("#05070f", s.sky.mean, 0.25 + 0.75 * s.daylight);
        const ink = mix("#f4f1ea", "#0b0d12", clamp((s.daylight - 0.55) * 6)); // flips while the ground is mid-grey
        if (shown.bg !== bg) {
          shown.bg = bg;
          wrap.style.background = bg;
          wrap.style.color = ink;
        }

        const { ctx } = layer;
        layer.clear();
        ctx.fillStyle = rgba(ink, 0.5);
        const drift = s.weather.wind * 6 * s.dt; // px this frame: the real wind
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const j = i * 3;
          motes[j] = (motes[j] + drift * motes[j + 2]) % W;
          ctx.rect(motes[j], motes[j + 1], 3, 3);
        }
        ctx.fill();

        if (put("time", time, `${s.text.time} ${s.text.ampm}`)) fitText(time, W - 160);
        put("cond", cond, `${s.text.temp} ${s.text.condition}`);
      },
    };
  },
};
