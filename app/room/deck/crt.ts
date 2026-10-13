import * as THREE from "three";
import { paintScreen, screenKey, type ScreenState } from "./screen";

export type Crt = { group: THREE.Group; setScreen(state: ScreenState): void; setGlow(level: number): void; dispose(): void };

const SCREEN = { w: 256, h: 192 };
export const SCREEN_Y = 1.19;

// A low-poly retro CRT (optionally on a desk) whose screen is a live canvas texture.
export function buildCrt(color: string, { scale = 1, withDesk = true } = {}): Crt {
  const group = new THREE.Group();
  const accent = new THREE.Color(color);
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    geometries.push(geometry);
    if (!materials.includes(material)) materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
  };
  if (withDesk) {
    const wood = new THREE.MeshStandardMaterial({ color: "#7a5236", roughness: 0.85 });
    add(new THREE.BoxGeometry(1.7, 0.08, 1.05), wood, 0, 0.72, 0);
    for (const [x, z] of [[-0.75, -0.45], [0.75, -0.45], [-0.75, 0.45], [0.75, 0.45]]) add(new THREE.BoxGeometry(0.07, 0.72, 0.07), wood, x, 0.36, z);
  }
  const top = withDesk ? 0.76 : 0;
  add(new THREE.BoxGeometry(1.0, 0.82, 0.86), new THREE.MeshStandardMaterial({ color: "#d9c8a6", roughness: 0.6 }), 0, top + 0.41, -0.04);
  const bezel = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.15, roughness: 0.5 });
  add(new THREE.BoxGeometry(0.9, 0.72, 0.06), bezel, 0, top + 0.43, 0.4);

  const canvas = document.createElement("canvas");
  canvas.width = SCREEN.w;
  canvas.height = SCREEN.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const screenGeometry = new THREE.PlaneGeometry(0.74, 0.56, 8, 6);
  const position = screenGeometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) / 0.37;
    const y = position.getY(i) / 0.28;
    position.setZ(i, 0.03 * (1 - 0.5 * x * x - 0.5 * y * y)); // a gentle CRT bulge
  }
  position.needsUpdate = true;
  add(screenGeometry, new THREE.MeshBasicMaterial({ map: texture }), 0, top + 0.43, 0.435);

  const light = new THREE.PointLight(accent, 0, 2.6);
  light.position.set(0, top + 0.5, 0.9);
  group.add(light);
  group.scale.setScalar(scale);

  let key = "";
  return {
    group,
    setScreen(state) {
      const next = screenKey(state);
      if (next === key) return;
      key = next;
      paintScreen(ctx, SCREEN.w, SCREEN.h, state);
      texture.needsUpdate = true;
    },
    setGlow(level) {
      light.intensity = level * 2.2;
      bezel.emissiveIntensity = 0.15 + level * 0.6;
    },
    dispose() {
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      texture.dispose();
    },
  };
}
