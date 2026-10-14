import * as THREE from "three";

type Keep = <T extends { dispose(): void }>(item: T) => T;

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Warm wooden planks with darker seams.
function planks(ctx: CanvasRenderingContext2D) {
  const tones = ["#6b4a32", "#71503a", "#664630", "#6f4d35"];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 3; col++) {
      ctx.fillStyle = tones[(row * 3 + col * 2) % tones.length];
      const offset = row % 2 ? 85 : 0;
      ctx.fillRect(col * 170 - offset, row * 64, 170, 64);
      ctx.fillRect(col * 170 - offset + 510, row * 64, 170, 64);
    }
    ctx.fillStyle = "#3e2a1c";
    ctx.fillRect(0, row * 64, 512, 2);
  }
}

// A night city: gradient sky, a few stars, building silhouettes with lit windows. Deterministic.
function nightCity(ctx: CanvasRenderingContext2D) {
  const sky = ctx.createLinearGradient(0, 0, 0, 320);
  sky.addColorStop(0, "#0b1430");
  sky.addColorStop(1, "#3a2a55");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 320);
  let seed = 11;
  const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  ctx.fillStyle = "#f3e6cf";
  for (let i = 0; i < 40; i++) ctx.fillRect(rand() * 512, rand() * 150, 2, 2);
  let x = 0;
  while (x < 512) {
    const w = 40 + rand() * 50;
    const h = 90 + rand() * 170;
    ctx.fillStyle = "#141024";
    ctx.fillRect(x, 320 - h, w - 4, h);
    for (let wy = 320 - h + 10; wy < 310; wy += 16) {
      for (let wx = x + 6; wx < x + w - 12; wx += 12) {
        if (rand() > 0.55) {
          ctx.fillStyle = rand() > 0.3 ? "#ffd27a" : "#9fd3ff";
          ctx.fillRect(wx, wy, 5, 7);
        }
      }
    }
    x += w;
  }
}

// The static room: planked floor, walls with wainscot, window, framed poster, centre table and lights.
export function buildRoom(scene: THREE.Scene, keep: Keep): void {
  const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => keep(new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra }));
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, shadow = false) => {
    const m = new THREE.Mesh(keep(geometry), material);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  const floorTexture = keep(canvasTexture(512, 512, planks));
  floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
  floorTexture.repeat.set(3, 3);
  const floor = mesh(new THREE.PlaneGeometry(10, 8), mat("#ffffff", { map: floorTexture }), 0, 0, 0.5);
  floor.rotation.x = -Math.PI / 2;

  const wall = mat("#e9d7b5");
  const sideWall = mat("#dcc7a1");
  const wainscot = mat("#8a5d3b");
  const back = mesh(new THREE.PlaneGeometry(10, 4), wall, 0, 2, -3.5);
  back.receiveShadow = true;
  const left = mesh(new THREE.PlaneGeometry(8, 4), sideWall, -5, 2, 0.5);
  left.rotation.y = Math.PI / 2;
  mesh(new THREE.BoxGeometry(10, 1.0, 0.05), wainscot, 0, 0.5, -3.47);
  const leftWainscot = mesh(new THREE.BoxGeometry(8, 1.0, 0.05), wainscot, -4.97, 0.5, 0.5);
  leftWainscot.rotation.y = Math.PI / 2;
  mesh(new THREE.BoxGeometry(10, 0.06, 0.08), mat("#5a3b25"), 0, 1.02, -3.45);

  const rug = mesh(new THREE.CircleGeometry(2.4, 48), mat("#8a3b2e", { roughness: 1 }), 0, 0.01, 0.4);
  rug.rotation.x = -Math.PI / 2;
  const rugBorder = mesh(new THREE.RingGeometry(2.2, 2.32, 48), mat("#d9a441", { roughness: 1 }), 0, 0.012, 0.4);
  rugBorder.rotation.x = -Math.PI / 2;

  // Window with a night city, framed in wood, letting in a faint blue light.
  const frame = mat("#6b4527");
  mesh(new THREE.PlaneGeometry(1.6, 1.0), keep(new THREE.MeshBasicMaterial({ map: keep(canvasTexture(512, 320, nightCity)) })), 0.95, 2.35, -3.48);
  for (const [w, h, x, y] of [[1.76, 0.08, 0.95, 2.89], [1.76, 0.08, 0.95, 1.81], [0.08, 1.16, 0.11, 2.35], [0.08, 1.16, 1.79, 2.35], [0.05, 1.0, 0.95, 2.35]]) {
    mesh(new THREE.BoxGeometry(w, h, 0.06), frame, x, y, -3.45);
  }
  const moonlight = new THREE.PointLight("#7f9cff", 0.6, 6);
  moonlight.position.set(0.95, 2.3, -2.8);
  scene.add(moonlight);

  // The Hub's staircase poster in a wooden frame.
  const posterTexture = keep(new THREE.TextureLoader().load("/ascend-hub-staircase.webp"));
  posterTexture.colorSpace = THREE.SRGBColorSpace;
  mesh(new THREE.BoxGeometry(1.16, 1.16, 0.04), frame, -1.55, 2.35, -3.47);
  mesh(new THREE.PlaneGeometry(1.04, 1.04), keep(new THREE.MeshStandardMaterial({ map: posterTexture, roughness: 0.6 })), -1.55, 2.35, -3.44);

  // Small round table in the middle of the desk arc.
  const tableWood = mat("#6e4930", { roughness: 0.7 });
  mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 32), tableWood, 0, 0.5, 0.9, true);
  mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 12), tableWood, 0, 0.25, 0.9, true);

  // Lamp bulb glow beside the floor lamp prop (Task 8 props sit at x -4.4).
  mesh(new THREE.SphereGeometry(0.11, 16, 16), keep(new THREE.MeshBasicMaterial({ color: "#ffd9a0" })), -4.33, 1.8, -2.68);
  const lamp = new THREE.PointLight("#ffb46a", 1.6, 7);
  lamp.position.set(-4.2, 1.8, -2.5);
  scene.add(lamp);

  scene.add(new THREE.AmbientLight("#fff1dc", 0.65));
  const sun = new THREE.DirectionalLight("#fff3e0", 1.25);
  sun.position.set(-4, 8, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 30 });
  sun.shadow.bias = -0.0005;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);
}
