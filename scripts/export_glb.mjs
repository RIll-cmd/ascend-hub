import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import fs from 'fs';

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

const objContent = fs.readFileSync('public/models/VHS.obj', 'utf8');
const objLoader = new OBJLoader();
const obj = objLoader.parse(objContent);

const mats = {
  'Cube.005': new THREE.MeshStandardMaterial({ color: 0xff5533, roughness: 0.4, name: 'ZZZ_Koleda_Mole_In_The_Hole' }),
  'Cube.004': new THREE.MeshStandardMaterial({ color: 0xd7f300, roughness: 0.4, name: 'ZZZ_Rina_Until_Your_Memory_Fades' }),
  'Cube.003': new THREE.MeshStandardMaterial({ color: 0x5aa0f0, roughness: 0.4, name: 'ZZZ_Lycaon_Heroes_Behind_Scenes' })
};

obj.children.forEach(child => {
  if (child.isMesh && mats[child.name]) {
    child.material = mats[child.name];
  }
});

const exporter = new GLTFExporter();
await new Promise((resolve, reject) => {
  exporter.parse(
    obj,
    (glb) => {
      fs.writeFileSync('public/models/zzz-tapes.glb', Buffer.from(glb));
      console.log('Successfully wrote zzz-tapes.glb! Size:', fs.statSync('public/models/zzz-tapes.glb').size);
      resolve();
    },
    (err) => {
      console.error('Export error:', err);
      reject(err);
    },
    { binary: true }
  );
});
