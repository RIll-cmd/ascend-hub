export function radialBarsVisualizer(canvas, ctx, audioArray) {
  const w = canvas.width;
  const h = canvas.height;
  const centerX = w / 2;
  const centerY = h / 2;
  const barCount = 64; // 64 bars for 64 frequency bands
  const radius = Math.min(w, h) / 4; // Starting radius
  const maxBarHeight = Math.min(w, h) / 2;

  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < barCount; i++) {
    const barHeight =
      Math.min((audioArray[i] + audioArray[i + 64]) / 2, 1) * maxBarHeight;
    const angle = (i / barCount) * Math.PI * 2;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    const xEnd = centerX + Math.cos(angle) * (radius + barHeight);
    const yEnd = centerY + Math.sin(angle) * (radius + barHeight);

    // ctx.strokeStyle = `hsl(${i * 5}, 100%, 50%)`;
    ctx.strokeStyle = "rgb(255, 255, 255)";
    ctx.shadowColor = "rgba(0, 0, 0, 255)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(xEnd, yEnd);
    ctx.stroke();
  }
  ctx.shadowColor = "transparent";
}

export function radialBarsVisualizer2(canvas, ctx, audioArray, options = {}) {
  const w = canvas.width;
  const h = canvas.height;
  const centerX = w / 2;
  const centerY = h / 2;
  const numBars = 64;
  const radius = options.radius || Math.min(w, h) / 4;
  const maxBarLength = options.maxBarLength || radius;
  const barWidth = options.barWidth || 5;
  const maxAmplitude = 1;

  ctx.clearRect(0, 0, w, h);

  // Set styles
  ctx.strokeStyle = options.strokeStyle || "white";
  ctx.lineWidth = barWidth;
  ctx.lineCap = options.lineCap || "round";

  // Precompute angles
  const angleStep = (Math.PI * 2) / numBars;

  for (let i = 0; i < numBars; i++) {
    const angle = i * angleStep;
    let volume = Math.min(1, (audioArray[i] + audioArray[i + 64]) / 2);

    // Apply neighbor adjustment
    if (i > 0) {
      volume += audioArray[i - 1] + audioArray[i - 1 + 64] / 3;
    }
    if (i < numBars - 1) {
      volume += audioArray[i + 1] + audioArray[i + 1 + 64] / 3;
    }

    volume = Math.max(volume, 0.05); // Prevent very low volumes
    volume = Math.min(volume, maxAmplitude); // Cap the volume at maxAmplitude

    const barLength = (volume / maxAmplitude) * maxBarLength;

    // Calculate start and end points of the bar
    const xStart = centerX + radius * Math.cos(angle);
    const yStart = centerY + radius * Math.sin(angle);
    const xEnd = centerX + (radius + barLength) * Math.cos(angle);
    const yEnd = centerY + (radius + barLength) * Math.sin(angle);

    ctx.beginPath();
    ctx.moveTo(xStart, yStart);
    ctx.lineTo(xEnd, yEnd);
    ctx.stroke();
  }
}

export function waveformVisualizer(canvas, ctx, audioArray) {
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  ctx.beginPath();
  ctx.moveTo(0, h);

  for (let i = 0; i < 64; i++) {
    // Left channel only
    const x = (i / 63) * w;
    const y = (1 - Math.min(audioArray[i], 1)) * h;
    ctx.lineTo(x, y);
  }

  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function waveformStackedVisualizer(canvas, ctx, audioArray) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  let path = getAudioVisualizerPath(canvas, audioArray);

  // this.audioCanvasCtx.strokeStyle = "rgb(255,204,0)";
  ctx.strokeStyle = "rgb(255, 255, 255)";
  ctx.lineWidth = 7;
  ctx.stroke(path);

  ctx.strokeStyle = "rgb(0,0,0)";
  ctx.lineWidth = 2;
  ctx.stroke(path);
}

function getAudioVisualizerPath(canvas, audioArray, damping = 0.7) {
  const w = canvas.width;
  const h = canvas.height;

  const path = new Path2D();

  const leftChannelLenght = audioArray.length / 2;

  path.moveTo(0, h);

  let sliceWidth = w / (leftChannelLenght + 2);
  let x = sliceWidth;

  for (let i = 0; i < leftChannelLenght; i++) {
    const vol =
      Math.min((audioArray[i] + audioArray[i + leftChannelLenght]) / 2, 1) *
      damping;
    // const y = h / 2 + h * v * 0.5;
    const y = Math.max((1 - vol) * h, 15);

    // if (i === 0) {
    //     path.moveTo(x, y);
    // } else {
    //     path.lineTo(x, y);
    // }

    path.lineTo(x, y);
    x += sliceWidth;
  }

  path.lineTo(w, h);

  return path;
}

export function inverseWaveformVisualizer(
  canvas,
  ctx,
  audioArray,
  options = {}
) {
  const w = canvas.width;
  const h = canvas.height;
  const numPoints = audioArray.length / 2;
  const sliceWidth = w / (numPoints - 1);
  const damping = options.damping !== undefined ? options.damping : 1; // Damping factor between 0 and 1

  ctx.clearRect(0, 0, w, h);

  ctx.lineWidth = options.lineWidth || 5;
  ctx.strokeStyle = options.strokeStyle || "white";
  ctx.lineCap = options.lineCap || "round";
  ctx.beginPath();

  const startingPos = (h * 6) / 8;
  const allowedHeight = (h * 2) / 8;

  for (let i = 0; i < numPoints; i++) {
    const x = i * sliceWidth;
    const normalizedValue = Math.min(
      (audioArray[i] + audioArray[i + 64]) / 2,
      1
    ); // Normalize audio data to range [0, 1]
    const amplitude = normalizedValue * damping; // Adjust amplitude with damping
    const y = startingPos + amplitude * allowedHeight; // Wave goes down from center

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
}

export function inverseSmoothWaveformVisualizer(
  canvas,
  ctx,
  audioArray,
  options = {}
) {
  const w = canvas.width;
  const h = canvas.height;
  const numPoints = audioArray.length / 2;
  const sliceWidth = w / (numPoints - 1);
  const damping = options.damping !== undefined ? options.damping : 1;

  ctx.clearRect(0, 0, w, h);

  ctx.lineWidth = options.lineWidth || 7;
  ctx.strokeStyle = options.strokeStyle || "white";
  ctx.lineCap = options.lineCap || "round";
  ctx.beginPath();

  const startingPos = (h * 6) / 8;
  const allowedHeight = (h * 2) / 8;

  // First point
  const x0 = 0;
  const normalizedValue0 = Math.min((audioArray[0] + audioArray[64]) / 2, 1);
  const amplitude0 = normalizedValue0 * damping;
  const y0 = startingPos + amplitude0 * allowedHeight;
  ctx.moveTo(x0, y0);

  // Use quadratic curves for smoother transitions
  for (let i = 1; i < numPoints - 2; i++) {
    const xCurr = i * sliceWidth;
    const xNext = (i + 1) * sliceWidth;
    const xMid = (xCurr + xNext) / 2;

    const normalizedValueCurr = Math.min(
      (audioArray[i] + audioArray[i + 64]) / 2,
      1
    );
    const normalizedValueNext = Math.min(
      (audioArray[i + 1] + audioArray[i + 1 + 64]) / 2,
      1
    );

    const amplitudeCurr = normalizedValueCurr * damping;
    const amplitudeNext = normalizedValueNext * damping;

    const yCurr = startingPos + amplitudeCurr * allowedHeight;
    const yNext = startingPos + amplitudeNext * allowedHeight;
    const yMid = (yCurr + yNext) / 2;

    ctx.quadraticCurveTo(xCurr, yCurr, xMid, yMid);
  }

  // Draw the last segment
  const xLast = (numPoints - 1) * sliceWidth;
  const normalizedValueLast = Math.min(
    (audioArray[numPoints - 1] + audioArray[numPoints - 1 + 64]) / 2,
    1
  );
  const amplitudeLast = normalizedValueLast * damping;
  const yLast = startingPos + amplitudeLast * allowedHeight;

  ctx.quadraticCurveTo(xLast, yLast, xLast, yLast);

  ctx.stroke();
}

export function particleBurstVisualizer(canvas, ctx, audioArray, options = {}) {
  const w = canvas.width;
  const h = canvas.height;
  const centerX = w / 2;
  const centerY = h / 2;
  const numParticles = options.numParticles || 100;
  const maxSpeed = options.maxSpeed || 5;
  const particleSize = options.particleSize || 2;
  const particles = [];

  ctx.clearRect(0, 0, w, h);

  // Initialize particles
  for (let i = 0; i < numParticles; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (audioArray[i % audioArray.length] / 255) * maxSpeed;
    particles.push({
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    });
  }

  // Update and draw particles
  particles.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;

    ctx.fillStyle = options.fillStyle || "white";
    ctx.beginPath();
    ctx.arc(p.x, p.y, particleSize, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function spectrumRingsVisualizer(canvas, ctx, audioArray) {
  const w = canvas.width;
  const h = canvas.height;
  const centerX = w / 2;
  const centerY = h / 2;
  const maxRadius = Math.min(w, h) / 2;

  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < 64; i++) {
    const radius = (i / 63) * maxRadius;
    ctx.beginPath();
    ctx.arc(
      centerX,
      centerY,
      radius + Math.min((audioArray[i] + audioArray[i + 64]) / 2, 1) * 20,
      0,
      Math.PI * 2
    );
    ctx.strokeStyle = `hsl(${i * 5}, 100%, 50%)`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export function lissajousCurveVisualizer(canvas, ctx, audioArray) {
  const w = canvas.width;
  const h = canvas.height;
  const A = (w / 4) * (Math.min(audioArray[32], 1) + 0.5);
  const B = (h / 4) * (Math.min(audioArray[96], 1) + 0.5);
  const a = 3; // Frequency ratio for x-axis
  const b = 2; // Frequency ratio for y-axis
  const delta = Math.PI / 2; // Phase difference

  ctx.clearRect(0, 0, w, h);

  ctx.beginPath();
  for (let t = 0; t < Math.PI * 2; t += 0.01) {
    const x = w / 2 + A * Math.sin(a * t + delta);
    const y = h / 2 + B * Math.sin(b * t);
    ctx.lineTo(x, y);
  }

  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function circularWaveVisualizer(canvas, ctx, audioArray) {
  const w = canvas.width;
  const h = canvas.height;
  const centerX = w / 2;
  const centerY = h / 2;

  ctx.clearRect(0, 0, w, h);

  ctx.beginPath();
  for (let i = 0; i < 64; i++) {
    const angle = (i / 63) * Math.PI * 2;
    const radius =
      ((1 + Math.min((audioArray[i] + audioArray[i + 64]) / 2, 1) * 0.8) *
        Math.min(w, h)) /
      4;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();

  ctx.strokeStyle = "white";
  ctx.shadowColor = "rgba(0, 0, 0, 255)";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.shadowColor = "transparent";
}

export function mirrorSpectrumVisualizer(canvas, ctx, audioArray) {
  const w = canvas.width;
  const h = canvas.height;
  const barWidth = w / 64;

  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < 64; i++) {
    const barHeight = (Math.min(audioArray[i], 1) * h) / 2;
    ctx.fillStyle = `hsl(${i * 5}, 100%, 50%)`;
    ctx.fillRect(i * barWidth, h / 2 - barHeight, barWidth, barHeight);
    ctx.fillRect(i * barWidth, h / 2, barWidth, barHeight);
  }
}

export function mirrorDotBarVisualizer(canvas, ctx, audioArray, options = {}) {
  const w = canvas.width;
  const h = canvas.height;
  const numBars = 64;
  const gap = options.gap || 2;
  const totalGapWidth = gap * (numBars - 1);
  const barWidth = options.barWidth || (w - totalGapWidth) / numBars;
  const maxAmplitude = 1;
  let cornerRadius =
    options.cornerRadius !== undefined ? options.cornerRadius : barWidth / 2;
  cornerRadius = Math.min(cornerRadius, barWidth / 2);
  const minDotSize = barWidth;

  ctx.clearRect(0, 0, w, h);

  // Precompute adjusted volumes
  const adjustedVolumes = new Array(numBars);
  for (let i = 0; i < numBars; i++) {
    let volume = Math.min((audioArray[i] + audioArray[i + 64]) / 2, 1);

    // Apply neighbor adjustment
    if (i > 0) {
      volume += (audioArray[i - 1] + audioArray[i - 1 + 64]) / 2 / 3;
    }
    if (i < numBars - 1) {
      volume += (audioArray[i + 1] + audioArray[i + 1 + 64]) / 2 / 3;
    }

    volume = Math.max(volume, 0.05); // Prevent very low volumes
    volume = Math.min(volume, maxAmplitude); // Cap the volume at maxAmplitude

    adjustedVolumes[i] = volume;
  }

  ctx.fillStyle = "white";
  // Draw the visualizer using the adjusted volumes
  for (let i = 0; i < numBars; i++) {
    const volume = adjustedVolumes[i];
    const barHeight =
      (volume / maxAmplitude) * (h / 2 - minDotSize) + minDotSize;

    const x = i * (barWidth + gap);
    const y = h / 2 - barHeight;
    const height = 2 * barHeight;
    ctx.shadowColor = `rgba(255, 255, 255, ${volume})`;
    ctx.shadowBlur = 40 * volume;
    drawRoundedRect(ctx, x, y, barWidth, height, cornerRadius);
  }

  ctx.shadowColor = "transparent";
}

export function roundedBarVisualizer(canvas, ctx, audioArray, options = {}) {
  const w = canvas.width;
  const h = canvas.height;
  const numBars = 64;
  const gap = options.gap || 2;
  const totalGapWidth = gap * (numBars - 1);
  const barWidth = options.barWidth || (w - totalGapWidth) / numBars;
  const maxAmplitude = 1;
  let cornerRadius =
    options.cornerRadius !== undefined ? options.cornerRadius : barWidth / 2;
  cornerRadius = Math.min(cornerRadius, barWidth / 2);
  const minBarHeight = options.minBarHeight || barWidth; // Ensures bars are always visible

  ctx.clearRect(0, 0, w, h);

  // Precompute adjusted volumes
  const adjustedVolumes = new Array(numBars);
  for (let i = 0; i < numBars; i++) {
    let volume = Math.min((audioArray[i] + audioArray[i + 64]) / 2, 1);

    // Apply neighbor adjustment for smoothing
    if (i > 0) {
      volume += (audioArray[i - 1] + audioArray[i - 1 + 64]) / 2 / 3;
    }
    if (i < numBars - 1) {
      volume += (audioArray[i + 1] + audioArray[i + 1 + 64]) / 2 / 3;
    }

    volume = Math.max(volume, 0.05); // Prevent very low volumes
    volume = Math.min(volume, maxAmplitude); // Cap the volume at maxAmplitude

    adjustedVolumes[i] = volume;
  }

  ctx.fillStyle = options.fillStyle || "white";
  // ctx.shadowColor = options.shadowColor || "rgba(0, 0, 0, 1)";

  // Draw the bars
  for (let i = 0; i < numBars; i++) {
    const volume = adjustedVolumes[i];
    const barHeight =
      ((volume / maxAmplitude) * (h - minBarHeight)) / 2 + minBarHeight;

    const x = i * (barWidth + gap);
    const y = h - barHeight; // Bars grow upwards from the bottom

    ctx.shadowColor = `rgba(255, 255, 255, ${volume})`;
    ctx.shadowBlur = 40 * volume;
    drawRoundedRect(ctx, x, y, barWidth, barHeight, cornerRadius);
  }

  ctx.shadowColor = "transparent";
}

// Helper function to draw a rounded rectangle
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y, x + width, y + radius, radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
  ctx.fill();
}

export function gooeyVisualizer(canvas, ctx, audioArray) {
  const w = canvas.width;
  const h = canvas.height;
  const centerX = w / 2;
  const centerY = h / 2;

  ctx.clearRect(0, 0, w, h);

  // Create a blob of circles that react to audio data
  for (let i = 0; i < 64; i++) {
    const radius = Math.min(audioArray[i], 1) * 50;
    const angle = (i / 63) * Math.PI * 2;
    const x = centerX + Math.cos(angle) * (w / 4);
    const y = centerY + Math.sin(angle) * (h / 4);

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.fill();
  }

  // Apply a blur filter for the gooey effect
  ctx.filter = "blur(15px)";
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(canvas, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
}

export function blockVisualizer(canvas, ctx, audioArray) {
  const w = canvas.width;
  const h = canvas.height;
  const blockSize = Math.floor(Math.min(w, h) / 8); // Define block size based on canvas size

  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < 64; i++) {
    const x = (i % 8) * blockSize;
    const y = Math.floor(i / 8) * blockSize;
    const amplitude = Math.min(audioArray[i], 1);
    const colorValue = Math.floor(amplitude * 255);

    ctx.fillStyle = `rgb(${colorValue}, ${colorValue}, ${colorValue})`;
    ctx.fillRect(x, y, blockSize, blockSize);
  }

  for (let i = 64; i < 128; i++) {
    const x = ((i - 64) % 8) * blockSize + blockSize / 2;
    const y = Math.floor((i - 64) / 8) * blockSize + blockSize / 2;
    const amplitude = Math.min(audioArray[i], 1);
    const colorValue = Math.floor(amplitude * 255);

    ctx.fillStyle = `rgb(${255 - colorValue}, ${255 - colorValue}, ${
      255 - colorValue
    })`;
    ctx.fillRect(x, y, blockSize, blockSize);
  }
}

export function fireworksVisualizer(canvas, ctx, audioArray) {
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < 10; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const maxParticles = Math.floor(Math.min(audioArray[i * 6]) * 50);

    for (let j = 0; j < maxParticles; j++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1;
      const xOffset = Math.cos(angle) * speed;
      const yOffset = Math.sin(angle) * speed;

      ctx.beginPath();
      ctx.arc(x + xOffset * 10, y + yOffset * 10, 2, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${Math.random() * 360}, 100%, 50%)`;
      ctx.fill();
    }
  }
}

export function circularPulseVisualizer(canvas, ctx, audioArray) {
  const w = canvas.width;
  const h = canvas.height;
  const centerX = w / 2;
  const centerY = h / 2;

  ctx.clearRect(0, 0, w, h);

  const maxRadius = Math.min(w, h) / 2;
  const baseRadius = maxRadius / 8;

  for (let i = 0; i < 8; i++) {
    const amplitude = Math.min((audioArray[i * 8] + audioArray[i * 8 + 64]) / 2, 1);
    const radius = baseRadius + amplitude * maxRadius;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 + amplitude * 0.9})`;
    ctx.shadowColor = "rgba(0, 0, 0, 255)";
    ctx.lineWidth = 10;
    ctx.stroke();
  }
  ctx.shadowColor = "rgba(0, 0, 0, 0)";
}

export function textVisualizer(canvas, ctx, audioArray, text) {
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const fontSize = 30 + Math.min(audioArray[32], 1) * 100;
  ctx.font = `${fontSize}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = `hsl(${Math.min(audioArray[64], 1) * 360}, 100%, 50%)`;
  ctx.fillText(text, w / 2, h / 2);

  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 10;
  ctx.fillText(text, w / 2, h / 2);
}

export function spiralVisualizer(canvas, ctx, audioArray) {
  const w = canvas.width;
  const h = canvas.height;
  const centerX = w / 2;
  const centerY = h / 2;

  ctx.clearRect(0, 0, w, h);

  const maxRadius = Math.min(w, h) / 2;
  const dotCount = 100;

  for (let i = 0; i < dotCount; i++) {
    const angle = i * 0.2 + Math.min(audioArray[i % 64], 1) * Math.PI * 2;
    const radius = (i / dotCount) * maxRadius;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${i * 3.6}, 100%, 50%)`;
    ctx.fill();
  }
}

export function radialSpikesVisualizer(canvas, ctx, audioArray) {
  const w = canvas.width;
  const h = canvas.height;
  const centerX = w / 2;
  const centerY = h / 2;

  ctx.clearRect(0, 0, w, h);

  const spikeCount = 64;
  const maxSpikeLength = Math.min(w, h) / 2;

  for (let i = 0; i < spikeCount; i++) {
    const angle = (i / spikeCount) * Math.PI * 2;
    const spikeLength = Math.min(audioArray[i], 1) * maxSpikeLength;
    const xEnd = centerX + Math.cos(angle) * spikeLength;
    const yEnd = centerY + Math.sin(angle) * spikeLength;

    ctx.strokeStyle = `hsl(${i * 5}, 100%, 50%)`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(xEnd, yEnd);
    ctx.stroke();
  }
}

export function rotatingCubesVisualizer(canvas, ctx, audioArray) {
  const w = canvas.width;
  const h = canvas.height;
  const cubeSize = Math.min(w, h) / 10;

  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < 8; i++) {
    const size = cubeSize * (1 + Math.min(audioArray[i * 8], 1) * 2);
    const x = (i % 4) * (w / 4) + w / 8;
    const y = Math.floor(i / 4) * (h / 2) + h / 4;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.min(audioArray[i * 8], 1) * Math.PI * 2);
    ctx.strokeStyle = `hsl(${i * 45}, 100%, 50%)`;
    ctx.lineWidth = 3;
    ctx.strokeRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  }
}

export function gooeyWaveVisualizerBW(canvas, ctx, audioArray) {
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Create a path for the wave
  ctx.beginPath();
  ctx.moveTo(0, h / 2);

  for (let i = 0; i < 64; i++) {
    const x = (i / 63) * w;
    const y = h / 2 + (Math.min((audioArray[i] + audioArray[i + 64] / 2), 1) * h) / 4;
    ctx.lineTo(x, y);
  }

  // Complete the path to the bottom of the canvas
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();

  // Set the fill color with a gooey gradient effect
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.8)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0.2)");
  ctx.fillStyle = gradient;
  ctx.fill();

  // Apply a blur filter for the gooey effect
  ctx.filter = "blur(10px)";
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(canvas, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";

  // Optionally, add an outline to the wave
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function gooeyWaveVisualizer2(canvas, ctx, audioArray) {
  const w = canvas.width;
  const h = canvas.height;
  const waveHeight = h / 2; // Base height for the wave

  ctx.clearRect(0, 0, w, h);

  // Start drawing the wave path
  ctx.beginPath();
  ctx.moveTo(0, waveHeight);

  for (let i = 0; i < 64; i++) {
    const x = (i / 63) * w;
    const frequency = Math.min(audioArray[i]);
    const y = waveHeight + frequency * waveHeight * 0.5;

    ctx.lineTo(x, y);
  }

  // Complete the wave path
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();

  // Fill the wave with a smooth color
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, "rgba(0, 150, 255, 0.8)");
  gradient.addColorStop(1, "rgba(0, 255, 150, 0.5)");
  ctx.fillStyle = gradient;
  ctx.fill();

  // Apply a blur filter for the gooey effect
  ctx.filter = "blur(10px)";
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(canvas, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";

  // Optionally, add an outline to the wave
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw the top of the wave again for a sharp top edge
  ctx.beginPath();
  ctx.moveTo(0, waveHeight);

  for (let i = 0; i < 64; i++) {
    const x = (i / 63) * w;
    const frequency = Math.min(audioArray[i], 1);
    const y = waveHeight + frequency * waveHeight * 0.5;

    ctx.lineTo(x, y);
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 1)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function gooeyWaveVisualizer(canvas, ctx, audioArray, surfaceColor="rgba(0, 150, 255, 0.8)", waveColor="rgba(0, 255, 150, 0.5)", outlineColor="rgba(0, 255, 150, 0.5)") {
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Base wave height
  const waveBaseHeight = h * 0.9;
  const waveAmplitude = h / 4;

  // Begin the path for the gooey wave
  ctx.beginPath();
  ctx.moveTo(0, h); // Start from the bottom left corner

  // Loop through the audio array to create the wave
  for (let i = 0; i < 64; i++) {
    const x = (i / 63) * w;
    const frequency = Math.min(audioArray[i], 1);
    const y = waveBaseHeight - frequency * waveAmplitude;

    ctx.lineTo(x, y);
  }

  // Complete the path by drawing to the bottom right corner
  ctx.lineTo(w, h);
  ctx.closePath();

  // Fill the wave with a gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, surfaceColor);
  gradient.addColorStop(1, waveColor);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Apply a blur filter for the gooey effect
  ctx.filter = "blur(8px)";
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(canvas, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";

  // Optionally, add a smooth outline to the wave for a more defined shape
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function waterPuddleVisualizer(canvas, ctx, audioArray, options = {}) {
  const w = canvas.width;
  const h = canvas.height;
  const centerY = h / 2;
  const waveAmplitude = h / 4; // Maximum wave height

  // Clear the canvas
  ctx.clearRect(0, 0, w, h);

  // Save the current state
  ctx.save();

  // Apply blur for the gooey effect
  ctx.filter = "blur(20px)";

  // Set blending mode to achieve the gooey appearance
  ctx.globalCompositeOperation = "lighter";

  // Draw multiple overlapping waves for depth
  for (let i = 0; i < 3; i++) {
    drawWave(ctx, w, h, audioArray, i, options.surfaceColor || undefined, options.waterColor || undefined);
  }

  // Restore to default state
  ctx.restore();

  // Optionally, draw the top outline without blur for definition
  drawWave(ctx, w, h, audioArray, 0, true, options.surfaceColor || undefined, options.waterColor || undefined);
}

function drawWave(
  ctx,
  width,
  height,
  audioData,
  layer = 0,
  strokeOnly = false,
  surfaceColor = "rgba(0, 150, 255, 0.6)",
  waterColor = "rgba(0, 255, 150, 0.2)"
) {
  const waveAmplitude = height / 4;
  const points = 64; // Number of points in the wave
  const sliceWidth = width / (points - 1);
  const offsetY = height / 2 + layer * 10; // Slight vertical offset for layering

  ctx.beginPath();
  ctx.moveTo(0, offsetY);

  // Create smooth curves using quadratic Bézier
  for (let i = 0; i < points; i++) {
    const x = i * sliceWidth;
    const y = offsetY + Math.min((audioData[i] + audioData[i + 64]) / 2, 1) * waveAmplitude;

    if (i === 0) {
      ctx.lineTo(x, y);
    } else {
      const prevX = (i - 1) * sliceWidth;
      const prevY = offsetY + Math.min((audioData[i - 1] + audioData[i - 1 + 64])/2, 1) * waveAmplitude;
      const cpX = (prevX + x) / 2;
      const cpY = (prevY + y) / 2;
      ctx.quadraticCurveTo(prevX, prevY, cpX, cpY);
    }
  }

  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();

  if (!strokeOnly) {
    // Gradient fill for the wave
    const gradient = ctx.createLinearGradient(
      0,
      offsetY - waveAmplitude,
      0,
      height
    );
    gradient.addColorStop(0, surfaceColor);
    gradient.addColorStop(1, waterColor);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  if (strokeOnly) {
    // Draw the wave outline without filling
    ctx.beginPath();
    ctx.moveTo(0, offsetY);

    for (let i = 0; i < points; i++) {
      const x = i * sliceWidth;
      const y = offsetY + Math.min((audioData[i - 1] + audioData[i - 1 + 64])/2, 1) * waveAmplitude;

      if (i === 0) {
        ctx.lineTo(x, y);
      } else {
        const prevX = (i - 1) * sliceWidth;
        const prevY = offsetY + Math.min((audioData[i - 1] + audioData[i - 1 + 64])/2, 1) * waveAmplitude;
        const cpX = (prevX + x) / 2;
        const cpY = (prevY + y) / 2;
        ctx.quadraticCurveTo(prevX, prevY, cpX, cpY);
      }
    }

    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export function dotJumpVisualizer(canvas, ctx, audioArray) {
  const w = canvas.width;
  const h = canvas.height;

  const gap = 2;
  const dotSize = w / 32 - gap; // Width of each bar, adjusted for gap
  const maxAmplitude = 1;

  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < 64; i += 2) {
    const x = i * (dotSize + gap) + (gap + dotSize / 2);
    const amplitude = Math.min((audioArray[i] + audioArray[i + 64]) / 2, maxAmplitude);
    const y = Math.min(h - dotSize, h - amplitude * h * 0.7 - dotSize);

    ctx.beginPath();
    ctx.arc(x, y, dotSize / 2, 0, Math.PI * 2);
    const glowSize = 100;
    ctx.shadowBlur = Math.min(glowSize, glowSize * amplitude); // Increase this value for a stronger glow
    ctx.shadowColor = "white";
    // const colorValue = Math.floor(amplitude * (255 - 200)) + 200;
    const colorValue = 255;

    ctx.fillStyle = `rgba(${colorValue}, ${colorValue}, ${colorValue}, 255)`;
    ctx.fill();
    ctx.closePath();
  }
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
}
