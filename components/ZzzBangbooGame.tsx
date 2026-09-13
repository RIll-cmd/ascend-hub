"use client";

import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { zzzAudio } from "./zzzAudio";

export function ZzzBangbooGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let groundY = canvas.height - 35;

    // Load sprite
    const bangbooImg = new Image();
    bangbooImg.src = "/images/zzz-tv/sprite/bangboo_run.png";

    // Player state
    let playerY = groundY - 45;
    let playerVY = 0;
    const gravity = 0.65;
    let isJumping = false;
    let runFrame = 0;
    let frameTick = 0;

    // Obstacles
    let obstacles: { x: number; w: number; h: number }[] = [];
    let spawnTimer = 0;
    let localScore = 0;
    let isDead = false;

    const jump = () => {
      if (!isJumping && !isDead) {
        playerVY = -11;
        isJumping = true;
        zzzAudio.play("click", 0.4);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        if (isDead) {
          restart();
        } else {
          jump();
        }
      }
    };

    const handleTouch = (e: TouchEvent | MouseEvent) => {
      e.preventDefault();
      if (isDead) {
        restart();
      } else {
        jump();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    canvas.addEventListener("click", handleTouch);

    const restart = () => {
      playerY = groundY - 45;
      playerVY = 0;
      isJumping = false;
      obstacles = [];
      spawnTimer = 0;
      localScore = 0;
      isDead = false;
      setGameOver(false);
      setScore(0);
      setStarted(true);
    };

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Sky & Horizon
      ctx.fillStyle = "#221c2b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Distant Grid Lines
      ctx.strokeStyle = "rgba(215, 243, 0, 0.12)";
      ctx.lineWidth = 1;
      for (let y = groundY - 60; y < groundY; y += 15) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Ground Line
      ctx.fillStyle = "#3a3048";
      ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
      ctx.fillStyle = "#d7f300";
      ctx.fillRect(0, groundY, canvas.width, 2);

      if (!isDead) {
        // Player Physics
        playerVY += gravity;
        playerY += playerVY;

        if (playerY >= groundY - 45) {
          playerY = groundY - 45;
          playerVY = 0;
          isJumping = false;
        }

        // Spawn obstacles
        spawnTimer++;
        if (spawnTimer > 95 + Math.random() * 50) {
          spawnTimer = 0;
          obstacles.push({
            x: canvas.width,
            w: 18,
            h: 26 + Math.random() * 12,
          });
        }

        // Move obstacles
        for (let i = obstacles.length - 1; i >= 0; i--) {
          const obs = obstacles[i];
          obs.x -= 3.8;

          // Draw obstacle (Hollow Ether Crystal / Pylon)
          ctx.fillStyle = "#ff5533";
          ctx.fillRect(obs.x, groundY - obs.h, obs.w, obs.h);
          ctx.fillStyle = "#ffaa00";
          ctx.fillRect(obs.x + 3, groundY - obs.h + 3, obs.w - 6, obs.h - 6);

          // Collision detection
          const playerX = 40;
          const playerW = 34;
          const playerH = 42;

          if (
            playerX + playerW > obs.x &&
            playerX < obs.x + obs.w &&
            playerY + playerH > groundY - obs.h
          ) {
            isDead = true;
            setGameOver(true);
            zzzAudio.play("tv_static", 0.5);
          }

          if (obs.x + obs.w < 0) {
            obstacles.splice(i, 1);
            localScore += 10;
            setScore(localScore);
          }
        }

        frameTick++;
        if (frameTick % 6 === 0) {
          runFrame = (runFrame + 1) % 4;
        }
      }

      // Draw Bangboo Sprite (or fallback vector Bangboo)
      const px = 40;
      if (bangbooImg.complete && bangbooImg.naturalWidth > 0) {
        const frameW = bangbooImg.naturalWidth / 4;
        const frameH = bangbooImg.naturalHeight;
        ctx.drawImage(
          bangbooImg,
          runFrame * frameW,
          0,
          frameW,
          frameH,
          px,
          playerY,
          38,
          45
        );
      } else {
        // Crisp fallback Bangboo (cylinder body + cute ears)
        ctx.fillStyle = "#e6e6e6";
        ctx.beginPath();
        ctx.roundRect(px + 4, playerY + 8, 30, 36, 12);
        ctx.fill();

        // Bangboo Face Mask
        ctx.fillStyle = "#161616";
        ctx.fillRect(px + 10, playerY + 16, 18, 12);

        // Cute glowing eyes
        ctx.fillStyle = "#d7f300";
        ctx.fillRect(px + 13, playerY + 20, 3, 3);
        ctx.fillRect(px + 22, playerY + 20, 3, 3);

        // Bangboo Ears
        ctx.fillStyle = "#ff5533";
        ctx.fillRect(px + 8, playerY, 6, 9);
        ctx.fillRect(px + 24, playerY, 6, 9);
      }

      // Draw HUD Score
      ctx.fillStyle = "#d7f300";
      ctx.font = "bold 11px monospace";
      ctx.fillText(`BANGBOO RUN  SCORE: ${localScore.toString().padStart(4, "0")}`, 10, 16);

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("keydown", handleKeyDown);
      canvas.removeEventListener("click", handleTouch);
    };
  }, []);

  return (
    <div className="zzz-game-channel-container">
      <canvas
        ref={canvasRef}
        width={320}
        height={220}
        className="zzz-game-canvas"
      />
      {gameOver && (
        <div className="zzz-game-over-overlay">
          <span className="zzz-game-over-title">HOLLOW CORRUPTED!</span>
          <span className="zzz-game-over-score">FINAL SCORE: {score}</span>
          <span className="zzz-game-press-start">TAP SCREEN OR SPACE TO RETRY</span>
        </div>
      )}
      {!started && !gameOver && (
        <div className="zzz-game-start-prompt">
          <span>TAP OR SPACE TO JUMP</span>
        </div>
      )}
    </div>
  );
}
