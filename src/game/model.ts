export type Command = `move:${string}` | "salvage" | "extract";
export type Mode = "planning" | "running" | "paused" | "stranded" | "won";
export interface Room {
  id: string;
  label: string;
  x: number;
  y: number;
  relay: boolean;
  salvageValue: number;
}
export interface Corridor {
  from: string;
  to: string;
  oneWay: boolean;
}
export interface Level {
  difficulty?: number;
  chapter?: string;
  id: string;
  name: string;
  dock: string;
  bufferLimit: number;
  quota: number;
  rooms: Room[];
  corridors: Corridor[];
  wires: string[][];
  witnessPrograms: Command[][];
  witnessValue: number;
  intendedFailurePrograms: Command[][];
  teachingPoint: string;
  briefing: string;
  hint: string[];
}
export interface State {
  room: string;
  liveRelays: string[];
  salvage: number;
  banked: number;
  mode: Mode;
  program: Command[];
  cursor: number;
  executed: Command | null;
  uploads: number;
  moves: number;
  message: string;
}
export interface Transition {
  state: State;
  ok: boolean;
  reason?: string;
}
