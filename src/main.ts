import { MwangaEngine } from "./engine/engine.ts";
import { LINE_FRAG, LINE_VERT, LIT_FRAG, LIT_VERT, ShaderProgram, createWhiteTexture } from "./engine/gl.ts";
import {
  createMat4,
  mat4LookAt,
  mat4Multiply,
  mat4Perspective,
  mat4TRS,
  type Vec3,
} from "./engine/math.ts";
import { createBoxMesh, createGridMesh, type GpuMesh } from "./engine/mesh.ts";

const canvas = document.getElementById("mwanga-canvas") as HTMLCanvasElement;
const hud = document.getElementById("hud") as HTMLDivElement;

let litProgram: ShaderProgram;
let lineProgram: ShaderProgram;
let boxMesh: GpuMesh;
let gridMesh: GpuMesh;

const proj = createMat4();
const view = createMat4();
const viewProj = createMat4();
const model = createMat4();

const camPos: Vec3 = { x: 0, y: 2.5, z: 6.5 };
const camTarget: Vec3 = { x: 0, y: 0.6, z: 0 };
const up: Vec3 = { x: 0, y: 1, z: 0 };

let yaw = 0;
let pitch = -0.25;
let orbitDist = 6.5;
let pulse = 0;

const cubes = [
  { x: 0, y: 0.9, z: 0, scale: 1.0, color: [0.96, 0.62, 0.22] as const, speed: 0.9 },
  { x: -2.2, y: 0.6, z: -1.1, scale: 0.65, color: [0.28, 0.78, 0.95] as const, speed: 1.4 },
  { x: 2.2, y: 0.6, z: 1.0, scale: 0.65, color: [0.45, 0.9, 0.55] as const, speed: -1.2 },
];

const engine = new MwangaEngine(canvas, {
  onInit(eng) {
    const gl = eng.gl;
    litProgram = new ShaderProgram(gl, LIT_VERT, LIT_FRAG);
    lineProgram = new ShaderProgram(gl, LINE_VERT, LINE_FRAG);
    boxMesh = createBoxMesh(gl, 1);
    gridMesh = createGridMesh(gl, 12, 1);
    gl.clearColor(0.05, 0.07, 0.1, 1.0);
    const whiteTex = createWhiteTexture(gl);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, whiteTex);
  },

  onUpdate(dt, elapsed, eng) {
    const { input, audio } = eng;

    // Orbit with mouse drag or arrow keys
    if (input.isMouseDown(0)) {
      yaw -= input.mouseDeltaX * 0.006;
      pitch = Math.max(-1.2, Math.min(0.4, pitch - input.mouseDeltaY * 0.006));
    }
    yaw -= input.getAxis("ArrowLeft", "ArrowRight") * dt * 1.8;
    pitch = Math.max(-1.2, Math.min(0.4, pitch + input.getAxis("ArrowDown", "ArrowUp") * dt * 1.4));

    if (input.wheelDelta !== 0) {
      orbitDist = Math.max(2.5, Math.min(18, orbitDist + input.wheelDelta * 0.005));
    }

    // Move target on XZ plane with WASD
    const moveX = input.getAxis("KeyA", "KeyD");
    const moveZ = input.getAxis("KeyW", "KeyS");
    if (moveX !== 0 || moveZ !== 0) {
      const sinY = Math.sin(yaw);
      const cosY = Math.cos(yaw);
      const speed = 5 * dt;
      camTarget.x += (moveX * cosY + moveZ * sinY) * speed;
      camTarget.z += (-moveX * sinY + moveZ * cosY) * speed;
    }

    if (input.wasKeyPressed("Space")) {
      pulse = 1;
      audio.playTone(523.25, 0.18, "triangle", 0.45);
    }
    pulse = Math.max(0, pulse - dt * 3);

    const cp = Math.cos(pitch);
    camPos.x = camTarget.x + Math.sin(yaw) * cp * orbitDist;
    camPos.y = camTarget.y - Math.sin(pitch) * orbitDist;
    camPos.z = camTarget.z + Math.cos(yaw) * cp * orbitDist;

    mat4Perspective(proj, (60 * Math.PI) / 180, eng.aspect, 0.1, 120);
    mat4LookAt(view, camPos, camTarget, up);
    mat4Multiply(viewProj, proj, view);

    hud.textContent =
      `mwanga 0.1.0 | ${eng.fps} FPS (${eng.frameTimeMs} ms) | ${eng.width}x${eng.height}\n` +
      `WASD: move | Drag / Arrows: orbit | Wheel: zoom | Space: chime`;
    hud.style.whiteSpace = "pre";

    void elapsed;
  },

  onRender(eng) {
    const gl = eng.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Ground grid
    lineProgram.use();
    gl.uniformMatrix4fv(lineProgram.uniform("uViewProj"), false, viewProj);
    gl.uniform3f(lineProgram.uniform("uColor"), 0.18, 0.24, 0.34);
    gridMesh.draw();

    // Lit cubes
    litProgram.use();
    gl.uniformMatrix4fv(litProgram.uniform("uViewProj"), false, viewProj);
    gl.uniform3f(litProgram.uniform("uLightDir"), 0.6, 1.0, 0.5);
    gl.uniform1f(litProgram.uniform("uUseTexture"), 0.0);
    gl.uniform1i(litProgram.uniform("uBaseColorMap"), 0);

    const t = performance.now() * 0.001;
    for (let i = 0; i < cubes.length; i++) {
      const c = cubes[i];
      const s = c.scale + (i === 0 ? pulse * 0.25 : 0);
      const bob = Math.sin(t * 2 + i) * 0.15;
      mat4TRS(model, c.x, c.y + bob, c.z, t * 0.5 * c.speed, t * c.speed, 0, s, s, s);
      gl.uniformMatrix4fv(litProgram.uniform("uModel"), false, model);
      gl.uniform3f(litProgram.uniform("uColor"), c.color[0], c.color[1], c.color[2]);
      boxMesh.draw();
    }
  },
});

engine.start();
