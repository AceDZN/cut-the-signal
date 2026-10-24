import test from "node:test";
import assert from "node:assert/strict";
import { levels, totalValue } from "../src/game/levels";
import { findRoute, safeSalvage, routeSafety } from "../src/game/navigation";
import {
  initialState,
  isConnected,
  previewProgram,
  replay,
  applyCommand,
  signalRooms,
} from "../src/game/simulate";

test("20 unique campaign levels form four chapters with progressive difficulty and tested quotas", () => {
  assert.equal(levels.length, 20);
  assert.equal(new Set(levels.map((l) => l.id)).size, 20);
  assert.equal(new Set(levels.map((l) => l.chapter)).size, 4);
  for (const [i, l] of levels.entries()) {
    assert.equal(l.difficulty, i + 1);
    assert.ok(l.quota > 0 && l.quota <= totalValue(l));
    assert.ok(l.hint.length >= 3);
    assert.ok(l.rooms.length >= 3);
    for (const program of l.witnessPrograms)
      assert.ok(program.length <= l.bufferLimit);
  }
  assert.equal(levels[0].bufferLimit, 4);
  assert.equal(levels.at(-1)!.bufferLimit, 3);
  assert.ok(levels.at(-1)!.rooms.length > levels[0].rooms.length * 3);
});
test("salvage action includes a live return and previews the actual cargo gain", () => {
  const l = levels[0],
    s = { ...initialState(l), room: "b" };
  const plan = safeSalvage(l, s);
  assert.deepEqual(plan.commands, ["salvage", "move:a"]);
  assert.equal(plan.returnRoom, "a");
  const result = previewProgram(l, s, plan.commands);
  assert.ok(isConnected(l, result.state));
  assert.equal(result.state.salvage, 3);
  assert.equal(s.salvage, 0);
});
for (const level of levels)
  test(`${level.name}: suggested returns are legal and never finish offline`, () => {
    let state = initialState(level);
    for (const program of level.witnessPrograms) {
      for (const command of program) {
        if (isConnected(level, state)) {
          const plan = safeSalvage(level, state);
          if (plan.commands.length) {
            const preview = previewProgram(level, state, plan.commands);
            assert.ok(preview.ok);
            assert.ok(isConnected(level, preview.state));
            assert.ok(plan.commands.length <= level.bufferLimit);
            assert.ok(routeSafety(level, state, plan.commands).safe);
          }
        }
        state = applyCommand(level, state, command).state;
      }
    }
  });
test("incomplete offline routes are identified before upload", () => {
  const l = levels[0],
    s = initialState(l);
  const safety = routeSafety(l, s, ["move:a", "move:b", "salvage"]);
  assert.equal(safety.safe, false);
  assert.match(safety.message, /Add a return/);
  assert.equal(
    routeSafety(l, s, ["move:a", "move:b", "salvage", "move:a"]).safe,
    true,
  );
});
test("route search respects one-way links and can restrict travel to live receivers", () => {
  const l = levels.find((l) => l.id === "rail-switch")!;
  assert.deepEqual(findRoute(l, "b", ["a"]), ["c", "d", "a"]);
  assert.equal(findRoute(l, "b", ["a"], ["a", "b", "d"]), null);
  assert.equal(findRoute(l, "dock", ["missing"]), null);
});
test("a dependent cut with no usable return produces an explanation instead of an unsafe action", () => {
  const l = levels[0];
  const s = { ...initialState(l), room: "b", liveRelays: ["dock", "b"] };
  const plan = safeSalvage(l, s);
  assert.deepEqual(plan.commands, ["salvage", "move:a", "move:dock"]);
  assert.equal(plan.returnRoom, "dock");
  const oneWay = levels.find((l) => l.id === "rail-switch")!;
  const blocked = safeSalvage(
    { ...oneWay, bufferLimit: 2 },
    { ...initialState(oneWay), room: "b" },
  );
  assert.equal(blocked.commands.length, 0);
  assert.match(blocked.reason, /needs 3 slots/);
});

test("quick salvage explains a premature checkpoint cut instead of stranding required cargo", () => {
  const l = levels[0],
    s = { ...initialState(l), room: "a" };
  const blocked = safeSalvage(l, s);
  assert.equal(blocked.commands.length, 0);
  assert.match(blocked.reason, /Survey Relay still needs/);
  const loaded = { ...s, salvage: 3, liveRelays: ["dock", "a"] };
  assert.deepEqual(safeSalvage(l, loaded).commands, ["salvage", "move:dock"]);
});
