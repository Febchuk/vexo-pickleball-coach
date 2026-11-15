import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE);
const here = resolve(import.meta.dirname);
const work = join(here, 'work');
const clips = process.argv.slice(2);
const tracks = clips.map((c) => JSON.parse(readFileSync(join(here, 'tracks', `${c}.json`), 'utf8')));

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 688, height: 912 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(join(here, 'replay.html')).href);
await page.evaluate(() => Promise.all(['400 13px Geist', '500 13px Geist', '600 15px Geist', '700 30px Geist', '500 15px "Geist Mono"', '600 15px "Geist Mono"'].map((f) => document.fonts.load(f))));
const fontOk = await page.evaluate(() => document.fonts.check('700 30px Geist') && document.fonts.check('600 15px "Geist Mono"'));
if (!fontOk) throw new Error('Geist fonts did not load');
await page.evaluate((t) => window.setup(t), tracks);

for (const [seg, track] of tracks.entries()) {
  const inDir = join(work, 'frames', track.clip);
  const outDir = join(work, 'shots', track.clip);
  mkdirSync(outDir, { recursive: true });
  const frames = readdirSync(inDir).filter((f) => f.endsWith('.jpg')).sort();
  for (const [k, f] of frames.entries()) {
    const t = track.start + k / 30;
    await page.evaluate(([s, tt, u]) => window.renderFrame(s, tt, u), [seg, t, pathToFileURL(join(inDir, f)).href]);
    await page.screenshot({ path: join(outDir, f), type: 'jpeg', quality: 92 });
  }
  console.log(track.clip, frames.length, 'frames');
}

const title = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await title.goto(pathToFileURL(join(here, 'title.html')).href);
await title.evaluate(() => Promise.all(['400 36px Geist', '700 132px Geist'].map((f) => document.fonts.load(f))));
console.log('title Geist loaded:', await title.evaluate(() => document.fonts.check('700 132px Geist')));
await title.screenshot({ path: join(work, 'title.png') });
await browser.close();
