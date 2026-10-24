import seed from "./levels.seed.json";
import { additionalLevels, campaignOrder, chapters } from "./campaign";
import type { Level } from "./model";
const briefings = [
  "Recover the survey relay. Keep one command for the return to Receiver A.",
  "The outer loop runs one way. Keep the Uplink until your drone returns.",
  "Two feeds power the battery. Trace the wires before you cut.",
];
const hints = [
  [
    "Click Receiver A, then Survey Relay. Add Salvage, then a move back to Receiver A.",
    "A cut receiver has no signal. A move already in the buffer still runs.",
    "Back at Receiver A, upload the final trip: salvage it, return to Dock, extract.",
  ],
  [
    "Move to the Uplink and upload from there. A new upload gives you four fresh slots.",
    "The full outer trip fits: Core Relay, salvage, Dark Passage, Uplink.",
    "Only cut the Uplink once the outer trip is finished.",
  ],
  [
    "Feed C is a second electrical route to the Battery Relay.",
    "After cutting Feed A, move on to the Battery to regain signal.",
    "Each cut needs a move to the next live receiver. The dock is always connected.",
  ],
];
const starters = seed.levels.map((l, i) => ({
  ...l,
  briefing: briefings[i],
  hint: hints[i],
})) as Level[];
const originalLevels: Level[] = [
  ...starters,
  {
    id: "valuable-checkpoint",
    name: "The Price of a Checkpoint",
    dock: "dock",
    bufferLimit: 4,
    quota: 7,
    briefing:
      "The central relay is worth five. It also controls both salvage routes.",
    teachingPoint:
      "A valuable relay can be useful twice: as a checkpoint first, as cargo later.",
    hint: [
      "Use the central relay as an upload point for each branch.",
      "The north loop takes all four slots: move, salvage, move, return.",
      "The two outer relays meet the quota. The checkpoint is optional cargo on your final trip.",
    ],
    rooms: [
      { id: "dock", label: "Dock", x: 1, y: 3, relay: true, salvageValue: 0 },
      {
        id: "a",
        label: "Checkpoint",
        x: 3.1,
        y: 3,
        relay: true,
        salvageValue: 5,
      },
      {
        id: "b",
        label: "Survey Array",
        x: 4.5,
        y: 1,
        relay: true,
        salvageValue: 3,
      },
      {
        id: "c",
        label: "Empty Hold",
        x: 6.8,
        y: 3,
        relay: false,
        salvageValue: 0,
      },
      {
        id: "d",
        label: "Storage Relay",
        x: 4.5,
        y: 5,
        relay: true,
        salvageValue: 4,
      },
    ],
    corridors: [
      { from: "dock", to: "a", oneWay: false },
      { from: "a", to: "b", oneWay: true },
      { from: "b", to: "c", oneWay: true },
      { from: "c", to: "a", oneWay: true },
      { from: "a", to: "d", oneWay: false },
    ],
    wires: [
      ["dock", "a"],
      ["a", "b"],
      ["a", "d"],
    ],
    witnessPrograms: [
      ["move:a"],
      ["move:b", "salvage", "move:c", "move:a"],
      ["move:d", "salvage", "move:a"],
      ["salvage", "move:dock", "extract"],
    ],
    witnessValue: 12,
    intendedFailurePrograms: [["move:a", "salvage", "move:b", "salvage"]],
  },
  {
    id: "across-the-dark",
    name: "Across the Dark",
    dock: "dock",
    bufferLimit: 4,
    quota: 10,
    briefing:
      "Empty rooms carry the drone, not the signal. Bridge each dark stretch with a complete program.",
    teachingPoint:
      "Signal wiring does not have to follow walkable corridors. Stop at receivers, not empty rooms.",
    hint: [
      "Move through Dark Passage to the Core before uploading the next trip.",
      "Cut the Core, cross the Empty Hold, and stop at the live Return Relay.",
      "Cut Return Relay and cross the Service Duct back to the Uplink. Save the Uplink for last.",
    ],
    rooms: [
      { id: "dock", label: "Dock", x: 1, y: 3, relay: true, salvageValue: 0 },
      { id: "a", label: "Uplink", x: 2.8, y: 3, relay: true, salvageValue: 2 },
      {
        id: "t",
        label: "Dark Passage",
        x: 4.1,
        y: 1,
        relay: false,
        salvageValue: 0,
      },
      { id: "b", label: "Core", x: 6, y: 1, relay: true, salvageValue: 6 },
      {
        id: "u",
        label: "Empty Hold",
        x: 7.5,
        y: 3,
        relay: false,
        salvageValue: 0,
      },
      {
        id: "c",
        label: "Return Relay",
        x: 6,
        y: 5,
        relay: true,
        salvageValue: 4,
      },
      {
        id: "v",
        label: "Service Duct",
        x: 4.1,
        y: 5,
        relay: false,
        salvageValue: 0,
      },
    ],
    corridors: [
      { from: "dock", to: "a", oneWay: false },
      { from: "a", to: "t", oneWay: true },
      { from: "t", to: "b", oneWay: true },
      { from: "b", to: "u", oneWay: true },
      { from: "u", to: "c", oneWay: true },
      { from: "c", to: "v", oneWay: true },
      { from: "v", to: "a", oneWay: true },
    ],
    wires: [
      ["dock", "a"],
      ["a", "b"],
      ["a", "c"],
    ],
    witnessPrograms: [
      ["move:a", "move:t", "move:b"],
      ["salvage", "move:u", "move:c"],
      ["salvage", "move:v", "move:a"],
      ["salvage", "move:dock", "extract"],
    ],
    witnessValue: 12,
    intendedFailurePrograms: [["move:a", "move:t", "move:b", "salvage"]],
  },
  {
    id: "last-light",
    name: "Last Light",
    dock: "dock",
    bufferLimit: 3,
    quota: 16,
    briefing:
      "Two loops. Three slots. Leave each return receiver intact until its outer relay is aboard.",
    teachingPoint:
      "With three commands, salvage order matters. Each loop needs its return receiver alive.",
    hint: [
      "The two outer loops contain exactly the required sixteen salvage. The central relay is optional.",
      "Keep North Feed until the Survey Array is cut; keep South Feed until the Engine is cut.",
      "From the Uplink: Survey Array, salvage, North Feed. Cut that feed on the return. Repeat on the south loop.",
    ],
    rooms: [
      { id: "dock", label: "Dock", x: 1, y: 3, relay: true, salvageValue: 0 },
      { id: "a", label: "Uplink", x: 3, y: 3, relay: true, salvageValue: 6 },
      {
        id: "b",
        label: "Survey Array",
        x: 4.3,
        y: 1,
        relay: true,
        salvageValue: 4,
      },
      {
        id: "c",
        label: "North Feed",
        x: 6.8,
        y: 1,
        relay: true,
        salvageValue: 3,
      },
      { id: "d", label: "Engine", x: 4.3, y: 5, relay: true, salvageValue: 5 },
      {
        id: "e",
        label: "South Feed",
        x: 6.8,
        y: 5,
        relay: true,
        salvageValue: 4,
      },
    ],
    corridors: [
      { from: "dock", to: "a", oneWay: false },
      { from: "a", to: "b", oneWay: true },
      { from: "b", to: "c", oneWay: false },
      { from: "c", to: "a", oneWay: false },
      { from: "a", to: "d", oneWay: true },
      { from: "d", to: "e", oneWay: false },
      { from: "e", to: "a", oneWay: false },
    ],
    wires: [
      ["dock", "a"],
      ["a", "c"],
      ["c", "b"],
      ["a", "e"],
      ["e", "d"],
    ],
    witnessPrograms: [
      ["move:a"],
      ["move:b", "salvage", "move:c"],
      ["salvage", "move:a"],
      ["move:d", "salvage", "move:e"],
      ["salvage", "move:a"],
      ["salvage", "move:dock", "extract"],
    ],
    witnessValue: 22,
    intendedFailurePrograms: [
      ["move:a"],
      ["move:c", "salvage", "move:a"],
      ["move:b", "salvage", "move:c"],
    ],
  },
];
export const totalValue = (level: Level) =>
  level.rooms.reduce((sum, r) => sum + r.salvageValue, 0);

const allLevels = [...originalLevels, ...additionalLevels];
export const levels: Level[] = campaignOrder.map((id, i) => ({
  ...allLevels.find((l) => l.id === id)!,
  difficulty: i + 1,
  chapter: chapters[Math.floor(i / 5)],
}));
