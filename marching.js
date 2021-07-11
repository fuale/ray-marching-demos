/**
 * @format
 */

import fragment from "./shader.frag";
import vertex from "./shader.vert";

let ratio = window.devicePixelRatio || 1;
let canvas = document.querySelector(".vessel");
canvas.width = canvas.clientWidth * ratio;
canvas.height = canvas.clientHeight * ratio;

/** @type {WebGL2RenderingContext} */
let gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");

// Some static consts
const { ARRAY_BUFFER, STATIC_DRAW } = gl;

// Geometry
let vertices = [-1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0];

let vbuffer = gl.createBuffer();
gl.bindBuffer(ARRAY_BUFFER, vbuffer);
gl.bufferData(ARRAY_BUFFER, new Float32Array(vertices), STATIC_DRAW);

// Vertex Shader
let vshader = gl.createShader(gl.VERTEX_SHADER);

gl.shaderSource(vshader, vertex);
gl.compileShader(vshader);

// Fragment Shader
let fshader = gl.createShader(gl.FRAGMENT_SHADER);

gl.shaderSource(fshader, fragment);
gl.compileShader(fshader);
if (!gl.getShaderParameter(fshader, gl.COMPILE_STATUS)) {
  throw new Error(gl.getShaderInfoLog(fshader));
}

// Program
let program = gl.createProgram();
gl.attachShader(program, vshader);
gl.attachShader(program, fshader);
gl.linkProgram(program);
gl.useProgram(program);

// Geometry to program
let xy = gl.getAttribLocation(program, "a_position");
gl.vertexAttribPointer(xy, 2, gl.FLOAT, false, 0, 0);
gl.enableVertexAttribArray(xy);

// Size
let size = gl.getUniformLocation(program, "u_size");
gl.uniform2fv(size, [canvas.width, canvas.height]);

// Time
let time = gl.getUniformLocation(program, "u_time");

// Mouse tracking
let u_mouse = gl.getUniformLocation(program, "u_mouse");
let mouse = [0, 0];

window.addEventListener("mousemove", (e) => {
  mouse = [
    (e.clientX * ratio) / canvas.width,
    (canvas.height - e.clientY * ratio) / canvas.height,
  ];
});

// Render
function render() {
  requestAnimationFrame(render);
  gl.clearColor(0.265625, 0.17578125, 0.94921875, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.uniform1f(time, window.performance.now() / 1000);
  gl.uniform2fv(u_mouse, mouse);
  gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

render();
