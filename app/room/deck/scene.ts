import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { AGENT_IDS, type AgentId } from "../room-types";
import { buildCrt, SCREEN_Y, type Crt } from "./crt";
import { AGENT_COLORS, MAX_MINIS, type DeckPulse, type DeckView } from "./deck-view";
import { arcPoints, easeInOut, pulseProgress, type Vec3 } from "./pulses";

export type PlatePosition = { id: AgentId; x: number; y: number; visible: boolean };
export type Deck = {
  update(view: DeckView, pulses: DeckPulse[]): void;
  select(id: AgentId | null): void;
  onSelect(cb: (id: AgentId) => void): void;
  onFrame(cb: (plates: PlatePosition[]) => void): void;
  dispose(): void;
};
type Prop = { file: string; position: Vec3; rotationY?: number; scale?: number };

const SEATS: Record<AgentId, Vec3> = { codex: [-2.3, 0, 0.5], claude: [0, 0, -1.3], agy: [2.3, 0, 0.5] };
const MAX_PULSES = 8;
const TILT = (3 * Math.PI) / 180;

const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export function createDeck(canvas: HTMLCanvasElement, { tilt = true, onLost }: { tilt?: boolean; onLost?: () => void } = {}): Deck {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#1a120c");
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  const target = new THREE.Vector3(0, 0.7, 0);
  const baseSpherical = new THREE.Spherical().setFromVector3(new THREE.Vector3(5.5, 6.2, 8.2).sub(target));
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(item: T) => { disposables.push(item); return item; };
  const plane = (w: number, h: number, color: string) =>
    new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), keep(new THREE.MeshStandardMaterial({ color, roughness: 0.9 })));

  // Room
  const floor = plane(10, 8, "#6b4a32");
  floor.rotation.x = -Math.PI / 2;
  const back = plane(10, 4, "#e9d7b5");
  back.position.set(0, 2, -3.5);
  const left = plane(8, 4, "#dcc7a1");
  left.rotation.y = Math.PI / 2;
  left.position.set(-5, 2, 0.5);
  const rug = new THREE.Mesh(keep(new THREE.CircleGeometry(2.3, 48)), keep(new THREE.MeshStandardMaterial({ color: "#8a3b2e", roughness: 1 })));
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.01;
  scene.add(floor, back, left, rug);
  scene.add(new THREE.AmbientLight("#fff1dc", 0.85));
  const sun = new THREE.DirectionalLight("#ffffff", 1.3);
  sun.position.set(-4, 8, 6);
  const lamp = new THREE.PointLight("#ffb46a", 1.2, 9);
  lamp.position.set(-3.5, 2.6, -2.5);
  scene.add(sun, lamp);

  // Agents
  const crts = {} as Record<AgentId, Crt>;
  const rings = {} as Record<AgentId, THREE.Mesh>;
  for (const id of AGENT_IDS) {
    const crt = buildCrt(AGENT_COLORS[id]);
    crt.group.position.set(...SEATS[id]);
    crt.group.lookAt(0, 0, 6);
    crt.group.traverse(object => { object.userData.agentId = id; });
    scene.add(crt.group);
    crts[id] = crt;
    const ring = new THREE.Mesh(keep(new THREE.RingGeometry(1.1, 1.16, 48)),
      keep(new THREE.MeshBasicMaterial({ color: AGENT_COLORS[id], transparent: true, opacity: 0.7, side: THREE.DoubleSide })));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(SEATS[id][0], 0.02, SEATS[id][2]);
    ring.visible = false;
    scene.add(ring);
    rings[id] = ring;
  }
  const selection = new THREE.Mesh(keep(new THREE.RingGeometry(0.95, 1.05, 48)),
    keep(new THREE.MeshBasicMaterial({ color: "#ffd27a", side: THREE.DoubleSide })));
  selection.rotation.x = -Math.PI / 2;
  selection.visible = false;
  scene.add(selection);

  // Live state
  let view: DeckView | null = null;
  let sessionId: string | null | undefined; // undefined = no update yet
  let spawnedSeq = 0;
  const minis = new Map<string, { crt: Crt; agent: AgentId; leftAt: number | null }>();
  const pulses: { mesh: THREE.Mesh; points: Vec3[]; start: number; owner: boolean }[] = [];
  const pulseGeometry = keep(new THREE.SphereGeometry(0.07, 12, 12));
  let delegationLine: THREE.Line | null = null;
  let delegationKey = "";
  let selectCb: ((id: AgentId) => void) | null = null;
  let frameCb: ((plates: PlatePosition[]) => void) | null = null;
  let yaw = 0, pitch = 0, targetYaw = 0, targetPitch = 0;
  let disposed = false;

  const miniSpot = (agent: AgentId, index: number): Vec3 => add3(SEATS[agent], [1.15, 0, 0.6 - index * 0.5]);
  const screenPoint = (agent: AgentId): Vec3 => add3(SEATS[agent], [0, SCREEN_Y, 0]);

  function removePulse(index: number) {
    const [pulse] = pulses.splice(index, 1);
    scene.remove(pulse.mesh);
    (pulse.mesh.material as THREE.Material).dispose();
  }
  function spawnPulse(from: Vec3, to: Vec3, color: string, owner: boolean) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true });
    const mesh = new THREE.Mesh(pulseGeometry, material);
    scene.add(mesh);
    pulses.push({ mesh, points: arcPoints(from, to, owner ? 0.3 : 1.0), start: performance.now(), owner });
    while (pulses.length > MAX_PULSES) removePulse(0);
  }

  function syncMinis(next: DeckView) {
    const wanted = new Set<string>();
    for (const agent of next.agents) {
      const running = agent.subagents.filter(s => s.status === "running").slice(0, MAX_MINIS);
      const shown = [...running, ...agent.subagents.filter(s => s.status !== "running")].slice(0, MAX_MINIS);
      shown.forEach((sub, index) => {
        const key = `${agent.id}:${sub.id}`;
        wanted.add(key);
        let mini = minis.get(key);
        if (!mini) {
          const crt = buildCrt(agent.color, { scale: 0.38, withDesk: false });
          crt.group.lookAt(0, 0, 6);
          scene.add(crt.group);
          mini = { crt, agent: agent.id, leftAt: null };
          minis.set(key, mini);
        }
        mini.crt.group.position.set(...miniSpot(agent.id, index));
        const done = sub.status !== "running";
        mini.crt.setScreen({ name: agent.name, color: agent.color, state: "busy", activity: null, roles: [], mini: true, label: sub.label, done });
        if (done && mini.leftAt === null) mini.leftAt = performance.now();
      });
    }
    for (const [key, mini] of minis) if (!wanted.has(key) && mini.leftAt === null) mini.leftAt = performance.now();
  }

  function syncDelegation(next: DeckView) {
    const key = next.delegation ? `${next.delegation.from}>${next.delegation.to}` : "";
    if (key === delegationKey) return;
    delegationKey = key;
    if (delegationLine) {
      scene.remove(delegationLine);
      delegationLine.geometry.dispose();
      (delegationLine.material as THREE.Material).dispose();
      delegationLine = null;
    }
    if (!next.delegation) return;
    const points = arcPoints(screenPoint(next.delegation.from), screenPoint(next.delegation.to), 0.9, 32).map(p => new THREE.Vector3(...p));
    delegationLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineDashedMaterial({ color: AGENT_COLORS[next.delegation.from], dashSize: 0.12, gapSize: 0.08 }));
    delegationLine.computeLineDistances();
    scene.add(delegationLine);
  }

  // Interaction
  const raycaster = new THREE.Raycaster();
  const onPointerDown = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(AGENT_IDS.map(id => crts[id].group), true)[0];
    const id = hit?.object.userData.agentId as AgentId | undefined;
    if (id) selectCb?.(id);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!tilt) return;
    const rect = canvas.getBoundingClientRect();
    targetYaw = (((event.clientX - rect.left) / rect.width) * 2 - 1) * TILT;
    targetPitch = (((event.clientY - rect.top) / rect.height) * 2 - 1) * TILT;
  };
  const onLostContext = (event: Event) => { event.preventDefault(); onLost?.(); };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("webglcontextlost", onLostContext);

  const resize = () => {
    const parent = canvas.parentElement;
    if (!parent) return;
    const { clientWidth: w, clientHeight: h } = parent;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  if (canvas.parentElement) observer.observe(canvas.parentElement);
  resize();

  // Loop: full rate while something moves, about 30 fps otherwise; rAF pauses in hidden tabs.
  let raf = 0;
  let lastRender = 0;
  const projected = new THREE.Vector3();
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const busy = view?.agents.some(a => a.state === "busy") ?? false;
    const moving = pulses.length > 0 || [...minis.values()].some(m => m.leftAt !== null) || busy
      || Math.abs(yaw - targetYaw) > 1e-4 || Math.abs(pitch - targetPitch) > 1e-4;
    if (!moving && now - lastRender < 33) return;
    lastRender = now;
    yaw += (targetYaw - yaw) * 0.08;
    pitch += (targetPitch - pitch) * 0.08;
    const spherical = baseSpherical.clone();
    spherical.theta += yaw;
    spherical.phi = Math.min(Math.PI / 2.2, Math.max(0.3, spherical.phi + pitch));
    camera.position.setFromSpherical(spherical).add(target);
    camera.lookAt(target);
    for (const agent of view?.agents ?? []) {
      crts[agent.id].setGlow(agent.state === "busy" ? 0.55 + 0.45 * Math.sin(now / 320) : 0);
      rings[agent.id].visible = agent.waiting;
      rings[agent.id].rotation.z = now / 1500;
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const pulse = pulses[i];
      const t = pulseProgress(pulse.start, now);
      const index = Math.min(pulse.points.length - 1, Math.floor(easeInOut(t) * (pulse.points.length - 1)));
      pulse.mesh.position.set(...pulse.points[index]);
      (pulse.mesh.material as THREE.MeshBasicMaterial).opacity = pulse.owner ? 1 - t : t > 0.85 ? (1 - t) / 0.15 : 1;
      if (t >= 1) removePulse(i);
    }
    for (const [key, mini] of minis) {
      if (mini.leftAt === null) continue;
      const t = pulseProgress(mini.leftAt, now, 1600);
      mini.crt.group.scale.setScalar(0.38 * (1 - Math.max(0, t - 0.6) / 0.4));
      if (t >= 1) {
        scene.remove(mini.crt.group);
        mini.crt.dispose();
        minis.delete(key);
      }
    }
    renderer.render(scene, camera);
    if (frameCb) {
      const { clientWidth: w, clientHeight: h } = canvas;
      frameCb(AGENT_IDS.map(id => {
        projected.set(...add3(SEATS[id], [0, 2.05, 0])).project(camera);
        return { id, x: ((projected.x + 1) / 2) * w, y: ((1 - projected.y) / 2) * h, visible: projected.z < 1 };
      }));
    }
  };
  raf = requestAnimationFrame(loop);

  // Optional CC0 props from public/models/room/props.json (Task 8); the room is complete without them.
  void (async () => {
    try {
      const response = await fetch("/models/room/props.json", { cache: "no-store" });
      if (!response.ok) return;
      const props = (await response.json()) as Prop[];
      const loader = new GLTFLoader();
      for (const prop of props) {
        const gltf = await loader.loadAsync(`/models/room/${prop.file}`);
        if (disposed) return;
        gltf.scene.position.set(...prop.position);
        gltf.scene.rotation.y = prop.rotationY ?? 0;
        gltf.scene.scale.setScalar(prop.scale ?? 1);
        gltf.scene.traverse(object => {
          if (object instanceof THREE.Mesh) {
            keep(object.geometry);
            (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => keep(m));
          }
        });
        scene.add(gltf.scene);
      }
    } catch {
      // Props are decoration only.
    }
  })();

  return {
    update(next, fresh) {
      // A fresh deck (remount) or a different session seeds the cursor: pulses already handed over never replay.
      if (next.sessionId !== sessionId) {
        sessionId = next.sessionId;
        spawnedSeq = Math.max(0, ...fresh.map(p => p.seq));
      }
      view = next;
      for (const agent of next.agents) {
        crts[agent.id].setScreen({ name: agent.name, color: agent.color, state: agent.state, activity: agent.activity, roles: agent.roles });
      }
      syncMinis(next);
      syncDelegation(next);
      for (const pulse of fresh) {
        if (pulse.seq <= spawnedSeq) continue;
        spawnedSeq = pulse.seq;
        const from = screenPoint(pulse.from);
        const color = AGENT_COLORS[pulse.from];
        if (pulse.kind === "subagent") {
          spawnPulse(from, add3(miniSpot(pulse.from, 0), [0, 0.3, 0]), color, false);
        } else if (pulse.to === "owner") {
          spawnPulse(from, add3(from, [0.6, 2.4, 1.2]), color, true);
        } else {
          for (const to of pulse.to) if (to !== pulse.from) spawnPulse(from, screenPoint(to), color, false);
        }
      }
    },
    select(id) {
      selection.visible = id !== null;
      if (id) selection.position.set(SEATS[id][0], 0.015, SEATS[id][2]);
    },
    onSelect(cb) { selectCb = cb; },
    onFrame(cb) { frameCb = cb; },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("webglcontextlost", onLostContext);
      while (pulses.length) removePulse(0);
      for (const mini of minis.values()) mini.crt.dispose();
      minis.clear();
      AGENT_IDS.forEach(id => crts[id].dispose());
      if (delegationLine) {
        delegationLine.geometry.dispose();
        (delegationLine.material as THREE.Material).dispose();
      }
      disposables.forEach(item => item.dispose());
      renderer.dispose();
    },
  };
}
