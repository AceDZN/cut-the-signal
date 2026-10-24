import { chromium } from "playwright";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { levels } from "../src/game/levels.ts";
const url = process.env.GAME_URL ?? "http://127.0.0.1:5173";
const name = process.env.GAME_ARTIFACT_NAME ?? "3d-browser";
const out = new URL(`../output/${name}/`, import.meta.url);
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: process.env.HEADED !== "1",
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1672, height: 941 },
});
const page = await context.newPage();
const errors = [],
  external = [],
  checks = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("request", (r) => {
  if (
    !r.url().startsWith(url) &&
    !r.url().startsWith("data:") &&
    !r.url().startsWith("blob:")
  )
    external.push(r.url());
});
const state = () =>
  page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (ms) => page.evaluate((ms) => window.advanceTime(ms), ms);
const shot = (n) =>
  page.screenshot({
    path: new URL(`${n}.png`, out).pathname,
    animations: "disabled",
  });
async function open() {
  if (!(await state()).programOpen) {
    await page.click("#program-toggle");
    await advance(1000);
  }
}
async function choose(i) {
  if (!(await page.locator("#mission-menu").isVisible()))
    await page.click("#missions-toggle");
  await page.selectOption("#mission-select", String(i));
  await advance(1000);
}
async function append(commands) {
  await open();
  for (const cmd of commands)
    await page
      .locator(
        cmd.startsWith("move:")
          ? `[data-room="${cmd.slice(5)}"]`
          : cmd === "salvage"
            ? "#salvage"
            : "#extract",
      )
      .click();
  await advance(0);
}
async function run(commands) {
  await append(commands);
  await page.click("#run");
  await advance(60000);
  return state();
}
try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () =>
      window.render_game_to_text &&
      Object.values(JSON.parse(window.render_game_to_text()).models).every(
        (x) => x !== "loading",
      ),
    {},
    { timeout: 30000 },
  );
  await advance(0);
  let s = await state();
  assert.equal(s.models.drone, "Tripo GLB");
  assert.equal(s.models.relay, "Tripo GLB");
  assert.equal(s.models.deck, "Tripo GLB");
  assert.equal(s.renderer, "Three.js WebGL2");
  await shot("intro");
  await page.click("#start-btn");
  await advance(1000);
  // Camera-relative continuous pilot movement, walls and a genuine room handoff.
  await page.mouse.move(700, 400);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(700 - 0.5 / 0.006, 400);
  await page.mouse.up({ button: "right" });
  assert.ok(Math.abs((await state()).camera.yaw) < 0.001);
  await page.locator("#board").press("r");
  await page.keyboard.down("d");
  await advance(500);
  await page.keyboard.up("d");
  s = await state();
  assert.ok(s.dronePosition.x > -10);
  assert.equal(s.droneRoom, "dock");
  await page.keyboard.down("s");
  await advance(5000);
  await page.keyboard.up("s");
  s = await state();
  assert.ok(s.dronePosition.z < 3.5);
  assert.equal(s.droneRoom, "dock");
  await page.locator("#board").press("r");
  await page.keyboard.down("d");
  await advance(2500);
  await page.keyboard.up("d");
  s = await state();
  assert.equal(s.droneRoom, "a");
  assert.equal(s.connected, true);
  await page.mouse.move(700, 400);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(700 + 0.5 / 0.006, 400);
  await page.mouse.up({ button: "right" });
  await advance(1000);
  await shot("actual-connected");
  checks.push(
    "Real WebGL models, continuous WASD, floor collision, receiver arrival, orbit",
  );
  await append(["move:b", "salvage", "move:a"]);
  await shot("actual-planning");
  await page.click("#run");
  const moveTime = (await state()).commandDuration;
  await advance(moveTime + 1);
  assert.equal((await state()).droneRoom, "b");
  await advance(900);
  await shot("actual-cutting");
  await advance(900);
  s = await state();
  assert.equal(s.connected, false);
  assert.equal(s.mode, "running");
  assert.equal(s.salvage, 3);
  await shot("actual-offline");
  const queue = s.queue;
  await page.locator("#board").press("p");
  assert.match((await state()).reason, /OFFLINE/);
  await page.locator("#board").press("e");
  await open();
  assert.equal(await page.locator("#run").isEnabled(), false);
  assert.equal(await page.locator("#salvage").isEnabled(), false);
  assert.deepEqual((await state()).queue, queue);
  await page.click("#program-close");
  await advance(60000);
  s = await state();
  assert.equal(s.mode, "planning");
  assert.equal(s.droneRoom, "a");
  assert.equal(s.connected, true);
  s = await run(["salvage", "move:dock", "extract"]);
  assert.equal(s.mode, "won");
  assert.equal(s.banked, 4);
  await shot("extracted");
  checks.push(
    "Cut sparks, offline lockout, autonomous driving, reconnection, banked extraction",
  );
  for (const i of process.env.SMOKE_ONLY === "1"
    ? [0, levels.length - 1]
    : levels.map((_, i) => i)) {
    await choose(i);
    for (const p of levels[i].witnessPrograms) s = await run(p);
    assert.equal(s.mode, "won", levels[i].name);
    assert.equal(s.banked, levels[i].witnessValue);
    await shot(`mission-${i + 1}-won`);
    await choose(i);
    const unsafe = levels[i].intendedFailurePrograms;
    for (const p of unsafe.slice(0, -1)) s = await run(p);
    await append(unsafe.at(-1));
    assert.equal((await state()).routeSafety.safe, false, levels[i].name);
    assert.equal(await page.locator("#run").isEnabled(), false);
    assert.equal(await page.locator("#step").isEnabled(), false);
    assert.notEqual((await state()).mode, "stranded");
    assert.equal((await state()).banked, 0);
    console.log(
      `Verified wreck ${i + 1}/${levels.length}: ${levels[i].name}, full recovery and unsafe return guard`,
    );
  }
  checks.push(
    process.env.SMOKE_ONLY === "1"
      ? "First/final wreck regression: full recovery and unsafe return guard"
      : "All 20 full-salvage solutions via normal controls; unsafe uploads blocked in all 20 wrecks",
  );
  await choose(0);
  await append(["move:a", "move:b", "salvage", "move:a"]);
  await page.click("#step");
  await advance(10000);
  assert.equal((await state()).mode, "paused");
  assert.equal((await state()).droneRoom, "a");
  await page.click("#step");
  await advance(10000);
  assert.equal((await state()).droneRoom, "b");
  assert.equal((await state()).mode, "paused");
  await page.click("#step");
  await advance(60000);
  assert.equal((await state()).droneRoom, "a");
  assert.equal((await state()).connected, true);
  await choose(0);
  await append(["move:a", "move:b"]);
  await page.click("#run");
  await page.locator("#board").press("p");
  await advance(10000);
  assert.equal((await state()).mode, "paused");
  assert.equal((await state()).droneRoom, "a");
  await page.click("#undo");
  assert.equal((await state()).queue.length, 0);
  checks.push(
    "Step, automatic offline continuation, pause at connected boundary, replacement/undo",
  );
  await choose(0);
  await open();
  await page.click("#extract");
  assert.match((await state()).reason, /3 more/);
  assert.equal((await state()).queue.length, 0);
  await page.click("#hint");
  const hint = await page.locator("#hint-copy").innerText();
  await page.click("#hint");
  assert.notEqual(await page.locator("#hint-copy").innerText(), hint);
  await page.locator("#board").press("Tab");
  assert.equal((await state()).programOpen, false);
  await page.locator("#board").press("?");
  assert.equal(await page.locator("#help").isVisible(), true);
  await page.click("#help-close");
  await page.click("#sound");
  assert.equal((await state()).muted, false);
  await page.click("#sound");
  assert.equal((await state()).muted, true);
  await page.locator("#board").press("v");
  assert.equal((await state()).camera.overview, true);
  await advance(1000);
  await shot("overview");
  await page.locator("#board").press("v");
  await page.locator("#board").press("f");
  await page.waitForFunction(() => !!document.fullscreenElement);
  await page.locator("#board").press("Escape");
  await page.waitForFunction(() => !document.fullscreenElement);
  const before = await state();
  await page.setViewportSize({ width: 1280, height: 720 });
  await advance(1000);
  assert.equal((await state()).droneRoom, before.droneRoom);
  await shot("laptop");
  checks.push(
    "Context errors, hints, help, sound/mute, overview, fullscreen/Escape, resize",
  );
  // Drafts and overview must never silently lock out piloting.
  await choose(0);
  await append(["move:a"]);
  await page.click("#program-close");
  let point = (await state()).dronePosition;
  await page.keyboard.down("d");
  await advance(500);
  await page.keyboard.up("d");
  s = await state();
  assert.ok(
    Math.hypot(s.dronePosition.x - point.x, s.dronePosition.z - point.z) > 1,
  );
  assert.equal(s.queue.length, 0);
  await page.locator("#board").press("v");
  point = (await state()).dronePosition;
  await page.keyboard.down("a");
  await advance(400);
  await page.keyboard.up("a");
  s = await state();
  assert.equal(s.camera.overview, false);
  assert.ok(
    Math.hypot(s.dronePosition.x - point.x, s.dronePosition.z - point.z) > 0.8,
  );
  checks.push("Closing a draft and entering overview do not freeze driving");
  // A direct dark crossing is guarded at the live deck, with a free reverse.
  const loopIndex = levels.findIndex((l) => l.id === "use-it-then-lose-it");
  await choose(loopIndex);
  await run(["move:a", "move:b"]);
  s = await state();
  const source = s.rooms.find((r) => r.id === "b"),
    dest = s.rooms.find((r) => r.id === "c");
  const desiredYaw = -Math.atan2(
    dest.worldZ - source.worldZ,
    dest.worldX - source.worldX,
  );
  await page.mouse.move(700, 400);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(700 + (desiredYaw - s.camera.yaw) / 0.006, 400);
  await page.mouse.up({ button: "right" });
  await page.keyboard.down("d");
  await advance(10000);
  await page.keyboard.up("d");
  s = await state();
  assert.equal(s.droneRoom, "b");
  assert.equal(s.mode, "planning");
  assert.equal(s.connected, true);
  assert.match(s.reason, /no signal/);
  const stalled = { ...s.dronePosition };
  assert.ok(
    Math.hypot(stalled.x - source.worldX, stalled.z - source.worldZ) < 5,
  );
  await page.keyboard.down("a");
  await advance(300);
  await page.keyboard.up("a");
  s = await state();
  assert.ok(
    Math.hypot(s.dronePosition.x - stalled.x, s.dronePosition.z - stalled.z) >
      1,
  );
  await shot("dark-crossing-guard");
  checks.push(
    "Direct dark crossing stops at a live deck, explains planning, and permits immediate reverse",
  );
  // E handles an explicit, previewed cut + safe return, and U rewinds multiple trips.
  await choose(0);
  await run(["move:a"]);
  assert.equal((await state()).salvagePlan.commands.length, 0);
  assert.match((await state()).salvagePlan.reason, /Survey Relay still needs/);
  await page.locator("#board").press("e");
  assert.equal((await state()).salvage, 0);
  assert.equal((await state()).programOpen, true);
  await page.click("#program-close");
  await run(["move:b"]);
  assert.deepEqual((await state()).salvagePlan.commands, ["salvage", "move:a"]);
  await shot("safe-return-preview");
  await page.locator("#board").press("e");
  await advance(1900);
  assert.equal((await state()).salvage, 3);
  await shot("safe-salvage-offline");
  await page.locator("#board").press("u");
  s = await state();
  assert.equal(s.salvage, 0);
  assert.ok(s.liveRelays.includes("b"));
  assert.equal(s.droneRoom, "b");
  assert.equal(s.mode, "planning");
  await page.locator("#board").press("u");
  assert.equal((await state()).droneRoom, "a");
  await page.locator("#board").press("u");
  assert.equal((await state()).droneRoom, "dock");
  assert.equal((await state()).undoTrips, 0);
  await run(["move:a", "move:b"]);
  await page.locator("#board").press("e");
  await advance(20000);
  assert.equal((await state()).droneRoom, "a");
  assert.equal((await state()).salvage, 3);
  await page.locator("#board").press("e");
  await advance(20000);
  assert.equal((await state()).droneRoom, "dock");
  await page.locator("#board").press("e");
  await advance(10000);
  assert.equal((await state()).banked, 4);
  await page.click("#next");
  assert.equal((await state()).mission, 2);
  assert.equal((await state()).mode, "planning");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() =>
    Object.values(JSON.parse(window.render_game_to_text()).models).every(
      (x) => x === "Tripo GLB",
    ),
  );
  await advance(0);
  assert.equal((await state()).mission, 2);
  assert.equal((await state()).started, false);
  await page.click("#start-btn");
  checks.push(
    "E salvage/return and dock extraction, reversible live trips, repeated undo, next-level progression and saved resume",
  );
  await choose(0);
  await append(["move:a", "move:b", "salvage"]);
  assert.equal(await page.locator("#run").isEnabled(), false);
  await page.click("#add-return");
  assert.equal(await page.locator("#run").isEnabled(), true);
  assert.deepEqual((await state()).queue, [
    "move:a",
    "move:b",
    "salvage",
    "move:a",
  ]);
  await page.click("#run");
  await advance(20000);
  assert.equal((await state()).droneRoom, "a");
  assert.equal((await state()).salvage, 3);
  assert.equal(
    await page.locator(".dev-credit").getAttribute("href"),
    "https://acedzn.dev",
  );
  assert.equal(await page.locator(".dev-credit").isVisible(), true);
  await page.click("#missions-toggle");
  assert.equal(await page.locator("#mission-select option").count(), 20);
  assert.equal(await page.locator("#mission-select optgroup").count(), 4);
  await page.click("#missions-toggle");
  checks.push(
    "Unsafe upload protection, add-safe-return helper, 20-level chapter menu, aceDZN credit",
  );
  await page.evaluate(() =>
    localStorage.setItem("cut-the-signal:v1", "{invalid"),
  );
  await page.reload({ waitUntil: "networkidle" });
  await advance(0);
  assert.equal((await state()).salvage, 0);
  assert.equal((await state()).muted, true);
  checks.push("Malformed progress recovery and safe storage defaults");
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const touch = await mobile.newPage();
  touch.on("pageerror", (e) => errors.push(String(e)));
  await touch.goto(url, { waitUntil: "networkidle" });
  await touch.evaluate(() => window.advanceTime(0));
  await touch.tap("#start-btn");
  await touch.evaluate(() => window.advanceTime(1000));
  assert.equal(
    await touch.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await touch.tap("#program-toggle");
  await touch.tap('[data-room="a"]');
  await touch.tap("#run");
  await touch.evaluate(() => window.advanceTime(20000));
  assert.equal(
    JSON.parse(await touch.evaluate(() => window.render_game_to_text()))
      .droneRoom,
    "a",
  );
  await touch.tap("#program-toggle");
  await touch.tap('[data-room="b"]');
  await touch.tap("#run");
  await touch.evaluate(() => window.advanceTime(20000));
  await touch.tap("#interact");
  await touch.evaluate(() => window.advanceTime(20000));
  assert.equal(
    JSON.parse(await touch.evaluate(() => window.render_game_to_text()))
      .salvage,
    3,
  );
  await touch.tap("#recover");
  await touch.evaluate(() => window.advanceTime(1000));
  assert.equal(
    JSON.parse(await touch.evaluate(() => window.render_game_to_text()))
      .droneRoom,
    "b",
  );
  assert.equal(await touch.locator(".dev-credit").isVisible(), true);
  await touch.screenshot({ path: new URL("mobile.png", out).pathname });
  await touch.setViewportSize({ width: 320, height: 568 });
  await touch.evaluate(() => window.advanceTime(1000));
  assert.equal(
    await touch.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  const overlap = await touch.evaluate(() => {
    const a = document.querySelector(".controls").getBoundingClientRect(),
      b = document.querySelector("#interact").getBoundingClientRect(),
      c = document.querySelector(".dev-credit").getBoundingClientRect();
    const hit = (x, y) =>
      Math.min(x.right, y.right) > Math.max(x.left, y.left) &&
      Math.min(x.bottom, y.bottom) > Math.max(x.top, y.top);
    return hit(a, b) || hit(b, c) || hit(a, c);
  });
  assert.equal(overlap, false);
  await touch.screenshot({ path: new URL("mobile-320.png", out).pathname });
  await mobile.close();
  checks.push(
    "390px/320px touch, E salvage and recovery, reduced motion, no horizontal scroll or footer/control overlap",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await fs.writeFile(
    new URL("validation.json", out),
    JSON.stringify(
      {
        url,
        passed: true,
        campaignCoverage:
          process.env.SMOKE_ONLY === "1"
            ? "first/final regression"
            : "all 20 wrecks",
        checks,
        consoleErrors: errors,
        externalRequests: external,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        passed: true,
        checks,
        consoleErrors: errors,
        externalRequests: external,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await shot("failed");
  await fs.writeFile(
    new URL("failure.json", out),
    JSON.stringify(
      { error: String(error), state: await state(), errors },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
