import * as THREE from "three";
import { paintScreen, screenKey, type ScreenState } from "./screen";

// setLive shows an app screenshot instead of the agent's face until it is set back to null.
export type Crt = { group: THREE.Group; setScreen(state: ScreenState): void; setLive(image: HTMLImageElement | null): void; setGlow(level: number): void; dispose(): void };

const SCREEN = { w: 512, h: 384 };
export const SCREEN_Y = 1.22;

// A soft radial glow in the agent colour, drawn once per CRT.
function haloTexture(color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A low-poly retro CRT (optionally on a desk) whose screen is a live canvas texture.
export function buildCrt(color: string, { scale = 1, withDesk = true } = {}): Crt {
  const group = new THREE.Group();
  const accent = new THREE.Color(color);
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, shadow = true) => {
    geometries.push(geometry);
    if (!materials.includes(material)) materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    group.add(mesh);
  };
  if (withDesk) {
    const wood = new THREE.MeshStandardMaterial({ color: "#7a5236", roughness: 0.8 });
    add(new THREE.BoxGeometry(1.8, 0.08, 1.1), wood, 0, 0.72, 0);
    for (const [x, z] of [[-0.8, -0.47], [0.8, -0.47], [-0.8, 0.47], [0.8, 0.47]]) add(new THREE.BoxGeometry(0.07, 0.72, 0.07), wood, x, 0.36, z);
  }
  const top = withDesk ? 0.76 : 0;
  add(new THREE.BoxGeometry(1.08, 0.88, 0.86), new THREE.MeshStandardMaterial({ color: "#dccba8", roughness: 0.55 }), 0, top + 0.44, -0.04);
  const bezel = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.15, roughness: 0.45 });
  add(new THREE.BoxGeometry(0.98, 0.78, 0.06), bezel, 0, top + 0.46, 0.4);

  const canvas = document.createElement("canvas");
  canvas.width = SCREEN.w;
  canvas.height = SCREEN.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const screenGeometry = new THREE.PlaneGeometry(0.82, 0.62, 8, 6);
  const position = screenGeometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) / 0.41;
    const y = position.getY(i) / 0.31;
    position.setZ(i, 0.03 * (1 - 0.5 * x * x - 0.5 * y * y)); // a gentle CRT bulge
  }
  position.needsUpdate = true;
  add(screenGeometry, new THREE.MeshBasicMaterial({ map: texture }), 0, top + 0.46, 0.435, false);

  // Halo around the bezel while busy; additive so it reads as light, not paint.
  const halo = new THREE.MeshBasicMaterial({ map: haloTexture(color), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  add(new THREE.PlaneGeometry(1.7, 1.4), halo, 0, top + 0.46, 0.425, false);

  const light = new THREE.PointLight(accent, 0, 2.6);
  light.position.set(0, top + 0.5, 0.9);
  group.add(light);
  group.scale.setScalar(scale);

  let key = "";
  let live: HTMLImageElement | null = null;
  return {
    group,
    setScreen(state) {
      if (live) return;
      const next = screenKey(state);
      if (next === key) return;
      key = next;
      paintScreen(ctx, SCREEN.w, SCREEN.h, state);
      texture.needsUpdate = true;
    },
    setLive(image) {
      if (image === live) return;
      live = image;
      key = "";
      if (!image) return;
      // Cover the tube with the screenshot, then the CRT's scanlines and a LIVE tag on top.
      const scale = Math.max(SCREEN.w / image.naturalWidth, SCREEN.h / image.naturalHeight);
      const w = image.naturalWidth * scale;
      const h = image.naturalHeight * scale;
      ctx.globalAlpha = 1;
      ctx.drawImage(image, (SCREEN.w - w) / 2, 0, w, h);
      ctx.fillStyle = "#000000";
      ctx.globalAlpha = 0.12;
      for (let y = 0; y < SCREEN.h; y += 3) ctx.fillRect(0, y, SCREEN.w, 1);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#e5484d";
      ctx.fillRect(12, 12, 74, 30);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 22px monospace";
      ctx.textAlign = "left";
      ctx.fillText("LIVE", 22, 35);
      texture.needsUpdate = true;
    },
    setGlow(level) {
      light.intensity = level * 2.2;
      bezel.emissiveIntensity = 0.15 + level * 0.6;
      halo.opacity = level * 0.55;
    },
    dispose() {
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      halo.map?.dispose();
      texture.dispose();
    },
  };
}
