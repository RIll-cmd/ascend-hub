import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import fs from 'fs';

// Polyfills for Three.js loaders in Node
globalThis.self = globalThis;

// Complete FileReader polyfill for GLTFExporter
globalThis.FileReader = class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      if (this.onloadend) this.onloadend();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      const b64 = Buffer.from(buf).toString('base64');
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${b64}`;
      if (this.onloadend) this.onloadend();
    });
  }
};

const combinedScene = new THREE.Scene();

// 1. Load Shelf
const shelfBuf = fs.readFileSync('public/models/shelf-with-brackets.glb');
const gltfLoader = new GLTFLoader();
const shelfGltf = await new Promise((res, rej) => {
  gltfLoader.parse(shelfBuf.buffer, '', res, rej);
});

shelfGltf.scene.scale.set(0.65, 0.65, 0.65);
shelfGltf.scene.position.set(0, 0, 0);
combinedScene.add(shelfGltf.scene);

// 2. Load Tapes
const objContent = fs.readFileSync('public/models/VHS.obj', 'utf8');
const objLoader = new OBJLoader();
const obj = objLoader.parse(objContent);

const mats = {
  'Cube.005': new THREE.MeshStandardMaterial({ color: 0xff5533, roughness: 0.35, name: 'ZZZ_Koleda_Mole_In_The_Hole' }),
  'Cube.004': new THREE.MeshStandardMaterial({ color: 0xd7f300, roughness: 0.35, name: 'ZZZ_Rina_Until_Your_Memory_Fades' }),
  'Cube.003': new THREE.MeshStandardMaterial({ color: 0x5aa0f0, roughness: 0.35, name: 'ZZZ_Lycaon_Heroes_Behind_Scenes' })
};

const positions = {
  'Cube.005': { x: -0.11, angle: 0.3 },
  'Cube.004': { x: 0.0, angle: 0.1 },
  'Cube.003': { x: 0.11, angle: -0.2 }
};

obj.children.forEach(child => {
  if (child.isMesh) {
    child.material = mats[child.name] || child.material;
    const mesh = child.clone();
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.computeBoundingBox();
    const bbox = mesh.geometry.boundingBox;
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    mesh.geometry.translate(-center.x, -bbox.min.y, -center.z);

    const pos = positions[child.name] || { x: 0, angle: 0 };
    mesh.position.set(pos.x, 0.003, 0.015);
    mesh.rotation.set(0, -Math.PI / 2 + pos.angle, 0);
    mesh.scale.set(1.0, 1.0, 1.0);
    combinedScene.add(mesh);
  }
});

const exporter = new GLTFExporter();
await new Promise((resolve, reject) => {
  exporter.parse(
    combinedScene,
    (glb) => {
      fs.writeFileSync('public/models/shelf-with-zzz-tapes.glb', Buffer.from(glb));
      console.log('Successfully exported shelf-with-zzz-tapes.glb! Size:', fs.statSync('public/models/shelf-with-zzz-tapes.glb').size);
      resolve();
    },
    (err) => {
      console.error('Export error:', err);
      reject(err);
    },
    { binary: true }
  );
});
