import type { Level } from "./model";
import { exits } from "./simulate";
export interface Point {
  x: number;
  z: number;
}
export const WORLD_SCALE = 6;
export const DECK_X = 4.1,
  DECK_Z = 3.5,
  WALKWAY_RADIUS = 1.12;
const layouts = new WeakMap<Level, Map<string, Point>>();
export function worldPoints(level: Level): Map<string, Point> {
  let points = layouts.get(level);
  if (!points) {
    const xs = level.rooms.map((r) => r.x),
      zs = level.rooms.map((r) => r.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2,
      cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    points = new Map(
      level.rooms.map((r) => [
        r.id,
        { x: (r.x - cx) * WORLD_SCALE, z: (r.y - cz) * WORLD_SCALE },
      ]),
    );
    layouts.set(level, points);
  }
  return points;
}
export function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    length = dx * dx + dz * dz;
  const t = length
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length))
    : 0;
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
const inDeck = (p: Point, c: Point) =>
  Math.abs(p.x - c.x) < DECK_X && Math.abs(p.z - c.z) < DECK_Z;
export function onFloor(level: Level, p: Point): boolean {
  const points = worldPoints(level);
  return (
    [...points.values()].some((c) => inDeck(p, c)) ||
    level.corridors.some(
      (c) =>
        segmentDistance(p, points.get(c.from)!, points.get(c.to)!) <
        WALKWAY_RADIUS,
    )
  );
}
export function permittedPoint(
  level: Level,
  room: string,
  p: Point,
  destinations = exits(level, room),
): boolean {
  const points = worldPoints(level),
    here = points.get(room)!;
  return (
    inDeck(p, here) ||
    destinations.some(
      (id) =>
        inDeck(p, points.get(id)!) ||
        segmentDistance(p, here, points.get(id)!) < WALKWAY_RADIUS,
    )
  );
}
// Keep every entrance and the center aisle clear, including diagonal doorways.
export function inTravelLane(level: Level, room: string, p: Point): boolean {
  const points = worldPoints(level),
    here = points.get(room)!;
  return level.corridors.some(
    (c) =>
      (c.from === room || c.to === room) &&
      segmentDistance(p, here, points.get(c.from === room ? c.to : c.from)!) <
        1.5,
  );
}
export function relayPoint(level: Level, room: string): Point {
  const points = worldPoints(level),
    center = points.get(room)!;
  const candidates = [
    { x: 0, z: -2.1 },
    { x: -2.45, z: -1.8 },
    { x: 2.45, z: -1.8 },
    { x: -2.45, z: 1.8 },
    { x: 2.45, z: 1.8 },
  ];
  const incident = level.corridors.filter(
    (c) => c.from === room || c.to === room,
  );
  const score = (p: Point) =>
    Math.min(
      ...incident.map((c) =>
        segmentDistance(
          p,
          center,
          points.get(c.from === room ? c.to : c.from)!,
        ),
      ),
      10,
    );
  return candidates
    .map((p) => ({ x: center.x + p.x, z: center.z + p.z }))
    .sort((a, b) => score(b) - score(a))[0];
}
export function hitsEquipment(level: Level, p: Point): boolean {
  const points = worldPoints(level);
  for (const room of level.rooms) {
    const c = points.get(room.id)!,
      x = p.x - c.x,
      z = p.z - c.z;
    if (
      Math.abs(x) < 4.6 &&
      Math.abs(z) < 4 &&
      !inTravelLane(level, room.id, p)
    ) {
      if (Math.abs(x) > 2.9 && Math.abs(z) > 2.5) return true;
      if (room.relay && room.id !== level.dock) {
        const relay = relayPoint(level, room.id);
        if (Math.hypot(p.x - relay.x, p.z - relay.z) < 0.9) return true;
      }
    }
  }
  return false;
}
export function advancePilot(
  level: Level,
  room: string,
  p: Point,
  dx: number,
  dz: number,
  connectedRooms?: string[],
): { point: Point; arrived: string | null; blocked: boolean } {
  let point = { ...p },
    blocked = false;
  const points = worldPoints(level),
    here = points.get(room)!;
  const destinations = exits(level, room).filter(
    (id) => !connectedRooms || connectedRooms.includes(id),
  );
  const valid = (q: Point) =>
    onFloor(level, q) &&
    permittedPoint(level, room, q, destinations) &&
    !hitsEquipment(level, q);
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.09));
  dx /= steps;
  dz /= steps;
  for (let i = 0; i < steps; i++) {
    const next = { x: point.x + dx, z: point.z + dz };
    if (valid(next)) point = next;
    else {
      blocked = true;
      const candidates = [
        { x: point.x + dx, z: point.z },
        { x: point.x, z: point.z + dz },
      ];
      // Guardrails slide along a catwalk instead of catching the drone at its lip.
      for (const id of destinations) {
        const end = points.get(id)!,
          vx = end.x - here.x,
          vz = end.z - here.z,
          len = Math.hypot(vx, vz);
        if (segmentDistance(point, here, end) > 1.7) continue;
        const projection = (dx * vx + dz * vz) / len;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((point.x - here.x) * vx + (point.z - here.z) * vz) / (len * len),
          ),
        );
        const pull = Math.min(0.12, Math.hypot(dx, dz) * 0.25);
        candidates.push({
          x:
            point.x +
            (vx / len) * projection +
            (here.x + vx * t - point.x) * pull,
          z:
            point.z +
            (vz / len) * projection +
            (here.z + vz * t - point.z) * pull,
        });
      }
      const usable = candidates.filter(
        (q) =>
          valid(q) && (q.x - point.x) * dx + (q.z - point.z) * dz > 0.0000001,
      );
      usable.sort(
        (a, b) =>
          (b.x - point.x) * dx +
          (b.z - point.z) * dz -
          ((a.x - point.x) * dx + (a.z - point.z) * dz),
      );
      if (usable[0]) point = usable[0];
    }
    const arrived =
      destinations.find(
        (id) =>
          inDeck(point, points.get(id)!) &&
          Math.hypot(point.x - points.get(id)!.x, point.z - points.get(id)!.z) <
            2.5,
      ) ?? null;
    if (arrived) return { point, arrived, blocked };
  }
  return { point, arrived: null, blocked };
}
