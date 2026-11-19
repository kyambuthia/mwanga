export class GpuMesh {
  private readonly vao: WebGLVertexArrayObject;
  private readonly vbo: WebGLBuffer;
  private readonly ibo: WebGLBuffer | null = null;
  public readonly count: number;
  public readonly indexed: boolean;
  public readonly indexType: number;
  public readonly mode: number;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    vertices: Float32Array,
    strideFloats: number,
    attributes: Array<{ location: number; size: number; offsetFloats: number }>,
    indices?: Uint16Array | Uint32Array,
    mode: number = gl.TRIANGLES
  ) {
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error("Failed to allocate GPU mesh buffers.");

    this.vao = vao;
    this.vbo = vbo;
    this.mode = mode;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const strideBytes = strideFloats * 4;
    for (const attr of attributes) {
      gl.enableVertexAttribArray(attr.location);
      gl.vertexAttribPointer(
        attr.location,
        attr.size,
        gl.FLOAT,
        false,
        strideBytes,
        attr.offsetFloats * 4
      );
    }

    if (indices) {
      const ibo = gl.createBuffer();
      if (!ibo) throw new Error("Failed to allocate index buffer.");
      this.ibo = ibo;
      this.indexed = true;
      this.count = indices.length;
      this.indexType = indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    } else {
      this.indexed = false;
      this.indexType = gl.UNSIGNED_SHORT;
      this.count = vertices.length / strideFloats;
    }

    gl.bindVertexArray(null);
  }

  public draw(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    if (this.indexed) {
      gl.drawElements(this.mode, this.count, this.indexType, 0);
    } else {
      gl.drawArrays(this.mode, 0, this.count);
    }
  }

  public dispose(): void {
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteBuffer(this.vbo);
    if (this.ibo) this.gl.deleteBuffer(this.ibo);
  }
}

export function createBoxMesh(gl: WebGL2RenderingContext, size = 1): GpuMesh {
  const h = size * 0.5;
  // 24 vertices (pos x,y,z + normal x,y,z + uv u,v)
  const v = new Float32Array([
    // +Z
    -h, -h,  h,  0,  0,  1,  0, 1,
     h, -h,  h,  0,  0,  1,  1, 1,
     h,  h,  h,  0,  0,  1,  1, 0,
    -h,  h,  h,  0,  0,  1,  0, 0,
    // -Z
     h, -h, -h,  0,  0, -1,  0, 1,
    -h, -h, -h,  0,  0, -1,  1, 1,
    -h,  h, -h,  0,  0, -1,  1, 0,
     h,  h, -h,  0,  0, -1,  0, 0,
    // +X
     h, -h,  h,  1,  0,  0,  0, 1,
     h, -h, -h,  1,  0,  0,  1, 1,
     h,  h, -h,  1,  0,  0,  1, 0,
     h,  h,  h,  1,  0,  0,  0, 0,
    // -X
    -h, -h, -h, -1,  0,  0,  0, 1,
    -h, -h,  h, -1,  0,  0,  1, 1,
    -h,  h,  h, -1,  0,  0,  1, 0,
    -h,  h, -h, -1,  0,  0,  0, 0,
    // +Y
    -h,  h,  h,  0,  1,  0,  0, 1,
     h,  h,  h,  0,  1,  0,  1, 1,
     h,  h, -h,  0,  1,  0,  1, 0,
    -h,  h, -h,  0,  1,  0,  0, 0,
    // -Y
    -h, -h, -h,  0, -1,  0,  0, 1,
     h, -h, -h,  0, -1,  0,  1, 1,
     h, -h,  h,  0, -1,  0,  1, 0,
    -h, -h,  h,  0, -1,  0,  0, 0,
  ]);

  const idx = new Uint16Array([
     0,  1,  2,   0,  2,  3,
     4,  5,  6,   4,  6,  7,
     8,  9, 10,   8, 10, 11,
    12, 13, 14,  12, 14, 15,
    16, 17, 18,  16, 18, 19,
    20, 21, 22,  20, 22, 23,
  ]);

  return new GpuMesh(
    gl,
    v,
    8,
    [
      { location: 0, size: 3, offsetFloats: 0 },
      { location: 1, size: 3, offsetFloats: 3 },
      { location: 2, size: 2, offsetFloats: 6 },
    ],
    idx,
    gl.TRIANGLES
  );
}

export function createGridMesh(gl: WebGL2RenderingContext, halfExtent = 10, step = 1): GpuMesh {
  const coords: number[] = [];
  for (let i = -halfExtent; i <= halfExtent; i += step) {
    coords.push(i, 0, -halfExtent, i, 0, halfExtent);
    coords.push(-halfExtent, 0, i, halfExtent, 0, i);
  }
  return new GpuMesh(
    gl,
    new Float32Array(coords),
    3,
    [{ location: 0, size: 3, offsetFloats: 0 }],
    undefined,
    gl.LINES
  );
}
