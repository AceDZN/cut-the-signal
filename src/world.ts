import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Level, State, Command } from "./game/model";
import type { Point } from "./game/physical";
import { worldPoints, relayPoint } from "./game/physical";
import { signalRooms } from "./game/simulate";
export interface WorldFrame {
  state: State;
  drone: Point;
  heading: number;
  time: number;
  dt: number;
  cut: number;
  extract: number;
  overview: boolean;
  started: boolean;
  reduced: boolean;
  draft: Command[];
  routeSafe: boolean;
}
const mat = (color: number, metalness = 0.6, roughness = 0.65) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });
const steel = mat(0x475963, 0.75),
  edge = mat(0x1b2833, 0.8),
  dark = mat(0x111b23, 0.6),
  ivory = mat(0xc9c6af, 0.6),
  copper = mat(0x937148, 0.8),
  rubber = mat(0x10171b, 0.1);
const amber = new THREE.MeshStandardMaterial({
  color: 0xffbc4c,
  emissive: 0xff780d,
  emissiveIntensity: 1.2,
  roughness: 0.3,
});
const white = new THREE.MeshStandardMaterial({
  color: 0xc7e8f8,
  emissive: 0x83c4ee,
  emissiveIntensity: 1.6,
});
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const up = new THREE.Vector3(0, 1, 0);
function box(
  group: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  m: THREE.Material,
) {
  const mesh = new THREE.Mesh(boxGeo, m);
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function cylinder(
  g: THREE.Object3D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
  m: THREE.Material,
) {
  const v = b.clone().sub(a);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, v.length(), 7),
    m,
  );
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(up, v.normalize());
  mesh.castShadow = true;
  mesh.userData.ownedGeometry = true;
  g.add(mesh);
  return mesh;
}
function tube(
  g: THREE.Object3D,
  points: THREE.Vector3[],
  r: number,
  m: THREE.Material,
) {
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, Math.max(8, points.length * 4), r, 6, false),
    m,
  );
  mesh.castShadow = true;
  mesh.userData.ownedGeometry = true;
  g.add(mesh);
  return mesh;
}
function rand(seed: number) {
  let n = seed >>> 0;
  return () => {
    n = (1664525 * n + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
export class GameWorld {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 800);
  level: Level;
  root = new THREE.Group();
  drone = new THREE.Group();
  proceduralDrone = new THREE.Group();
  relayMeshes = new Map<string, THREE.Group>();
  relayLights = new Map<string, THREE.PointLight>();
  wires: {
    a: string;
    b: string;
    mesh: THREE.Mesh;
    material: THREE.MeshStandardMaterial;
  }[] = [];
  particles: THREE.Points;
  particlePositions = new Float32Array(150 * 3);
  particleMat: THREE.PointsMaterial;
  labels = new Map<string, HTMLDivElement>();
  labelLayer: HTMLElement;
  modelStatus = { drone: "loading", relay: "loading", deck: "loading" };
  loadedDeck: THREE.Object3D | null = null;
  deckShells: THREE.Group[] = [];
  loadedDrone: THREE.Object3D | null = null;
  loadedRelay: THREE.Object3D | null = null;
  yaw = 0.5;
  zoom = 1;
  follow = new THREE.Vector3();
  width = 1280;
  height = 720;
  keyLight: THREE.DirectionalLight;
  floorTexture: THREE.CanvasTexture;
  focusTarget = new THREE.Vector3();
  route = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineDashedMaterial({
      color: 0x94e8df,
      dashSize: 0.6,
      gapSize: 0.28,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    }),
  );
  marker = new THREE.Mesh(
    new THREE.RingGeometry(1.15, 1.23, 32),
    new THREE.MeshBasicMaterial({
      color: 0xa5eee3,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    }),
  );
  routeKey = "";
  levelFloorMaterial: THREE.Material | null = null;
  constructor(
    canvas: HTMLCanvasElement,
    level: Level,
    labelLayer: HTMLElement,
  ) {
    this.level = level;
    this.labelLayer = labelLayer;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color(0x07111e);
    this.scene.fog = new THREE.FogExp2(0x10283a, 0.0013);
    this.scene.add(new THREE.HemisphereLight(0xa9d5ef, 0x18202a, 2));
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(environment, 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    environment.dispose();
    pmrem.dispose();
    this.keyLight = new THREE.DirectionalLight(0xffd49b, 3.3);
    this.keyLight.position.set(-18, 36, 14);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    Object.assign(this.keyLight.shadow.camera, {
      left: -45,
      right: 45,
      top: 40,
      bottom: -40,
      near: 1,
      far: 120,
    });
    this.keyLight.shadow.bias = -0.0003;
    this.keyLight.shadow.normalBias = 0.03;
    this.scene.add(this.keyLight, this.keyLight.target);
    const fill = new THREE.DirectionalLight(0x6fb8ff, 2.4);
    fill.position.set(10, 8, -30);
    this.scene.add(fill);
    this.floorTexture = this.makeFloorTexture();
    this.scene.add(this.root, this.drone, this.route, this.marker);
    this.route.renderOrder = 10;
    this.marker.rotation.x = -Math.PI / 2;
    this.makeSpace();
    this.makeDrone();
    this.particleMat = new THREE.PointsMaterial({
      color: 0xffbb4a,
      size: 0.09,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(this.particlePositions, 3),
    );
    this.particles = new THREE.Points(geo, this.particleMat);
    this.scene.add(this.particles);
    this.particles.visible = false;
    this.build(level);
    void this.loadModels();
  }
  makeFloorTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const x = c.getContext("2d")!;
    const r = rand(291);
    x.fillStyle = "#52616a";
    x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 12000; i++) {
      const v = 60 + Math.floor(r() * 65);
      x.fillStyle = `rgba(${v},${v + 9},${v + 13},.17)`;
      x.fillRect(r() * 512, r() * 512, 1 + r() * 4, 1 + r() * 2);
    }
    x.strokeStyle = "#283942";
    x.lineWidth = 6;
    x.strokeRect(5, 5, 502, 502);
    x.strokeStyle = "#879298";
    x.lineWidth = 2;
    x.strokeRect(10, 10, 492, 492);
    for (const a of [22, 490])
      for (const b of [22, 490]) {
        x.fillStyle = "#202c33";
        x.beginPath();
        x.arc(a, b, 6, 0, Math.PI * 2);
        x.fill();
        x.strokeStyle = "#a1a6a4";
        x.lineWidth = 1;
        x.stroke();
      }
    for (let i = 0; i < 50; i++) {
      x.strokeStyle = `rgba(200,203,188,${r() * 0.15})`;
      x.lineWidth = 1;
      x.beginPath();
      const px = r() * 512,
        py = r() * 512;
      x.moveTo(px, py);
      x.lineTo(px + r() * 60 - 30, py + r() * 5);
      x.stroke();
    }
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }
  makeSpace() {
    const r = rand(773);
    const pos = new Float32Array(1800 * 3);
    for (let i = 0; i < 1800; i++) {
      pos[i * 3] = (r() - 0.5) * 500;
      pos[i * 3 + 1] = (r() - 0.3) * 300;
      pos[i * 3 + 2] = (r() - 0.5) * 500;
    }
    const stars = new THREE.BufferGeometry();
    stars.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.scene.add(
      new THREE.Points(
        stars,
        new THREE.PointsMaterial({
          color: 0xc3d9ed,
          size: 0.22,
          sizeAttenuation: true,
        }),
      ),
    );
    const planetTexture = new THREE.TextureLoader().load(
      "/assets/textures/planet-albedo.png",
    );
    planetTexture.colorSpace = THREE.SRGBColorSpace;
    planetTexture.wrapS = THREE.RepeatWrapping;
    planetTexture.repeat.set(2, 1);
    const planetMat = new THREE.MeshBasicMaterial({
      map: planetTexture,
      color: 0x8c999c,
    });
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(125, 96, 64),
      planetMat,
    );
    planet.position.set(0, -143, -64);
    planet.rotation.z = -0.35;
    this.scene.add(planet);
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(126, 64, 48),
      new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexShader: `varying vec3 n;varying vec3 v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`,
        fragmentShader: `varying vec3 n;varying vec3 v;void main(){float f=pow(1.-abs(dot(n,v)),3.);gl_FragColor=vec4(.12,.5,1.,f*.9);}`,
      }),
    );
    atmosphere.position.copy(planet.position);
    this.scene.add(atmosphere);
    const debris = new THREE.Group();
    for (let i = 0; i < 85; i++) {
      const x = (r() - 0.5) * 160,
        z = (r() - 0.5) * 150;
      const mesh = box(
        debris,
        x,
        -12 - r() * 36,
        z,
        0.5 + r() * 2,
        0.5 + r() * 3,
        0.5 + r() * 2,
        edge,
      );
      mesh.rotation.set(r() * 6, r() * 6, r() * 6);
    }
    this.scene.add(debris);
  }
  makeDrone() {
    const g = this.proceduralDrone;
    box(g, 0, 0.65, 0, 1.5, 0.65, 1.6, ivory);
    box(g, 0, 1.16, -0.35, 1.3, 0.75, 0.95, ivory);
    for (const x of [-0.85, 0.85])
      for (const z of [-0.6, 0.65]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.43, 0.43, 0.34, 16),
          rubber,
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.45, z);
        g.add(wheel);
      }
    const eye = new THREE.Mesh(
      new THREE.CylinderGeometry(0.27, 0.27, 0.12, 20),
      amber,
    );
    eye.rotation.x = Math.PI / 2;
    eye.position.set(0, 1.2, -0.88);
    g.add(eye);
    for (const x of [-0.8, 0.8]) {
      cylinder(
        g,
        new THREE.Vector3(x, 0.9, -0.3),
        new THREE.Vector3(x, 0.6, -1.4),
        0.08,
        copper,
      );
      box(g, x, 0.56, -1.5, 0.3, 0.2, 0.4, dark);
    }
    box(g, 0, 0.9, 0.7, 0.9, 0.5, 0.55, edge);
    this.drone.add(g);
    const lamp = new THREE.PointLight(0xffb85b, 2, 6);
    lamp.position.set(0, 1.4, -1);
    this.drone.add(lamp);
  }
  async loadModels() {
    const loader = new GLTFLoader();
    const normalize = (object: THREE.Object3D, size: number) => {
      const bounds = new THREE.Box3().setFromObject(object);
      const dimensions = bounds.getSize(new THREE.Vector3());
      const scale = size / Math.max(dimensions.x, dimensions.y, dimensions.z);
      object.scale.setScalar(scale);
      const after = new THREE.Box3().setFromObject(object);
      const center = after.getCenter(new THREE.Vector3());
      object.position.set(-center.x, -after.min.y, -center.z);
      object.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      return object;
    };
    await Promise.all([
      loader
        .loadAsync("/assets/models/deck.glb")
        .then((g) => {
          const object = g.scene;
          const bounds = new THREE.Box3().setFromObject(object),
            dim = bounds.getSize(new THREE.Vector3());
          object.scale.set(9.2 / dim.x, 9.2 / dim.x, 8.2 / dim.z);
          const scaled = new THREE.Box3().setFromObject(object),
            center = scaled.getCenter(new THREE.Vector3());
          object.position.set(-center.x, 0, -center.z);
          object.updateMatrixWorld(true);
          const ray = new THREE.Raycaster(
            new THREE.Vector3(0, 50, 0),
            new THREE.Vector3(0, -1, 0),
          );
          const hits = ray.intersectObject(object, true);
          object.position.y -= hits.length ? hits[0].point.y : scaled.max.y;
          object.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          object.traverse((o) => {
            if (
              o instanceof THREE.Mesh &&
              o.material instanceof THREE.MeshStandardMaterial
            ) {
              o.material.color.multiplyScalar(0.72);
            }
          });
          this.loadedDeck = object;
          this.modelStatus.deck = "Tripo GLB";
          this.replaceDecks();
        })
        .catch(() => {
          this.modelStatus.deck = "procedural fallback";
        }),
      loader
        .loadAsync("/assets/models/salvage-drone.glb")
        .then((g) => {
          this.loadedDrone = normalize(g.scene, 2.2);
          this.loadedDrone.rotation.y = Math.PI;
          this.drone.add(this.loadedDrone);
          this.proceduralDrone.visible = false;
          this.modelStatus.drone = "Tripo GLB";
        })
        .catch(() => {
          this.modelStatus.drone = "procedural fallback";
        }),
      loader
        .loadAsync("/assets/models/relay.glb")
        .then((g) => {
          this.loadedRelay = normalize(g.scene, 4.4);
          this.modelStatus.relay = "Tripo GLB";
          this.replaceRelays();
        })
        .catch(() => {
          this.modelStatus.relay = "procedural fallback";
        }),
    ]);
  }
  replaceDecks() {
    if (!this.loadedDeck) return;
    for (const shell of this.deckShells) {
      shell.clear();
      shell.add(this.loadedDeck.clone(true));
    }
  }
  replaceRelays() {
    if (!this.loadedRelay) return;
    for (const g of this.relayMeshes.values()) {
      for (const c of [...g.children]) g.remove(c);
      g.add(this.loadedRelay.clone(true));
    }
  }
  makeRelay(): THREE.Group {
    const g = new THREE.Group();
    box(g, 0, 0.2, 0, 1.4, 0.4, 1.4, dark);
    box(g, 0, 1.5, 0, 0.7, 2.5, 0.7, edge);
    for (const x of [-0.36, 0.36])
      box(g, x, 1.8, -0.38, 0.09, 1.7, 0.09, amber);
    for (const z of [-0.36, 0.36]) box(g, 0, 1.8, z, 0.25, 1.6, 0.08, amber);
    for (const y of [0.6, 2.8, 3.3]) box(g, 0, y, 0, 1.1, 0.2, 0.9, copper);
    cylinder(
      g,
      new THREE.Vector3(0, 2.5, 0),
      new THREE.Vector3(0, 4.1, 0),
      0.06,
      dark,
    );
    box(g, 0, 4.1, 0, 0.12, 0.25, 0.12, amber);
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(0.56, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.4),
      ivory,
    );
    dish.rotation.z = Math.PI / 2;
    dish.position.set(-0.5, 2.8, 0);
    g.add(dish);
    return g;
  }
  build(level: Level) {
    this.level = level;
    this.routeKey = "";
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.ownedGeometry)
        o.geometry.dispose();
    });
    for (const wire of this.wires) wire.material.dispose();
    this.levelFloorMaterial?.dispose();
    this.root.clear();
    this.deckShells = [];
    this.relayMeshes.clear();
    this.relayLights.clear();
    this.wires = [];
    this.labelLayer.innerHTML = "";
    this.labels.clear();
    const points = worldPoints(level);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x9ba9ad,
      map: this.floorTexture,
      metalness: 0.65,
      roughness: 0.7,
    });
    this.levelFloorMaterial = floorMat;
    const r = rand(31 + level.rooms.length);
    for (const room of level.rooms) {
      const p = points.get(room.id)!,
        g = new THREE.Group();
      g.position.set(p.x, 0, p.z);
      this.root.add(g);
      const shell = new THREE.Group();
      shell.userData.dynamic = true;
      g.add(shell);
      this.deckShells.push(shell);
      box(shell, 0, -0.75, 0, 9.2, 1.5, 8.2, edge);
      box(shell, 0, -1.6, 0, 8.7, 0.35, 7.8, dark);
      for (let x = -3; x <= 3; x += 2)
        for (let z = -3; z <= 3; z += 2) {
          box(shell, x, 0.02, z, 1.96, 0.12, 1.96, floorMat);
        }
      // Repeated support ribs, under-deck machinery and worn safety markings.
      for (let x = -4; x <= 4; x += 1.5) {
        box(shell, x, -1.2, 4.1, 0.22, 2.5, 0.3, copper);
        box(shell, x, -1.2, -4.1, 0.22, 2.5, 0.3, steel);
      }
      for (let z = -3.5; z <= 3.5; z += 1.5) {
        box(shell, -4.65, -0.6, z, 0.25, 1.9, 0.22, steel);
        box(shell, 4.65, -0.6, z, 0.25, 1.9, 0.22, steel);
      }
      for (let i = 0; i < 6; i++) {
        const x = (r() - 0.5) * 7,
          z = (r() - 0.5) * 6;
        box(shell, x, -2.05, z, 0.45 + r() * 0.7, 0.6 + r() * 0.8, 0.7, steel);
      }
      for (const z of [-3.86, 3.86])
        for (let x = -3.9; x < 4; x += 1.3) {
          box(shell, x, 0.12, z, 0.7, 0.04, 0.12, copper);
        }
      for (const x of [-4.25, 4.25])
        for (const z of [-3.65, 3.65]) {
          box(shell, x, 0.5, z, 0.13, 1.1, 0.13, copper);
          box(shell, x, 0.75, z, 0.22, 0.18, 0.22, amber);
        }
      // Back-edge rails are cut away near doors so the drone stays readable.
      for (const z of [-3.75, 3.75]) {
        cylinder(
          shell,
          new THREE.Vector3(-4, 0.65, z),
          new THREE.Vector3(4, 0.65, z),
          0.035,
          copper,
        );
      }
      for (const x of [-3.4, 3.4]) {
        const z = -2.7;
        box(shell, x, 0.55, z, 1, 0.95, 0.8, steel);
        box(shell, x, 0.98, z, 0.85, 0.06, 0.7, edge);
        box(shell, x + 0.28, 0.6, z - 0.41, 0.14, 0.35, 0.03, amber);
        for (let i = 0; i < 4; i++)
          box(shell, x - 0.2 + i * 0.1, 0.5, z + 0.41, 0.04, 0.4, 0.03, dark);
      }
      // Cargo crates and a small vent, kept outside the main drivable lane.
      const crate = box(shell, -3, 0.4, 2.8, 1.2, 0.8, 1, steel);
      box(shell, -3, 0.84, 2.8, 1.26, 0.08, 1.04, dark);
      for (const x of [-3.4, -2.6])
        box(shell, x, 0.45, 3.33, 0.05, 0.8, 0.04, copper);
      for (let i = 0; i < 9; i++)
        box(shell, 2.2 + i * 0.09, 0.12, 2.4, 0.035, 0.04, 1.1, dark);
      if (room.relay && room.id !== level.dock) {
        const relay = this.makeRelay();
        const equipment = relayPoint(level, room.id);
        relay.position.set(equipment.x - p.x, 0.1, equipment.z - p.z);
        relay.userData.dynamic = true;
        g.add(relay);
        this.relayMeshes.set(room.id, relay);
        const light = new THREE.PointLight(0xffaa38, 7, 7, 2);
        light.position.set(equipment.x - p.x, 1.4, equipment.z - p.z);
        g.add(light);
        this.relayLights.set(room.id, light);
        tube(
          g,
          [
            new THREE.Vector3(equipment.x - p.x, 0.18, equipment.z - p.z),
            new THREE.Vector3(0.6, 0.18, -0.6),
            new THREE.Vector3(2, 0.18, -0.5),
            new THREE.Vector3(3.9, 0.18, 0),
          ],
          0.07,
          copper,
        );
      }
      if (room.id === level.dock) {
        box(g, 0, 2, -3.45, 5, 4, 0.7, steel);
        box(g, 0, 1.6, -3.02, 2.7, 3, 0.12, dark);
        for (const x of [-1.5, 1.5])
          box(g, x, 1.7, -2.9, 0.16, 3.2, 0.1, amber);
        box(g, 0, 3.28, -2.9, 3.1, 0.14, 0.1, amber);
        box(g, 0, 0.16, 1.5, 3, 0.07, 2.1, edge);
        for (const x of [-1.45, 1.45])
          box(g, x, 0.21, 1.5, 0.08, 0.03, 2.1, white);
      }
      const label = document.createElement("div");
      label.className = "room-label";
      label.innerHTML = `<span>${room.label.toUpperCase()}</span><small>${room.id === level.dock ? "EXTRACTION" : room.relay ? `RELAY +${room.salvageValue}` : "NO RECEIVER"}</small>`;
      this.labelLayer.append(label);
      this.labels.set(room.id, label);
    }
    for (const c of level.corridors) {
      const a = points.get(c.from)!,
        b = points.get(c.to)!;
      const dx = b.x - a.x,
        dz = b.z - a.z,
        fullLength = Math.hypot(dx, dz);
      const ux = Math.abs(dx / fullLength),
        uz = Math.abs(dz / fullLength);
      const trim = Math.min(
        ux > 0.001 ? 4.55 / ux : Infinity,
        uz > 0.001 ? 4.05 / uz : Infinity,
      );
      const length = Math.max(0.3, fullLength - trim * 2);
      const g = new THREE.Group();
      g.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
      g.rotation.y = -Math.atan2(dz, dx);
      this.root.add(g);
      box(g, 0, -0.1, 0, length, 0.2, 2.8, edge);
      box(g, 0, -0.5, 0, length, 0.2, 2.6, copper);
      for (let t = -length / 2; t < length / 2; t += 0.32)
        box(g, t, 0.04, 0, 0.09, 0.1, 2.65, steel);
      for (const z of [-1.35, 1.35]) {
        box(g, 0, 0.18, z, length, 0.12, 0.12, amber);
        for (let t = -length / 2; t < length / 2; t += 2)
          box(g, t, 0.5, z, 0.06, 0.8, 0.06, edge);
        box(g, 0, 0.86, z, length, 0.055, 0.055, copper);
      }
      if (c.oneWay) {
        const arrow = new THREE.Mesh(
          new THREE.ConeGeometry(0.3, 0.65, 3),
          white,
        );
        arrow.rotation.z = -Math.PI / 2;
        arrow.position.set(0, 0.2, 0);
        g.add(arrow);
      }
    }
    for (const [a, b] of level.wires) {
      const p = points.get(a)!,
        q = points.get(b)!;
      const material = new THREE.MeshStandardMaterial({
        color: 0xe3a34a,
        emissive: 0xe38d21,
        emissiveIntensity: 1.3,
        metalness: 0.4,
        roughness: 0.4,
      });
      const mesh = tube(
        this.root,
        [
          new THREE.Vector3(p.x, 0.25, p.z + 0.86),
          new THREE.Vector3((p.x + q.x) / 2, 0.25, (p.z + q.z) / 2 + 0.86),
          new THREE.Vector3(q.x, 0.25, q.z + 0.86),
        ],
        0.065,
        material,
      );
      this.wires.push({ a, b, mesh, material });
    }
    this.replaceRelays();
    this.replaceDecks();
    this.batchStaticMeshes();
    const dock = points.get(level.dock)!;
    this.follow.set(dock.x, 0, dock.z);
    this.focusTarget.copy(this.follow);
  }
  batchStaticMeshes() {
    this.root.updateMatrixWorld(true);
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const remove: THREE.Mesh[] = [];
    const wireMeshes = new Set(this.wires.map((w) => w.mesh));
    this.root.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        wireMeshes.has(object) ||
        Array.isArray(object.material)
      )
        return;
      let parent: THREE.Object3D | null = object;
      while (parent && parent !== this.root) {
        if (parent.userData.dynamic) return;
        parent = parent.parent;
      }
      const geometries = batches.get(object.material) ?? [];
      geometries.push(object.geometry.clone().applyMatrix4(object.matrixWorld));
      batches.set(object.material, geometries);
      remove.push(object);
    });
    for (const mesh of remove) mesh.removeFromParent();
    for (const [material, geometries] of batches) {
      // Geometry families have different attributes; group by attribute signature.
      const families = new Map<string, THREE.BufferGeometry[]>();
      for (const geo of geometries) {
        const signature = Object.keys(geo.attributes).sort().join(",");
        const family = families.get(signature) ?? [];
        family.push(geo);
        families.set(signature, family);
      }
      for (const family of families.values()) {
        const merged = mergeGeometries(family, false);
        if (merged) {
          const mesh = new THREE.Mesh(merged, material);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.ownedGeometry = true;
          this.root.add(mesh);
        }
        for (const geo of family) geo.dispose();
      }
    }
  }
  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
  project(point: THREE.Vector3) {
    const v = point.clone().project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * this.width,
      y: (-0.5 * v.y + 0.5) * this.height,
      visible: v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2,
    };
  }
  pick(clientX: number, clientY: number): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        (-(clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    const hit = new THREE.Vector3();
    if (
      !ray.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
        hit,
      )
    )
      return null;
    let best: string | null = null,
      distance = 6;
    for (const [id, p] of worldPoints(this.level)) {
      const d = Math.hypot(hit.x - p.x, hit.z - p.z);
      if (d < distance) {
        best = id;
        distance = d;
      }
    }
    return best;
  }
  update(f: WorldFrame) {
    const points = worldPoints(this.level),
      signal = signalRooms(this.level, f.state);
    const phase = f.reduced ? 0 : f.time * 0.001;
    this.drone.position.set(f.drone.x, 0.12, f.drone.z);
    this.drone.rotation.y = f.heading;
    this.drone.visible = true;
    this.marker.position.set(f.drone.x, 0.25, f.drone.z);
    this.marker.visible =
      f.started && !["won", "stranded"].includes(f.state.mode);
    const routeKey = `${this.level.id}/${f.state.room}/${f.draft.join("/")}`;
    if (routeKey !== this.routeKey) {
      this.routeKey = routeKey;
      const vertices = [
        new THREE.Vector3(
          points.get(f.state.room)!.x,
          0.3,
          points.get(f.state.room)!.z,
        ),
      ];
      for (const command of f.draft)
        if (command.startsWith("move:")) {
          const p = points.get(command.slice(5))!;
          vertices.push(new THREE.Vector3(p.x, 0.3, p.z));
        }
      this.route.geometry.dispose();
      this.route.geometry = new THREE.BufferGeometry().setFromPoints(vertices);
      this.route.computeLineDistances();
    }
    this.route.visible =
      f.started &&
      f.draft.some((c) => c.startsWith("move:")) &&
      !["won", "stranded"].includes(f.state.mode);
    (this.route.material as THREE.LineDashedMaterial).color.set(
      f.routeSafe ? 0x94e8df : 0xffb63f,
    );
    if (this.loadedDrone)
      this.loadedDrone.position.y = Math.sin(phase * 5) * 0.012;
    const center = new THREE.Vector3();
    for (const p of points.values()) center.add(new THREE.Vector3(p.x, 0, p.z));
    center.divideScalar(points.size);
    const target =
      f.overview || !f.started
        ? center
        : new THREE.Vector3(f.drone.x, 0, f.drone.z);
    this.follow.lerp(target, f.reduced ? 1 : 1 - Math.exp(-f.dt * 0.006));
    const xs = [...points.values()].map((p) => p.x),
      zs = [...points.values()].map((p) => p.z);
    const span = Math.max(
      Math.max(...xs) - Math.min(...xs),
      Math.max(...zs) - Math.min(...zs),
    );
    const distance =
      (f.overview || !f.started ? Math.max(30, span * 1.25) : 23) *
      this.zoom *
      (this.camera.aspect < 1 ? 1.45 : 1);
    this.camera.position.set(
      this.follow.x + Math.sin(this.yaw) * distance,
      this.follow.y + distance * 0.92,
      this.follow.z + Math.cos(this.yaw) * distance,
    );
    this.camera.lookAt(this.follow.x, 0, this.follow.z);
    this.camera.updateMatrixWorld();
    this.keyLight.position.set(f.drone.x - 18, 36, f.drone.z + 14);
    this.keyLight.target.position.set(f.drone.x, 0, f.drone.z);
    const objective = document.getElementById("objective");
    const objectiveRect =
      objective && !objective.hidden ? objective.getBoundingClientRect() : null;
    for (const room of this.level.rooms) {
      const relay = this.relayMeshes.get(room.id),
        intact = f.state.liveRelays.includes(room.id),
        live = signal.includes(room.id);
      if (relay) {
        relay.scale.y = intact ? 1 : 0.13;
        relay.rotation.z = intact ? 0 : 0.12;
        const light = this.relayLights.get(room.id)!;
        light.intensity = live ? 7 : 0;
        relay.traverse((o) => {
          if (
            o instanceof THREE.Mesh &&
            o.material instanceof THREE.MeshStandardMaterial &&
            o.material === amber
          )
            o.visible = intact;
        });
      }
      const p =
          room.relay && room.id !== this.level.dock
            ? relayPoint(this.level, room.id)
            : points.get(room.id)!,
        screen = this.project(
          new THREE.Vector3(
            p.x,
            room.relay ? 5 : 1,
            p.z + (room.id === this.level.dock ? -2.5 : 0),
          ),
        );
      const label = this.labels.get(room.id)!;
      label.style.transform = `translate(${screen.x}px,${screen.y}px) translate(-50%,-100%)`;
      const coveredByHud =
        screen.y < 135 && (screen.x < 350 || screen.x > this.width - 230);
      const coveredByObjective =
        objectiveRect &&
        screen.x + 70 > objectiveRect.left &&
        screen.x - 70 < objectiveRect.right &&
        screen.y > objectiveRect.top &&
        screen.y - 40 < objectiveRect.bottom;
      label.hidden =
        !screen.visible || !f.started || coveredByHud || !!coveredByObjective;
      label.classList.toggle("cut", !intact && room.relay);
      label.classList.toggle("current", room.id === f.state.room);
      const steps = f.draft.flatMap((c, i) =>
        c === `move:${room.id}` ? [i + 1] : [],
      );
      label.classList.toggle("route-stop", steps.length > 0);
      label.querySelector("small")!.textContent = steps.length
        ? `STOP ${steps.join(" / ")} · ${live ? "SIGNAL" : "OFFLINE"}`
        : room.id === this.level.dock
          ? "EXTRACT HERE"
          : !intact && room.relay
            ? "SALVAGED · FLOOR OPEN"
            : room.relay
              ? `${live ? "LIVE" : "OFFLINE"} · +${room.salvageValue}`
              : "DARK CROSSING";
    }
    for (const wire of this.wires) {
      const live =
        signal.includes(wire.a) &&
        signal.includes(wire.b) &&
        f.state.liveRelays.includes(wire.a) &&
        f.state.liveRelays.includes(wire.b);
      wire.material.emissiveIntensity = live ? 0.3 : 0;
      wire.material.color.set(live ? 0xd58c31 : 0x302a24);
    }
    const cut = Math.max(f.cut, f.extract);
    this.particles.visible = cut > 0 && !f.reduced;
    if (this.particles.visible) {
      const p =
        f.extract > 0
          ? points.get(f.state.room)!
          : relayPoint(this.level, f.state.room);
      for (let i = 0; i < 150; i++) {
        const angle = i * 2.399;
        const t = (f.time * 0.003 + i * 0.073) % 1;
        this.particlePositions[i * 3] = p.x + Math.cos(angle) * t * 2.2;
        this.particlePositions[i * 3 + 1] = 0.6 + t * 2.2 - t * t * 2.6;
        this.particlePositions[i * 3 + 2] = p.z + Math.sin(angle) * t * 1.7;
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
