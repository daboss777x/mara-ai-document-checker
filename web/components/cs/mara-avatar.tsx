"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import styles from "./mara-avatar.module.css";

const PX = { sm: 28, md: 34, lg: 48, xl: 96 } as const;
export type MaraAvatarSize = keyof typeof PX;

// Droplet palette (kept here: the avatar is the only consumer).
const INK = "#16324f";

/* ---- One shared, passive pointer listener for every avatar on the page ---- */
const pointer = { x: 0, y: 0, lastMove: -1e9, inside: false };
const subscribers = new Set<() => void>();
function onMove(e: PointerEvent) {
  if (e.pointerType === "touch") return; // touch: eyes keep idling instead
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.inside = true;
  pointer.lastMove = performance.now();
}
function onLeave(e: MouseEvent) {
  if (!e.relatedTarget) pointer.inside = false;
}
function subscribe(fn: () => void) {
  if (subscribers.size === 0) {
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave as EventListener);
    window.addEventListener("blur", () => (pointer.inside = false));
  }
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave as EventListener);
    }
  };
}

type Splash = { dx: string; dy: string; delay: number };

export function MaraAvatar({
  size = "md",
  className,
  interactive,
  label = "Mara",
}: {
  size?: MaraAvatarSize;
  className?: string;
  /** Click/tap/Enter/Space makes it splash. Defaults to true for lg and xl, false for sm and md. */
  interactive?: boolean;
  /** Accessible name when interactive. */
  label?: string;
}) {
  const px = PX[size];
  const isInteractive = interactive ?? (size === "lg" || size === "xl");
  const uid = useId().replace(/:/g, "");
  const rootRef = useRef<HTMLSpanElement>(null);
  const bodyRef = useRef<HTMLSpanElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const eyeLRef = useRef<SVGGElement>(null);
  const eyeRRef = useRef<SVGGElement>(null);
  const dotsRef = useRef<SVGGElement>(null);
  const arcsRef = useRef<SVGGElement>(null);
  const kick = useRef<() => void>(() => {});
  const [burst, setBurst] = useState<{ n: number; splashes: Splash[] }>({ n: 0, splashes: [] });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Reduced motion: static droplet, opacity-only blink.
    if (reduced) {
      let t: ReturnType<typeof setTimeout>;
      const blink = () => {
        t = setTimeout(() => {
          if (eyesRef.current) eyesRef.current.style.opacity = "0.15";
          setTimeout(() => {
            if (eyesRef.current) eyesRef.current.style.opacity = "1";
            blink();
          }, 160);
        }, 3500 + Math.random() * 4500);
      };
      blink();
      return () => clearTimeout(t);
    }

    const gain = size === "sm" || size === "md" ? 0.75 : 1;
    const MAX = 12; // viewBox units = 12% of avatar size
    let visible = true;
    let raf = 0;
    let last = 0;
    let rect = root.getBoundingClientRect();
    let rectAt = 0;
    let ox = 0, oy = 0; // eye offset
    let gx = 0, gy = 0, nextGlance = 0; // idle glance target
    let nextBlink = performance.now() + 1500 + Math.random() * 2500;
    let blinkStart = -1;
    let s = 0, v = 0; // jelly spring
    let happyUntil = 0, happy = 0;

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
      last = now;

      // Eye target
      let tx = 0, ty = 0;
      const following = pointer.inside && now - pointer.lastMove < 2800;
      if (following) {
        if (now - rectAt > 300) { rect = root.getBoundingClientRect(); rectAt = now; }
        const dx = pointer.x - (rect.left + rect.width / 2);
        const dy = pointer.y - (rect.top + rect.height / 2);
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 260) * MAX * gain;
        tx = (dx / d) * k;
        ty = (dy / d) * k * 0.8;
      } else {
        if (now > nextGlance) {
          const roll = Math.random();
          gx = roll < 0.35 ? 0 : (Math.random() * 2 - 1) * MAX * 0.6;
          gy = roll < 0.35 ? 0 : (Math.random() * 2 - 1) * MAX * 0.35;
          nextGlance = now + 1400 + Math.random() * 2800;
        }
        tx = gx; ty = gy;
      }
      const a = 1 - Math.exp(-dt * (following ? 14 : 6));
      ox += (tx - ox) * a;
      oy += (ty - oy) * a;

      // Blink and happy squint
      let blinkK = 1;
      if (now > nextBlink && blinkStart < 0) blinkStart = now;
      if (blinkStart >= 0) {
        const p = (now - blinkStart) / 170;
        if (p >= 1) { blinkStart = -1; nextBlink = now + 2200 + Math.random() * 4300; }
        else blinkK = 1 - Math.sin(p * Math.PI) * 0.92;
      }
      happy += ((now < happyUntil ? 1 : 0) - happy) * (1 - Math.exp(-dt * 18));

      // Spring + breathing
      const ω2 = 190, c = 8.5;
      v += (-ω2 * s - c * v) * dt;
      s += v * dt;
      const t = now / 1000;
      const breathe = 0.014 * Math.sin(t * 1.7) + 0.007 * Math.sin(t * 2.9 + 1);
      const sx = 1 + s + breathe;
      const sy = 1 - s * 0.9 - breathe;

      if (bodyRef.current) bodyRef.current.style.transform = `scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
      eyesRef.current?.setAttribute("transform", `translate(${ox.toFixed(2)} ${oy.toFixed(2)})`);
      const eyeT = (cx: number) => `translate(${cx} 50) scale(1 ${Math.max(0.06, blinkK).toFixed(3)})`;
      eyeLRef.current?.setAttribute("transform", eyeT(38));
      eyeRRef.current?.setAttribute("transform", eyeT(62));
      dotsRef.current?.setAttribute("opacity", String(1 - happy));
      arcsRef.current?.setAttribute("opacity", String(happy));

      if (visible && !document.hidden) raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (!raf && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); }
    };
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };

    kick.current = () => {
      v += 2.1;
      happyUntil = performance.now() + 750;
      start();
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(root);
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    const unsub = subscribe(() => {});
    start();

    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      unsub();
    };
  }, [size]);

  const splash = useCallback(() => {
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    kick.current();
    const n = 3;
    const splashes: Splash[] = Array.from({ length: n }, (_, i) => {
      const ang = (-150 + (i * 120) / (n - 1) + (Math.random() * 24 - 12)) * (Math.PI / 180);
      const r = 62 + Math.random() * 22;
      return { dx: `${Math.round(Math.cos(ang) * r * 1.3)}%`, dy: `${Math.round(Math.sin(ang) * r)}%`, delay: Math.round(Math.random() * 60) };
    });
    setBurst((b) => ({ n: b.n + 1, splashes }));
  }, []);

  useEffect(() => {
    if (!burst.n) return;
    const t = setTimeout(() => setBurst((b) => (b.n === burst.n ? { n: b.n, splashes: [] } : b)), 900);
    return () => clearTimeout(t);
  }, [burst.n]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      splash();
    }
  };

  const g = (n: string) => `mav-${n}-${uid}`;
  return (
    <span
      ref={rootRef}
      className={cn(styles.root, isInteractive && styles.interactive, className)}
      style={{ width: px, height: px }}
      {...(isInteractive
        ? { role: "button", tabIndex: 0, "aria-label": label, onPointerDown: splash, onKeyDown: onKey }
        : { "aria-hidden": true })}
    >
      {burst.n > 0 && (
        <span key={burst.n} aria-hidden="true">
          <span className={styles.ripple} />
          <span className={cn(styles.ripple, styles.ripple2)} />
          {burst.splashes.map((p, i) => (
            <span
              key={i}
              className={styles.splash}
              style={{ ["--dx" as string]: p.dx, ["--dy" as string]: p.dy, animationDelay: `${p.delay}ms` }}
            />
          ))}
        </span>
      )}
      <span ref={bodyRef} className={styles.body}>
        <svg viewBox="0 0 100 100" className={styles.svg} focusable="false" aria-hidden="true">
          <defs>
            <radialGradient id={g("fill")} cx="38%" cy="30%" r="80%">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
              <stop offset="0.35" stopColor="#c9ebff" stopOpacity="0.62" />
              <stop offset="0.8" stopColor="#6db4ec" stopOpacity="0.6" />
              <stop offset="1" stopColor="#3b86d6" stopOpacity="0.78" />
            </radialGradient>
            <radialGradient id={g("caustic")} cx="55%" cy="82%" r="38%">
              <stop offset="0" stopColor="#eafcff" stopOpacity="0.95" />
              <stop offset="0.5" stopColor="#9fe3ff" stopOpacity="0.45" />
              <stop offset="1" stopColor="#9fe3ff" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={g("rim")} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
              <stop offset="0.45" stopColor="#fff" stopOpacity="0.1" />
              <stop offset="0.75" stopColor="#d6f3ff" stopOpacity="0.2" />
              <stop offset="1" stopColor="#fff" stopOpacity="0.75" />
            </linearGradient>
            <radialGradient id={g("shadow")} cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#1e4f8f" stopOpacity="0.4" />
              <stop offset="1" stopColor="#1e4f8f" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="50" cy="94" rx="30" ry="6" fill={`url(#${g("shadow")})`} />
          <circle cx="50" cy="49" r="42" fill={`url(#${g("fill")})`} />
          <ellipse cx="50" cy="49" rx="40" ry="40" fill={`url(#${g("caustic")})`} />
          <circle cx="50" cy="49" r="41" fill="none" stroke={`url(#${g("rim")})`} strokeWidth="2.2" />
          <g ref={eyesRef}>
            <g ref={dotsRef}>
              <g ref={eyeLRef} transform="translate(38 50)">
                <circle r="5.4" fill={INK} />
                <circle cx="1.7" cy="-2" r="1.7" fill="#fff" />
              </g>
              <g ref={eyeRRef} transform="translate(62 50)">
                <circle r="5.4" fill={INK} />
                <circle cx="1.7" cy="-2" r="1.7" fill="#fff" />
              </g>
            </g>
            <g ref={arcsRef} opacity="0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round">
              <path d="M32.5 52 Q38 44 43.5 52" />
              <path d="M56.5 52 Q62 44 67.5 52" />
            </g>
          </g>
          <ellipse cx="32" cy="24" rx="13" ry="7" transform="rotate(-35 32 24)" fill="#fff" fillOpacity="0.88" />
          <circle cx="23" cy="38" r="2.6" fill="#fff" fillOpacity="0.8" />
        </svg>
      </span>
    </span>
  );
}
