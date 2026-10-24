import type { Command, Level, State } from "./model";
import {
  applyCommand,
  exits,
  isConnected,
  previewProgram,
  signalRooms,
} from "./simulate";
export function findRoute(
  level: Level,
  from: string,
  targets: string[],
  allowed?: string[],
): string[] | null {
  const queue = [{ id: from, path: [] as string[] }],
    seen = new Set([from]);
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    if (targets.includes(item.id)) return item.path;
    for (const id of exits(level, item.id)) {
      if (seen.has(id) || (allowed && !allowed.includes(id))) continue;
      seen.add(id);
      queue.push({ id, path: [...item.path, id] });
    }
  }
  return null;
}
export const moveCommands = (path: string[]): Command[] =>
  path.map((id): Command => `move:${id}`);
export function safeSalvage(
  level: Level,
  state: State,
): { commands: Command[]; returnRoom: string | null; reason: string } {
  const cut = applyCommand(level, state, "salvage");
  if (!cut.ok) return { commands: [], returnRoom: null, reason: cut.reason! };
  const connected = signalRooms(level, cut.state);
  const remainingValue = level.rooms
    .filter((r) => connected.includes(r.id))
    .reduce((sum, r) => sum + r.salvageValue, 0);
  if (cut.state.salvage + remainingValue < level.quota) {
    const isolated = level.rooms.find(
      (r) =>
        cut.state.liveRelays.includes(r.id) &&
        !connected.includes(r.id) &&
        r.salvageValue > 0,
    );
    if (isolated)
      return {
        commands: [],
        returnRoom: null,
        reason: `${isolated.label} still needs this receiver. Recover that cargo before cutting ${level.rooms.find((r) => r.id === state.room)!.label}.`,
      };
  }
  const path = findRoute(level, state.room, signalRooms(level, cut.state));
  if (!path)
    return {
      commands: [],
      returnRoom: null,
      reason: "This cut removes every route home. Keep this relay for now.",
    };
  if (path.length + 1 > level.bufferLimit)
    return {
      commands: [],
      returnRoom: null,
      reason: `Cut + return needs ${path.length + 1} slots; this buffer has ${level.bufferLimit}. Keep another receiver alive or plan from an earlier deck.`,
    };
  return {
    commands: ["salvage", ...moveCommands(path)],
    returnRoom: path.at(-1) ?? state.room,
    reason: "",
  };
}
export function routeSafety(
  level: Level,
  state: State,
  commands: Command[],
): { safe: boolean; message: string; end: State } {
  const preview = previewProgram(level, state, commands);
  if (!preview.ok)
    return { safe: false, message: preview.reason!, end: preview.state };
  const safe =
    preview.state.mode === "won" || isConnected(level, preview.state);
  return {
    safe,
    end: preview.state,
    message: safe
      ? preview.state.mode === "won"
        ? "Cargo banked · mission complete"
        : `Safe stop · ${level.rooms.find((r) => r.id === preview.state.room)!.label}`
      : "Route ends without signal. Add a return to a live receiver.",
  };
}
