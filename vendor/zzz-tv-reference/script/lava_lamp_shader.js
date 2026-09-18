function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(
      `Error compiling ${
        type === gl.VERTEX_SHADER ? "vertex" : "fragment"
      } shader:`,
      gl.getShaderInfoLog(shader)
    );
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Error linking program:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function getRandomColor() {
  return [Math.random(), Math.random(), Math.random()];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function createLavaLampShader(
  width,
  height,
  colors = null,
  minNumBlobs = 3, // Minimum number of blobs
  maxNumBlobs = 10, // Maximum number of blobs
  fpsLimit = 15 // FPS limit
) {
  return () => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.classList.add("lava-lamp-container");

    // Random number of blobs between minNumBlobs and maxNumBlobs
    const numBlobs = randomInt(minNumBlobs, maxNumBlobs);

    let gl = canvas.getContext("webgl");
    if (!gl) {
      console.error("WebGL not supported, falling back on experimental-webgl");
      gl = canvas.getContext("experimental-webgl");
    }
    if (!gl) {
      alert("Your browser does not support WebGL");
      return null;
    }

    // Set the background color (RGBA: red, green, blue, alpha)
    gl.clearColor(0.2, 0.2, 0.2, 1.0); // Light gray background

    const vertexShaderSource = `
      precision mediump float;
      attribute vec2 a_position;
      varying vec2 v_uv;

      void main() {
          v_uv = a_position * 0.5 + 0.5; // Normalize coordinates to [0, 1]
          gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fragmentShaderSource = `
      precision mediump float;
      #define NUM_BLOBS ${numBlobs} // Random number of blobs
      uniform vec3 u_colors[NUM_BLOBS];
      uniform vec2 u_positions[NUM_BLOBS];
      uniform float u_radii[NUM_BLOBS];
      varying vec2 v_uv;

      void main() {
          vec2 uv = v_uv;
          float value = 0.0;
          vec3 color = vec3(0.0);

          for (int i = 0; i < NUM_BLOBS; i++) {
              float dist = length(uv - u_positions[i]);
              float blobValue = exp(-dist * dist / (u_radii[i] * u_radii[i]));
              value += blobValue;
              color += u_colors[i] * blobValue;
          }

          float threshold = 0.5;
          float alpha = step(threshold, value);
          gl_FragColor = vec4(color * alpha, alpha);
      }
    `;

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    if (!vertexShader) return null;

    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    if (!fragmentShader) return null;

    const program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) return null;

    const positionAttributeLocation = gl.getAttribLocation(program, "a_position");
    const colorsUniformLocation = gl.getUniformLocation(program, "u_colors");
    const positionsUniformLocation = gl.getUniformLocation(program, "u_positions");
    const radiiUniformLocation = gl.getUniformLocation(program, "u_radii");

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    const positionsArray = [
      -1.0, -1.0, // Bottom-left
       1.0, -1.0, // Bottom-right
      -1.0,  1.0, // Top-left
      -1.0,  1.0, // Top-left
       1.0, -1.0, // Bottom-right
       1.0,  1.0  // Top-right
    ];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positionsArray), gl.STATIC_DRAW);

    // Initialize blob positions, velocities, radii, and colors
    let blobData = [];
    for (let i = 0; i < numBlobs; i++) {
      blobData.push({
        position: [
          Math.random(), // X position between 0 and 1
          Math.random()  // Y position between 0 and 1
        ],
        velocity: [
          0.1 * (Math.random() - 0.5), // X velocity
          0.1 * (Math.random() - 0.5)  // Y velocity
        ],
        radius: 0.05 + Math.random() * 0.05, // Radius between 0.1 and 0.2
        color: colors ? colors[i % colors.length] : getRandomColor(),
      });
    }

    let lastFrameTime = performance.now();
    const fpsInterval = 1000 / fpsLimit;

    function updateBlobs(deltaTime) {
      for (let blob of blobData) {
        // Only update the position based on velocity and deltaTime
        blob.position[0] += blob.velocity[0] * deltaTime;
        blob.position[1] += blob.velocity[1] * deltaTime;
    
        // Bounce off walls (ensure position stays within bounds)
        if (blob.position[0] - blob.radius <= 0.0 || blob.position[0] + blob.radius >= 1.0) {
          blob.velocity[0] *= -1;
        }
        if (blob.position[1] - blob.radius <= 0.0 || blob.position[1] + blob.radius >= 1.0) {
          blob.velocity[1] *= -1;
        }
    
        // **DO NOT** modify `blob.radius` with `deltaTime`
        // Keep the radius constant as originally set.
      }
    }

    function render() {
      const positions = blobData
        .map((blob) => blob.position)
        .flat();
      const radii = blobData.map((blob) => blob.radius);
      const colorsArray = blobData.map((blob) => blob.color).flat();

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.enableVertexAttribArray(positionAttributeLocation);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

      gl.uniform3fv(colorsUniformLocation, colorsArray);
      gl.uniform2fv(positionsUniformLocation, positions);
      gl.uniform1fv(radiiUniformLocation, radii);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function animate(currentTime) {
      const elapsed = currentTime - lastFrameTime;

      if (elapsed >= fpsInterval) {
        const deltaTime = elapsed / 1000; // Convert to seconds

        updateBlobs(deltaTime);
        render();

        lastFrameTime = currentTime - (elapsed % fpsInterval);
      }

      requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);

    return canvas;
  };
}
