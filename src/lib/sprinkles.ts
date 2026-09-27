/**
 * The "wrap" sprinkles: nine candy pieces burst from a button after a
 * successful copy/export. Pure WAAPI on fixed-position elements (no layout),
 * removed when done. Skipped entirely under reduced motion.
 */
import { prefersReducedMotion } from "./platform";

const COLOURS = ["#FF4F7B", "#FF9A3C", "#FFD84D", "#5FD4A8", "#4F8BFF", "#8B6CFF", "#FF6A8F"];

/** Deterministic PRNG per burst (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let burst = 0;

export function sprinkle(from: Element | DOMRect | null): void {
  if (!from || prefersReducedMotion() || typeof document === "undefined") return;
  const r = from instanceof Element ? from.getBoundingClientRect() : from;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const rand = rng(++burst * 7919);
  for (let i = 0; i < 9; i++) {
    const el = document.createElement("i");
    el.className = "sprinkle";
    const bar = i % 2 === 0;
    const w = bar ? 6 : 6 + Math.round(rand() * 2);
    const h = bar ? 12 : w;
    el.style.cssText = `left:${cx - w / 2}px;top:${cy - h / 2}px;width:${w}px;height:${h}px;background:${COLOURS[i % COLOURS.length]};border-radius:${bar ? "3px" : "50%"}`;
    document.body.appendChild(el);
    // Angles -20..200 degrees (mostly sideways and down), 40..100 px out.
    const ang = ((-20 + (220 * (i + rand() * 0.8)) / 9) * Math.PI) / 180;
    const dist = 40 + rand() * 60;
    const dx = Math.cos(ang) * dist;
    const dy = Math.sin(ang) * dist * 0.8 + 6;
    const rot = (rand() * 2 - 1) * 90;
    const anim = el.animate(
      [
        { transform: "translate(0,0) rotate(0deg) scale(.4)", opacity: 1 },
        {
          transform: `translate(${dx}px,${dy}px) rotate(${rot}deg) scale(1)`,
          opacity: 1,
          offset: 0.55,
          easing: "cubic-bezier(.55,0,1,.45)",
        },
        { transform: `translate(${dx}px,${dy + 12}px) rotate(${rot * 1.3}deg) scale(.9)`, opacity: 0 },
      ],
      { duration: 700, easing: "cubic-bezier(.5,1.8,.4,.8)", fill: "forwards" },
    );
    anim.onfinish = () => el.remove();
    anim.oncancel = () => el.remove();
  }
}
