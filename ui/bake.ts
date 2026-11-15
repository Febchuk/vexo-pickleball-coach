// Bakes the pixel-art avatars and the home court with Nomen's tracer and writes upscaled PNGs.
//
//   npx -y tsx ui/bake.ts            -> ui/out/*.png

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import { R } from "./engine/palette";
import { bake, fbm, type Ground, hash2, Model, type ShadeOut, type Sprite, translate } from "./engine/tracer";
import { solid } from "./engine/materials";
import { ScaledModel } from "./engine/scaled";
import { C, type Look, playerInto, type Stance } from "./player";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "out");
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------------------------
// PNG out, scaled up with hard pixels.

function png(sprite: Sprite, scale: number) {
  const w = sprite.w * scale;
  const h = sprite.h * scale;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const s = ((Math.floor(y / scale) * sprite.w) + Math.floor(x / scale)) * 4;
      const d = y * (w * 4 + 1) + 1 + x * 4;
      raw[d] = sprite.rgba[s];
      raw[d + 1] = sprite.rgba[s + 1];
      raw[d + 2] = sprite.rgba[s + 2];
      raw[d + 3] = sprite.rgba[s + 3];
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function save(name: string, sprite: Sprite, scale: number) {
  writeFileSync(join(OUT, `${name}.png`), png(sprite, scale));
  console.log(`${name}.png  ${sprite.w}x${sprite.h} art px  x${scale}`);
}

// ---------------------------------------------------------------------------------------------
// The squad. "you" wears the glasses and the band.

export const SQUAD: Record<string, Look> = {
  you: { skin: R.skinDeep, hair: R.hair, style: "visor", hat: R.white, shirt: R.crimson, trim: R.cream, shorts: R.black, paddle: C.optic, glasses: true, band: C.amber },
  partner: { skin: R.skinLight, hair: R.ochre, style: "bun", hat: R.teal, shirt: R.teal, trim: R.white, shorts: R.navy, paddle: R.coral, glasses: false, band: null },
  opp1: { skin: R.skinMid, hair: R.hair, style: "cap", hat: R.navy, shirt: R.white, trim: R.navy, shorts: R.navy, paddle: R.blue, glasses: false, band: null },
  opp2: { skin: R.skinLight, hair: R.hair, style: "headband", hat: R.gold, shirt: R.gold, trim: R.black, shorts: R.olive, paddle: R.violet, glasses: false, band: null },
};

const FACE_VIEWER = Math.PI / 4;
const SUN: [number, number, number] = [-0.62, 0.32, 0.72];

// A small sand-free pad under each avatar so they stand on something: a scrap of court.
const K = 2.5;

function pad(seed: number): Ground {
  const r = 9 * K;
  return {
    sdf: (x, y) => Math.hypot(x, y * 1.1) - r + (fbm(x * 0.08 + seed, y * 0.08) - 0.5) * 6,
    shade: (x: number, y: number, out: ShadeOut) => {
      out.ramp = C.court;
      const n = hash2(Math.floor(x * 1.4), Math.floor(y * 1.4));
      out.tone = n < 0.08 ? -0.6 : n > 0.94 ? 0.6 : 0;
      if (Math.abs(x - 3 * K) < 0.45 * K) {
        out.ramp = R.white;
        out.tone = 0.6;
      }
    },
    bounds: { x0: -r - 6, y0: -r - 6, x1: r + 6, y1: r + 6 },
    rim: 6,
  };
}

const stances: Stance[] = ["ready", "forehand", "backhand", "dink", "cheer"];
let seed = 1;
for (const [name, look] of Object.entries(SQUAD)) {
  for (const stance of name === "you" ? stances : (["ready", "cheer"] as Stance[])) {
    const m = new Model();
    playerInto(new ScaledModel(m, K), look, stance, FACE_VIEWER);
    save(`${name}-${stance}`, bake(m.prims, { ground: pad(seed++), outline: true, sun: SUN, pad: 3 }), 4);
  }
}

// ---------------------------------------------------------------------------------------------
// The home court: 20 x 44 ft (60 x 132 units), net across x = 0, kitchens 7 ft (21 units) deep.

const HX = 66;
const HY = 30;
const KITCHEN = 21;
const LINE = 0.75;

function court(): Ground {
  const mx = HX + 14;
  const my = HY + 12;
  return {
    sdf: (x, y) => Math.max(Math.abs(x) - mx, Math.abs(y) - my) + (fbm(x * 0.06 + 3, y * 0.06) - 0.5) * 10,
    shade: (x: number, y: number, out: ShadeOut) => {
      const n = hash2(Math.floor(x * 1.4), Math.floor(y * 1.4));
      out.tone = n < 0.06 ? -0.7 : n > 0.95 ? 0.6 : 0;
      const inside = Math.abs(x) <= HX + LINE && Math.abs(y) <= HY + LINE;
      if (!inside) {
        out.ramp = C.surround;
        return;
      }
      out.ramp = Math.abs(x) < KITCHEN ? C.kitchen : C.court;
      const onLine =
        Math.abs(Math.abs(x) - HX) < LINE ||
        Math.abs(Math.abs(y) - HY) < LINE ||
        Math.abs(Math.abs(x) - KITCHEN) < LINE ||
        (Math.abs(x) > KITCHEN && Math.abs(y) < LINE * 0.8);
      if (onLine) {
        out.ramp = R.white;
        out.tone = 0.7;
      }
    },
    bounds: { x0: -mx - 12, y0: -my - 12, x1: mx + 12, y1: my + 12 },
    rim: 10,
  };
}

function net(m: Model) {
  const mesh = solid(R.black, 0.2, 0);
  for (const y of [-HY - 3, HY + 3]) m.cylinder(0, y, 0, 0.5, 4.6, { mat: solid(R.iron, 0.8, 0) });
  // The mesh: a thin dark panel with a white tape along the top.
  m.box(0, 0, 2.2, 0.12, HY + 3, 1.9, {
    mat: (h, out) => {
      out.dither = 0;
      const grid = (Math.floor(h.y * 1.2) + Math.floor(h.z * 1.2)) % 2 === 0;
      out.ramp = R.black;
      out.tone = grid ? 0.9 : 0.1;
    },
  });
  m.box(0, 0, 4.25, 0.2, HY + 3, 0.22, { mat: solid(R.white, 1, 0) });
  void mesh;
}

function ball(m: Model, x: number, y: number, z: number) {
  m.sphere(x, y, z, 0.6, { mat: solid(C.optic, 1.4, 0) });
}

const scene = new Model();
net(scene);
// Your team on the far side, facing the viewer; the opponents on the near side, backs to us.
const place = (look: Look, stance: Stance, x: number, y: number, facing: number) => scene.with(translate(x, y, 0), () => playerInto(scene, look, stance, facing));
place(SQUAD.you, "forehand", -26, 12, 0.15);
place(SQUAD.partner, "ready", -24, -15, 0.1);
place(SQUAD.opp1, "dink", 24, 14, Math.PI);
place(SQUAD.opp2, "ready", 30, -13, Math.PI + 0.1);
ball(scene, -10, 9, 9);
save("court", bake(scene.prims, { ground: court(), outline: true, sun: SUN, pad: 3 }), 3);

// ---------------------------------------------------------------------------------------------
// HD avatars for the glass UI: the same models at a much larger scale, no ground, shown smooth.

const HD = 18;
for (const [name, look] of Object.entries(SQUAD)) {
  for (const stance of name === "you" ? (["ready", "forehand", "cheer"] as Stance[]) : (["ready"] as Stance[])) {
    const m = new Model();
    playerInto(new ScaledModel(m, HD), look, stance, FACE_VIEWER);
    save(`hd-${name}-${stance}`, bake(m.prims, { outline: false, sun: SUN, pad: 4 }), 1);
  }
}
