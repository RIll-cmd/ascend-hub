"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { Disc3, Info } from "lucide-react";
import { synth } from "../app/synth";

export interface ZZZTapeInfo {
  id: string;
  name: string;
  title: string;
  faction: string;
  accentColor: string;
  textureFile: string;
  meshName: string;
  videoSrc?: string;
  synopsis: string;
}

export const ZZZ_TAPES: ZZZTapeInfo[] = [
  {
    id: "koleda",
    name: "Koleda Belobog",
    title: "Mole in the Hole",
    faction: "Belobog Heavy Industries",
    accentColor: "#ff5533",
    textureFile: "/models/zzz_koleda.jpg",
    meshName: "Cube.005",
    synopsis: "The Belobog construction team's deepest Hollow excavation expedition.",
  },
  {
    id: "rina",
    name: "Alexandrina Sebastiane",
    title: "Until Your Memory Fades",
    faction: "Victoria Housekeeping Co.",
    accentColor: "#d7f300",
    textureFile: "/models/zzz_rina.jpg",
    meshName: "Cube.004",
    synopsis: "An elegant gothic melody intertwined with forgotten New Eridu memories.",
  },
  {
    id: "lycaon",
    name: "Von Lycaon",
    title: "And the True Heroes Are Always Behind the Scenes",
    faction: "Victoria Housekeeping Co.",
    accentColor: "#5aa0f0",
    textureFile: "/models/zzz_lycaon.jpg",
    meshName: "Cube.003",
    synopsis: "The gentlemen's code of conduct amidst perilous Hollow operations.",
  },
];

interface RetroWallShelfProps {
  onTapeSelect?: (tape: ZZZTapeInfo) => void;
  className?: string;
}

export function RetroWallShelf({ onTapeSelect, className = "" }: RetroWallShelfProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTape, setActiveTape] = useState<ZZZTapeInfo | null>(null);
  const [hoveredTape, setHoveredTape] = useState<ZZZTapeInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const tapeMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const handleSelectTape = useCallback(
    (tape: ZZZTapeInfo) => {
      setActiveTape(tape);
      synth.play("click");
      onTapeSelect?.(tape);
    },
    [onTapeSelect]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 290;
    const height = container.clientHeight || 220;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 50);
    camera.position.set(0, 0.22, 0.72);
    camera.lookAt(0, 0.06, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xfff6ea, 1.1);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(0.6, 1.0, 1.0);
    scene.add(keyLight);

    // Warm CRT bounce glow
    const warmBounce = new THREE.PointLight(0xff6622, 1.5, 2.2);
    warmBounce.position.set(0.5, 0.1, 0.4);
    scene.add(warmBounce);

    // Signature ZZZ neon lime rim
    const neonRim = new THREE.PointLight(0xd7f300, 1.8, 1.8);
    neonRim.position.set(-0.5, 0.25, 0.3);
    scene.add(neonRim);

    // Root Group
    const shelfGroup = new THREE.Group();
    scene.add(shelfGroup);

    // Raycasting
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-999, -999);
    let targetRotationY = 0;
    let targetRotationX = 0;

    // 1. Load Shelf Model
    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
      "/models/shelf-with-brackets.glb",
      (gltf) => {
        const shelf = gltf.scene;
        shelf.scale.set(0.58, 0.58, 0.58);
        shelf.position.set(0, 0, 0);
        shelfGroup.add(shelf);
      },
      undefined,
      (err) => {
        console.warn("Using procedural fallback shelf:", err);
        const boardGeo = new THREE.BoxGeometry(0.5, 0.015, 0.14);
        const boardMat = new THREE.MeshStandardMaterial({ color: 0x2b1e16, roughness: 0.6 });
        const board = new THREE.Mesh(boardGeo, boardMat);
        board.position.set(0, 0, 0);
        shelfGroup.add(board);
      }
    );

    // 2. Load VHS Tapes with MTL
    const mtlLoader = new MTLLoader();
    mtlLoader.setPath("/models/");
    mtlLoader.load(
      "VHS.mtl",
      (materials) => {
        materials.preload();
        const objLoader = new OBJLoader();
        objLoader.setMaterials(materials);
        objLoader.setPath("/models/");
        objLoader.load(
          "VHS.obj",
          (obj) => {
            const tapesMap = new Map<string, THREE.Mesh>();
            const tapesContainer = new THREE.Group();

            obj.children.forEach((child) => {
              if ((child as THREE.Mesh).isMesh) {
                const mesh = (child as THREE.Mesh).clone();
                mesh.geometry = mesh.geometry.clone();
                mesh.geometry.computeBoundingBox();
                const bbox = mesh.geometry.boundingBox!;
                const center = new THREE.Vector3();
                bbox.getCenter(center);

                // Pivot to bottom center
                mesh.geometry.translate(-center.x, -bbox.min.y, -center.z);

                // Upgrade materials to Standard Material with semi-gloss sleeve finish
                if (Array.isArray(mesh.material)) {
                  mesh.material = mesh.material.map((m) => {
                    const phong = m as THREE.MeshPhongMaterial;
                    return new THREE.MeshStandardMaterial({
                      map: phong.map || null,
                      color: phong.color,
                      roughness: 0.35,
                      metalness: 0.08,
                    });
                  });
                } else if (mesh.material) {
                  const phong = mesh.material as THREE.MeshPhongMaterial;
                  mesh.material = new THREE.MeshStandardMaterial({
                    map: phong.map || null,
                    color: phong.color,
                    roughness: 0.35,
                    metalness: 0.08,
                  });
                }

                // Determine position based on mesh name
                let posX = 0;
                let baseAngleY = -Math.PI / 2; // Face front cover forward
                let tiltY = 0;

                if (mesh.name === "Cube.005") {
                  // Left: Koleda (Mole in the Hole)
                  posX = -0.11;
                  tiltY = 0.32;
                } else if (mesh.name === "Cube.004") {
                  // Center: Rina (Until Your Memory Fades)
                  posX = 0.0;
                  tiltY = 0.12;
                } else if (mesh.name === "Cube.003") {
                  // Right: Lycaon (Heroes Behind the Scenes)
                  posX = 0.11;
                  tiltY = -0.18;
                }

                mesh.position.set(posX, 0.003, 0.015);
                mesh.rotation.set(0, baseAngleY + tiltY, 0);
                mesh.scale.set(1.05, 1.05, 1.05);

                tapesMap.set(mesh.name, mesh);
                tapesContainer.add(mesh);
              }
            });

            tapeMeshesRef.current = tapesMap;
            shelfGroup.add(tapesContainer);
            setIsLoading(false);
          },
          undefined,
          (err) => {
            console.error("Failed to load VHS.obj", err);
            setLoadError("Failed to load 3D tapes");
            setIsLoading(false);
          }
        );
      },
      undefined,
      (err) => {
        console.error("Failed to load VHS.mtl", err);
        setLoadError("Failed to load materials");
        setIsLoading(false);
      }
    );

    // Mouse Interaction
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      mouse.set(x, y);

      targetRotationY = x * 0.22;
      targetRotationX = -y * 0.12;

      // Raycast against tapes
      raycaster.setFromCamera(mouse, camera);
      const meshes = Array.from(tapeMeshesRef.current.values());
      const intersects = raycaster.intersectObjects(meshes, false);

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object as THREE.Mesh;
        const matched = ZZZ_TAPES.find((t) => t.meshName === hitMesh.name);
        setHoveredTape(matched || null);
        container.style.cursor = "pointer";
      } else {
        setHoveredTape(null);
        container.style.cursor = "default";
      }
    };

    const handleMouseLeave = () => {
      mouse.set(-999, -999);
      targetRotationY = 0;
      targetRotationX = 0;
      setHoveredTape(null);
    };

    const handleClick = () => {
      raycaster.setFromCamera(mouse, camera);
      const meshes = Array.from(tapeMeshesRef.current.values());
      const intersects = raycaster.intersectObjects(meshes, false);
      if (intersects.length > 0) {
        const hitMesh = intersects[0].object as THREE.Mesh;
        const matched = ZZZ_TAPES.find((t) => t.meshName === hitMesh.name);
        if (matched) {
          handleSelectTape(matched);
        }
      }
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);
    container.addEventListener("click", handleClick);

    // Resize Handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // Animation Loop
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Smooth shelf parallax
      shelfGroup.rotation.y += (targetRotationY - shelfGroup.rotation.y) * 0.08;
      shelfGroup.rotation.x += (targetRotationX - shelfGroup.rotation.x) * 0.08;

      // Subtle float
      shelfGroup.position.y = Math.sin(elapsed * 1.5) * 0.003;

      // Animate hovered / active tape forward
      tapeMeshesRef.current.forEach((mesh, name) => {
        const matched = ZZZ_TAPES.find((t) => t.meshName === name);
        const isHovered = hoveredTape?.id === matched?.id;
        const isActive = activeTape?.id === matched?.id;

        const targetZ = isHovered ? 0.04 : isActive ? 0.025 : 0.015;
        const targetY = isHovered ? 0.01 : 0.003;

        mesh.position.z += (targetZ - mesh.position.z) * 0.15;
        mesh.position.y += (targetY - mesh.position.y) * 0.15;
      });

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      container.removeEventListener("click", handleClick);

      renderer.dispose();
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [handleSelectTape, hoveredTape, activeTape]);

  return (
    <div className={`zzz-wall-shelf-card ${className}`}>
      <div className="zzz-shelf-header">
        <div className="zzz-shelf-badge">
          <Disc3 size={13} className="animate-spin text-[#d7f300]" />
          <span>RANDOM PLAY ARCHIVE</span>
        </div>
        <span className="zzz-shelf-serial">HIA-TAPE-03</span>
      </div>

      <div className="zzz-3d-canvas-wrapper" ref={containerRef}>
        {isLoading && (
          <div className="zzz-shelf-loading">
            <div className="zzz-spinner" />
            <span>LOADING CASSETTE HEADS...</span>
          </div>
        )}
        {loadError && (
          <div className="zzz-shelf-error">
            <Info size={14} />
            <span>{loadError}</span>
          </div>
        )}
      </div>

      <div className="zzz-shelf-footer">
        {hoveredTape || activeTape ? (
          <div
            className="zzz-tape-active-info"
            style={{
              borderColor: (hoveredTape || activeTape)?.accentColor,
            }}
          >
            <div className="zzz-tape-active-title">
              <span
                className="zzz-tape-indicator"
                style={{ backgroundColor: (hoveredTape || activeTape)?.accentColor }}
              />
              <b>{(hoveredTape || activeTape)?.title}</b>
            </div>
            <div className="zzz-tape-active-meta">
              <span>{(hoveredTape || activeTape)?.faction}</span>
              <span className="zzz-action-hint">CLICK TO LOAD</span>
            </div>
          </div>
        ) : (
          <div className="zzz-tape-idle-info">
            <span>SELECT A TAPE TO INSERT INTO VCR</span>
            <div className="zzz-tape-pills">
              {ZZZ_TAPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSelectTape(t)}
                  className={`zzz-pill-btn ${(activeTape as ZZZTapeInfo | null)?.id === t.id ? "active" : ""}`}
                  style={{
                    borderColor: (activeTape as ZZZTapeInfo | null)?.id === t.id ? t.accentColor : undefined,
                  }}
                >
                  <span
                    className="zzz-dot"
                    style={{ backgroundColor: t.accentColor }}
                  />
                  {t.name.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
