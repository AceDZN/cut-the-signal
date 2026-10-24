import test from "node:test";
import assert from "node:assert/strict";
import { levels } from "../src/game/levels";
import {
  advancePilot,
  onFloor,
  worldPoints,
  permittedPoint,
  hitsEquipment,
  relayPoint,
} from "../src/game/physical";
test("pilot moves continuously inside a room without changing logical rooms", () => {
  const level = levels[0],
    dock = worldPoints(level).get("dock")!;
  const move = advancePilot(level, "dock", dock, 0.2, 0.1);
  assert.equal(move.point.x, dock.x + 0.2);
  assert.equal(move.arrived, null);
});
test("deck boundary blocks movement into space and preserves a valid floor position", () => {
  const level = levels[0],
    dock = worldPoints(level).get("dock")!;
  let p = { ...dock };
  for (let i = 0; i < 200; i++)
    p = advancePilot(level, "dock", p, 0, 0.1).point;
  assert.ok(p.z < 3.5);
  assert.ok(onFloor(level, p));
  assert.ok(advancePilot(level, "dock", p, 0, 0.1).blocked);
});
test("driving along the connecting catwalk reaches the next receiver", () => {
  const level = levels[0],
    points = worldPoints(level);
  let p = points.get("dock")!,
    arrived: string | null = null;
  for (let i = 0; i < 150 && !arrived; i++) {
    const r = advancePilot(level, "dock", p, 0.1, 0);
    p = r.point;
    arrived = r.arrived;
  }
  assert.equal(arrived, "a");
  assert.ok(onFloor(level, p));
});
test("one-way corridor cannot be traversed backwards by direct pilot", () => {
  const level = levels.find((l) => l.id === "use-it-then-lose-it")!,
    points = worldPoints(level),
    b = points.get("b")!,
    a = points.get("a")!;
  const p = { x: b.x + (a.x - b.x) * 0.6, z: b.z + (a.z - b.z) * 0.6 };
  assert.equal(permittedPoint(level, "b", p), false);
});
test("floor geometry survives removal of signal relays; room graph stays separate", () => {
  for (const level of levels) {
    for (const [id, p] of worldPoints(level)) {
      assert.ok(onFloor(level, p), `${level.id}/${id}`);
    }
    for (const c of level.corridors) {
      const points = worldPoints(level),
        a = points.get(c.from)!,
        b = points.get(c.to)!;
      assert.ok(onFloor(level, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }));
    }
  }
});

test("relay equipment and corner cargo block direct driving while the center aisle remains open", () => {
  const level = levels[0],
    a = worldPoints(level).get("a")!;
  assert.ok(hitsEquipment(level, relayPoint(level, "a")));
  assert.ok(hitsEquipment(level, { x: a.x + 3.2, z: a.z + 2.7 }));
  assert.equal(hitsEquipment(level, a), false);
});

for (const level of levels) {
  test(`${level.name}: every directed catwalk and diagonal entrance is drivable`, () => {
    const points = worldPoints(level);
    for (const corridor of level.corridors) {
      const directions = [[corridor.from, corridor.to]];
      if (!corridor.oneWay) directions.push([corridor.to, corridor.from]);
      for (const [from, to] of directions) {
        let point = { ...points.get(from)! },
          arrived: string | null = null;
        const target = points.get(to)!;
        for (let i = 0; i < 2500 && !arrived; i++) {
          const dx = target.x - point.x,
            dz = target.z - point.z,
            len = Math.hypot(dx, dz);
          const result = advancePilot(
            level,
            from,
            point,
            (dx / len) * 0.08,
            (dz / len) * 0.08,
          );
          assert.ok(onFloor(level, result.point), `${from} → ${to}: floor`);
          assert.equal(
            hitsEquipment(level, result.point),
            false,
            `${from} → ${to}: equipment`,
          );
          point = result.point;
          arrived = result.arrived;
        }
        assert.equal(
          arrived,
          to,
          `${level.id}: ${from} → ${to} must not jam at entrance`,
        );
        // Once the receiver hands over, reaching its center must remain possible.
        for (let i = 0; i < 60; i++) {
          const dx = target.x - point.x,
            dz = target.z - point.z,
            len = Math.hypot(dx, dz);
          if (len < 0.08) break;
          point = advancePilot(
            level,
            to,
            point,
            (dx / len) * 0.08,
            (dz / len) * 0.08,
          ).point;
        }
        assert.ok(
          Math.hypot(target.x - point.x, target.z - point.z) < 0.15,
          `${from} → ${to}: handoff must not trap the drone`,
        );
      }
    }
  });
}
test("large input steps cannot tunnel off a deck or through equipment", () => {
  const level = levels[0],
    dock = worldPoints(level).get("dock")!;
  const result = advancePilot(level, "dock", dock, 0, 100);
  assert.ok(onFloor(level, result.point));
  assert.ok(result.point.z < 3.5);
  assert.ok(result.blocked);
});
test("a drone stopped against a boundary can immediately reverse and slide away", () => {
  const level = levels[0],
    dock = worldPoints(level).get("dock")!;
  let point = advancePilot(level, "dock", dock, 0, 10).point;
  const initial = { ...point };
  point = advancePilot(level, "dock", point, 0, -1).point;
  assert.ok(point.z < initial.z - 0.9);
  const slide = advancePilot(level, "dock", initial, 1, 0.5);
  assert.ok(slide.point.x > initial.x + 0.8);
});

test("direct driving stops on the live deck before a dark crossing, and can reverse freely", () => {
  const level = levels.find((l) => l.id === "use-it-then-lose-it")!,
    points = worldPoints(level),
    start = points.get("b")!,
    target = points.get("c")!;
  const dx = target.x - start.x,
    dz = target.z - start.z,
    length = Math.hypot(dx, dz);
  let point = { ...start };
  for (let i = 0; i < 500; i++) {
    const result = advancePilot(
      level,
      "b",
      point,
      (dx / length) * 0.08,
      (dz / length) * 0.08,
      ["dock", "a", "b"],
    );
    assert.equal(result.arrived, null);
    point = result.point;
  }
  assert.ok(Math.hypot(point.x - start.x, point.z - start.z) < 5);
  const before = Math.hypot(point.x - start.x, point.z - start.z);
  const reverse = advancePilot(level, "b", point, -dx / length, -dz / length, [
    "dock",
    "a",
    "b",
  ]);
  assert.ok(
    Math.hypot(reverse.point.x - start.x, reverse.point.z - start.z) <
      before - 0.7,
  );
  assert.ok(
    Math.hypot(reverse.point.x - point.x, reverse.point.z - point.z) > 0.95,
  );
});
test("sliding guardrail follows an angled bridge instead of jamming against its edge", () => {
  const level = levels.find((l) => l.id === "alternative-feed")!,
    points = worldPoints(level),
    a = points.get("dock")!,
    b = points.get("a")!;
  const dx = b.x - a.x,
    dz = b.z - a.z,
    len = Math.hypot(dx, dz),
    p = {
      x: (a.x + b.x) / 2 - (dz / len) * 1.02,
      z: (a.z + b.z) / 2 + (dx / len) * 1.02,
    };
  const result = advancePilot(level, "dock", p, 0.5, 0);
  assert.ok(onFloor(level, result.point));
  assert.ok(Math.hypot(result.point.x - p.x, result.point.z - p.z) > 0.15);
});
