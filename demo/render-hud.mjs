import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE);
const here = resolve(import.meta.dirname);
const name = process.argv[2];
const track = JSON.parse(readFileSync(join(here, 'tracks-hud', `${name}.json`), 'utf8'));
const inDir = join(here, 'work', 'hud', name, 'frames');
const outDir = join(here, 'work', 'hud', name, 'shots');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 688, height: 912 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(join(here, 'replay-hud.html')).href);
await page.evaluate(() => Promise.all(['400 13px Outfit', '600 13px Outfit', '700 24px Outfit'].map((f) => document.fonts.load(f))));
if (!(await page.evaluate(() => document.fonts.check('700 24px Outfit')))) throw new Error('Outfit font did not load');
await page.evaluate((t) => window.setup(t), track);
const frames = readdirSync(inDir).filter((f) => f.endsWith('.jpg')).sort();
for (const [k, f] of frames.entries()) {
  await page.evaluate(([tt, u]) => window.renderFrame(tt, u), [track.start + k / 30, pathToFileURL(join(inDir, f)).href]);
  await page.screenshot({ path: join(outDir, f), type: 'jpeg', quality: 92 });
}
console.log(name, frames.length, 'frames');
await browser.close();
