import "./style.css";
import * as THREE from "three";
import { levels, totalValue } from "./game/levels";
import type { Command, State } from "./game/model";
import {
  initialState,
  isConnected,
  exits,
  previewProgram,
  upload,
  tickCommand,
  pause,
  applyCommand,
  signalRooms,
} from "./game/simulate";
import {
  worldPoints,
  advancePilot,
  relayPoint,
  segmentDistance,
  type Point,
} from "./game/physical";
import { readSaved, STORAGE_KEY } from "./game/storage";
import { GameWorld } from "./world";
import {
  findRoute,
  moveCommands,
  safeSalvage,
  routeSafety,
} from "./game/navigation";
const $ = <T extends HTMLElement>(id: string) => document.querySelector<T>(id)!;
$("#app").innerHTML = `
<main id="game"><canvas id="board" tabindex="0" aria-label="3D salvage wreck. Drive with WASD. E salvages with an automatic safe return. Tab opens route planning."></canvas><div id="world-labels" aria-hidden="true"></div><div class="vignette"></div>
<header class="hud"><div class="identity"><h1>CUT THE SIGNAL</h1><button id="missions-toggle" class="mission-title" aria-expanded="false"><span id="mission-number">01</span> / <span id="mission-name">FIRST CONTACT</span> <span class="chevron">⌄</span></button></div><div class="telemetry"><div class="cargo">SALVAGE <strong id="cargo">0</strong> / <span id="quota">3</span><small id="banked"></small></div><div id="connection">SIGNAL CONNECTED</div><div class="utility"><button id="sound" title="Toggle sound (M)">SOUND OFF</button><button id="fullscreen" title="Fullscreen (F)" aria-label="Enter fullscreen">↗</button></div></div></header>
<section id="mission-menu" class="glass menu" hidden><label for="mission-select">SELECT WRECK</label><select id="mission-select" aria-label="Choose mission"></select><p id="best"></p><p id="campaign-progress"></p><button id="restart">Restart mission <kbd>R</kbd></button></section>
<section id="intro" class="intro"><p class="eyebrow">A SALVAGE JOB. A SHORT MEMORY.</p><h2>Take the signal<br>apart.</h2><p class="intro-copy">Drive to a relay. Salvage it. Get home.<br>Cut the signal, and your planned return takes over.</p><button id="start-btn" class="primary">Enter the wreck <span>↗</span></button><div class="intro-keys"><span><kbd>WASD</kbd> DRIVE</span><span><kbd>E</kbd> SALVAGE + RETURN</span><span><kbd>TAB</kbd> PLAN A ROUTE</span></div><p class="intro-note">20 wrecks. Four chapters. No timer. Undo a trip whenever you need.</p></section>
<div id="objective" class="objective"><span id="objective-label">RECOVER THE SURVEY RELAY</span><p id="briefing"></p><p id="next-step" class="next-step"></p></div><p id="message" class="message" role="status" aria-live="polite"></p>
<section id="programmer" class="glass programmer" aria-label="Autopilot programmer" hidden><div class="panel-title"><h2>Autopilot</h2><button id="program-close" aria-label="Close programmer">×</button></div><p>Choose each stop, add a cut, then return to a live receiver. Your route is highlighted in the wreck.</p><span class="eyebrow" id="moves-label"></span><div id="moves" class="moves"></div><div class="verbs"><button id="salvage">⌁ Cut relay <span id="salvage-value"></span></button><button id="extract">↗ Extract</button></div><div class="planner-info"><span id="endpoint" role="status"></span><button id="undo">Undo ↶</button></div><button id="add-return" class="return-button" hidden>Add a safe return ↶</button><button id="run" class="primary">Upload & run <span>▶</span></button><div class="transport"><button id="step">Step</button><button id="pause">Pause</button><button id="clear">Clear</button></div><button id="hint" class="hint">Need a hint?</button><p id="hint-copy" hidden></p></section>
<section id="program-strip" class="program-strip" aria-label="Uploaded program"><div class="strip-meta"><span id="program-label">AUTOPILOT BUFFER</span><span id="buffer-count"></span></div><ol id="queue"></ol><button id="program-toggle">TAB · PROGRAM A RETURN</button><div class="command-progress"><i id="command-progress"></i></div></section>
<footer class="controls"><span><kbd>WASD</kbd> DRIVE</span><button id="overview"><kbd>V</kbd> OVERVIEW</button><button id="recover" title="Undo the last trip (U)"><kbd>U</kbd> UNDO TRIP</button><button id="help-toggle" aria-expanded="false"><kbd>?</kbd> CONTROLS</button></footer><a class="dev-credit" href="https://acedzn.dev" target="_blank" rel="noopener noreferrer" aria-label="Game developed by aceDZN — acedzn.dev">Developed by aceDZN ↗</a><button id="interact" class="interact"><kbd>E</kbd><span id="interact-label">EXTRACT AT DOCK</span></button>
<div id="touch-drive" class="touch-drive" aria-label="Touch driving"><button data-drive="w" aria-label="Drive forward">↑</button><div><button data-drive="a" aria-label="Drive left">←</button><button data-drive="s" aria-label="Drive backward">↓</button><button data-drive="d" aria-label="Drive right">→</button></div></div>
<section id="help" class="glass help" hidden><h2>Drive. Salvage. Get home.</h2><p>WASD drives relative to your camera. Click a live deck to travel there. Guardrails keep you on the platforms. Right-drag rotates; the wheel zooms; V shows the wreck. Driving exits overview.</p><p>E salvages the current relay and follows the highlighted return automatically. At Dock, E banks cargo. Tab opens manual route planning for dark crossings and longer jobs. Unsafe routes cannot be uploaded: add a live return first.</p><p>Amber cables carry signal. Catwalks carry the drone. Cutting leaves the floor intact. Offline, your uploaded route keeps moving. U undoes a trip, restoring the drone and relays. Press it again to go back further. R restarts the whole level.</p><p><kbd>Enter</kbd> Run · <kbd>Space</kbd> Step · <kbd>P</kbd> Pause at receiver<br><kbd>Backspace</kbd> Undo · <kbd>R</kbd> Restart · <kbd>M</kbd> Sound<br><kbd>F</kbd> Fullscreen · <kbd>Esc</kbd> Close / exit</p><p class="help-credit">Created by <a href="https://acedzn.dev" target="_blank" rel="noopener noreferrer">aceDZN · acedzn.dev ↗</a></p><button id="help-close">Got it</button></section>
<section id="result" class="result glass" hidden aria-label="Mission result"><p class="eyebrow" id="result-kicker"></p><h2 id="result-title"></h2><p id="result-copy"></p><div><button id="next" class="primary">Next wreck ↗</button><button id="result-recover">Undo last trip</button><button id="retry">Retry mission</button></div></section><div id="render-error" class="render-error" hidden></div></main>`;
let index = 0,
  level = levels[0],
  state = initialState(level),
  draft: Command[] = [],
  started = false,
  programOpen = false,
  overview = false;
let time = 0,
  manualClock = false,
  lastDrawDt = 16,
  heading = 0,
  notice = "",
  hintIndex = 0,
  pauseRequested = false,
  stepMode = false,
  cutBurst = 0,
  extractionBurst = 0;
let drone: Point = { ...worldPoints(level).get(level.dock)! };
let tripHistory: { state: State; drone: Point }[] = [];
let boundaryNotice = "";
function rememberTrip(point = drone) {
  tripHistory.push({ state: structuredClone(state), drone: { ...point } });
  if (tripHistory.length > 80) tripHistory.shift();
}
function recoverTrip() {
  if (!tripHistory.length || state.mode === "won") return;
  const checkpoint = tripHistory.pop()!;
  state = {
    ...structuredClone(checkpoint.state),
    mode: "planning",
    program: [],
    cursor: 0,
  };
  drone = { ...checkpoint.drone };
  boundaryNotice = "";
  animation = null;
  draft = [];
  keys.clear();
  overview = false;
  cutBurst = 0;
  extractionBurst = 0;
  notice =
    "Trip undone. Drone, relays and cargo restored. U goes back another trip.";
  setProgram(false);
  sync();
  draw();
}
interface Animation {
  command: Command;
  elapsed: number;
  duration: number;
  from: Point;
  via: Point;
  to: Point;
  firstLength: number;
  totalLength: number;
}
let animation: Animation | null = null;
let saved: ReturnType<typeof readSaved>;
try {
  saved = readSaved(localStorage);
} catch {
  saved = { best: {}, muted: true };
}
for (const l of levels)
  if (saved.best[l.id] > totalValue(l)) delete saved.best[l.id];
const resumeIndex = levels.findIndex((l) => l.id === saved.lastLevel);
if (resumeIndex >= 0) {
  index = resumeIndex;
  level = levels[index];
  state = initialState(level);
  drone = { ...worldPoints(level).get(level.dock)! };
}
if (index > 0)
  $("#start-btn").innerHTML =
    `Continue wreck ${String(index + 1).padStart(2, "0")} <span>↗</span>`;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const canvas = $<HTMLCanvasElement>("#board");
let world: GameWorld;
try {
  world = new GameWorld(canvas, level, $("#world-labels"));
} catch (error) {
  $("#render-error").hidden = false;
  $("#render-error").textContent =
    "This 3D game needs WebGL 2. Enable hardware acceleration in your browser, then reload.";
  throw error;
}
const keys = new Set<string>();
let audio: AudioContext | undefined;
const label = (id: string) => level.rooms.find((r) => r.id === id)?.label ?? id;
const canEdit = () =>
  started &&
  !animation &&
  ["planning", "paused"].includes(state.mode) &&
  isConnected(level, state);
const planned = () => previewProgram(level, state, draft).state;
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {}
}
function tone(kind: "move" | "cut" | "connect" | "win") {
  if (saved.muted) return;
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const oscillator = audio.createOscillator(),
      gain = audio.createGain();
    oscillator.type = kind === "cut" ? "sawtooth" : "sine";
    oscillator.frequency.setValueAtTime(
      kind === "cut"
        ? 100
        : kind === "connect"
          ? 620
          : kind === "win"
            ? 880
            : 180,
      audio.currentTime,
    );
    gain.gain.setValueAtTime(kind === "cut" ? 0.018 : 0.035, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.25);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.3);
  } catch {}
}
function say(message: string) {
  notice = message;
  sync();
}
function setProgram(open: boolean) {
  programOpen = open && started;
  $("#programmer").hidden = !programOpen;
  $("#program-toggle").setAttribute("aria-expanded", String(programOpen));
  keys.clear();
  sync();
}
function add(command: Command) {
  if (!canEdit()) {
    say(
      "No control link. Your uploaded program must finish; R restarts the attempt.",
    );
    return;
  }
  if (draft.length >= level.bufferLimit) {
    say(`Buffer full — ${level.bufferLimit} commands. Undo or upload.`);
    return;
  }
  const preview = previewProgram(level, state, [...draft, command]);
  if (!preview.ok) {
    say(preview.reason!);
    return;
  }
  draft.push(command);
  notice = "";
  sync();
}
function undo() {
  if (canEdit()) {
    draft.pop();
    notice = "";
    sync();
  }
}
function begin(single = false) {
  if (!started) {
    start();
    return;
  }
  const result = upload(level, state, draft);
  if (!result.ok) {
    say(result.reason!);
    return;
  }
  const safety = routeSafety(level, state, draft);
  if (!safety.safe) {
    say(safety.message);
    setProgram(true);
    return;
  }
  rememberTrip();
  state = result.state;
  draft = [];
  stepMode = single;
  pauseRequested = false;
  notice = "";
  setProgram(false);
  startCommand();
  sync();
}
function startCommand() {
  if (state.mode !== "running") return;
  const command = state.program[state.cursor],
    points = worldPoints(level),
    center = points.get(state.room)!;
  const to = command.startsWith("move:")
    ? points.get(command.slice(5))!
    : command === "salvage"
      ? (() => {
          const relay = relayPoint(level, state.room),
            distance = Math.hypot(relay.x - center.x, relay.z - center.z);
          return {
            x: relay.x - ((relay.x - center.x) / distance) * 1.35,
            z: relay.z - ((relay.z - center.z) / distance) * 1.35,
          };
        })()
      : drone;
  const via = command.startsWith("move:") ? center : drone;
  const firstLength = Math.hypot(via.x - drone.x, via.z - drone.z),
    totalLength = firstLength + Math.hypot(to.x - via.x, to.z - via.z);
  animation = {
    command,
    elapsed: 0,
    duration:
      command === "salvage"
        ? 1800
        : command === "extract"
          ? 1400
          : Math.max(700, (totalLength / 5) * 1000),
    from: { ...drone },
    via: { ...via },
    to: { ...to },
    firstLength,
    totalLength,
  };
}
function finish() {
  const oldConnected = isConnected(level, state),
    command = animation!.command;
  drone = { ...animation!.to };
  state = tickCommand(level, state).state;
  animation = null;
  notice = "";
  if (command === "salvage") {
    cutBurst = 650;
    tone("cut");
  } else if (!oldConnected && isConnected(level, state)) {
    tone("connect");
    notice = "Signal reacquired. You have control.";
  } else tone(command === "extract" ? "win" : "move");
  if (state.mode === "won") {
    extractionBurst = 1600;
    saved.best[level.id] = Math.max(saved.best[level.id] ?? 0, state.banked);
    saved.lastLevel = levels[Math.min(index + 1, levels.length - 1)].id;
    save();
  }
  if (state.mode === "running") {
    if ((stepMode || pauseRequested) && isConnected(level, state)) {
      state = pause(level, state).state;
      draft = state.program.slice(state.cursor);
      pauseRequested = false;
      setProgram(true);
    } else startCommand();
  }
  sync();
}
function update(dt: number) {
  time += dt;
  cutBurst = Math.max(0, cutBurst - dt);
  extractionBurst = Math.max(0, extractionBurst - dt);
  if (animation) {
    animation.elapsed = Math.min(animation.duration, animation.elapsed + dt);
    const t = animation.elapsed / animation.duration;
    if (animation.command.startsWith("move:")) {
      const traveled = t * animation.totalLength;
      const first = traveled < animation.firstLength;
      const a = first ? animation.from : animation.via,
        b = first ? animation.via : animation.to;
      const segment = first
        ? animation.firstLength
        : animation.totalLength - animation.firstLength;
      const local =
        segment > 0
          ? (first ? traveled : traveled - animation.firstLength) / segment
          : 1;
      const old = { ...drone };
      drone = { x: a.x + (b.x - a.x) * local, z: a.z + (b.z - a.z) * local };
      if (Math.hypot(drone.x - old.x, drone.z - old.z) > 0.0001)
        heading = Math.atan2(-(drone.x - old.x), -(drone.z - old.z));
    } else if (animation.command === "salvage") {
      const tMove = Math.min(1, t * 3);
      drone = {
        x: animation.from.x + (animation.to.x - animation.from.x) * tMove,
        z: animation.from.z + (animation.to.z - animation.from.z) * tMove,
      };
      const relay = relayPoint(level, state.room);
      heading = Math.atan2(-(relay.x - drone.x), -(relay.z - drone.z));
    }
    if (animation.elapsed >= animation.duration) finish();
  } else if (
    started &&
    !programOpen &&
    $("#help").hidden &&
    $("#mission-menu").hidden &&
    canEdit()
  ) {
    let x =
        (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
        (keys.has("a") || keys.has("arrowleft") ? 1 : 0),
      z =
        (keys.has("s") || keys.has("arrowdown") ? 1 : 0) -
        (keys.has("w") || keys.has("arrowup") ? 1 : 0);
    const length = Math.hypot(x, z);
    if (length) {
      if (overview) {
        overview = false;
        sync();
      }
      if (draft.length) {
        draft = [];
        notice = "Driving resumed · unfinished route cleared.";
        sync();
      }
      x /= length;
      z /= length;
      const yaw = world.yaw,
        dx = (x * Math.cos(yaw) + z * Math.sin(yaw)) * dt * 0.0048,
        dz = (-x * Math.sin(yaw) + z * Math.cos(yaw)) * dt * 0.0048;
      const connected = signalRooms(level, state);
      const result = advancePilot(level, state.room, drone, dx, dz, connected);
      if (result.blocked) {
        const origin = worldPoints(level).get(state.room)!;
        const dark = exits(level, state.room).find((id) => {
          const p = worldPoints(level).get(id)!;
          return (
            !connected.includes(id) &&
            segmentDistance(drone, origin, p) < 1.7 &&
            (p.x - origin.x) * dx + (p.z - origin.z) * dz > 0
          );
        });
        if (dark) {
          const warning = `${label(dark)} has no signal. Tab plans the crossing and a live return.`;
          if (boundaryNotice !== warning) {
            boundaryNotice = warning;
            say(warning);
          }
        }
      }
      const previousPoint = { ...drone };
      drone = result.point;
      if (
        Math.hypot(drone.x - previousPoint.x, drone.z - previousPoint.z) > 0.001
      )
        heading = Math.atan2(
          -(drone.x - previousPoint.x),
          -(drone.z - previousPoint.z),
        );
      if (result.arrived) {
        const moved = applyCommand(level, state, `move:${result.arrived}`);
        if (moved.ok) {
          if (!isConnected(level, moved.state)) {
            drone = previousPoint;
            const warning = `${label(result.arrived)} has no signal. Press Tab to plan a crossing and a live return.`;
            if (boundaryNotice !== warning) {
              boundaryNotice = warning;
              say(warning);
            }
          } else {
            rememberTrip(worldPoints(level).get(state.room)!);
            state = moved.state;
            boundaryNotice = "";
            notice = `${label(state.room)} · connected. E salvages with a safe return.`;
            tone("connect");
            sync();
          }
        }
      }
    }
  }
}
function advance(ms: number) {
  let left = Math.max(0, Math.min(ms, 60000));
  lastDrawDt = left;
  while (left > 0) {
    const step = Math.min(left, 1000 / 60);
    update(step);
    left -= step;
  }
  draw();
}
function draw() {
  world.update({
    state,
    drone,
    heading,
    time,
    dt: lastDrawDt,
    cut:
      animation?.command === "salvage"
        ? animation.elapsed / animation.duration
        : cutBurst > 0
          ? 1
          : 0,
    extract: extractionBurst,
    overview: overview || programOpen,
    started,
    reduced: reduced.matches,
    draft:
      state.mode === "running"
        ? state.program.slice(state.cursor)
        : draft.length
          ? draft
          : canEdit()
            ? safeSalvage(level, state).commands
            : [],
    routeSafe:
      state.mode === "running" ||
      !draft.length ||
      routeSafety(level, state, draft).safe,
  });
  $("#command-progress").style.width = animation
    ? `${(animation.elapsed / animation.duration) * 100}%`
    : "0%";
}
function requestPause() {
  if (!animation || state.mode !== "running") {
    say("Step stops after a command at a live receiver.");
    return;
  }
  if (!isConnected(level, state)) {
    say("OFFLINE — pause cannot reach the drone. Uploaded commands continue.");
    return;
  }
  pauseRequested = true;
  say("Pause requested at the next live receiver.");
}
function addReturn() {
  if (!canEdit()) return;
  const preview = planned();
  const path = findRoute(level, preview.room, signalRooms(level, preview));
  if (!path || path.length + draft.length > level.bufferLimit) {
    say("A return does not fit. Undo a stop or keep another receiver alive.");
    return;
  }
  for (const command of moveCommands(path)) add(command);
}
function interact() {
  if (!canEdit()) {
    say("Autopilot has control. Your return continues; U undoes the trip.");
    return;
  }
  if (draft.length) {
    begin();
    return;
  }
  if (state.room === level.dock) {
    if (state.salvage < level.quota) {
      say(
        "Drive with WASD or click a live deck. Salvage relays to fill your hold.",
      );
      return;
    }
    add("extract");
    if (draft.length) begin();
    return;
  }
  const plan = safeSalvage(level, state);
  if (!plan.commands.length) {
    say(plan.reason);
    setProgram(true);
    return;
  }
  draft = plan.commands;
  begin();
}
function restart(next = index) {
  index = next;
  level = levels[index];
  state = initialState(level);
  draft = [];
  animation = null;
  keys.clear();
  cutBurst = 0;
  extractionBurst = 0;
  notice = "";
  hintIndex = 0;
  tripHistory = [];
  boundaryNotice = "";
  overview = false;
  heading = 0;
  drone = { ...worldPoints(level).get(level.dock)! };
  world.build(level);
  saved.lastLevel = level.id;
  save();
  $("#hint-copy").hidden = true;
  $("#help").hidden = true;
  $("#mission-menu").hidden = true;
  setProgram(false);
  sync();
  draw();
}
function start() {
  started = true;
  $("#intro").hidden = true;
  $("#game").classList.add("playing");
  canvas.focus();
  sync();
}
function commandLabel(command: Command) {
  return command === "salvage"
    ? "CUT"
    : command === "extract"
      ? "EXTRACT"
      : `→ ${label(command.slice(5))}`;
}
function sync() {
  const live = isConnected(level, state),
    edit = canEdit(),
    preview = planned(),
    ended = ["won", "stranded"].includes(state.mode),
    safety = routeSafety(level, state, draft),
    smart = canEdit() && !draft.length ? safeSalvage(level, state) : null;
  const queue =
    state.mode === "running" ? state.program.slice(state.cursor) : draft;
  $("#mission-number").textContent =
    `${String(index + 1).padStart(2, "0")} / ${levels.length}`;
  $("#mission-name").textContent = level.name.toUpperCase();
  $<HTMLSelectElement>("#mission-select").value = String(index);
  $("#cargo").textContent = String(state.salvage);
  $("#quota").textContent = String(level.quota);
  $("#banked").textContent = state.mode === "won" ? "BANKED" : "";
  $("#connection").textContent =
    state.mode === "won"
      ? "DRONE RECOVERED"
      : state.mode === "stranded"
        ? "OFFLINE · STRANDED"
        : live
          ? "SIGNAL CONNECTED"
          : "OFFLINE · AUTOPILOT";
  $("#connection").classList.toggle("offline", !live);
  $("#objective-label").textContent =
    state.salvage >= level.quota
      ? "RETURN TO DOCK & EXTRACT"
      : `RECOVER ${level.quota - state.salvage} MORE SALVAGE`;
  $("#briefing").textContent = level.briefing;
  $("#next-step").textContent =
    state.mode === "running"
      ? "Autopilot driving · your return is already on board."
      : state.room === level.dock
        ? state.salvage >= level.quota
          ? "Quota reached. Press E to bank cargo and finish."
          : "Drive with WASD or click a live deck. E salvages and returns."
        : smart?.commands.length
          ? `E · salvage +${level.rooms.find((r) => r.id === state.room)!.salvageValue}, then return to ${label(smart.returnRoom!)}.`
          : smart?.reason ||
            "Tab · plan a dark crossing. U · undo the last trip.";
  $("#objective").hidden = !started || ended || programOpen;
  $("#message").textContent =
    notice ||
    (state.mode === "running" && !live
      ? "No signal. Following the uploaded program."
      : state.mode === "planning"
        ? ""
        : state.message);
  $("#queue").innerHTML = Array.from(
    { length: level.bufferLimit },
    (_, i) =>
      `<li title="${queue[i] ? commandLabel(queue[i]) : "Empty slot"}" class="${queue[i] ? "filled" : ""} ${state.mode === "running" && i === 0 ? "active" : ""}"><span>${String(i + 1).padStart(2, "0")}</span>${queue[i] ? commandLabel(queue[i]) : "—"}</li>`,
  ).join("");
  $("#queue").style.setProperty("--slots", String(level.bufferLimit));
  $("#program-label").textContent =
    state.mode === "running"
      ? "UPLOADED PROGRAM"
      : programOpen
        ? "BUILD A COMPLETE RETURN"
        : "YOUR ROUTE · TAB TO PLAN";
  $("#buffer-count").textContent = `${queue.length} / ${level.bufferLimit}`;
  $("#program-toggle").textContent =
    state.mode === "running"
      ? "AUTOPILOT EXECUTING"
      : draft.length
        ? "ENTER · UPLOAD   /   TAB · EDIT"
        : "TAB · PLAN A ROUTE";
  $("#endpoint").textContent = draft.length
    ? safety.message
    : "Each move, cut or extract uses one slot";
  $("#endpoint").classList.toggle("unsafe", !!draft.length && !safety.safe);
  $("#add-return").hidden = !edit || !draft.length || safety.safe;
  $("#moves-label").textContent =
    `MOVE FROM ${label(preview.room).toUpperCase()}`;
  $("#moves").innerHTML = exits(level, preview.room)
    .map(
      (id) =>
        `<button data-room="${id}" ${!edit || draft.length >= level.bufferLimit ? "disabled" : ""}>→ ${label(id)}</button>`,
    )
    .join("");
  const salvageable =
    preview.liveRelays.includes(preview.room) && preview.room !== level.dock;
  $<HTMLButtonElement>("#salvage").disabled =
    !edit || !salvageable || draft.length >= level.bufferLimit;
  $<HTMLButtonElement>("#extract").disabled =
    !edit || preview.room !== level.dock || draft.length >= level.bufferLimit;
  $("#salvage-value").textContent = salvageable
    ? `+${level.rooms.find((r) => r.id === preview.room)!.salvageValue}`
    : "";
  for (const id of ["#undo", "#clear"])
    $<HTMLButtonElement>(id).disabled = !edit || !draft.length;
  for (const id of ["#run", "#step"])
    $<HTMLButtonElement>(id).disabled = !edit || !draft.length || !safety.safe;
  $<HTMLButtonElement>("#pause").disabled = state.mode !== "running";
  $("#sound").textContent = saved.muted ? "SOUND OFF" : "SOUND ON";
  $("#sound").setAttribute(
    "aria-label",
    saved.muted ? "Unmute sound" : "Mute sound",
  );
  $("#best").textContent =
    saved.best[level.id] === undefined
      ? `${totalValue(level)} salvage available`
      : `Best ${saved.best[level.id]} / ${totalValue(level)}`;
  const completed = levels.filter(
    (l) => (saved.best[l.id] ?? -1) >= l.quota,
  ).length;
  $("#campaign-progress").textContent =
    `${completed} / ${levels.length} wrecks recovered · ${level.chapter}`;
  for (const option of $<HTMLSelectElement>("#mission-select").options) {
    const n = Number(option.value),
      item = levels[n];
    option.textContent = `${String(n + 1).padStart(2, "0")} · ${item.name}${(saved.best[item.id] ?? -1) >= item.quota ? " ✓" : ""}`;
  }
  $("#recover").hidden = !tripHistory.length || state.mode === "won";
  $("#result-recover").hidden = !tripHistory.length || state.mode === "won";
  $("#interact-label").textContent =
    state.mode === "running"
      ? "AUTOPILOT ENGAGED"
      : !live
        ? "NO CONTROL LINK"
        : draft.length
          ? "RUN PROGRAM"
          : state.room === level.dock
            ? state.salvage >= level.quota
              ? "BANK CARGO & FINISH"
              : "EXPLORE THE WRECK"
            : smart?.commands.length
              ? `SALVAGE +${level.rooms.find((r) => r.id === state.room)!.salvageValue} & RETURN`
              : "PLAN NEXT TRIP";
  $<HTMLButtonElement>("#interact").disabled = !edit;
  $("#result").hidden = !ended;
  if (ended) {
    const win = state.mode === "won";
    $("#result-kicker").textContent = win
      ? `WRECK ${index + 1} / ${levels.length} · EXTRACTION COMPLETE`
      : "CONTROL LINK LOST";
    $("#result-title").textContent = win ? "Cargo secured." : "Drone stranded.";
    $("#result-copy").textContent = win
      ? `${state.banked} / ${totalValue(level)} salvage banked. ${state.banked === totalValue(level) ? "Perfect recovery. Every relay aboard." : "Quota complete. Replay for a perfect recovery."}${index === levels.length - 1 ? ` ${completed === levels.length ? "All 20 wrecks recovered." : "Final wreck recovered."} Thanks for playing.` : ""}`
      : state.message;
    $("#next").hidden = !win;
    $("#next").textContent =
      index === levels.length - 1
        ? "Campaign complete · replay ↗"
        : `Next wreck · ${index + 2} / ${levels.length} ↗`;
  }
  $("#program-strip").hidden = !started || ended;
  $(".controls").hidden = !started;
  $("#interact").hidden = !started || ended;
  $("#touch-drive").classList.toggle(
    "available",
    started && !ended && !programOpen,
  );
}
$("#start-btn").addEventListener("click", start);
$("#program-toggle").addEventListener("click", () => setProgram(!programOpen));
$("#add-return").addEventListener("click", addReturn);
$("#recover").addEventListener("click", recoverTrip);
$("#result-recover").addEventListener("click", recoverTrip);
$("#program-close").addEventListener("click", () => setProgram(false));
$("#moves").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-room]");
  if (b) add(`move:${b.dataset.room}`);
});
$("#salvage").addEventListener("click", () => add("salvage"));
$("#extract").addEventListener("click", () => add("extract"));
$("#undo").addEventListener("click", undo);
$("#clear").addEventListener("click", () => {
  if (canEdit()) {
    draft = [];
    sync();
  }
});
$("#run").addEventListener("click", () => begin());
$("#step").addEventListener("click", () => begin(true));
$("#pause").addEventListener("click", requestPause);
$("#interact").addEventListener("click", interact);
$("#restart").addEventListener("click", () => restart());
$("#retry").addEventListener("click", () => restart());
$("#next").addEventListener("click", () =>
  restart((index + 1) % levels.length),
);
$("#missions-toggle").addEventListener("click", () => {
  const menu = $("#mission-menu");
  menu.hidden = !menu.hidden;
  $("#missions-toggle").setAttribute("aria-expanded", String(!menu.hidden));
});
$<HTMLSelectElement>("#mission-select").innerHTML = Array.from(
  { length: 4 },
  (_, chapter) =>
    `<optgroup label="${levels[chapter * 5].chapter}">${levels
      .slice(chapter * 5, chapter * 5 + 5)
      .map((l, j) => {
        const i = chapter * 5 + j;
        return `<option value="${i}">${String(i + 1).padStart(2, "0")} · ${l.name}${(saved.best[l.id] ?? -1) >= l.quota ? " ✓" : ""}</option>`;
      })
      .join("")}</optgroup>`,
).join("");
$("#mission-select").addEventListener("change", (e) => {
  if (!started) start();
  restart(Number((e.target as HTMLSelectElement).value));
  $("#mission-menu").hidden = true;
});
$("#overview").addEventListener("click", () => {
  overview = !overview;
  keys.clear();
});
$("#hint").addEventListener("click", () => {
  $("#hint-copy").hidden = false;
  $("#hint-copy").textContent =
    level.hint[Math.min(hintIndex++, level.hint.length - 1)];
});
function toggleHelp() {
  const el = $("#help");
  el.hidden = !el.hidden;
  $("#help-toggle").setAttribute("aria-expanded", String(!el.hidden));
  keys.clear();
}
$("#help-toggle").addEventListener("click", toggleHelp);
$("#help-close").addEventListener("click", toggleHelp);
function toggleSound() {
  saved.muted = !saved.muted;
  save();
  if (!saved.muted) tone("connect");
  sync();
}
$("#sound").addEventListener("click", toggleSound);
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    say("Fullscreen is unavailable. Resize the browser to change the view.");
  }
}
$("#fullscreen").addEventListener("click", () => void fullscreen());
let drag = false,
  dragX = 0,
  downX = 0,
  downY = 0;
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointerdown", (e) => {
  canvas.focus();
  drag = e.button === 2;
  dragX = e.clientX;
  downX = e.clientX;
  downY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (drag) {
    world.yaw += (e.clientX - dragX) * 0.006;
    dragX = e.clientX;
  }
});
canvas.addEventListener("pointerup", (e) => {
  if (
    !drag &&
    Math.hypot(e.clientX - downX, e.clientY - downY) < 5 &&
    started
  ) {
    const target = world.pick(e.clientX, e.clientY);
    if (target) {
      if (!programOpen) {
        if (target === state.room) {
          say("E salvages with a safe return. Tab plans a route.");
        } else if (canEdit()) {
          const path = findRoute(
            level,
            state.room,
            [target],
            signalRooms(level, state),
          );
          if (path && path.length <= level.bufferLimit) {
            draft = moveCommands(path);
            begin();
          } else {
            setProgram(true);
            say(
              "That deck needs a planned crossing. Choose the stops and include a live return.",
            );
          }
        }
      } else add(`move:${target}`);
    }
  }
  drag = false;
});
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    world.zoom = Math.max(0.65, Math.min(1.9, world.zoom + e.deltaY * 0.001));
  },
  { passive: false },
);
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-drive]",
)) {
  const key = button.dataset.drive!;
  button.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    keys.add(key);
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    button.addEventListener(event, () => keys.delete(key));
}
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key.toLowerCase(),
    target = e.target as HTMLElement;
  if (key === "escape") {
    keys.clear();
    if (document.fullscreenElement) void fullscreen();
    else if (programOpen) setProgram(false);
    else if (!$("#help").hidden) toggleHelp();
    else $("#mission-menu").hidden = true;
    return;
  }
  if (target.matches("input,select,textarea") || target.isContentEditable)
    return;
  if (key === "tab" && started) {
    e.preventDefault();
    if (!e.repeat) setProgram(!programOpen);
    return;
  }
  if (
    [
      "w",
      "a",
      "s",
      "d",
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
    ].includes(key) &&
    started &&
    !programOpen
  ) {
    e.preventDefault();
    keys.add(key);
    return;
  }
  if (e.repeat) return;
  if (key === "f") {
    void fullscreen();
    return;
  }
  if (key === "m") {
    toggleSound();
    return;
  }
  if (!started) {
    if (key === "enter" || key === " ") {
      e.preventDefault();
      start();
    }
    return;
  }
  if (target.closest("button") && (key === "enter" || key === " ")) return;
  if (key === "enter") {
    e.preventDefault();
    begin();
  } else if (key === " ") {
    e.preventDefault();
    begin(true);
  } else if (key === "e") {
    interact();
  } else if (key === "p") {
    requestPause();
  } else if (key === "u") {
    recoverTrip();
  } else if (key === "r") {
    restart();
  } else if (key === "v") {
    overview = !overview;
    keys.clear();
  } else if (key === "?") {
    toggleHelp();
  } else if (programOpen) {
    if (key === "s") add("salvage");
    else if (key === "x") add("extract");
    else if (key === "backspace") {
      e.preventDefault();
      undo();
    } else if (key.startsWith("arrow")) {
      e.preventDefault();
      const p = planned(),
        current = level.rooms.find((r) => r.id === p.room)!;
      const direction =
        key === "arrowright"
          ? [1, 0]
          : key === "arrowleft"
            ? [-1, 0]
            : key === "arrowup"
              ? [0, -1]
              : [0, 1];
      const candidates = exits(level, p.room)
        .map((id) => level.rooms.find((r) => r.id === id)!)
        .filter(
          (r) =>
            (r.x - current.x) * direction[0] +
              (r.y - current.y) * direction[1] >
            0.1,
        )
        .sort((a, b) => {
          const score = (r: typeof a) =>
            ((r.x - current.x) * direction[0] +
              (r.y - current.y) * direction[1]) /
            Math.hypot(r.x - current.x, r.y - current.y);
          return score(b) - score(a);
        });
      if (candidates[0]) add(`move:${candidates[0].id}`);
    }
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) keys.clear();
});
function resize() {
  world.resize(innerWidth, innerHeight);
  draw();
}
window.addEventListener("resize", resize);
document.addEventListener("fullscreenchange", resize);
Object.assign(window, {
  advanceTime: (ms: number) => {
    manualClock = true;
    advance(ms);
  },
  render_game_to_text: () =>
    JSON.stringify({
      coordinateSystem:
        "3D world: X right, Y up, Z deck south. WASD follows camera yaw. screenX/screenY are projected deck centers in canvas CSS pixels.",
      renderer: "Three.js WebGL2",
      models: world.modelStatus,
      level: level.id,
      mission: index + 1,
      campaignSize: levels.length,
      chapter: level.chapter,
      difficulty: level.difficulty,
      recoverable: tripHistory.length > 0,
      undoTrips: tripHistory.length,
      routeSafety: routeSafety(level, state, draft),
      salvagePlan: canEdit() ? safeSalvage(level, state) : null,
      started,
      mode: state.mode,
      droneRoom: state.room,
      dronePosition: { x: drone.x, y: 0.12, z: drone.z },
      heading,
      camera: {
        overview: overview || programOpen,
        yaw: world.yaw,
        zoom: world.zoom,
      },
      programOpen,
      liveRelays: state.liveRelays,
      signalConnectedRooms: signalRooms(level, state),
      connected: isConnected(level, state),
      salvage: state.salvage,
      quota: level.quota,
      banked: state.banked,
      buffer: level.bufferLimit,
      queue:
        state.mode === "running" ? state.program.slice(state.cursor) : draft,
      plannedEndpoint: planned().room,
      currentCommand: animation?.command ?? null,
      commandDuration: animation?.duration ?? 0,
      commandElapsed: animation?.elapsed ?? 0,
      reason: notice || state.message,
      muted: saved.muted,
      rooms: level.rooms.map((r) => {
        const p = worldPoints(level).get(r.id)!;
        const s = world.project(new THREE.Vector3(p.x, 0, p.z));
        return {
          ...r,
          worldX: p.x,
          worldZ: p.z,
          screenX: s.x,
          screenY: s.y,
          visible: s.visible,
        };
      }),
      corridors: level.corridors,
      wires: level.wires,
    }),
});
let previous = performance.now();
function frame(now: number) {
  lastDrawDt = Math.min(now - previous, 60);
  previous = now;
  if (!manualClock) advance(lastDrawDt);
  requestAnimationFrame(frame);
}
resize();
sync();
requestAnimationFrame(frame);
