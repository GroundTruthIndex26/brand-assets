import { useEffect, useRef } from "react";

/**
 * BugWalker
 *
 * The circuit-brain from the wordmark, which wakes up and walks off.
 *
 * It starts docked in the gap in /logo-stacked-nobug.png, at the exact size and
 * position the icon used to occupy, so on arrival the logo looks whole. After a
 * beat it stretches, peels off the wordmark and walks away, leaving the gap.
 *
 * Every limb is a real leg: the five above the body centre act as front legs,
 * the five below as back legs, the two level ones swing. During stance each leg
 * rotates at exactly the rate that holds its foot still while the body rides
 * over it, solved from that leg's own hip-to-foot geometry, so the step rate can
 * never drift away from the travel speed.
 *
 * It strolls most of the time. Occasionally it walks to a word in the phrase,
 * heads for the rim and bumps it, or crouches and jumps. Walking pace is a held
 * property that only changes after something that is not walking.
 *
 * Requires in the DOM:
 *   [data-bug-dock]  the logo <img>, used to find the gap
 *   [data-bug-word]  the words it can walk to
 * Both are optional. Without the dock it just starts walking.
 */

/** where the gap sits inside the logo image, as fractions of the rendered box */
const DOCK_SIZE_W = 0.13791;
const DOCK_LEFT_W = 0.34115;
const DOCK_TOP_H = 0.06442;

const PIVOT: Record<string, [number, number]> = {
  "antenna-left": [28.58, 40.82],
  "antenna-left-short": [40.82, 28.58],
  "antenna-center": [50.0, 28.58],
  "antenna-right": [59.18, 28.58],
  "antenna-right-short": [71.42, 40.82],
  "arm-left": [28.58, 50.0],
  "arm-right": [71.42, 50.0],
  "leg-far-left": [28.58, 58.16],
  "leg-far-right": [71.42, 58.16],
  "leg-left": [40.82, 71.42],
  "leg-center": [50.0, 71.42],
  "leg-right": [59.18, 71.42],
};

/** foot position relative to its own hip, at rest */
const FOOT: Record<string, [number, number]> = {
  "antenna-left": [-11.22, -28.56],
  "antenna-left-short": [-9.18, -10.2],
  "antenna-center": [0.0, -16.32],
  "antenna-right": [29.58, -11.22],
  "antenna-right-short": [10.2, -9.18],
  "arm-left": [-16.32, 0.0],
  "arm-right": [17.34, 0.0],
  "leg-far-left": [-9.18, 9.18],
  "leg-far-right": [11.22, 29.58],
  "leg-left": [-29.58, 10.2],
  "leg-center": [0.0, 16.32],
  "leg-right": [9.18, 9.18],
};

/** alternating around the perimeter so neighbouring limbs never step together */
const GAIT_PHASE: Record<string, number> = {
  "antenna-left": 0.0,
  "antenna-left-short": 0.5,
  "antenna-center": 0.035,
  "antenna-right": 0.535,
  "antenna-right-short": 0.07,
  "arm-right": 0.57,
  "leg-far-right": 0.105,
  "leg-right": 0.605,
  "leg-center": 0.14,
  "leg-left": 0.64,
  "leg-far-left": 0.175,
  "arm-left": 0.675,
};

const LIMBS = Object.keys(PIVOT);
const BASE_STRIDE = 11.5;
const REACH: Record<string, number> = {};
const REST_ANGLE: Record<string, number> = {};
const BRANCH: Record<string, number> = {};
const IS_SIDE: Record<string, boolean> = {};
for (const k of LIMBS) {
  const [fx, fy] = FOOT[k];
  REACH[k] = Math.hypot(fx, fy);
  REST_ANGLE[k] = Math.atan2(fy, fx);
  BRANCH[k] = REST_ANGLE[k] >= 0 ? 1 : -1;
  IS_SIDE[k] = Math.abs(fy) <= 0.5;
}

/** the angle that keeps this foot planted while the body advances `stride` */
function stanceAngle(k: string, p: number, stride: number) {
  const [fx] = FOOT[k];
  const r = REACH[k];
  const t = Math.max(-r + 1e-3, Math.min(r - 1e-3, fx - stride * (p - 0.5)));
  return BRANCH[k] * Math.acos(t / r) - REST_ANGLE[k];
}

const DEG = 180 / Math.PI;
function limbPose(k: string, phase: number, duty: number, lift: number, gather: number, stride: number) {
  const u = (((phase + GAIT_PHASE[k]) % 1) + 1) % 1;
  let a: number;
  let l: number;
  if (IS_SIDE[k]) {
    a = 18 * Math.sin(2 * Math.PI * u);
    l = -0.5 * lift * Math.max(0, Math.sin(2 * Math.PI * u));
  } else if (u < duty) {
    a = stanceAngle(k, u / duty, stride) * DEG;
    l = 0;
  } else {
    const p = (u - duty) / (1 - duty);
    const e = p * p * (3 - 2 * p);
    const a0 = stanceAngle(k, 1, stride) * DEG;
    const a1 = stanceAngle(k, 0, stride) * DEG;
    a = a0 + (a1 - a0) * e;
    l = -lift * Math.sin(Math.PI * p);
  }
  return [a * (1 - gather), l * (1 - gather)] as const;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

/** how big it is once it is off the logo and walking */
function walkSizePx() {
  if (typeof window === "undefined") return 92;
  const d = Math.sqrt(window.innerWidth * window.innerHeight);
  return Math.round(clamp(0.085 * d, 62, 118));
}

export default function BugWalker() {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const dock = document.querySelector<HTMLElement>("[data-bug-dock]");
      if (dock) {
        const r = dock.getBoundingClientRect();
        const s = (DOCK_SIZE_W * r.width) / walkSizePx();
        svg.style.transform =
          "translate(" + (r.left + DOCK_LEFT_W * r.width) + "px," + (r.top + DOCK_TOP_H * r.height) + "px) scale(" + s + ")";
      } else {
        svg.style.opacity = "0";
      }
      return;
    }

    const nodes: Record<string, SVGGElement> = {};
    for (const k of LIMBS) {
      const el = svg.querySelector<SVGGElement>("#" + k);
      if (!el) return;
      nodes[k] = el;
    }
    const bodyEl = svg.querySelector<SVGGElement>("#body");
    const sqEl = svg.querySelector<SVGGElement>("#squash");
    if (!bodyEl || !sqEl) return;

    let ICON = walkSizePx();
    svg.style.width = ICON + "px";
    svg.style.height = ICON + "px";

    /** motion was tuned for a 104px bug on a 380x700 screen */
    const K = () => (ICON / 104) * clamp(Math.min(window.innerWidth, window.innerHeight) / 640, 0.9, 1.9);
    const areaW = () => Math.max(0, window.innerWidth - ICON);
    const areaH = () => Math.max(0, window.innerHeight - ICON);
    const cx = (v: number) => clamp(v, 0, areaW());
    const cy = (v: number) => clamp(v, 0, areaH());

    function dockRect() {
      const el = document.querySelector<HTMLElement>("[data-bug-dock]");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 40) return null;
      return {
        left: r.left + DOCK_LEFT_W * r.width,
        top: r.top + DOCK_TOP_H * r.height,
        size: DOCK_SIZE_W * r.width,
        bottom: r.bottom,
      };
    }

    function wordTargets(): Array<[number, number]> {
      const out: Array<[number, number]> = [];
      document.querySelectorAll<HTMLElement>("[data-bug-word]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 18 || r.height < 6) return;
        out.push([cx(r.left + r.width / 2 - ICON / 2), cy(r.top + r.height / 2 - ICON / 2)]);
      });
      return out;
    }

    const dock0 = dockRect();
    let x = dock0 ? dock0.left : areaW() * 0.5;
    let y = dock0 ? dock0.top : areaH() * 0.5;
    let elemScale = dock0 ? dock0.size / ICON : 1;

    let heading = rnd(-0.4, 0.4);
    let curve = 0;
    let phase = 0;
    let facing = 1;
    let spd = 0;
    let spdTarget = 0;
    let gather = 1;
    let squash = 0;
    let scale = 1;
    let shake = 0;
    let overX = 0;
    let overY = 0;
    let twitch = 0;
    let state: "dock" | "wake" | "peel" | "pause" | "run" | "crouch" | "fly" = dock0 ? "dock" : "pause";
    let timer = dock0 ? 1.35 : 0.4;
    let target: [number, number] | null = null;
    let jump: [number, number, number, number] = [0, 0, 0, 0];
    let peelFrom: [number, number, number] = [x, y, elemScale];
    let peelTo: [number, number, number] = [x, y, 1];
    let lastAct = "";
    let sinceJump = 99;
    let walkSpd = 44;
    let paceDirty = true;
    let firstMove = true;

    function chooseAction() {
      const k = K();
      if (paceDirty) {
        const r = Math.random();
        walkSpd = (r < 0.08 ? rnd(150, 192) : r < 0.18 ? rnd(74, 132) : rnd(28, 58)) * k;
        paceDirty = false;
      }
      const fast = walkSpd > 100 * k;
      const words = wordTargets();
      const opts: string[] = [];
      if (words.length && lastAct !== "word") opts.push(...Array(fast ? 40 : 10).fill("word"));
      if (lastAct !== "edge") opts.push(...Array(fast ? 38 : 6).fill("edge"));
      if (!fast && lastAct !== "wander") opts.push(...Array(80).fill("wander"));
      if (lastAct !== "jump" && sinceJump >= 3) opts.push(...Array(24).fill("jump"));
      let act = opts.length ? opts[(Math.random() * opts.length) | 0] : fast ? "edge" : "wander";

      if (firstMove) {
        act = "wander";                       // first thing it does is leave the wordmark
        firstMove = false;
      }
      lastAct = act;
      sinceJump = act === "jump" ? 0 : sinceJump + 1;

      if (act === "word") {
        target = words[(Math.random() * words.length) | 0];
        heading = Math.atan2(target[1] - y, target[0] - x);
        spdTarget = walkSpd;
        state = "run";
        timer = 7;
        gather = 0;
        curve = rnd(-0.8, 0.8);
      } else if (act === "edge") {
        const s = "LRTB"[(Math.random() * 4) | 0];
        target =
          s === "L" ? [-40, rnd(0, areaH())] :
          s === "R" ? [areaW() + 40, rnd(0, areaH())] :
          s === "T" ? [rnd(0, areaW()), -40] :
          [rnd(0, areaW()), areaH() + 40];
        heading = Math.atan2(target[1] - y, target[0] - x);
        spdTarget = walkSpd;
        state = "run";
        timer = 9;
        gather = 0;
        curve = rnd(-0.7, 0.7);
      } else if (act === "jump") {
        state = "crouch";
        timer = 0.24;
        squash = 0;
        paceDirty = true;
        target = null;
        let jx = x;
        let jy = y;
        for (let i = 0; i < 30; i++) {
          jx = cx(rnd(0, areaW()));
          jy = cy(rnd(0, areaH()));
          if (Math.hypot(jx - x, jy - y) > 150 * k) break;
        }
        jump = [x, y, jx, jy];
      } else {
        const d = dockRect();
        if (d && y < d.bottom) {
          heading = rnd(0.5, Math.PI - 0.5);   // head down the screen, away from the logo
        } else {
          heading += Math.random() < 0.6 ? (Math.random() < 0.5 ? -1 : 1) * rnd(0.5, Math.PI) : rnd(-0.5, 0.5);
        }
        spdTarget = walkSpd;
        state = "run";
        timer = rnd(1.3, 3.0) * clamp(k, 1, 1.9);
        target = null;
        gather = 0;
        curve = rnd(-1.2, 1.2);
      }
    }

    let raf = 0;
    let last = 0;

    function frame(now: number) {
      if (!last) last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const k = K();
      let pulse = 1;

      if (state === "dock") {
        const d = dockRect();
        if (d) {
          x = d.left;
          y = d.top;
          elemScale = d.size / ICON;
        }
        timer -= dt;
        gather = 1;
        twitch = timer < 0.35 ? Math.sin(timer * 40) * (0.35 - timer) * 1.6 : 0;
        if (timer <= 0) {
          state = "wake";
          timer = 0.55;
          peelFrom = [x, y, elemScale];
        }
      } else if (state === "wake") {
        timer -= dt;
        const p = 1 - Math.max(0, timer) / 0.55;
        const e = p * p * (3 - 2 * p);
        squash = -0.55 * Math.sin(Math.PI * e);   // a long stretch, then release
        gather = 1 - 1.45 * e;
        twitch = 0;
        if (timer <= 0) {
          state = "peel";
          timer = 0.6;
          const d = dockRect();
          peelFrom = [x, y, elemScale];
          peelTo = [cx(x - ICON * 0.15), cy(d ? d.bottom + ICON * 0.1 : y + ICON), 1];
        }
      } else if (state === "peel") {
        timer -= dt;
        const p = 1 - Math.max(0, timer) / 0.6;
        const e = p * p * (3 - 2 * p);
        x = peelFrom[0] + (peelTo[0] - peelFrom[0]) * e;
        y = peelFrom[1] + (peelTo[1] - peelFrom[1]) * e;
        elemScale = peelFrom[2] + (peelTo[2] - peelFrom[2]) * e;
        squash += (0 - squash) * Math.min(1, dt * 6);
        gather = -0.45 * (1 - e);
        phase = (phase + dt * 1.1) % 1;
        if (timer <= 0) {
          elemScale = 1;
          state = "pause";
          timer = 0.2;
          gather = 0;
        }
      } else if (state === "pause") {
        timer -= dt;
        overX *= 0.78;
        overY *= 0.78;
        squash += (0 - squash) * Math.min(1, dt * 7);
        scale += (1 - scale) * Math.min(1, dt * 7);
        shake = Math.max(0, shake - dt * 1.7);
        if (timer <= 0) chooseAction();
      } else if (state === "crouch") {
        timer -= dt;
        gather = 1;
        squash += (0.85 - squash) * Math.min(1, dt * 12);
        scale += (0.9 - scale) * Math.min(1, dt * 12);
        if (timer <= 0) {
          state = "fly";
          timer = 0.38;
        }
      } else if (state === "fly") {
        timer -= dt;
        const p = 1 - Math.max(0, timer) / 0.38;
        x = jump[0] + (jump[2] - jump[0]) * p;
        y = jump[1] + (jump[3] - jump[1]) * p;
        const arc = Math.sin(Math.PI * p);
        scale = 1 + 0.22 * arc;
        squash = -0.3 * arc;
        gather = -0.45 * arc;
        if (timer <= 0) {
          x = jump[2];
          y = jump[3];
          state = "pause";
          timer = rnd(0.25, 0.7);
          squash = 1;
          scale = 0.93;
          overX = 0;
          overY = 3;
          gather = 1;
        }
      } else {
        timer -= dt;
        spd += (spdTarget - spd) * Math.min(1, dt * 14);
        gather = Math.max(0, gather - dt * 8);
        squash += (0 - squash) * Math.min(1, dt * 8);
        scale += (1 - scale) * Math.min(1, dt * 8);

        curve += (-curve * 1.5 + (Math.random() * 2 - 1) * 2.6) * dt;
        if (target) {
          const want = Math.atan2(target[1] - y, target[0] - x);
          curve += Math.atan2(Math.sin(want - heading), Math.cos(want - heading)) * 2.2 * dt;
        }
        curve = clamp(curve, -3.2, 3.2);
        heading += curve * dt;
        pulse = 1 + 0.13 * Math.sin(2 * Math.PI * phase);

        const vx = spd * pulse * Math.cos(heading);
        const vy = spd * pulse * Math.sin(heading);
        x += vx * dt;
        y += vy * dt;

        let hx = 0;
        let hy = 0;
        let hit = false;
        if (x <= 0) { x = 0; hx = 1; hit = true; } else if (x >= areaW()) { x = areaW(); hx = -1; hit = true; }
        if (y <= 0) { y = 0; hy = 1; hit = true; } else if (y >= areaH()) { y = areaH(); hy = -1; hit = true; }

        const stride = BASE_STRIDE + 7 * Math.min(1, spd / (180 * k));
        if (vx > 0.2 * spd * pulse) facing = 1;
        else if (vx < -0.2 * spd * pulse) facing = -1;
        phase = (((phase + (facing * spd * pulse * dt) / ((stride * ICON) / 100)) % 1) + 1) % 1;

        if (hit) {
          const mag = Math.min(1, spd / (190 * k));
          overX = hx * (3 + 7 * mag) * k;
          overY = hy * (3 + 7 * mag) * k;
          squash = 0.9 + 0.5 * mag;
          shake = 1;
          paceDirty = true;
          state = "pause";
          timer = 0.85 + 0.6 * mag;
          spd = 0;
          gather = 1;
          target = null;
          heading = Math.atan2(hy || rnd(-0.7, 0.7), hx || rnd(-0.7, 0.7));
        } else if (target && Math.hypot(target[0] - x, target[1] - y) < 10) {
          state = "pause";
          timer = rnd(0.5, 1.6);
          spd = 0;
          gather = 1;
          overX = Math.cos(heading) * 2.5;
          overY = Math.sin(heading) * 2.5;
          squash = 0.45;
          target = null;
        } else if (timer <= 0) {
          state = "pause";
          timer = rnd(0.15, 0.9);
          spd = 0;
          gather = 1;
          overX = Math.cos(heading) * 2;
          overY = Math.sin(heading) * 2;
          squash = 0.35;
          target = null;
        }
      }

      const norm = Math.min(1, spd / (150 * k));
      const duty = 0.62 - 0.12 * norm;
      const lift = 2 + 1.4 * norm;
      const bobA = 0.6 + 1 * norm;
      const stride = BASE_STRIDE + 7 * Math.min(1, spd / (180 * k));
      for (const key of LIMBS) {
        const [px, py] = PIVOT[key];
        let [a, l] = limbPose(key, phase, duty, lift, gather, stride);
        if (shake > 0) a += shake * (Math.random() * 32 - 16);
        if (twitch !== 0 && (key === "antenna-left" || key === "antenna-right")) {
          a += twitch * (key === "antenna-left" ? 9 : -9);
        }
        nodes[key].setAttribute("transform", "translate(0 " + l.toFixed(2) + ") rotate(" + a.toFixed(2) + " " + px + " " + py + ")");
      }
      bodyEl!.setAttribute("transform", "translate(0 " + (-bobA * Math.cos(4 * Math.PI * (phase - 0.3))).toFixed(2) + ")");
      const sx = scale * (1 + 0.1 * squash);
      const sy = scale * (1 - 0.1 * squash);
      sqEl!.setAttribute(
        "transform",
        "translate(" + (50 * (1 - sx)).toFixed(2) + " " + (50 * (1 - sy)).toFixed(2) + ") scale(" + sx.toFixed(3) + " " + sy.toFixed(3) + ")"
      );

      const jx = shake > 0 ? (Math.random() * 4.8 - 2.4) * shake : 0;
      const jy = shake > 0 ? (Math.random() * 4.8 - 2.4) * shake : 0;
      svg!.style.transform =
        "translate(" + (x + overX + jx).toFixed(1) + "px," + (y + overY + jy).toFixed(1) + "px) scale(" + elemScale.toFixed(4) + ")";

      raf = requestAnimationFrame(frame);
    }

    function onResize() {
      ICON = walkSizePx();
      svg!.style.width = ICON + "px";
      svg!.style.height = ICON + "px";
      x = cx(x);
      y = cy(y);
    }
    const onVis = () => { last = 0; };
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: 92,
        height: 92,
        transformOrigin: "0 0",
        pointerEvents: "none",
        zIndex: 40,
        willChange: "transform",
      }}
    >
      <g id="squash">
        <g id="limbs" fill="none" stroke="#F4B400" stroke-width="4.1" stroke-linecap="round" stroke-linejoin="round">
            <g id="antenna-left">
              <path id="antenna-left-line" d="M31.64 40.82 L17.36 40.82 L17.36 12.26" />
              <circle id="antenna-left-pad" cx="17.36" cy="12.26" r="4.1" fill="#F4B400" stroke="none" />
            </g>
            <g id="antenna-left-short">
              <path id="antenna-left-short-line" d="M40.82 31.64 L40.82 18.38 L31.64 18.38" />
              <circle id="antenna-left-short-pad" cx="31.64" cy="18.38" r="4.1" fill="#F4B400" stroke="none" />
            </g>
            <g id="antenna-center">
              <path id="antenna-center-line" d="M50.0 31.64 L50.0 12.26" />
              <circle id="antenna-center-pad" cx="50.0" cy="12.26" r="4.1" fill="#F4B400" stroke="none" />
            </g>
            <g id="antenna-right">
              <path id="antenna-right-line" d="M59.18 31.64 L59.18 17.36 L88.76 17.36" />
              <circle id="antenna-right-pad" cx="88.76" cy="17.36" r="4.1" fill="#F4B400" stroke="none" />
            </g>
            <g id="antenna-right-short">
              <path id="antenna-right-short-line" d="M68.36 40.82 L81.62 40.82 L81.62 31.64" />
              <circle id="antenna-right-short-pad" cx="81.62" cy="31.64" r="4.1" fill="#F4B400" stroke="none" />
            </g>
            <g id="arm-left">
              <path id="arm-left-line" d="M31.64 50.0 L12.26 50.0" />
              <circle id="arm-left-pad" cx="12.26" cy="50.0" r="4.1" fill="#F4B400" stroke="none" />
            </g>
            <g id="arm-right">
              <path id="arm-right-line" d="M68.36 50.0 L88.76 50.0" />
              <circle id="arm-right-pad" cx="88.76" cy="50.0" r="4.1" fill="#F4B400" stroke="none" />
            </g>
            <g id="leg-far-left">
              <path id="leg-far-left-line" d="M31.64 58.16 L19.4 58.16 L19.4 67.34" />
              <circle id="leg-far-left-pad" cx="19.4" cy="67.34" r="4.1" fill="#F4B400" stroke="none" />
            </g>
            <g id="leg-far-right">
              <path id="leg-far-right-line" d="M68.36 58.16 L82.64 58.16 L82.64 87.74" />
              <circle id="leg-far-right-pad" cx="82.64" cy="87.74" r="4.1" fill="#F4B400" stroke="none" />
            </g>
            <g id="leg-left">
              <path id="leg-left-line" d="M40.82 68.36 L40.82 81.62 L11.24 81.62" />
              <circle id="leg-left-pad" cx="11.24" cy="81.62" r="4.1" fill="#F4B400" stroke="none" />
            </g>
            <g id="leg-center">
              <path id="leg-center-line" d="M50.0 68.36 L50.0 87.74" />
              <circle id="leg-center-pad" cx="50.0" cy="87.74" r="4.1" fill="#F4B400" stroke="none" />
            </g>
            <g id="leg-right">
              <path id="leg-right-line" d="M59.18 68.36 L59.18 80.6 L68.36 80.6" />
              <circle id="leg-right-pad" cx="68.36" cy="80.6" r="4.1" fill="#F4B400" stroke="none" />
            </g>
          </g>
        
          <g id="body">
            <rect id="chip" x="28.58" y="28.58" width="42.84" height="42.84" rx="7.7" ry="7.7" fill="#F4B400" />
            <g id="brain" transform="translate(0 1.15)" fill="none" stroke="#0A6B70" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <path id="brain-lobe-left" d="M50.0 34.91 C46.55 31.41 41.66 32.14 39.83 36.24 C36.67 36.72 34.85 40.46 35.9 43.97 C33.7 46.38 33.89 50.97 36.19 52.9 C35.42 56.76 37.44 60.62 40.6 61.1 C41.94 64.73 46.07 66.05 48.66 63.76 C49.14 63.4 49.62 62.79 50.0 62.19" />
              <path id="brain-lobe-right" d="M50.0 34.91 C53.45 31.41 58.34 32.14 60.17 36.24 C63.33 36.72 65.15 40.46 64.1 43.97 C66.3 46.38 66.11 50.97 63.81 52.9 C64.58 56.76 62.56 60.62 59.4 61.1 C58.06 64.73 53.93 66.05 51.34 63.76 C50.86 63.4 50.38 62.79 50.0 62.19" />
              <path id="brain-stem" d="M50.0 34.91 L50.0 65.09" />
              <path id="brain-fold-left-1" d="M44.82 38.65 C46.74 40.59 46.55 43.6 44.44 44.93" />
              <path id="brain-fold-left-2" d="M40.79 48.31 C43.29 48.31 45.01 50.48 45.01 53.38 C45.01 55.91 43.86 57.72 42.14 58.45" />
              <path id="brain-fold-right-1" d="M55.18 38.65 C53.26 40.59 53.45 43.6 55.56 44.93" />
              <path id="brain-fold-right-2" d="M59.21 48.31 C56.71 48.31 54.99 50.48 54.99 53.38 C54.99 55.91 56.14 57.72 57.86 58.45" />
            </g>
          </g>
      </g>
    </svg>
  );
}
