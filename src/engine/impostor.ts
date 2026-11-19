import { ShaderProgram } from "./gl.ts";
import type { GlbModel } from "./gltf.ts";
import {
  createMat4,
  mat4LookAt,
  mat4Multiply,
  mat4Perspective,
  mat4TRS,
  type Mat4,
} from "./math.ts";

export interface ImpostorAtlas {
  texture: WebGLTexture;
  angles: number;
  frameSize: number;
  dispose(): void;
}

const IMPOSTOR_VERT = `#version 300 es
precision highp float;

// Per-vertex quad (-0.5..0.5, 0..1)
layout(location = 0) in vec2 aCorner;
// Per-instance: xyz = worldPos, w = scale
layout(location = 1) in vec4 aInstPosScale;
// Per-instance: x = yawRad, y = tintR, z = tintG, w = tintB
layout(location = 2) in vec4 aInstYawTint;

uniform mat4 uViewProj;
uniform vec3 uCamPos;
uniform vec3 uCamRight;
uniform float uAngles;

out vec2 vUv;
out vec3 vTint;
out float vViewDist;

void main() {
  vec3 worldCenter = aInstPosScale.xyz;
  float scale = aInstPosScale.w;

  // Cylindrical billboard: face camera horizontally, stay upright on +Y
  vec3 toCam = normalize(vec3(uCamPos.x - worldCenter.x, 0.0, uCamPos.z - worldCenter.z));
  vec3 right = length(toCam) > 0.001 ? normalize(cross(vec3(0.0, 1.0, 0.0), toCam)) : uCamRight;

  vec3 worldPos = worldCenter + right * (aCorner.x * scale) + vec3(0.0, aCorner.y * scale, 0.0);

  // Pick nearest baked yaw frame based on camera angle vs entity facing yaw
  float camAngle = atan(toCam.x, toCam.z);
  float relAngle = camAngle - aInstYawTint.x;
  float normAngle = mod(relAngle / 6.28318530718 + 1.0, 1.0);
  float frameIdx = floor(mod(normAngle * uAngles + 0.5, uAngles));

  float uMin = frameIdx / uAngles;
  float uWidth = 1.0 / uAngles;
  vUv = vec2(uMin + (aCorner.x + 0.5) * uWidth, 1.0 - aCorner.y);
  vTint = aInstYawTint.yzw;

  vec4 clipPos = uViewProj * vec4(worldPos, 1.0);
  vViewDist = length(uCamPos - worldPos);
  gl_Position = clipPos;
}
`;

const IMPOSTOR_FRAG = `#version 300 es
precision mediump float;

in vec2 vUv;
in vec3 vTint;
in float vViewDist;

uniform sampler2D uAtlas;
uniform vec3 uFogColor;
uniform float uFogStart;
uniform float uFogEnd;

out vec4 outColor;

void main() {
  vec4 texel = texture(uAtlas, vUv);
  if (texel.a < 0.35) discard;
  vec3 color = texel.rgb * vTint;
  float fog = clamp((vViewDist - uFogStart) / max(0.001, uFogEnd - uFogStart), 0.0, 1.0);
  color = mix(color, uFogColor, fog);
  outColor = vec4(color, 1.0);
}
`;

/**
 * Bakes any 3D GlbModel into an N-angle RGBA sprite atlas texture on the GPU.
 */
export function bakeGlbToImpostorAtlas(
  gl: WebGL2RenderingContext,
  model: GlbModel,
  litProgram: ShaderProgram,
  angles = 8,
  frameSize = 256,
  celShaded = true
): ImpostorAtlas {
  const width = frameSize * angles;
  const height = frameSize;

  const texture = gl.createTexture();
  const fbo = gl.createFramebuffer();
  const depthRb = gl.createRenderbuffer();
  if (!texture || !fbo || !depthRb) {
    throw new Error("Failed to allocate impostor baker FBO resources.");
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);

  const prevClear = gl.getParameter(gl.COLOR_CLEAR_VALUE) as Float32Array;
  const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const proj = createMat4();
  const view = createMat4();
  const viewProj = createMat4();
  const modelMat = createMat4();
  mat4Perspective(proj, (38 * Math.PI) / 180, 1.0, 0.1, 30);
  mat4TRS(modelMat, 0, 0, 0, 0, 0, 0, 1, 1, 1);

  litProgram.use();
  gl.uniformMatrix4fv(litProgram.uniform("uModel"), false, modelMat);
  gl.uniform3f(litProgram.uniform("uLightDir"), 0.55, 1.0, 0.65);

  const dist = 3.1;
  for (let i = 0; i < angles; i++) {
    const yaw = (i / angles) * Math.PI * 2;
    gl.viewport(i * frameSize, 0, frameSize, frameSize);
    mat4LookAt(
      view,
      { x: Math.sin(yaw) * dist, y: 1.05, z: Math.cos(yaw) * dist },
      { x: 0, y: 0.75, z: 0 },
      { x: 0, y: 1, z: 0 }
    );
    mat4Multiply(viewProj, proj, view);
    gl.uniformMatrix4fv(litProgram.uniform("uViewProj"), false, viewProj);
    model.draw(litProgram);
  }

  void celShaded;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.generateMipmap(gl.TEXTURE_2D);

  gl.deleteRenderbuffer(depthRb);
  gl.deleteFramebuffer(fbo);

  gl.clearColor(prevClear[0], prevClear[1], prevClear[2], prevClear[3]);
  gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);

  return {
    texture,
    angles,
    frameSize,
    dispose() {
      gl.deleteTexture(texture);
    },
  };
}

/**
 * Draws hundreds/thousands of 3D-oriented impostor sprites in 1 WebGL2 instanced draw call.
 */
export class ImpostorBatchRenderer {
  private readonly program: ShaderProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly quadVbo: WebGLBuffer;
  private readonly quadIbo: WebGLBuffer;
  private readonly instPosVbo: WebGLBuffer;
  private readonly instYawVbo: WebGLBuffer;

  public readonly posScaleData: Float32Array;
  public readonly yawTintData: Float32Array;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    public readonly maxInstances = 2048
  ) {
    this.program = new ShaderProgram(gl, IMPOSTOR_VERT, IMPOSTOR_FRAG);
    this.posScaleData = new Float32Array(maxInstances * 4);
    this.yawTintData = new Float32Array(maxInstances * 4);

    const vao = gl.createVertexArray();
    const quadVbo = gl.createBuffer();
    const quadIbo = gl.createBuffer();
    const instPosVbo = gl.createBuffer();
    const instYawVbo = gl.createBuffer();
    if (!vao || !quadVbo || !quadIbo || !instPosVbo || !instYawVbo) {
      throw new Error("Failed to allocate ImpostorBatchRenderer buffers.");
    }

    this.vao = vao;
    this.quadVbo = quadVbo;
    this.quadIbo = quadIbo;
    this.instPosVbo = instPosVbo;
    this.instYawVbo = instYawVbo;

    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, instPosVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.posScaleData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, instYawVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.yawTintData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);

    gl.bindVertexArray(null);
  }

  public setInstance(
    index: number,
    x: number,
    y: number,
    z: number,
    scale: number,
    yaw: number,
    r = 1,
    g = 1,
    b = 1
  ): void {
    const o = index * 4;
    this.posScaleData[o] = x;
    this.posScaleData[o + 1] = y;
    this.posScaleData[o + 2] = z;
    this.posScaleData[o + 3] = scale;

    this.yawTintData[o] = yaw;
    this.yawTintData[o + 1] = r;
    this.yawTintData[o + 2] = g;
    this.yawTintData[o + 3] = b;
  }

  public draw(
    count: number,
    atlas: ImpostorAtlas,
    viewProj: Mat4,
    camPos: { x: number; y: number; z: number },
    camRight: { x: number; y: number; z: number },
    fogColor: [number, number, number] = [0.05, 0.07, 0.1],
    fogStart = 18,
    fogEnd = 52
  ): void {
    if (count <= 0) return;
    const n = Math.min(count, this.maxInstances);
    const gl = this.gl;

    gl.disable(gl.CULL_FACE);
    this.program.use();

    gl.uniformMatrix4fv(this.program.uniform("uViewProj"), false, viewProj);
    gl.uniform3f(this.program.uniform("uCamPos"), camPos.x, camPos.y, camPos.z);
    gl.uniform3f(this.program.uniform("uCamRight"), camRight.x, camRight.y, camRight.z);
    gl.uniform1f(this.program.uniform("uAngles"), atlas.angles);
    gl.uniform3f(this.program.uniform("uFogColor"), fogColor[0], fogColor[1], fogColor[2]);
    gl.uniform1f(this.program.uniform("uFogStart"), fogStart);
    gl.uniform1f(this.program.uniform("uFogEnd"), fogEnd);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
    gl.uniform1i(this.program.uniform("uAtlas"), 0);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instPosVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.posScaleData.subarray(0, n * 4));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instYawVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.yawTintData.subarray(0, n * 4));

    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, n);
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
  }

  public dispose(): void {
    this.program.dispose();
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteBuffer(this.quadVbo);
    this.gl.deleteBuffer(this.quadIbo);
    this.gl.deleteBuffer(this.instPosVbo);
    this.gl.deleteBuffer(this.instYawVbo);
  }
}
