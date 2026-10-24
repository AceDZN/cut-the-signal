import test from "node:test";
import assert from "node:assert/strict";
import { levels, totalValue } from "../src/game/levels";
import type { Command, Level, State } from "../src/game/model";
import {
  applyCommand,
  initialState,
  isConnected,
  pause,
  previewProgram,
  replay,
  signalRooms,
  tickCommand,
  upload,
} from "../src/game/simulate";
import { readSaved } from "../src/game/storage";
const first = levels[0];
function execute(l: Level, s: State, commands: Command[]) {
  const up = upload(l, s, commands);
  assert.ok(up.ok, up.reason);
  let current = up.state;
  while (current.mode === "running") {
    const tick = tickCommand(l, current);
    assert.ok(tick.ok, tick.reason);
    current = tick.state;
  }
  return current;
}
for (const level of levels) {
  test(`${level.name}: legal perfect extraction and intended failure`, () => {
    const win = replay(level, level.witnessPrograms);
    assert.equal(win.mode, "won");
    assert.equal(win.banked, level.witnessValue);
    assert.equal(win.banked, totalValue(level));
    assert.ok(win.banked >= level.quota);
    assert.equal(win.room, level.dock);
    const fail = replay(level, level.intendedFailurePrograms);
    assert.equal(fail.mode, "stranded");
    assert.equal(fail.banked, 0);
    assert.equal(isConnected(level, fail), false);
    assert.equal(initialState(level).salvage, 0);
    assert.equal(
      initialState(level).liveRelays.length,
      level.rooms.filter((r) => r.relay).length,
    );
  });
}
test("cutting a bridge removes signal, leaves floor, executes offline, reconnects", () => {
  let s = upload(first, initialState(first), [
    "move:a",
    "salvage",
    "move:b",
    "move:a",
  ]).state;
  s = tickCommand(first, s).state;
  s = tickCommand(first, s).state;
  assert.deepEqual(signalRooms(first, s), ["dock"]);
  assert.equal(s.mode, "running");
  assert.equal(s.salvage, 1);
  const before = structuredClone(s);
  assert.equal(upload(first, s, ["move:dock"]).ok, false);
  assert.equal(pause(first, s).ok, false);
  assert.deepEqual(s, before);
  s = tickCommand(first, s).state;
  assert.equal(s.room, "b");
  assert.equal(isConnected(first, s), false);
  s = tickCommand(first, s).state;
  assert.equal(s.room, "a");
  assert.equal(s.mode, "stranded");
  let recovery = upload(
    first,
    initialState(first),
    first.witnessPrograms[0],
  ).state;
  for (let i = 0; i < 3; i++) recovery = tickCommand(first, recovery).state;
  assert.equal(recovery.mode, "running");
  assert.equal(isConnected(first, recovery), false);
  recovery = tickCommand(first, recovery).state;
  assert.equal(recovery.mode, "planning");
  assert.equal(isConnected(first, recovery), true);
  assert.equal(upload(first, recovery, ["move:dock", "extract"]).ok, true);
});
test("alternate feed maintains remote reachability through a cycle", () => {
  const level = levels.find((l) => l.id === "alternative-feed")!;
  let s = upload(level, initialState(level), [
    "move:a",
    "salvage",
    "move:b",
  ]).state;
  s = tickCommand(level, s).state;
  s = tickCommand(level, s).state;
  assert.equal(isConnected(level, s), false);
  assert.ok(signalRooms(level, s).includes("b"));
  s = tickCommand(level, s).state;
  assert.equal(isConnected(level, s), true);
  assert.equal(s.mode, "planning");
});
test("illegal actions, duplicates, overflow and premature extraction preserve score and position", () => {
  const s = initialState(first);
  const snapshot = structuredClone(s);
  for (const cmd of [
    "move:b",
    "move:missing",
    "salvage",
    "extract",
  ] as Command[]) {
    const result = applyCommand(first, s, cmd);
    assert.equal(result.ok, false);
    assert.deepEqual(result.state, snapshot);
  }
  assert.equal(
    upload(first, s, ["move:a", "move:b", "salvage", "move:a", "move:dock"]).ok,
    false,
  );
  const p = previewProgram(first, s, ["move:a", "salvage", "salvage"]);
  assert.equal(p.ok, false);
  let loaded = execute(first, s, ["move:a", "move:b", "salvage", "move:a"]);
  const atDock = applyCommand(first, loaded, "move:dock").state;
  assert.equal(applyCommand(first, atDock, "extract").state.mode, "won");
  const shortfall = applyCommand(first, { ...atDock, salvage: 1 }, "extract");
  assert.equal(shortfall.ok, false);
  assert.match(shortfall.reason!, /2 more/);
  assert.equal(shortfall.state.banked, 0);
  assert.equal(pause(first, initialState(first)).ok, false);
});
test("connected pause permits a replacement upload; running upload is immutable", () => {
  const s = upload(first, initialState(first), ["move:a", "move:b"]).state;
  assert.equal(upload(first, s, ["move:a"]).ok, false);
  const atA = tickCommand(first, s).state;
  const paused = pause(first, atA);
  assert.ok(paused.ok);
  assert.equal(paused.state.mode, "paused");
  const replacement = upload(first, paused.state, ["move:dock"]);
  assert.ok(replacement.ok);
  assert.deepEqual(replacement.state.program, ["move:dock"]);
});
test("planned endpoint advances one corridor per move, including after cutting", () => {
  const initial = initialState(first);
  const result = previewProgram(first, initial, [
    "move:a",
    "move:b",
    "salvage",
    "move:a",
  ]);
  assert.ok(result.ok);
  assert.equal(result.state.room, "a");
  assert.equal(result.state.salvage, 3);
  assert.equal(initial.salvage, 0);
  assert.equal(previewProgram(first, initial, ["move:b"]).ok, false);
});
test("malformed progress and impossible values reset safely without entering game state", () => {
  for (const raw of [
    "{broken",
    "null",
    "[]",
    "42",
    '{"best":null}',
    '{"best":[100]}',
  ])
    assert.deepEqual(readSaved({ getItem: () => raw }).best, {});
  assert.deepEqual(
    readSaved({
      getItem: () =>
        '{"best":{"first-contact":4,"negative":-2,"tooBig":999999,"text":"4"},"muted":false}',
    }),
    { best: { "first-contact": 4 }, muted: false },
  );
  assert.deepEqual(
    readSaved({
      getItem: () => {
        throw new Error("denied");
      },
    }),
    { best: {}, muted: true },
  );
});
// Independent command-level bounded search. Uploads are free only at a connected receiver.
// No witness data is used to find a quota solution or prove a perfect run exists.
function solve(
  level: Level,
  target: number,
): { commands: number; visited: number } | null {
  const all = level.rooms.filter((r) => r.relay && r.id !== level.dock);
  const bit = (id: string) => 1 << all.findIndex((r) => r.id === id);
  const start = {
    room: level.dock,
    mask: (1 << all.length) - 1,
    budget: level.bufferLimit,
    commands: 0,
  };
  const pending = [start];
  const seen = new Set<string>();
  for (let i = 0; i < pending.length; i++) {
    const n = pending[i];
    const live = [
      level.dock,
      ...all.filter((r) => n.mask & bit(r.id)).map((r) => r.id),
    ];
    const s = {
      ...initialState(level),
      room: n.room,
      liveRelays: live,
      salvage: all
        .filter((r) => !(n.mask & bit(r.id)))
        .reduce((sum, r) => sum + r.salvageValue, 0),
    };
    const budget = isConnected(level, s) ? level.bufferLimit : n.budget;
    const key = `${n.room}:${n.mask}:${budget}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (n.room === level.dock && s.salvage >= target && budget >= 1)
      return { commands: n.commands + 1, visited: seen.size };
    if (budget <= 0) continue;
    const actions: Command[] = [
      ...level.rooms.map((r) => `move:${r.id}` as Command),
      "salvage",
    ];
    for (const command of actions) {
      const result = applyCommand(level, s, command);
      if (!result.ok) continue;
      pending.push({
        room: result.state.room,
        mask: command === "salvage" ? n.mask & ~bit(n.room) : n.mask,
        budget: budget - 1,
        commands: n.commands + 1,
      });
    }
  }
  return null;
}
for (const level of levels)
  test(`${level.name}: independent search reaches quota and all salvage`, () => {
    const quota = solve(level, level.quota),
      perfect = solve(level, totalValue(level));
    assert.ok(quota);
    assert.ok(perfect);
    console.log(
      `${level.id}: quota ${quota.commands} commands, perfect ${perfect.commands}; ${perfect.visited} states searched`,
    );
  });
test("later checkpoint missions can meet quota without stripping the useful checkpoint", () => {
  const fourth = levels.find((l) => l.id === "valuable-checkpoint")!;
  const run = replay(fourth, [
    ["move:a"],
    ["move:b", "salvage", "move:c", "move:a"],
    ["move:d", "salvage", "move:a"],
    ["move:dock", "extract"],
  ]);
  assert.equal(run.banked, 7);
  assert.ok(run.liveRelays.includes("a"));
  const final = levels.find((l) => l.id === "last-light")!;
  const run2 = replay(final, [
    ...final.witnessPrograms.slice(0, -1),
    ["move:dock", "extract"],
  ]);
  assert.equal(run2.banked, 16);
  assert.ok(run2.liveRelays.includes("a"));
});

test("saved campaign selection resumes safely without accepting malformed identifiers", () => {
  assert.equal(
    readSaved({ getItem: () => '{"best":{},"lastLevel":"end-of-the-line"}' })
      .lastLevel,
    "end-of-the-line",
  );
  assert.equal(
    readSaved({ getItem: () => '{"lastLevel":42}' }).lastLevel,
    undefined,
  );
  assert.equal(
    readSaved({ getItem: () => '{"lastLevel":"<script>"}' }).lastLevel,
    undefined,
  );
});
