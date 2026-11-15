// Generic player avatars for the phone app, ray-traced with the same engine as the sprites.
//
//   npx -y tsx ui/avatars.ts      -> web/app/avatars/<name>.png (head and shoulders) and <name>-full.png

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import { R } from "./engine/palette";
import { ScaledModel } from "./engine/scaled";
import { bake, Model, type Sprite } from "./engine/tracer";
import { C, type Look, playerInto } from "./player";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "web", "app", "avatars");
mkdirSync(OUT, { recursive: true });

const PEOPLE: Record<string, Look> = {
  you: { skin: R.skinDeep, hair: R.hair, style: "short", hat: R.white, shirt: R.crimson, trim: R.cream, shorts: R.black, paddle: C.optic, glasses: true, band: C.amber },
  sean: { skin: R.skinLight, hair: R.ochre, style: "cap", hat: R.navy, shirt: R.jade, trim: R.white, shorts: R.navy, paddle: R.blue, glasses: false, band: null },
  maya: { skin: R.skinMid, hair: R.hair, style: "bun", hat: R.teal, shirt: R.violet, trim: R.white, shorts: R.black, paddle: R.coral, glasses: false, band: null },
  partner: { skin: R.skinMid, hair: R.hair, style: "headband", hat: R.gold, shirt: R.gold, trim: R.black, shorts: R.olive, paddle: R.violet, glasses: false, band: null },
  jules: { skin: R.skinDeep, hair: R.hair, style: "bun", hat: R.coral, shirt: R.teal, trim: R.cream, shorts: R.navy, paddle: R.magenta, glasses: false, band: null },
};

function png(rgba: Uint8ClampedArray, w: number, h: number) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
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

// A square from the top of the sprite, with headroom: the head and shoulders.
function headCrop(s: Sprite) {
  const side = Math.min(s.w, Math.round(s.h * 0.55));
  const top = Math.round(side * 0.1);
  const x0 = Math.round((s.w - side) / 2);
  const out = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side - top; y++) out.set(s.rgba.subarray((y * s.w + x0) * 4, (y * s.w + x0 + side) * 4), (y + top) * side * 4);
  return { rgba: out, side };
}

for (const [name, look] of Object.entries(PEOPLE)) {
  const m = new Model();
  playerInto(new ScaledModel(m, 22), look, "ready", Math.PI / 4);
  const sprite = bake(m.prims, { sun: [-0.62, 0.32, 0.72], pad: 4 });
  writeFileSync(join(OUT, `${name}-full.png`), png(sprite.rgba, sprite.w, sprite.h));
  const head = headCrop(sprite);
  writeFileSync(join(OUT, `${name}.png`), png(head.rgba, head.side, head.side));
  console.log(`${name}: full ${sprite.w}x${sprite.h}, head ${head.side}px`);
}
