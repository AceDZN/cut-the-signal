import type { Command, Level, State, Transition } from "./model";

export function initialState(level: Level): State {
  return {
    room: level.dock,
    liveRelays: level.rooms.filter((r) => r.relay).map((r) => r.id),
    salvage: 0,
    banked: 0,
    mode: "planning",
    program: [],
    cursor: 0,
    executed: null,
    uploads: 0,
    moves: 0,
    message: "Choose a route. Every command uses one buffer slot.",
  };
}
export function signalRooms(level: Level, state: State): string[] {
  const seen = new Set([level.dock]);
  const live = new Set(state.liveRelays);
  const pending = [level.dock];
  while (pending.length) {
    const id = pending.shift()!;
    for (const [a, b] of level.wires) {
      const other = a === id ? b : b === id ? a : undefined;
      if (other && live.has(other) && !seen.has(other)) {
        seen.add(other);
        pending.push(other);
      }
    }
  }
  return [...seen];
}
export const isConnected = (level: Level, state: State): boolean =>
  signalRooms(level, state).includes(state.room);
export function exits(level: Level, room: string): string[] {
  return level.corridors.flatMap((c) =>
    c.from === room ? [c.to] : !c.oneWay && c.to === room ? [c.from] : [],
  );
}
const reject = (state: State, reason: string): Transition => ({
  state,
  ok: false,
  reason,
});
export function applyCommand(
  level: Level,
  state: State,
  command: Command,
): Transition {
  if (state.mode === "won" || state.mode === "stranded")
    return reject(state, "Restart to begin another attempt.");
  const room = level.rooms.find((r) => r.id === state.room)!;
  if (command.startsWith("move:")) {
    const target = command.slice(5);
    if (!exits(level, state.room).includes(target))
      return reject(state, "No outgoing corridor connects those rooms.");
    return {
      ok: true,
      state: {
        ...state,
        room: target,
        moves: state.moves + 1,
        executed: command,
        message: `Arrived at ${level.rooms.find((r) => r.id === target)!.label}.`,
      },
    };
  }
  if (command === "salvage") {
    if (room.id === level.dock)
      return reject(
        state,
        "The dock is your permanent uplink. It cannot be salvaged.",
      );
    if (!room.relay || !state.liveRelays.includes(room.id))
      return reject(state, "There is no intact relay to salvage here.");
    return {
      ok: true,
      state: {
        ...state,
        liveRelays: state.liveRelays.filter((id) => id !== room.id),
        salvage: state.salvage + room.salvageValue,
        executed: command,
        message: `${room.label} cut. +${room.salvageValue} salvage aboard.`,
      },
    };
  }
  if (command !== "extract") return reject(state, "Unknown command.");
  if (state.room !== level.dock)
    return reject(state, "Extraction is only available at the dock.");
  if (state.salvage < level.quota)
    return reject(
      state,
      `Need ${level.quota - state.salvage} more salvage before extraction.`,
    );
  return {
    ok: true,
    state: {
      ...state,
      mode: "won",
      banked: state.salvage,
      executed: command,
      message: `${state.salvage} salvage secured. Drone recovered.`,
    },
  };
}
export function previewProgram(
  level: Level,
  state: State,
  program: Command[],
): Transition {
  let next = { ...state, mode: "planning" as State["mode"] };
  for (const command of program) {
    const transition = applyCommand(level, next, command);
    if (!transition.ok) return transition;
    next = transition.state;
  }
  return { state: next, ok: true };
}
export function upload(
  level: Level,
  state: State,
  program: Command[],
): Transition {
  if (
    !["planning", "paused"].includes(state.mode) ||
    !isConnected(level, state)
  )
    return reject(state, "Upload requires an idle, connected receiver.");
  if (!program.length)
    return reject(state, "Add at least one command to the buffer.");
  if (program.length > level.bufferLimit)
    return reject(state, `The buffer holds ${level.bufferLimit} commands.`);
  const preview = previewProgram(level, state, program);
  if (!preview.ok) return reject(state, preview.reason!);
  return {
    ok: true,
    state: {
      ...state,
      program: [...program],
      cursor: 0,
      mode: "running",
      uploads: state.uploads + 1,
      message: "Program uploaded. Executing.",
    },
  };
}
export function tickCommand(level: Level, state: State): Transition {
  if (state.mode !== "running")
    return reject(state, "The program is not running.");
  const command = state.program[state.cursor];
  if (!command) return reject(state, "The buffer is empty.");
  const result = applyCommand(level, state, command);
  if (!result.ok)
    return {
      ok: false,
      reason: result.reason,
      state: {
        ...state,
        mode: isConnected(level, state) ? "planning" : "stranded",
        program: [],
        cursor: 0,
        message: result.reason!,
      },
    };
  let next = { ...result.state, cursor: state.cursor + 1 };
  if (next.mode !== "won" && next.cursor === next.program.length) {
    const connected = isConnected(level, next);
    next = {
      ...next,
      mode: connected ? "planning" : "stranded",
      message: connected
        ? "Receiver connected. Ready for your next upload."
        : `Buffer empty at ${level.rooms.find((r) => r.id === next.room)!.label}. No signal to upload a return. Restart and leave room for the trip back.`,
    };
  }
  return { state: next, ok: true };
}
export function pause(level: Level, state: State): Transition {
  if (state.mode !== "running" || !isConnected(level, state))
    return reject(state, "No signal. The uploaded program must continue.");
  return {
    ok: true,
    state: {
      ...state,
      mode: "paused",
      message:
        "Paused at a live receiver. Resume or replace the remaining program.",
    },
  };
}
export function replay(level: Level, programs: Command[][]): State {
  let state = initialState(level);
  for (const program of programs) {
    const result = upload(level, state, program);
    if (!result.ok) throw new Error(`${level.id}: ${result.reason}`);
    state = result.state;
    while (state.mode === "running") state = tickCommand(level, state).state;
  }
  return state;
}
