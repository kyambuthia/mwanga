import type { ShaderProgram } from "./gl.ts";
import { GpuMesh } from "./mesh.ts";

interface GlbJson {
  accessors?: Array<{
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
  }>;
  bufferViews?: Array<{
    buffer: number;
    byteOffset?: number;
    byteLength: number;
    byteStride?: number;
  }>;
  images?: Array<{
    bufferView?: number;
    mimeType?: string;
    uri?: string;
  }>;
  textures?: Array<{ source?: number }>;
  materials?: Array<{
    pbrMetallicRoughness?: {
      baseColorFactor?: [number, number, number, number];
      baseColorTexture?: { index: number };
    };
  }>;
  meshes?: Array<{
    primitives: Array<{
      attributes: Record<string, number>;
      indices?: number;
      material?: number;
    }>;
  }>;
}

export interface GlbPrimitive {
  mesh: GpuMesh;
  baseColor: [number, number, number];
  texture: WebGLTexture | null;
}

export class GlbModel {
  constructor(
    private readonly gl: WebGL2RenderingContext,
    public readonly primitives: GlbPrimitive[]
  ) {}

  public draw(program: ShaderProgram): void {
    const gl = this.gl;
    for (const p of this.primitives) {
      gl.uniform3f(program.uniform("uColor"), p.baseColor[0], p.baseColor[1], p.baseColor[2]);
      if (p.texture) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, p.texture);
        gl.uniform1i(program.uniform("uBaseColorMap"), 0);
        gl.uniform1f(program.uniform("uUseTexture"), 1.0);
      } else {
        gl.uniform1f(program.uniform("uUseTexture"), 0.0);
      }
      p.mesh.draw();
    }
  }

  public dispose(): void {
    const seenTex = new Set<WebGLTexture>();
    for (const p of this.primitives) {
      p.mesh.dispose();
      if (p.texture && !seenTex.has(p.texture)) {
        seenTex.add(p.texture);
        this.gl.deleteTexture(p.texture);
      }
    }
  }
}

const COMPONENT_SIZE: Record<number, number> = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4, // FLOAT
};

const TYPE_COUNT: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
};

function readAccessorFloats(
  gltf: GlbJson,
  bin: ArrayBuffer,
  accessorIdx: number
): Float32Array {
  const acc = gltf.accessors?.[accessorIdx];
  if (!acc || acc.bufferView === undefined) {
    throw new Error(`Invalid accessor ${accessorIdx}`);
  }
  const bv = gltf.bufferViews?.[acc.bufferView];
  if (!bv) throw new Error(`Invalid bufferView ${acc.bufferView}`);

  const comps = TYPE_COUNT[acc.type] ?? 1;
  const compBytes = COMPONENT_SIZE[acc.componentType] ?? 4;
  const stride = bv.byteStride || comps * compBytes;
  const baseOffset = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const view = new DataView(bin);
  const out = new Float32Array(acc.count * comps);

  for (let i = 0; i < acc.count; i++) {
    const off = baseOffset + i * stride;
    for (let c = 0; c < comps; c++) {
      out[i * comps + c] = view.getFloat32(off + c * 4, true);
    }
  }
  return out;
}

function readIndices(
  gltf: GlbJson,
  bin: ArrayBuffer,
  accessorIdx: number
): Uint16Array | Uint32Array {
  const acc = gltf.accessors?.[accessorIdx];
  if (!acc || acc.bufferView === undefined) {
    throw new Error(`Invalid index accessor ${accessorIdx}`);
  }
  const bv = gltf.bufferViews?.[acc.bufferView];
  if (!bv) throw new Error(`Invalid index bufferView ${acc.bufferView}`);

  const baseOffset = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const view = new DataView(bin);
  const use32 = acc.componentType === 5125;
  const out = use32 ? new Uint32Array(acc.count) : new Uint16Array(acc.count);

  for (let i = 0; i < acc.count; i++) {
    if (acc.componentType === 5125) {
      out[i] = view.getUint32(baseOffset + i * 4, true);
    } else if (acc.componentType === 5123) {
      out[i] = view.getUint16(baseOffset + i * 2, true);
    } else {
      out[i] = view.getUint8(baseOffset + i);
    }
  }
  return out;
}

async function decodeTexture(
  gl: WebGL2RenderingContext,
  gltf: GlbJson,
  bin: ArrayBuffer,
  textureIdx: number
): Promise<WebGLTexture | null> {
  const texDef = gltf.textures?.[textureIdx];
  if (texDef?.source === undefined) return null;
  const imgDef = gltf.images?.[texDef.source];
  if (!imgDef || imgDef.bufferView === undefined) return null;
  const bv = gltf.bufferViews?.[imgDef.bufferView];
  if (!bv) return null;

  const bytes = new Uint8Array(bin, bv.byteOffset ?? 0, bv.byteLength);
  const blob = new Blob([bytes], { type: imgDef.mimeType || "image/png" });
  const bitmap = await createImageBitmap(blob);

  const tex = gl.createTexture();
  if (!tex) {
    bitmap.close();
    return null;
  }
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  bitmap.close();
  return tex;
}

export async function loadGlb(
  gl: WebGL2RenderingContext,
  url: string
): Promise<GlbModel> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch GLB ${url}: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const header = new DataView(buffer, 0, 12);

  if (header.getUint32(0, true) !== 0x46546c67) {
    throw new Error(`Not a valid GLB file: ${url}`);
  }

  let offset = 12;
  let gltf: GlbJson | null = null;
  let bin: ArrayBuffer | null = null;

  while (offset + 8 <= buffer.byteLength) {
    const chunkLen = new DataView(buffer, offset, 4).getUint32(0, true);
    const chunkType = new DataView(buffer, offset + 4, 4).getUint32(0, true);
    const chunkData = buffer.slice(offset + 8, offset + 8 + chunkLen);

    if (chunkType === 0x4e4f534a) {
      gltf = JSON.parse(new TextDecoder().decode(chunkData)) as GlbJson;
    } else if (chunkType === 0x004e4942) {
      bin = chunkData;
    }
    offset += 8 + chunkLen;
  }

  if (!gltf || !bin) {
    throw new Error(`Incomplete GLB chunks in ${url}`);
  }

  const textureCache = new Map<number, WebGLTexture | null>();
  const primitives: GlbPrimitive[] = [];

  for (const meshDef of gltf.meshes ?? []) {
    for (const prim of meshDef.primitives) {
      const posIdx = prim.attributes.POSITION;
      if (posIdx === undefined) continue;

      const positions = readAccessorFloats(gltf, bin, posIdx);
      const vertCount = positions.length / 3;
      const normals =
        prim.attributes.NORMAL !== undefined
          ? readAccessorFloats(gltf, bin, prim.attributes.NORMAL)
          : new Float32Array(vertCount * 3);
      const uvs =
        prim.attributes.TEXCOORD_0 !== undefined
          ? readAccessorFloats(gltf, bin, prim.attributes.TEXCOORD_0)
          : new Float32Array(vertCount * 2);

      const interleaved = new Float32Array(vertCount * 8);
      for (let i = 0; i < vertCount; i++) {
        const o = i * 8;
        interleaved[o] = positions[i * 3];
        interleaved[o + 1] = positions[i * 3 + 1];
        interleaved[o + 2] = positions[i * 3 + 2];
        interleaved[o + 3] = normals[i * 3] || 0;
        interleaved[o + 4] = normals[i * 3 + 1] || 1;
        interleaved[o + 5] = normals[i * 3 + 2] || 0;
        interleaved[o + 6] = uvs[i * 2] || 0;
        interleaved[o + 7] = uvs[i * 2 + 1] || 0;
      }

      const indices =
        prim.indices !== undefined ? readIndices(gltf, bin, prim.indices) : undefined;

      const gpuMesh = new GpuMesh(
        gl,
        interleaved,
        8,
        [
          { location: 0, size: 3, offsetFloats: 0 },
          { location: 1, size: 3, offsetFloats: 3 },
          { location: 2, size: 2, offsetFloats: 6 },
        ],
        indices,
        gl.TRIANGLES
      );

      let baseColor: [number, number, number] = [1, 1, 1];
      let texture: WebGLTexture | null = null;
      if (prim.material !== undefined) {
        const pbr = gltf.materials?.[prim.material]?.pbrMetallicRoughness;
        if (pbr?.baseColorFactor) {
          baseColor = [
            pbr.baseColorFactor[0],
            pbr.baseColorFactor[1],
            pbr.baseColorFactor[2],
          ];
        }
        if (pbr?.baseColorTexture) {
          const texIdx = pbr.baseColorTexture.index;
          if (!textureCache.has(texIdx)) {
            textureCache.set(texIdx, await decodeTexture(gl, gltf, bin, texIdx));
          }
          texture = textureCache.get(texIdx) ?? null;
        }
      }

      primitives.push({ mesh: gpuMesh, baseColor, texture });
    }
  }

  return new GlbModel(gl, primitives);
}
