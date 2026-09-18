// shader.js
import { debounce } from "./utils.js";
const vertexShaderSource = `
    attribute vec4 a_position;
    void main() {
        gl_Position = a_position;
    }
`;

const fragmentShaderSource = `
    precision mediump float;
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_pixelSize;

    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233) + u_time * 0.01)) * 43758.5453123);
    }

    void main() {
        // Normalize pixel coordinates
        vec2 st = gl_FragCoord.xy / u_resolution;

        // Scale the coordinates to control the pixel size
        st = floor(st * u_pixelSize) / u_pixelSize;

        // Calculate noise value
        float noiseValue = random(st);

        gl_FragColor = vec4(vec3(noiseValue), 1.0);
    }
`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Error compiling shader:', gl.getShaderInfoLog(shader));
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
        console.error('Error linking program:', gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    return program;
}

export class NoiseShader {
    constructor(canvas, wallpaperSettings) {
        this.canvas = canvas;
        this.wallpaperSettings = wallpaperSettings;
        // this.setWallpaperSettingsDebounce = debounce(this.setWallpaperSettings.bind(this), 3000)
        this.gl = this.canvas.getContext('webgl');
        if (!this.gl) {
            console.error('WebGL not supported, falling back on experimental-webgl');
            this.gl = this.canvas.getContext('experimental-webgl');
        }
        if (!this.gl) {
            alert('Your browser does not support WebGL');
        }

        const vertexShader = createShader(this.gl, this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = createShader(this.gl, this.gl.FRAGMENT_SHADER, fragmentShaderSource);
        this.program = createProgram(this.gl, vertexShader, fragmentShader);

        this.positionAttributeLocation = this.gl.getAttribLocation(this.program, 'a_position');
        this.timeUniformLocation = this.gl.getUniformLocation(this.program, 'u_time');
        this.resolutionUniformLocation = this.gl.getUniformLocation(this.program, 'u_resolution');
        this.pixelSizeUniformLocation = this.gl.getUniformLocation(this.program, 'u_pixelSize');

        this.positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            -1, 1,
            1, -1,
            1, 1
        ]), this.gl.STATIC_DRAW);

        this.lastTime = performance.now() / 1000;
        this.fpsThreshold = 0;

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    setWallpaperSettings(wallpaperSettings) {
        this.wallpaperSettings = wallpaperSettings;
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
    }

    render(time) {
        time *= 0.001;  // Convert to seconds

        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        this.gl.useProgram(this.program);

        this.gl.enableVertexAttribArray(this.positionAttributeLocation);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.vertexAttribPointer(this.positionAttributeLocation, 2, this.gl.FLOAT, false, 0, 0);

        this.gl.uniform1f(this.timeUniformLocation, time);
        this.gl.uniform2f(this.resolutionUniformLocation, this.canvas.width, this.canvas.height);
        this.gl.uniform1f(this.pixelSizeUniformLocation, 500.0);  // Adjust this value to control the pixel size

        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    }

    animate() {
        const now = performance.now() / 1000;
        const dt = now - this.lastTime;
        this.lastTime = now;

        // // If there is an FPS limit, abort updating the animation if we have reached the desired FPS
        if (this.wallpaperSettings.fps > 0) {
            this.fpsThreshold += dt;
            if (this.fpsThreshold < 1.0 / this.wallpaperSettings.fps) {
                requestAnimationFrame(this.animate.bind(this));
                return;
            }
            this.fpsThreshold -= 1.0 / this.wallpaperSettings.fps; 
        }

        this.render(performance.now());
        requestAnimationFrame(this.animate.bind(this));
    }
}
