export class BangbooJumpGame {
  constructor(canvas_width = 800, canvas_height = 400, fps = 60) {
    // Create the canvas and context
    this.canvas = document.createElement("canvas");
    this.canvas.classList.add("game-canvas");
    this.canvas.width = canvas_width;
    this.canvas.height = canvas_height;
    this.ctx = this.canvas.getContext("2d");

    // Load images
    this.dinoImage = this.loadImage("resource/sprite/bangboo_run.png");
    this.obstacleImage = this.loadImage("resource/image/error-404.afeccea.png");
    this.cloudImages = Array.from({ length: 9 }, (_, i) =>
      this.loadImage(`resource/image/cloud${i + 1}.png`)
    );
    this.backgroundColor = "#686868";

    // Game constants
    this.GROUND_LEVEL = canvas_height - 50;
    this.fps = fps; // Default FPS

    // Game state
    this.dino = new this.Dino(this.GROUND_LEVEL);
    this.obstacles = [];
    this.clouds = [];
    this.score = 0;
    this.gameOver = false;
    this.gameStarted = false;

    // Timing variables
    this.speed = 300; // Pixels per second
    this.lastFrameTime = 0;

    this.obstacleSpawnTime = 0;
    this.obstacleSpawnInterval = 2; // Seconds between obstacles

    this.cloudSpawnTime = 0;
    this.cloudSpawnInterval = 2; // Seconds between clouds

    // Ground points for rendering
    this.groundPoints = this.initializeGroundPoints();

    // Screen melt effect variables
    this.isMelting = false;
    this.meltColumns = [];
    this.meltImageData = null;
    this.meltAnimationFrameId = null;
    this.restartAfterMelt = false; // New flag to restart after melt

    // Event listeners
    this.initEventListeners();

    // // Show the start screen
    // this.showStartScreen();
  }

  loadImage(src) {
    const img = new Image();
    img.src = src;
    img.onerror = () => console.error(`Failed to load image: ${src}`);
    return img;
  }

  handleAction = () => {
    if (this.isMelting) {
      // Ignore input during the melting effect
      return;
    }

    if (!this.gameStarted) {
      // Start the game from the start screen
      // Stop the blinking effect
      if (this.blinkInterval) {
        clearInterval(this.blinkInterval);
        this.blinkInterval = null;
      }
      this.gameStarted = true;
      this.startGame();
    } else if (this.gameOver) {
      // Start the melt effect and set the flag to restart after melting
      this.restartAfterMelt = true;
      this.startMeltEffect();
    } else {
      this.dino.jump();
    }
  };

  initEventListeners() {
    this.tvContentContainerOverlay = document.getElementById(
      "tv-container-overlay"
    );
    this.tvContentContainerOverlay.addEventListener("click", this.handleAction);

    // Optional: Add keyboard support
    document.addEventListener("keydown", (event) => {
      if (event.code === "Space") {
        this.handleAction();
      }
    });
  }

  initializeGroundPoints() {
    const points = [];
    const bumpWidth = 10;
    for (let i = 0; i <= this.canvas.width / bumpWidth; i++) {
      const y = this.GROUND_LEVEL + (Math.random() > 0.9 ? -2 : 0);
      points.push({ x: i * bumpWidth, y });
    }
    return points;
  }

  setWallpaperSettings(wallpaperSettings) {
    if (wallpaperSettings && wallpaperSettings.fps) {
      this.fps = wallpaperSettings.fps;
    }
  }

  startGame() {
    // Reset game state
    this.gameOver = false;
    this.score = 0;
    this.speed = 300; // Reset speed to initial value
    this.obstacles = [];
    this.clouds = [];
    this.dino = new this.Dino(this.GROUND_LEVEL); // Reset the Dino instance
    this.lastFrameTime = 0;
    this.obstacleSpawnTime = 0;
    this.cloudSpawnTime = 0;
    this.isMelting = false;

    // Initialize ground points
    this.groundPoints = this.initializeGroundPoints();

    // Start the game loop
    this.updateGame();
  }

  showStartScreen() {
    // Clear any previous blinking interval
    if (this.blinkInterval) {
      clearInterval(this.blinkInterval);
    }

    // Start blinking text
    this.startBlinkingText();
  }

  startBlinkingText() {
    // Initial draw
    this.drawStartScreenText();

    // Set up interval for blinking
    this.blinkInterval = setInterval(() => {
      this.blinkVisible = !this.blinkVisible;
      this.drawStartScreenText();
    }, 500); // Adjust the interval (in milliseconds) as desired
  }

  drawStartScreenText() {
    // Clear the canvas and fill background color
    this.ctx.fillStyle = this.backgroundColor; // Set your desired background color
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.blinkVisible) {
      // Display the start screen message
      document.fonts.ready.then(() => {
        // Display the start screen message
        this.ctx.font = "40px Minecraft";
        this.ctx.fillStyle = "#000000"; // Set text color
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText(
          "Click to Start",
          this.canvas.width / 2,
          this.canvas.height / 2
        );
      });
    }
  }

  Dino = class {
    constructor(ground_level) {
      this.width = 64;
      this.height = 75;
      this.x = 50;
      this.y = ground_level - this.height;

      this.dy = 0;
      this.gravity = 1500; // Pixels per second squared
      this.lift = -700; // Pixels per second
      this.jumping = false;
      this.lives = 3;

      this.spriteWidth = 128;
      this.spriteHeight = 4494 / 30;
      this.frameIndex = 0;
      this.frameCount = 30;
      this.animationFPS = 15; // Increased from 10 to 15 for smoother animation
      this.frameDuration = 300 / this.animationFPS; // Milliseconds per frame
      this.frameTime = 0;
    }

    draw(ctx, dinoImage) {
      ctx.drawImage(
        dinoImage,
        0,
        this.frameIndex * this.spriteHeight,
        this.spriteWidth,
        this.spriteHeight,
        this.x,
        this.y,
        this.width,
        this.height
      );
    }

    jump() {
      if (!this.jumping) {
        this.dy = this.lift;
        this.jumping = true;
      }
    }

    update(ctx, dinoImage, deltaTimeSeconds, groundLevel) {
      // Update physics
      this.dy += this.gravity * deltaTimeSeconds;
      this.y += this.dy * deltaTimeSeconds;

      if (this.y >= groundLevel - this.height) {
        this.y = groundLevel - this.height;
        this.dy = 0;
        this.jumping = false;
      }

      // Update animation frame
      this.frameTime += deltaTimeSeconds * 1000; // Convert to milliseconds
      while (this.frameTime >= this.frameDuration) {
        this.frameIndex = (this.frameIndex + 1) % this.frameCount;
        this.frameTime -= this.frameDuration;
      }

      this.draw(ctx, dinoImage);
    }
  };

  Obstacle = class {
    constructor(speed, obstacleImage, canvasWidth, ground_level) {
      this.width = 46;
      this.height = 58;
      this.speed = speed; // Pixels per second
      this.x = canvasWidth;
      this.y = ground_level - this.height;
      this.obstacleImage = obstacleImage;
    }

    draw(ctx) {
      ctx.drawImage(
        this.obstacleImage,
        this.x,
        this.y,
        this.width,
        this.height
      );
    }

    update(ctx, deltaTimeSeconds) {
      this.x -= this.speed * deltaTimeSeconds;
      this.draw(ctx);
    }
  };

  Cloud = class {
    constructor(speed, cloudImages, canvasWidth, canvasHeight) {
      this.image = cloudImages[Math.floor(Math.random() * cloudImages.length)];
      this.width = 100;
      this.height = 60;
      this.speed = speed * 0.5; // Clouds move at half the game speed
      this.x = canvasWidth;
      this.y = Math.random() * (canvasHeight / 2);
    }

    draw(ctx) {
      ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    }

    update(ctx, deltaTimeSeconds) {
      this.x -= this.speed * deltaTimeSeconds;
      this.draw(ctx);
    }
  };

  updateObstacles(deltaTimeSeconds) {
    // Update the obstacle spawn timer
    this.obstacleSpawnTime += deltaTimeSeconds;
  
    // Randomize obstacle spawn interval between 1.5 and 3 seconds
    if (this.obstacleSpawnTime >= this.obstacleSpawnInterval) {
      // Randomize obstacle height and width within reasonable limits
      const obstacleHeight = 40 + Math.random() * 20; // Minimum height of 40, maximum of 60
      const obstacleWidth = 30 + Math.random() * 20;  // Minimum width of 30, maximum of 50
  
      // Ensure there is enough space between obstacles for the player to land
      const requiredGap = this.dino.lift * (2 / this.dino.gravity) + this.speed * (1.5 + Math.random() * 0.5);
  
      // Push a normal obstacle
      this.obstacles.push(
        new this.Obstacle(
          this.speed,
          this.obstacleImage,
          this.canvas.width + requiredGap, // Start obstacle further away
          this.GROUND_LEVEL,
          obstacleWidth,
          obstacleHeight
        )
      );
  
      // Add a rare chance (10%) to spawn a second obstacle close to the first one
      if (Math.random() < 0.1) {
        const secondObstacleHeight = 40 + Math.random() * 20;
        const secondObstacleWidth = 30 + Math.random() * 20;
        const smallGap = this.dino.width + 50 + Math.random() * 50; // Smaller gap for harder jump
  
        this.obstacles.push(
          new this.Obstacle(
            this.speed,
            this.obstacleImage,
            this.canvas.width + requiredGap + smallGap, // Second obstacle starts shortly after the first one
            this.GROUND_LEVEL,
            secondObstacleWidth,
            secondObstacleHeight
          )
        );
      }
  
      // Reset the obstacle spawn timer with a random interval for the next spawn
      this.obstacleSpawnTime -= this.obstacleSpawnInterval;
      this.obstacleSpawnInterval = 1.5 + Math.random() * 1.5; // Random interval between 1.5 and 3 seconds
    }
  
    // Update existing obstacles
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      this.obstacles[i].update(this.ctx, deltaTimeSeconds);
  
      // Remove obstacles that go off-screen
      if (this.obstacles[i].x + this.obstacles[i].width < 0) {
        this.obstacles.splice(i, 1);
        this.score++;
        // Increase speed every 5 points
        if (this.score % 5 === 0) {
          this.speed += 50; // Increase speed by 50 pixels per second
        }
      }
  
      // Handle collision with the player
      if (this.isCollision(this.dino, this.obstacles[i])) {
        this.obstacles.splice(i, 1);
        this.dino.lives--;
        if (this.dino.lives <= 0) {
          this.gameOver = true;
        }
      }
    }
  }

  updateClouds(deltaTimeSeconds) {
    this.cloudSpawnTime += deltaTimeSeconds;
    if (this.cloudSpawnTime >= this.cloudSpawnInterval) {
      this.clouds.push(
        new this.Cloud(
          this.speed,
          this.cloudImages,
          this.canvas.width,
          this.canvas.height
        )
      );
      this.cloudSpawnTime -= this.cloudSpawnInterval;
    }

    for (let i = this.clouds.length - 1; i >= 0; i--) {
      this.clouds[i].update(this.ctx, deltaTimeSeconds);

      if (this.clouds[i].x + this.clouds[i].width < 0) {
        this.clouds.splice(i, 1);
      }
    }
  }

  isCollision(dino, obstacle) {
    if (!obstacle) {
      return false;
    }
    return (
      dino.x < obstacle.x + obstacle.width &&
      dino.x + dino.width > obstacle.x &&
      dino.y < obstacle.y + obstacle.height &&
      dino.y + dino.height > obstacle.y
    );
  }

  drawGround(deltaTimeSeconds) {
    const bumpWidth = 10;
    this.ctx.strokeStyle = "#000000";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();

    // Update x positions
    for (let i = 0; i < this.groundPoints.length; i++) {
      this.groundPoints[i].x -= this.speed * deltaTimeSeconds;
    }

    // Remove points that are offscreen to the left
    while (
      this.groundPoints.length > 0 &&
      this.groundPoints[0].x < -bumpWidth
    ) {
      this.groundPoints.shift();
    }

    // Add new points to the right as needed
    const lastPoint = this.groundPoints[this.groundPoints.length - 1];
    while (lastPoint.x < this.canvas.width + bumpWidth) {
      const newX = lastPoint.x + bumpWidth;
      const newY = this.GROUND_LEVEL + (Math.random() > 0.9 ? -2 : 0);
      this.groundPoints.push({ x: newX, y: newY });
      lastPoint.x = newX;
      lastPoint.y = newY;
    }

    // Start drawing from the first point
    if (this.groundPoints.length > 0) {
      this.ctx.moveTo(this.groundPoints[0].x, this.groundPoints[0].y);
      for (let i = 1; i < this.groundPoints.length; i++) {
        this.ctx.lineTo(this.groundPoints[i].x, this.groundPoints[i].y);
      }
    }

    this.ctx.lineTo(this.canvas.width, this.GROUND_LEVEL);
    this.ctx.stroke();
  }

  updateGame(currentTime = 0) {
    // Calculate deltaTime
    if (!this.lastFrameTime) {
      this.lastFrameTime = currentTime;
    }
    const deltaTime = currentTime - this.lastFrameTime;

    // FPS limiter
    const fpsInterval = 1000 / this.fps;
    if (deltaTime < fpsInterval) {
      this.animationFrameId = requestAnimationFrame((time) =>
        this.updateGame(time)
      );
      return;
    }

    // Update lastFrameTime to account for any lag
    this.lastFrameTime = currentTime - (deltaTime % fpsInterval);

    // Convert deltaTime to seconds
    const deltaTimeSeconds = deltaTime / 1000;

    // Update game logic and render
    if (this.gameOver) {
      if (!this.isMelting) {
        this.gameOverScreen();
      }
      return;
    }

    // Fill background color
    this.ctx.fillStyle = this.backgroundColor; // Set your desired background color
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawGround(deltaTimeSeconds);
    this.updateClouds(deltaTimeSeconds);

    this.dino.update(
      this.ctx,
      this.dinoImage,
      deltaTimeSeconds,
      this.GROUND_LEVEL
    );
    this.updateObstacles(deltaTimeSeconds);

    this.ctx.font = "40px Minecraft";
    this.ctx.fillStyle = "#000000"; // Set text color
    this.ctx.textAlign = "right";
    this.ctx.fillText(`Score: ${this.score}`, this.canvas.width - 40, 60);
    this.ctx.textAlign = "left";
    this.ctx.fillText(`Lives: ${this.dino.lives}`, 40, 60);

    // Request the next frame
    this.animationFrameId = requestAnimationFrame((time) =>
      this.updateGame(time)
    );
  }

  gameOverScreen() {
    // Fill background color
    // this.ctx.fillStyle = this.backgroundColor; // Set your desired background color
    // this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Display the game over message
    this.ctx.font = "30px Minecraft";
    this.ctx.fillStyle = "#000000"; // Set text color
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(
      "Game Over",
      this.canvas.width / 2,
      this.canvas.height / 2
    );
    this.ctx.fillText(
      "Click to Restart",
      this.canvas.width / 2,
      this.canvas.height / 2 + 40
    );
  }

  startMeltEffect() {
    if (this.isMelting) return;

    this.isMelting = true;

    // Capture the current screen
    this.meltImageData = this.ctx.getImageData(
      0,
      0,
      this.canvas.width,
      this.canvas.height
    );

    // Create an offscreen canvas
    this.meltCanvas = document.createElement("canvas");
    this.meltCanvas.width = this.canvas.width;
    this.meltCanvas.height = this.canvas.height;
    this.meltCtx = this.meltCanvas.getContext("2d");
    this.meltCtx.putImageData(this.meltImageData, 0, 0);

    // Initialize melt columns with adjusted parameters
    this.initializeMeltColumns();

    // Start the melt animation
    this.meltAnimationFrameId = requestAnimationFrame(() => this.meltEffect());
  }

  initializeMeltColumns() {
    const columns = this.canvas.width;
    this.meltColumns = [];

    // Create a random permutation of column indices
    const order = Array.from({ length: columns }, (_, i) => i);
    this.shuffleArray(order);

    for (let i = 0; i < columns; i++) {
      this.meltColumns[order[i]] = {
        y: 0,
        speed: 0,
        delay: Math.floor(Math.random() * 600), // Increased delay range to slow down effect
      };
    }
  }

  shuffleArray(array) {
    // Fisher-Yates Shuffle Algorithm
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(this.getRandom() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  getRandom() {
    return Math.random();
  }

  meltEffect() {
    const { width, height } = this.canvas;

    // Clear the canvas
    this.ctx.fillStyle = this.backgroundColor; // Match the background color
    this.ctx.fillRect(0, 0, width, height);

    let columnsStillMelting = false;

    for (let x = 0; x < width; x++) {
      const column = this.meltColumns[x];
      if (column.delay > 0) {
        // Column is waiting to start melting
        column.delay -= 16; // Approximate frame time
      } else {
        if (column.speed === 0) {
          // Initialize speed when melting starts
          column.speed = 1 + this.getRandom() * 2; // Slower speeds
        }
        column.y += column.speed;
        if (column.y > height) {
          column.y = height;
        } else {
          columnsStillMelting = true;
        }
      }

      // Draw the column up to the current melt position
      if (column.y < height) {
        this.ctx.drawImage(
          this.meltCanvas,
          x, // source x
          column.y, // source y
          1, // source width
          height - column.y, // source height
          x, // destination x
          column.y, // destination y
          1, // destination width
          height - column.y // destination height
        );
      }
    }

    if (columnsStillMelting) {
      this.meltAnimationFrameId = requestAnimationFrame(() =>
        this.meltEffect()
      );
    } else {
      this.isMelting = false;
      cancelAnimationFrame(this.meltAnimationFrameId);

      // Restart the game if the flag is set
      if (this.restartAfterMelt) {
        this.restartAfterMelt = false;
        this.startGame();
      }
    }
  }

  getCanvas() {
    return this.canvas;
  }

  destroy() {
    this.tvContentContainerOverlay.removeEventListener(
      "click",
      this.handleAction
    );
    document.removeEventListener("keydown", this.handleAction);
    cancelAnimationFrame(this.animationFrameId);
    cancelAnimationFrame(this.meltAnimationFrameId);
  }
}
