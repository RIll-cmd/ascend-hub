// The room's mode props and lights: idle ready room, coding workshop, debate panel (see room-scene.ts for the mode).
import * as THREE from "three";
import type { AgentId } from "../room-types";
import type { RoomScene, Spot } from "./room-scene";

const CAMERA_AIM = new THREE.Vector3(1.1, 1.4, 7.2);
// Turn an object to face the camera, upright (its own height kept).
export const faceCamera = (object: THREE.Object3D) => object.lookAt(CAMERA_AIM.clone().setY(object.position.y));

function canvasPlane(w: number, h: number, pxW: number, pxH: number) {
  const canvas = document.createElement("canvas");
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
  return { mesh, ctx, texture, canvas };
}

// Mode props: everything here is shown or hidden as the room changes.
export function buildModeProps(scene: THREE.Scene) {
  const group = new THREE.Group();
  scene.add(group);
  const wood = new THREE.MeshStandardMaterial({ color: "#7a5236", roughness: 0.8 });

  // Individual desks (idle, debate) and the L bench (coding).
  const benchLong = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.08, 1.1), wood);
  benchLong.position.set(-1.2, 0.72, -1.55);
  const benchReturn = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 2.6), wood);
  benchReturn.position.set(1.75, 0.72, 0.05);
  for (const m of [benchLong, benchReturn]) { m.castShadow = m.receiveShadow = true; group.add(m); }
  const benchLegs = new THREE.Group();
  for (const [x, z] of [[-3.0, -2.05], [0.6, -2.05], [-3.0, -1.05], [1.25, -1.05], [2.25, -1.2], [2.25, 1.3], [1.25, 1.3]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.72, 0.07), wood);
    leg.position.set(x, 0.36, z);
    benchLegs.add(leg);
  }
  group.add(benchLegs);

  // Idle: the task station, a typewriter on the centre table with a sheet rolled in, lit by its own lamp.
  const terminal = new THREE.Group();
  const enamel = new THREE.MeshStandardMaterial({ color: "#3a6b54", roughness: 0.4, metalness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: "#232323", roughness: 0.5 });
  const keyCap = new THREE.MeshStandardMaterial({ color: "#efe6d2", roughness: 0.4 });
  // Body: a low front wedge (the keys) rising to a taller back (the carriage).
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.34), enamel);
  front.position.set(0, 0.05, 0.12);
  front.rotation.x = 0.18;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.2, 0.26), enamel);
  back.position.set(0, 0.11, -0.16);
  const platen = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.82, 20), dark);
  platen.rotation.z = Math.PI / 2;
  platen.position.set(0, 0.25, -0.18);
  const knobL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), dark);
  knobL.rotation.z = Math.PI / 2; knobL.position.set(-0.44, 0.25, -0.18);
  const knobR = knobL.clone(); knobR.position.x = 0.44;
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.02), dark);
  lever.position.set(-0.5, 0.3, -0.12); lever.rotation.z = 0.5;
  terminal.add(front, back, platen, knobL, knobR, lever);
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 9 - row; k++) {
      const key = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 12), keyCap);
      key.position.set(-0.27 + row * 0.03 + k * 0.066, 0.115 + row * 0.022, 0.24 - row * 0.07);
      key.rotation.x = 0.18;
      terminal.add(key);
    }
  }
  // The sheet, rolled into the platen and leaning back, readable from the camera.
  const brief = canvasPlane(0.6, 0.5, 372, 312);
  (brief.mesh as THREE.Mesh).material = new THREE.MeshStandardMaterial({ map: brief.texture, roughness: 0.95, side: THREE.DoubleSide });
  // Pivot at the sheet's foot, which sits just behind the roller, so the sheet leans back out of it.
  const sheet = new THREE.Group();
  sheet.position.set(0, 0.22, -0.23);
  sheet.rotation.x = -0.32;
  brief.mesh.position.set(0, 0.25, 0);
  sheet.add(brief.mesh);
  // The paper table behind the sheet, and the bail bar across its front.
  const rest = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.36, 0.015), dark);
  rest.position.set(0, 0.17, -0.02);
  sheet.add(rest);
  const bail = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.66, 8), new THREE.MeshStandardMaterial({ color: "#b8b8b8", metalness: 0.6, roughness: 0.3 }));
  bail.rotation.z = Math.PI / 2;
  bail.position.set(0, 0.32, -0.12);
  terminal.add(sheet, bail);
  terminal.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
  terminal.position.set(0, 0.525, 0.8);
  terminal.scale.setScalar(1.35);
  group.add(terminal);
  const stationLight = new THREE.PointLight("#ffcf8a", 0, 3.2);
  stationLight.position.set(0.5, 1.6, 1.4);
  group.add(stationLight);
  const cartridge = new THREE.Group();
  const paper = new THREE.MeshStandardMaterial({ color: "#f6efe0", roughness: 0.9 });
  for (let i = 0; i < 3; i++) {
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.38), paper);
    sheet.position.set(i * 0.012, 0.006 + i * 0.013, i * -0.01);
    sheet.rotation.y = (i - 1) * 0.06;
    cartridge.add(sheet);
  }
  const topPage = canvasPlane(0.48, 0.36, 300, 225);
  topPage.mesh.rotation.x = -Math.PI / 2;
  topPage.mesh.position.set(0.024, 0.047, -0.02);
  cartridge.add(topPage.mesh);
  cartridge.position.set(0.74, 0.528, 1.0);
  cartridge.rotation.y = 0.35;
  group.add(cartridge);

  // Wall board in place of the poster: "Up next" (idle), the debate phase, or the shared screen (coding).
  const board = canvasPlane(1, 1, 768, 512);
  group.add(board.mesh);
  const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.26, 0.05), new THREE.MeshStandardMaterial({ color: "#6b4527", roughness: 0.85 }));
  boardFrame.position.set(-1.45, 2.35, -3.455);
  boardFrame.castShadow = true;
  group.add(boardFrame);
  const poster = scene.children.filter(o => o.name === "poster");
  // Coding: a warm work lamp over the bench, so the workshop reads as lit while the room is dim.
  const benchLight = new THREE.PointLight("#ffd9a0", 0, 5.5);
  benchLight.position.set(-0.6, 2.4, -0.6);
  group.add(benchLight);
  // The centre table grows in idle, so the typewriter and the queued pages both rest on it.
  const table = scene.children.filter(o => o.name === "table");
  let tableScale = 1;

  // Coding: the check lamp beside the coder, and the approval tray with its flag on the bench's front corner.
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.12, 16), new THREE.MeshStandardMaterial({ color: "#222" }));
  lampBase.position.set(0.95, 0.82, -1.4);
  const lampBulbMat = new THREE.MeshBasicMaterial({ color: "#ffcf5a" });
  const lampBulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 16), lampBulbMat);
  lampBulb.position.set(0.95, 0.98, -1.4);
  const lampLabel = canvasPlane(0.7, 0.18, 280, 72);
  lampLabel.mesh.position.set(0.95, 1.22, -1.4);
  group.add(lampBase, lampBulb, lampLabel.mesh);

  const flag = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 8), new THREE.MeshStandardMaterial({ color: "#333" }));
  pole.position.y = 0.45;
  const cloth = canvasPlane(0.85, 0.4, 340, 160);
  cloth.mesh.position.set(0.44, 0.7, 0);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.42), new THREE.MeshStandardMaterial({ color: "#c9a24a" }));
  flag.add(pole, cloth.mesh, tray);
  group.add(flag);

  // Debate: the judge's marker, a raised disc under the judge's desk with a sign.
  const judgeSign = canvasPlane(0.7, 0.2, 280, 80);
  group.add(judgeSign.mesh);
  const spot = new THREE.SpotLight("#ffd9a0", 0, 9, 0.42, 0.75, 1.2);
  spot.castShadow = true;
  spot.shadow.mapSize.set(512, 512);
  const spotTarget = new THREE.Object3D();
  spot.target = spotTarget;
  group.add(spot, spotTarget);
  // A soft pool of light on the floor: a radial gradient, added on top of the floor's colour.
  const poolCanvas = document.createElement("canvas");
  poolCanvas.width = poolCanvas.height = 256;
  const pc = poolCanvas.getContext("2d")!;
  const grad = pc.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(255,220,160,0.55)");
  grad.addColorStop(0.5, "rgba(255,200,130,0.22)");
  grad.addColorStop(1, "rgba(255,190,120,0)");
  pc.fillStyle = grad;
  pc.fillRect(0, 0, 256, 256);
  const poolTex = new THREE.CanvasTexture(poolCanvas);
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), poolMat);
  pool.rotation.x = -Math.PI / 2;
  group.add(pool);
  // A faint beam: an open cone with a vertical fade.
  const beamCanvas = document.createElement("canvas");
  beamCanvas.width = 4; beamCanvas.height = 128;
  const bc = beamCanvas.getContext("2d")!;
  const bg = bc.createLinearGradient(0, 0, 0, 128);
  bg.addColorStop(0, "rgba(255,225,170,0)");
  bg.addColorStop(0.55, "rgba(255,225,170,0.11)");
  bg.addColorStop(0.85, "rgba(255,225,170,0.04)");
  bg.addColorStop(1, "rgba(255,225,170,0)");
  bc.fillStyle = bg;
  bc.fillRect(0, 0, 4, 128);
  const beamMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(beamCanvas), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.85, 3.2, 32, 1, true), beamMat);
  group.add(beam);
  let lightLevel = 0;
  const lightAt = new THREE.Vector3();
  // Room-wide light levels per mode: idle is dim, lit by the lamp, the station light and the TVs.
  const levels = { idle: { ambient: 0.22, sun: 0.3, lamp: 2.4 }, coding: { ambient: 0.26, sun: 0.4, lamp: 1.8 }, debate: { ambient: 0.45, sun: 0.8, lamp: 1.4 } };
  const named = (n: string) => scene.getObjectByName(n) as THREE.Light | undefined;

  const text = (ctx: CanvasRenderingContext2D, w: number, h: number, bg: string, lines: [string, string, number][]) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = "center";
    let y = 0;
    for (const [s, color, size] of lines) { y += size * 1.25; ctx.fillStyle = color; ctx.font = `bold ${size}px monospace`; ctx.fillText(s, w / 2, y); }
  };

  let key = "";
  return {
    update(room: RoomScene, seats: Record<AgentId, Spot>, now: number, live: HTMLImageElement | null, reduced: boolean) {
      // Reduced motion: every eased value jumps to its target.
      const k = reduced ? 1 : 0.08;
      const coding = room.kind === "coding";
      const idle = room.kind === "idle";
      const debate = room.kind === "debate";
      benchLong.visible = benchReturn.visible = benchLegs.visible = coding;
      terminal.visible = idle;
      if (idle) faceCamera(terminal);
      stationLight.intensity = idle ? 2.4 : 0;
      cartridge.visible = idle && Boolean(room.queued);
      lampBase.visible = lampBulb.visible = lampLabel.mesh.visible = coding;
      lampBulbMat.color.set(room.check === "pass" ? "#46a758" : room.check === "fail" ? "#e5484d" : "#ffcf5a");
      // Coding: the long bench's front-left corner, cloth to the left; panel: the centre table, cloth to the right.
      // Either way it covers no TV from the camera.
      flag.visible = Boolean(room.gate) && !idle;
      if (coding) { flag.position.set(-2.95, 0.76, -1.05); cloth.mesh.position.x = -0.44; } else { flag.position.set(0.6, 0.525, 0.95); cloth.mesh.position.x = 0.44; }
      faceCamera(flag);
      judgeSign.mesh.visible = debate && Boolean(room.judge);
      if (debate && room.judge && seats[room.judge]) {
        const [x, , z] = seats[room.judge].desk;
        // Beside the desk, below the name plate, so the plate never hides it.
        judgeSign.mesh.position.set(x + 0.62, 0.95, z + 0.75);
        faceCamera(judgeSign.mesh);
      }
      // Who has the floor: the speaker during opening and critique, the judge at the verdict.
      const lit = debate ? (room.phase === "verdict" ? room.judge : room.speaker) : null;
      if (lit && seats[lit]) {
        const [x, , z] = seats[lit].desk;
        lightAt.set(x, 0, z + 0.15);
      }
      lightLevel += ((lit ? 1 : 0) - lightLevel) * k;
      spot.position.set(lightAt.x, 4.2, lightAt.z + 0.9);
      spotTarget.position.copy(lightAt);
      spot.intensity = 26 * lightLevel;
      pool.position.set(lightAt.x, 0.02, lightAt.z);
      poolMat.opacity = lightLevel;
      beam.position.set(lightAt.x, 2.55, lightAt.z + 0.45);
      beam.lookAt(spot.position);
      beam.rotateX(Math.PI / 2);
      beamMat.opacity = lightLevel;
      const level = levels[room.kind];
      for (const [name, value] of Object.entries(level)) {
        const light = named(name);
        if (light) light.intensity += (value - light.intensity) * k;
      }
      if (coding) {
        board.mesh.position.set(-1.25, 2.3, -3.42);
        board.mesh.scale.set(2.5, 1.4, 1);
        boardFrame.visible = false;
      } else {
        board.mesh.scale.set(1.62, 1.08, 1);
        boardFrame.visible = true;
        board.mesh.position.set(-1.45, 2.35, -3.40);
      }
      faceCamera(lampLabel.mesh);
      for (const part of poster) part.visible = false;
      benchLight.intensity += ((coding ? 3.2 : 0) - benchLight.intensity) * k;
      tableScale += ((idle ? 2.1 : 1) - tableScale) * k;
      for (const part of table) part.scale.set(tableScale, 1, tableScale);
      const blinkOn = !reduced && Math.floor(now / 600) % 2 === 0;
      const next = JSON.stringify([room, blinkOn, live?.src ?? null]);
      if (next === key) return;
      key = next;
      // Paint the canvases for the current mode.
      {
        const c = brief.ctx;
        c.fillStyle = "#fffaf0"; c.fillRect(0, 0, 372, 312);
        c.fillStyle = "#e8dcc6";
        for (let y = 150; y < 312; y += 34) c.fillRect(24, y, 324, 2);
        c.textAlign = "left"; c.fillStyle = "#14100c";
        c.font = "bold 50px 'Courier New', monospace"; c.fillText("NEW TASK", 26, 88);
        c.font = "30px 'Courier New', monospace"; c.fillText(`type here${blinkOn ? "_" : ""}`, 28, 140);
      }
      brief.texture.needsUpdate = true;
      {
        const c = topPage.ctx;
        c.fillStyle = "#f6efe0"; c.fillRect(0, 0, 300, 225);
        c.fillStyle = "#14100c"; c.textAlign = "left";
        c.textAlign = "center";
        c.font = "bold 110px 'Courier New', monospace"; c.fillText(String(room.queued), 150, 120);
        c.font = "bold 40px 'Courier New', monospace"; c.fillText("queued", 150, 180);
        topPage.texture.needsUpdate = true;
      }
      text(lampLabel.ctx, 280, 72, "#14100c", [[room.check === "running" ? "CHECKS RUNNING" : room.check === "pass" ? "CHECKS PASSED" : room.check === "fail" ? "CHECKS FAILED" : "CHECKS", "#ffcf5a", 30]]);
      lampLabel.texture.needsUpdate = true;
      text(cloth.ctx, 340, 160, "#ffcf5a", [["NEEDS YOU", "#14100c", 52], [room.gate?.line ?? "", "#14100c", 26]]);
      cloth.texture.needsUpdate = true;
      text(judgeSign.ctx, 280, 80, "#c9a24a", [["JUDGE", "#14100c", 46]]);
      judgeSign.texture.needsUpdate = true;
      const b = board.ctx;
      b.clearRect(0, 0, 768, 512);
      if (coding) {
        b.fillStyle = "#0d0f0c"; b.fillRect(0, 0, 768, 512);
        b.strokeStyle = "#c9b79a"; b.lineWidth = 18; b.strokeRect(9, 9, 750, 494);
        // The task strip sits on top, above the agents' name plates, so it always keeps the task context.
        b.fillStyle = "#f3e6cf"; b.fillRect(18, 18, 732, 64);
        b.textAlign = "left"; b.fillStyle = "#14100c"; b.font = "bold 23px monospace";
        b.fillText((room.task ?? "Planning").slice(0, 54), 30, 58);
        if (live) {
          // The app as the room last captured it (UI tasks), covering the area under the strip.
          const scale = Math.max(732 / live.naturalWidth, 404 / live.naturalHeight);
          b.save(); b.beginPath(); b.rect(18, 90, 732, 404); b.clip();
          b.drawImage(live, 18 + (732 - live.naturalWidth * scale) / 2, 90, live.naturalWidth * scale, live.naturalHeight * scale);
          b.restore();
          b.fillStyle = "#e5484d"; b.fillRect(30, 102, 84, 34); b.fillStyle = "#ffffff"; b.font = "bold 24px monospace"; b.fillText("LIVE", 42, 128);
        } else {
          b.font = "bold 36px monospace"; b.fillStyle = "#9fe870"; b.fillText("PLAN", 46, 140);
          room.plan.slice(0, 6).forEach((t, i) => {
            const mark = t.status === "done" ? "☑" : t.status === "running" ? "▸" : t.status === "failed" ? "✗" : "☐";
            b.fillStyle = t.status === "running" ? "#ffcf5a" : t.status === "done" ? "#9fe870" : "#c9b79a";
            b.font = `${t.status === "running" ? "bold " : ""}32px monospace`;
            b.fillText(`${mark} ${i + 1}  ${t.title}`.slice(0, 34), 46, 196 + i * 48);
          });
        }
      } else {
        // Chalkboard: green slate, faint smudges from earlier writing, chalk lettering that is slightly uneven.
        b.fillStyle = "#2f4a3a"; b.fillRect(0, 0, 768, 512);
        let seed = 5;
        const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
        b.strokeStyle = "rgba(240,240,230,0.05)"; b.lineWidth = 26;
        for (let i = 0; i < 9; i++) { b.beginPath(); b.arc(rand() * 768, rand() * 512, 60 + rand() * 120, rand() * 6, rand() * 6 + 1.6); b.stroke(); }
        const chalkText = (text: string, x: number, y: number, size: number, color = "#f2f0e6") => {
          b.font = `${size}px "Segoe Print", "Comic Sans MS", cursive`;
          b.fillStyle = color;
          // Two passes a hair apart give the dusty, uneven edge of chalk.
          b.globalAlpha = 0.55; b.fillText(text, x + 1.5, y + 1);
          b.globalAlpha = 0.95; b.fillText(text, x, y);
          b.globalAlpha = 1;
        };
        b.textAlign = "center";
        if (idle) {
          chalkText("Up next", 384, 120, 72);
          chalkText((room.upNext ?? "nothing queued").slice(0, 22), 384, 270, 56);
          if (room.queued > 1) chalkText(`and ${room.queued - 1} more`, 384, 380, 40, "#d8dccf");
        } else {
          chalkText("Debate", 384, 112, 72);
          const phases = ["opening", "critique", "verdict"];
          phases.forEach((ph, i) => {
            const x = 120 + i * 264;
            const on = room.phase === ph;
            chalkText(ph, x, 300, on ? 48 : 40, on ? "#ffd27a" : "#d8dccf");
            if (on) { b.strokeStyle = "#ffd27a"; b.globalAlpha = 0.85; b.lineWidth = 6; b.beginPath(); b.moveTo(x - 86, 322); b.quadraticCurveTo(x, 334, x + 86, 318); b.stroke(); b.globalAlpha = 1; }
            if (i < 2) chalkText("→", x + 132, 300, 40, "#d8dccf");
          });
        }
        // A chalk ledge along the bottom.
        b.fillStyle = "#6b4527"; b.fillRect(0, 490, 768, 22);
        b.fillStyle = "#f2f0e6"; b.fillRect(560, 480, 46, 10);
      }
      board.texture.needsUpdate = true;
    },
    dispose() {
      group.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) { (m as THREE.MeshBasicMaterial).map?.dispose(); m.dispose(); }
      });
      scene.remove(group);
    },
  };
}
