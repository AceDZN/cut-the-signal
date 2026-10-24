// Capture the same gameplay moments as the imagegen targets, using normal controls.
import { chromium } from "playwright";
import fs from "node:fs/promises";
const url = process.env.GAME_URL ?? "http://127.0.0.1:5173";
const dir = new URL("../output/3d-browser/", import.meta.url);
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1672, height: 941 } });
const advance = (ms) => page.evaluate((ms) => window.advanceTime(ms), ms);
const text = () =>
  page.evaluate(() => JSON.parse(window.render_game_to_text()));
const shot = (name) =>
  page.screenshot({ path: new URL(`${name}.png`, dir).pathname });
try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () =>
      window.render_game_to_text &&
      Object.values(JSON.parse(window.render_game_to_text()).models).every(
        (x) => x === "Tripo GLB",
      ),
  );
  await advance(0);
  await page.click("#start-btn");
  await page.click("#program-toggle");
  await page.click('[data-room="a"]');
  await page.click("#run");
  await advance(60000);
  await shot("actual-piloting");
  await page.click("#program-toggle");
  for (const selector of ['[data-room="b"]', "#salvage", '[data-room="a"]'])
    await page.click(selector);
  await advance(1000);
  await shot("actual-planning");
  await page.click("#program-close");
  await advance(1000);
  await shot("actual-connected");
  await page.locator("#board").press("Enter");
  await advance((await text()).commandDuration + 1);
  await advance(900);
  await shot("actual-cutting");
  await advance(900);
  await shot("actual-offline");
  await fs.writeFile(
    new URL("reference-view-state.json", dir),
    JSON.stringify(await text(), null, 2),
  );
  console.log(
    "Captured matching connected, cutting and offline runtime views.",
  );
} finally {
  await browser.close();
}
