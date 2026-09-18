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

export function createAnimationGridShader(
  containerWidth,
  containerHeight,
  numCols,
  numRows,
  gap,
  color = [0.0, 1.0, 1.0],
  fpsLimit = 15 // Added fps limit as a parameter
) {
  return () => {
    const canvas = document.createElement("canvas");
    canvas.width = containerWidth;
    canvas.height = containerHeight;
    canvas.classList.add("animated-grid-container");

    let gl = canvas.getContext("webgl");
    if (!gl) {
      console.error("WebGL not supported, falling back on experimental-webgl");
      gl = canvas.getContext("experimental-webgl");
    }
    if (!gl) {
      alert("Your browser does not support WebGL");
      return null;
    }

    const vertexShaderSource = `
      precision mediump float;
      attribute vec2 a_position;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform vec2 u_translation;
      uniform vec2 u_scale;
      varying vec2 v_position;
      varying vec2 v_gridPosition;
  
      void main() {
          vec2 position = a_position * u_scale + u_translation;
          vec2 zeroToOne = position / u_resolution;
          vec2 zeroToTwo = zeroToOne * 2.0;
          vec2 clipSpace = zeroToTwo - 1.0;
  
          gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
          v_position = a_position;
          v_gridPosition = u_translation / u_resolution;
      }
    `;

    const fragmentShaderSource = `
      precision mediump float;
      uniform vec3 u_color;
      uniform float u_time;
      varying vec2 v_position;
      varying vec2 v_gridPosition;

      void main() {
          float delay = sin(v_gridPosition.x * 10.0 + v_gridPosition.y * 10.0) * 0.5 + 0.5;
          float animationTime = mod(u_time + delay * 2.0, 4.0); 
          float scale = step(1.0, animationTime) * step(animationTime, 2.0) * (1.0 - abs(animationTime - 1.5));
          float opacity = step(1.0, animationTime) * step(animationTime, 2.0) * (1.0 - abs(animationTime - 1.5));
          gl_FragColor = vec4(u_color * scale, opacity);
      }
    `;

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    if (!vertexShader) return null;

    const fragmentShader = createShader(
      gl,
      gl.FRAGMENT_SHADER,
      fragmentShaderSource
    );
    if (!fragmentShader) return null;

    const program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) return null;

    const positionAttributeLocation = gl.getAttribLocation(
      program,
      "a_position"
    );
    const resolutionUniformLocation = gl.getUniformLocation(
      program,
      "u_resolution"
    );
    const colorUniformLocation = gl.getUniformLocation(program, "u_color");
    const timeUniformLocation = gl.getUniformLocation(program, "u_time");
    const translationUniformLocation = gl.getUniformLocation(
      program,
      "u_translation"
    );
    const scaleUniformLocation = gl.getUniformLocation(program, "u_scale");

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    const squareVertices = [
      -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    ];

    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(squareVertices),
      gl.STATIC_DRAW
    );

    let lastFrameTime = 0;
    let fpsInterval = 1000 / fpsLimit; // Time between frames (in milliseconds)

    function render(time) {
      // Convert to seconds for uniform time usage
      time *= 0.001;

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.enableVertexAttribArray(positionAttributeLocation);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(
        positionAttributeLocation,
        2,
        gl.FLOAT,
        false,
        0,
        0
      );

      gl.uniform2f(
        resolutionUniformLocation,
        gl.canvas.width,
        gl.canvas.height
      );
      gl.uniform3fv(colorUniformLocation, color);
      gl.uniform1f(timeUniformLocation, time);

      const maxWidth = gl.canvas.width / numCols - gap;
      const maxHeight = gl.canvas.height / numRows - gap;

      for (let y = 0; y < numRows; y++) {
        for (let x = 0; x < numCols; x++) {
          const offsetX = x * (maxWidth + gap) + maxWidth / 2;
          const offsetY = y * (maxHeight + gap) + maxHeight / 2;
          gl.uniform2f(translationUniformLocation, offsetX, offsetY);

          const scaleX = maxWidth;
          const scaleY = maxHeight;
          gl.uniform2f(scaleUniformLocation, scaleX, scaleY);

          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
      }
    }

    function animate(currentTime) {
      const timeSinceLastFrame = currentTime - lastFrameTime;

      if (timeSinceLastFrame > fpsInterval) {
        // Update the last frame time
        lastFrameTime = currentTime - (timeSinceLastFrame % fpsInterval);

        // Render the frame
        render(currentTime);
      }

      // Continue the animation loop
      requestAnimationFrame(animate);
    }

    // Start the animation
    requestAnimationFrame(animate);

    return canvas;
  };
}
