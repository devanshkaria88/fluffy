"use client";
/* Fluffy: Fluffy's escrow agent, drawn as a soft blob that reacts to what it is doing.
   Ported from the desk's Robin (vanilla SVG blob): body outline recomputed every frame,
   eyes that look around and blink, mouth/cheeks/sweat/dots/zzz/sparkles per mood. */
import { useEffect, useId, useRef } from "react";
import type { Activity, Decision } from "@/lib/types";

export type Mood = "idle" | "thinking" | "happy" | "alarmed" | "concerned" | "sleepy" | "listening";

const PALETTE: Record<string, [string, string, string]> = {
  idle: ["#d4d2ff", "#9592f7", "#5f5ce0"],
  listening: ["#dcdaff", "#a19ffb", "#6865ea"],
  thinking: ["#d4d2ff", "#9592f7", "#5f5ce0"],
  happy: ["#dedcff", "#9f9cfa", "#6461e6"],
  alarmed: ["#ffd0bd", "#ff8361", "#e0452e"],
  concerned: ["#d9d6f6", "#9895e6", "#6a67cf"],
  sleepy: ["#dddbee", "#aeacd6", "#8482b8"],
};

const CAPTION: Record<Mood, string> = {
  idle: "Waiting for PRs. Backflips meanwhile.",
  listening: "Fetching the PR…",
  thinking: "Running the tests, reading both reports…",
  happy: "Paid. Nice work.",
  concerned: "Holding — see why below.",
  alarmed: "Something broke. Check the timeline.",
  sleepy: "Nothing to verify. Napping.",
};

export function FluffyCaption({ mood, activity }: { mood: Mood; activity?: Activity | null }) {
  let text = CAPTION[mood];
  const st = activity?.stage;
  if (mood === "listening" && st === "recalling") text = "Remembering past decisions…";
  if (mood === "thinking" && st === "testing") text = "Running the tests…";
  if (mood === "thinking" && st === "verifying") text = "Reading both reports…";
  if (mood === "thinking" && st === "checking") text = "Checking the policy, §1 to §7…";
  if (mood === "happy" && st === "paying") text = "Releasing the escrow…";
  if (mood === "happy" && st === "commenting") text = "Posting the report on the PR…";
  return <span>{text}</span>;
}

/** activity + last decision → mood. Pure, so the page can call it every poll. */
export function moodFromState(activity: Activity | null | undefined, lastDecision: Decision | undefined, now = Date.now(), mountedAt = now, pendingVerify = false): Mood {
  const age = activity ? now - Date.parse(activity.at) : now - mountedAt;
  if (pendingVerify && (!activity || activity.stage === "done" || activity.stage === "error")) return "listening";
  if (activity) {
    switch (activity.stage) {
      case "fetching":
      case "recalling":
        return "listening";
      case "testing":
      case "verifying":
      case "checking":
        return "thinking";
      case "paying":
      case "commenting":
        return "happy";
      case "error":
        return age < 120_000 ? "alarmed" : "idle";
      case "done": {
        const paid = lastDecision && (lastDecision.status === "paid" || lastDecision.status === "released_by_human");
        if (paid && age < 4000) return "happy";
        if (lastDecision && (lastDecision.status === "held" || lastDecision.status === "disputed")) return age < 120_000 ? "concerned" : "idle";
        if (lastDecision?.status === "failed") return age < 120_000 ? "alarmed" : "idle";
        break;
      }
    }
  }
  // Fluffy never naps: idle means waiting for PRs, and waiting means backflips.
  return "idle";
}

/* ───────────────────────────── drawing */
function blobPath(t: number, amp: number, st: Mood) {
  const N = 9;
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    const wob = amp * (0.62 * Math.sin(t * 1.25 + i * 1.71) + 0.38 * Math.sin(t * 2.05 + i * 0.93));
    const r = 41 * (1 + wob);
    let x = Math.cos(a) * r * 1.06;
    let y = Math.sin(a) * r * 0.97;
    if (y > 18) y = 18 + (y - 18) * 0.82; // a softly flattened base, so it sits
    if (st === "alarmed") x *= 0.97;
    pts.push([x, y]);
  }
  let d = "";
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
    if (i === 0) d += `M${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d + "Z";
}

type Sim = {
  look: { x: number; y: number };
  pointer: { x: number; y: number } | null;
  blinkAt: number;
  blinkT: number;
  jump: number;
  squish: number;
  flip: number; // 1 → 0 while a backflip is in progress
  nextFlipAt: number; // performance.now() timestamp of the next idle backflip
};

export default function Fluffy({ mood, size = 92, className = "" }: { mood: Mood; size?: number; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const moodRef = useRef<Mood>(mood);
  const sim = useRef<Sim>({ look: { x: 0, y: 0 }, pointer: null, blinkAt: 2500, blinkT: 0, jump: 0, squish: 0, flip: 0, nextFlipAt: 3000 });
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gid = `fb-g-${uid}`;

  // mood → palette, class, one-shot reactions
  useEffect(() => {
    const prev = moodRef.current;
    moodRef.current = mood;
    const el = root.current;
    if (!el) return;
    el.dataset.state = mood;
    const pal = PALETTE[mood] ?? PALETTE.idle;
    el.querySelectorAll<SVGStopElement>(".fb-stop").forEach((s, i) => s.setAttribute("stop-color", pal[i]));
    el.style.setProperty("--fb-lid", pal[1]);
    if (mood !== prev) {
      if (mood === "happy") {
        sim.current.squish = 1;
        el.classList.remove("sparkle");
        void el.offsetWidth;
        el.classList.add("sparkle");
        const t = setTimeout(() => el.classList.remove("sparkle"), 1300);
        return () => clearTimeout(t);
      }
      if (mood === "alarmed") sim.current.jump = 1;
    }
  }, [mood]);

  // animation loop
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const q = <T extends Element>(sel: string) => el.querySelector(sel) as T | null;
    const body = q<SVGPathElement>(".fb-body"), all = q<SVGGElement>(".fb-all"), shadow = q<SVGEllipseElement>(".fb-shadow");
    const face = q<SVGGElement>(".fb-face"), ring = q<SVGCircleElement>(".fb-ring"), mouth = q<SVGPathElement>(".fb-mouth"), o = q<SVGEllipseElement>(".fb-o");
    const eyes = Array.from(el.querySelectorAll<SVGGElement>(".fb-eye"));
    if (!body || !all || !shadow || !face || !ring || !mouth || !o) return;
    const S = sim.current;
    S.blinkAt = performance.now() + 2500;

    function draw(now: number) {
      const st = moodRef.current;
      const t = now / 1000;
      const still = reduced.matches;
      const amp = still ? 0 : ({ idle: 0.035, listening: 0.05, thinking: 0.045, happy: 0.065, alarmed: 0.06, concerned: 0.03, sleepy: 0.02 } as Record<Mood, number>)[st] ?? 0.035;
      const speed = st === "sleepy" ? 0.45 : st === "alarmed" ? 2.4 : st === "thinking" ? 1.4 : 1;
      body!.setAttribute("d", blobPath(t * speed, amp, st));

      // bob, jump, squish
      let bob = still ? 0 : Math.sin(t * (st === "sleepy" ? 1.1 : 2)) * (st === "sleepy" ? 1.2 : 2.4);
      let sx = 1, sy = 1, rot = 0;
      if (!still) {
        sy = 1 + Math.sin(t * 2 + 1.2) * 0.018;
        sx = 2 - sy;
        if (S.jump > 0) {
          const p = 1 - S.jump;
          bob -= Math.sin(Math.min(1, p * 1.6) * Math.PI) * 16;
          if (p > 0.62) { const k = Math.sin(((p - 0.62) / 0.38) * Math.PI); sy -= k * 0.16; sx += k * 0.14; }
          S.jump = Math.max(0, S.jump - 0.025);
        }
        if (S.squish > 0) {
          const k = Math.sin(S.squish * Math.PI * 3) * S.squish;
          sy -= k * 0.14; sx += k * 0.12;
          S.squish = Math.max(0, S.squish - 0.022);
        }
        if (st === "alarmed") rot = Math.sin(t * 38) * 1.4;
        if (st === "sleepy") rot = -5;
        if (st === "listening") { const k = 1 + Math.sin(t * 3.2) * 0.012; sx *= k; sy *= k; }

        // idle = waiting for PRs = backflips every few seconds
        if (st === "idle") {
          if (S.flip <= 0 && now > S.nextFlipAt) S.flip = 1;
          if (S.flip > 0) {
            const p = 1 - S.flip; // 0 → 1 over ~1.1s
            const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
            rot = -360 * ease; // backwards, a proper backflip
            bob -= Math.sin(p * Math.PI) * 26; // jump arc
            if (p < 0.12) { const k = Math.sin((p / 0.12) * Math.PI); sy -= k * 0.14; sx += k * 0.12; } // crouch
            if (p > 0.86) { const k = Math.sin(((p - 0.86) / 0.14) * Math.PI); sy -= k * 0.16; sx += k * 0.14; } // landing squish
            S.flip = Math.max(0, S.flip - 0.015);
            if (S.flip === 0) S.nextFlipAt = now + 3500 + Math.random() * 3500;
          }
        } else {
          S.flip = 0;
          S.nextFlipAt = now + 2500;
        }
      }
      const pivotY = S.flip > 0 ? 0 : 30; // flip around the body centre, lean around the base
      all!.setAttribute("transform", `translate(0 ${bob.toFixed(2)}) rotate(${rot.toFixed(2)} 0 ${pivotY}) scale(${sx.toFixed(3)} ${sy.toFixed(3)})`);
      const lift = Math.max(0, -bob);
      shadow!.setAttribute("rx", (30 - lift * 0.6).toFixed(2));
      shadow!.setAttribute("opacity", (1 - lift / 30).toFixed(2));

      // listening ring
      if (st === "listening" && !still) {
        const p = (t * 0.8) % 1;
        ring!.setAttribute("r", (44 + p * 12).toFixed(1));
        ring!.style.opacity = String((1 - p) * 0.55);
      } else ring!.style.opacity = "0";

      // gaze
      let tx = 0, ty = 0;
      if (st === "thinking" && !still) { tx = Math.cos(t * 4.2) * 0.75; ty = Math.sin(t * 4.2) * 0.65; }
      else if (st === "sleepy") { tx = 0; ty = 0.6; }
      else if (S.pointer && !still) {
        const r = el!.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const dx = S.pointer.x - cx, dy = S.pointer.y - cy, dist = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, dist / 380);
        tx = (dx / dist) * k; ty = (dy / dist) * k;
      } else if (!still) { tx = Math.sin(t * 0.37) * 0.35; ty = Math.sin(t * 0.23) * 0.2; }
      const ease = still ? 1 : 0.14;
      S.look.x += (tx - S.look.x) * ease;
      S.look.y += (ty - S.look.y) * ease;
      face!.setAttribute("transform", `translate(${(S.look.x * 3.4).toFixed(2)} ${(S.look.y * 2.4).toFixed(2)})`);

      // blink
      let blink = 1;
      if (!still && st !== "happy" && st !== "sleepy") {
        if (now > S.blinkAt) { S.blinkT = now; S.blinkAt = now + 2200 + Math.random() * 3800; }
        const bt = now - S.blinkT;
        if (bt < 150) blink = Math.max(0.08, Math.abs(1 - bt / 75));
      }
      const wide = st === "alarmed" ? 1.18 : st === "listening" ? 1.08 : 1;
      const pr = st === "alarmed" ? 3.4 : st === "listening" ? 5.8 : 5.4;
      for (const eye of eyes) {
        const side = Number(eye.dataset.side);
        eye.setAttribute("transform", `translate(${side * 14.6} -4)`);
        const ball = eye.querySelector(".fb-eyeball")!;
        ball.setAttribute("transform", `scale(${wide.toFixed(3)} ${(wide * blink).toFixed(3)})`);
        const pupil = eye.querySelector(".pupil")!;
        pupil.setAttribute("transform", `translate(${(S.look.x * 3.4).toFixed(2)} ${(S.look.y * 4).toFixed(2)})`);
        pupil.firstElementChild!.setAttribute("r", String(pr));
        const lid = eye.querySelector(".fb-lid")!;
        let d = "";
        if (st === "sleepy") d = "M-12 -15 H12 V1.5 Q0 4.5 -12 1.5Z";
        else if (st === "concerned") d = side < 0 ? "M-12 -15 H12 V-6.5 L-12 -10.5Z" : "M-12 -15 H12 V-10.5 L-12 -6.5Z";
        lid.setAttribute("d", d);
      }

      // mouth
      let m = "", filled = false, oo = 0;
      if (st === "happy") { m = "M-9.5 10.5 Q0 25 9.5 10.5 Q0 14 -9.5 10.5Z"; filled = true; }
      else if (st === "alarmed") { oo = 1; o!.setAttribute("ry", "4.6"); o!.setAttribute("rx", "3.6"); }
      else if (st === "listening") { oo = 1; o!.setAttribute("ry", "2.8"); o!.setAttribute("rx", "3.2"); }
      else if (st === "concerned") m = "M-7 15 q3.5 -3 7 0 t7 0";
      else if (st === "sleepy") m = "M-4 15 Q0 16.5 4 15";
      else if (st === "thinking") m = "M-2.5 15.2 Q1.5 14 5.5 14.6";
      else m = "M-7.5 12.5 Q0 19.5 7.5 12.5";
      mouth!.setAttribute("d", oo ? "" : m);
      mouth!.classList.toggle("filled", filled);
      o!.style.opacity = String(oo);
    }

    let raf = 0;
    let stillTimer = 0;
    const loop = (now: number) => { draw(now); raf = requestAnimationFrame(loop); };
    const start = () => {
      cancelAnimationFrame(raf);
      clearInterval(stillTimer);
      if (reduced.matches) { draw(performance.now()); stillTimer = window.setInterval(() => draw(performance.now()), 1000); return; }
      raf = requestAnimationFrame(loop);
    };
    const onVis = () => { if (document.hidden) cancelAnimationFrame(raf); else start(); };
    const onMove = (e: PointerEvent) => { S.pointer = { x: e.clientX, y: e.clientY }; };
    start();
    document.addEventListener("visibilitychange", onVis);
    reduced.addEventListener?.("change", start);
    addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(stillTimer);
      document.removeEventListener("visibilitychange", onVis);
      reduced.removeEventListener?.("change", start);
      removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div ref={root} className={`fluffy ${className}`} data-state={mood} style={{ width: size, height: size * (126 / 120) }} aria-label={`Fluffy (${mood})`} role="img">
      <svg viewBox="-60 -66 120 126" aria-hidden="true">
        <defs>
          <radialGradient id={gid} cx="36%" cy="28%" r="78%">
            <stop className="fb-stop" offset="0" stopColor="#d4d2ff" />
            <stop className="fb-stop" offset=".55" stopColor="#9592f7" />
            <stop className="fb-stop" offset="1" stopColor="#5f5ce0" />
          </radialGradient>
        </defs>
        <circle className="fb-ring" r="46" fill="none" strokeWidth="2" />
        <ellipse className="fb-shadow" cx="0" cy="50" rx="30" ry="4.6" />
        <g className="fb-all">
          <path className="fb-body" fill={`url(#${gid})`} />
          <path className="fb-shine" d="M-24 -22 Q-16 -32 -4 -33" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="4" strokeLinecap="round" />
          <g className="fb-cheeks"><ellipse cx="-23" cy="9" rx="6" ry="3.4" /><ellipse cx="23" cy="9" rx="6" ry="3.4" /></g>
          <g className="fb-face">
            {[-1, 1].map((side) => (
              <g className="fb-eye" data-side={side} key={side}>
                <g className="fb-eyeball">
                  <ellipse className="sclera" rx="9.8" ry="12.2" />
                  <g className="pupil"><circle r="5.4" /><circle className="glint" cx="1.9" cy="-2.4" r="1.8" /></g>
                </g>
                <path className="fb-lid" />
                <path className="fb-happy-eye" d="M-7.5 2 Q0 -7 7.5 2" />
              </g>
            ))}
            <path className="fb-mouth" />
            <ellipse className="fb-o" cx="0" cy="15" rx="3.4" ry="4" />
          </g>
          <path className="fb-sweat" d="M30 -26 q4 6 0 9 q-4 -3 0 -9z" />
        </g>
        <g className="fb-dots"><circle cx="-8" cy="-50" r="2.6" /><circle cx="0" cy="-54" r="3.1" /><circle cx="9" cy="-57" r="3.6" /></g>
        <g className="fb-zzz"><text x="22" y="-36">z</text><text x="31" y="-47">z</text><text x="40" y="-58">Z</text></g>
        <g className="fb-sparkles">
          <path d="M-44 -30 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" /><path d="M42 -34 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z" />
          <path d="M46 10 l1.4 3.4 3.4 1.4 -3.4 1.4 -1.4 3.4 -1.4 -3.4 -3.4 -1.4 3.4 -1.4z" /><path d="M-47 14 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2z" />
        </g>
      </svg>
    </div>
  );
}

/** The agent's dot: the desk's small inline face (agentFace), for rows, timelines and chips. */
export function FluffyDot({ size = 18, className = "", title = "Fluffy" }: { size?: number; className?: string; title?: string }) {
  const id = `af-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <span className={`fluffy-dot ${className}`} title={title} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
        <defs>
          <radialGradient id={id} cx="35%" cy="30%" r="80%">
            <stop offset="0" stopColor="#a9a7ff" />
            <stop offset="1" stopColor="#6461e0" />
          </radialGradient>
        </defs>
        <path d="M10 1.6c4.9 0 8.4 3.3 8.4 8.2 0 5-3.6 8.6-8.4 8.6S1.6 15 1.6 10C1.6 5.1 5.1 1.6 10 1.6z" fill={`url(#${id})`} />
        <ellipse cx="7.3" cy="9.3" rx="1.9" ry="2.4" fill="#fff" />
        <ellipse cx="12.7" cy="9.3" rx="1.9" ry="2.4" fill="#fff" />
        <circle cx="7.7" cy="9.8" r="1.05" fill="#1d1c1a" />
        <circle cx="13.1" cy="9.8" r="1.05" fill="#1d1c1a" />
        <path d="M8.6 13.4q1.4 1 2.8 0" stroke="#1d1c1a" strokeWidth=".9" fill="none" strokeLinecap="round" />
      </svg>
    </span>
  );
}
