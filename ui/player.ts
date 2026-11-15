import { solid } from "./engine/materials";
import { R } from "./engine/palette";
import { defineRamp, type HitInfo, Model, mul, rotY, rotZ, type ShadeOut, translate } from "./engine/tracer";

// A pickleball player for Nomen's tracer: built facing +x with feet at the origin, like its soldier.
// One unit is about 4 inches, so a player stands about 16 units tall.

export const C = {
  shoeWhite: defineRamp("shoeWhite", ["#8f8b84", "#aeaaa2", "#c9c5bc", "#dedbd3", "#efede7", "#fcfbf8"]),
  optic: defineRamp("optic", ["#4d5a10", "#6f8216", "#94ac1f", "#b8d42c", "#d4ef4d", "#ecfb9a"]),
  amber: defineRamp("amber", ["#5a3405", "#8a5208", "#bd760c", "#e89a16", "#ffb93f", "#ffdc8f"]),
  bandGreen: defineRamp("bandGreen", ["#0d4a2a", "#13703f", "#1c9a57", "#2fc472", "#5fe596", "#b4f7cf"]),
  court: defineRamp("court", ["#1b3d5c", "#22507a", "#2b6597", "#3a7cb0", "#5a99c6", "#93bfdd"]),
  kitchen: defineRamp("kitchen", ["#1e4a3c", "#275f4c", "#33765d", "#448e70", "#62a888", "#99c9ad"]),
  surround: defineRamp("surround", ["#2f4a37", "#3c5d44", "#4c7254", "#5f8766", "#7a9f7e", "#a3bea3"]),
};

export type Hair = "short" | "bun" | "cap" | "visor" | "headband" | "bald";

export type Look = {
  skin: number;
  hair: number;
  style: Hair;
  /** Colour of the cap, visor or headband (when worn). */
  hat: number;
  shirt: number;
  trim: number;
  shorts: number;
  paddle: number;
  /** Wears the Meta glasses. */
  glasses: boolean;
  /** Wears a Vexo band on the paddle wrist; its light is this ramp. */
  band: number | null;
};

export type Stance = "ready" | "forehand" | "backhand" | "cheer" | "dink";

const skinMat = (rampId: number) => solid(rampId, 0.3, 0);

/** Thigh to knee: shorts down to just above the knee. */
function thigh(l: Look) {
  return (h: HitInfo, out: ShadeOut) => {
    out.dither = 0;
    const shorts = h.lz < 0.6;
    out.ramp = shorts ? l.shorts : l.skin;
    out.tone = shorts ? 0.1 : 0.2;
  };
}

/** Knee to ankle: bare shin, white crew sock at the bottom. */
function shin(l: Look) {
  return (h: HitInfo, out: ShadeOut) => {
    out.dither = 0;
    const sock = h.lz > 1.6;
    out.ramp = sock ? C.shoeWhite : l.skin;
    out.tone = sock ? 0.5 : 0.2;
  };
}

/** Athletic tee: a contrasting yoke and a single chest stripe. */
function tee(l: Look) {
  return (h: HitInfo, out: ShadeOut) => {
    out.dither = 0;
    out.ramp = l.shirt;
    out.tone = 0.25;
    if (h.lz > 1.9) out.ramp = l.trim;
    else if (Math.abs(h.lz - 0.6) < 0.35) {
      out.ramp = l.trim;
      out.tone = 0.5;
    }
  };
}

/** The Vexo band: a dark strap with a glowing light pod on top. */
function bandMat(light: number) {
  return (h: HitInfo, out: ShadeOut) => {
    out.dither = 0;
    if (h.nz > 0.2 || Math.abs(h.ly) < 0.25) {
      out.ramp = light;
      out.tone = 1.4;
      out.glow = 0.7;
    } else {
      out.ramp = R.black;
      out.tone = 0.6;
    }
  };
}

/** Paddle face: solid colour with a lighter edge guard and a centre logo dot. */
function paddleFace(l: Look) {
  return (h: HitInfo, out: ShadeOut) => {
    out.dither = 0;
    const edge = Math.abs(h.lx) > 1.05 || Math.abs(h.lz) > 1.4;
    out.ramp = edge ? R.black : l.paddle;
    out.tone = edge ? 0.8 : 0.5;
    if (!edge && Math.hypot(h.lx, h.lz - 0.2) < 0.4 && Math.abs(h.ly) > 0.05) {
      out.ramp = R.white;
      out.tone = 1;
    }
  };
}

type Vec = [number, number, number];

function stancePose(stance: Stance) {
  // armR is the paddle arm. pitch raises it forward, splay swings it out to the side (+ = away from body).
  switch (stance) {
    case "ready":
      return { crouch: 0.8, lean: 0.1, twist: 0, wide: 1.55, armR: { pitch: 1.0, splay: 0.55, bend: 0.9 }, armL: { pitch: 0.85, splay: -0.3, bend: 0.9 }, paddleTilt: 1.4 };
    case "dink":
      return { crouch: 1.6, lean: 0.25, twist: 0.1, wide: 1.8, armR: { pitch: 0.75, splay: 0.15, bend: 0.4 }, armL: { pitch: 0.5, splay: -0.4, bend: 0.6 }, paddleTilt: -0.6 };
    case "forehand":
      return { crouch: 0.7, lean: 0.2, twist: 0.55, wide: 1.7, armR: { pitch: 1.35, splay: 1.15, bend: 0.15 }, armL: { pitch: 1.1, splay: -0.6, bend: 0.5 }, paddleTilt: 1.2 };
    case "backhand":
      return { crouch: 0.8, lean: 0.22, twist: -0.6, wide: 1.6, armR: { pitch: 1.3, splay: -1.0, bend: 0.2 }, armL: { pitch: 0.4, splay: 0.9, bend: 0.3 }, paddleTilt: -1.1 };
    case "cheer":
      return { crouch: 0, lean: -0.05, twist: 0, wide: 1.2, armR: { pitch: 2.9, splay: 0.3, bend: 0 }, armL: { pitch: 2.8, splay: 0.35, bend: 0 }, paddleTilt: 1.35 };
  }
}

export function playerInto(m: Model, l: Look, stance: Stance, facing: number) {
  const p = stancePose(stance);
  const hipZ = 7.2 - p.crouch;

  m.with(rotZ(facing), () => {
    for (const side of [1, -1] as const) {
      const y = side * p.wide * 0.85;
      const hip: Vec = [0, side * 1.1, hipZ];
      const foot: Vec = [side * 0.4, y + side * 0.6, 0.9];
      // Knees forward when crouched.
      const knee: Vec = [(hip[0] + foot[0]) / 2 + p.crouch * 0.9, (hip[1] + foot[1]) / 2, (hip[2] + foot[2]) / 2 + 0.2];
      m.capsule(hip, knee, 1.1, { mat: thigh(l) });
      m.capsule(knee, foot, 0.95, { mat: shin(l) });
      // Court shoes: white with a coloured sole stripe.
      m.box(foot[0] + 0.7, foot[1], 0.55, 1.65, 0.95, 0.55, { mat: solid(C.shoeWhite, 0.6, 0) });
      m.box(foot[0] + 0.7, foot[1], 0.12, 1.7, 1.0, 0.12, { mat: solid(l.trim, 0.3, 0) });
    }

    m.with(mul(translate(0, 0, hipZ), mul(rotZ(p.twist), rotY(p.lean))), () => {
      // Shorts and tee.
      m.frustum(0, 0, -0.3, 2.45, 2.15, 1.5, { mat: solid(l.shorts, 0.1, 0) });
      m.ellipsoid(0.1, 0, 3.4, 1.85, 2.35, 2.6, { mat: tee(l) });

      const shoulderZ = 5.1;
      const arm = (side: 1 | -1, a: { pitch: number; splay: number; bend: number }, band: boolean) => {
        const y = side * 2.45;
        const shoulder: Vec = [0, y, shoulderZ];
        const reach = 4.9;
        // Direction: start pointing down, pitch forward (+x), then splay outward (+side*y).
        const dx = Math.sin(a.pitch) * Math.cos(a.splay);
        const dy = side * Math.sin(a.pitch) * Math.sin(a.splay) * (a.splay >= 0 ? 1 : 1);
        const dz = -Math.cos(a.pitch);
        const elbow: Vec = [shoulder[0] + dx * reach * 0.5, shoulder[1] + dy * reach * 0.5 + side * 0.2, shoulder[2] + dz * reach * 0.5];
        // The forearm bends up and in by `bend`.
        const hand: Vec = [elbow[0] + dx * reach * 0.5 + a.bend * 0.6, elbow[1] + dy * reach * 0.5 - side * a.bend * 0.9, elbow[2] + dz * reach * 0.5 + a.bend * 1.6];
        m.sphere(shoulder[0], shoulder[1], shoulder[2] + 0.1, 1.1, { mat: tee(l) });
        m.capsule(shoulder, elbow, 0.82, { mat: skinMat(l.skin) });
        m.capsule(elbow, hand, 0.78, { mat: skinMat(l.skin) });
        if (band && l.band !== null) {
          const t = 0.72;
          const w: Vec = [elbow[0] + (hand[0] - elbow[0]) * t, elbow[1] + (hand[1] - elbow[1]) * t, elbow[2] + (hand[2] - elbow[2]) * t];
          const w2: Vec = [elbow[0] + (hand[0] - elbow[0]) * (t + 0.14), elbow[1] + (hand[1] - elbow[1]) * (t + 0.14), elbow[2] + (hand[2] - elbow[2]) * (t + 0.14)];
          m.capsule(w, w2, 1.0, { mat: bandMat(l.band) });
        }
        return hand;
      };

      const handR = arm(-1, p.armR, true);
      arm(1, p.armL, false);

      // Paddle: handle out of the fist, face beyond it, turned by paddleTilt.
      m.with(mul(translate(handR[0], handR[1], handR[2]), mul(rotZ(p.paddleTilt), rotY(-0.35))), () => {
        m.capsule([0, 0, -0.4], [0, 0, 1.4], 0.42, { mat: solid(R.black, 0.5, 0) });
        m.box(0, 0, 3.0, 1.25, 0.2, 1.6, { mat: paddleFace(l) });
      });

      // Head.
      m.with(mul(translate(0.15, 0, 7.55), rotY(-p.lean * 0.8)), () => {
        m.sphere(0.2, 0, 0, 2.05, { mat: skinMat(l.skin) });
        // Eyes and a nose: just enough for a face at this size.
        for (const side of [1, -1]) m.sphere(1.95, side * 0.75, 0.15, 0.32, { mat: solid(R.black, 0.2, 0) });
        m.sphere(2.25, 0, -0.45, 0.35, { mat: skinMat(l.skin) });
        const hair = solid(l.hair, 0.3, 0);
        if (l.style !== "bald" && l.style !== "cap") m.ellipsoid(-0.25, 0, 0.35, 2.25, 2.2, 2.2, { mat: hair, clip: [0, 0, -1, -0.1] });
        if (l.style === "bun") m.sphere(-1.6, 0, 1.6, 1.0, { mat: hair });
        if (l.style === "cap") {
          m.ellipsoid(-0.1, 0, 0.55, 2.3, 2.25, 2.1, { mat: solid(l.hat, 0.3, 0), clip: [0, 0, -1, 0.2] });
          m.box(2.2, 0, 1.25, 0.9, 1.5, 0.14, { mat: solid(l.hat, 0.1, 0), rot: rotY(-0.35) });
        }
        if (l.style === "visor") {
          m.cylinder(0.1, 0, 1.25, 2.3, 0.3, { mat: solid(l.hat, 0.5, 0) });
          m.box(2.2, 0, 1.25, 0.9, 1.5, 0.14, { mat: solid(l.hat, 0.2, 0), rot: rotY(-0.35) });
        }
        if (l.style === "headband") m.cylinder(0.05, 0, 0.75, 2.3, 0.3, { mat: solid(l.hat, 0.6, 0) });
        if (l.glasses) {
          // Meta glasses: thick black frames across the eyes, arms back to the ears.
          m.box(2.1, 0, 0.2, 0.3, 1.8, 0.5, { mat: solid(R.black, 0.4, 0) });
          for (const side of [1, -1]) m.box(0.9, side * 1.98, 0.15, 1.3, 0.14, 0.16, { mat: solid(R.black, 0.4, 0) });
        }
      });
    });
  });
}

export function playerModel(l: Look, stance: Stance, facing: number) {
  const m = new Model();
  playerInto(m, l, stance, facing);
  return m;
}
