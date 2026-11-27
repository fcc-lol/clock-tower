// The minimal piece from README.md, kept runnable so the contract stays tested.
// Its name starts with "_", so it is not part of the rotation.
import { W, H, mix, rgba, readableOn, rng, el, addStyle, canvas2d, grain, fitText } from "../lib/kit.js";

export default {
  title: "Example",
  description: "Drifting motes over the sky's color.",
  fonts: ["Archivo:wght@500;800"],
  mount(root, { seed }) {
    addStyle(root, `
      .ex { position: absolute; inset: 0; font-family: "Archivo", sans-serif; }
      .ex .time { position: absolute; left: 80px; top: 120px; font-weight: 800; font-size: 330px; line-height: 0.8; }
      .ex .ampm { position: absolute; right: 80px; top: 128px; font-weight: 800; font-size: 60px; }
      .ex .temp { position: absolute; left: 84px; top: 470px; font-weight: 800; font-size: 110px; line-height: 1; }
      .ex .cond { position: absolute; left: 84px; top: 600px; font-weight: 500; font-size: 56px; }
    `);
    const wrap = el("div", { class: "ex" });
    root.append(wrap); // in the page before anything is measured
    const layer = canvas2d(wrap, { adaptive: true }); // redrawn in full every frame
    const time = el("div", { class: "time" });
    const ampm = el("div", { class: "ampm" });
    const temp = el("div", { class: "temp" });
    const cond = el("div", { class: "cond" });
    wrap.append(time, ampm, temp, cond);
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
        // The ground follows the real sky and the real light, continuously. The ink
        // does not fade with it (it would pass through the ground's own grey and
        // vanish): it switches, at the point where both inks read equally well.
        const bg = mix("#05070f", s.sky.mean, 0.25 + 0.75 * s.daylight);
        if (shown.bg !== bg) {
          shown.bg = bg;
          shown.ink = readableOn(bg, "#f4f1ea", "#0b0d12");
          wrap.style.background = bg;
          wrap.style.color = shown.ink;
        }

        const { ctx } = layer;
        layer.clear();
        ctx.fillStyle = rgba(shown.ink, 0.5);
        const drift = s.weather.wind * 6 * s.dt; // px this frame: the real wind (dt is 0 on the first frame)
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const j = i * 3;
          motes[j] = (motes[j] + drift * motes[j + 2]) % W;
          ctx.rect(motes[j], motes[j + 1], 3, 3);
        }
        ctx.fill();

        if (put("time", time, s.text.time)) fitText(time, W - 320);
        put("ampm", ampm, s.text.ampm);
        put("temp", temp, s.text.temp);
        put("cond", cond, s.text.condition);
      },
    };
  },
};
