/** Column-major 4x4 matrix stored in a pre-allocated Float32Array. */
export type Mat4 = Float32Array;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function createMat4(): Mat4 {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

export function mat4Identity(out: Mat4): Mat4 {
  out.fill(0);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

export function mat4Perspective(
  out: Mat4,
  fovRad: number,
  aspect: number,
  near: number,
  far: number
): Mat4 {
  const f = 1.0 / Math.tan(fovRad * 0.5);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

export function mat4LookAt(out: Mat4, eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  let zx = eye.x - target.x;
  let zy = eye.y - target.y;
  let zz = eye.z - target.z;
  let len = Math.hypot(zx, zy, zz);
  if (len > 0) {
    zx /= len;
    zy /= len;
    zz /= len;
  } else {
    zz = 1;
  }

  let xx = up.y * zz - up.z * zy;
  let xy = up.z * zx - up.x * zz;
  let xz = up.x * zy - up.y * zx;
  len = Math.hypot(xx, xy, xz);
  if (len > 0) {
    xx /= len;
    xy /= len;
    xz /= len;
  } else {
    xx = 1;
  }

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  out[0] = xx;
  out[1] = yx;
  out[2] = zx;
  out[3] = 0;
  out[4] = xy;
  out[5] = yy;
  out[6] = zy;
  out[7] = 0;
  out[8] = xz;
  out[9] = yz;
  out[10] = zz;
  out[11] = 0;
  out[12] = -(xx * eye.x + xy * eye.y + xz * eye.z);
  out[13] = -(yx * eye.x + yy * eye.y + yz * eye.z);
  out[14] = -(zx * eye.x + zy * eye.y + zz * eye.z);
  out[15] = 1;
  return out;
}

export function mat4Multiply(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  for (let col = 0; col < 4; col++) {
    const o = col * 4;
    const b0 = b[o], b1 = b[o + 1], b2 = b[o + 2], b3 = b[o + 3];
    out[o]     = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[o + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[o + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[o + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  }
  return out;
}

export function mat4TRS(
  out: Mat4,
  tx: number, ty: number, tz: number,
  rx: number, ry: number, rz: number,
  sx: number, sy: number, sz: number
): Mat4 {
  const cx = Math.cos(rx), sxr = Math.sin(rx);
  const cy = Math.cos(ry), syr = Math.sin(ry);
  const cz = Math.cos(rz), szr = Math.sin(rz);

  // Y * X * Z Euler order
  const r00 = cy * cz + syr * sxr * szr;
  const r01 = cx * szr;
  const r02 = -syr * cz + cy * sxr * szr;

  const r10 = -cy * szr + syr * sxr * cz;
  const r11 = cx * cz;
  const r12 = syr * szr + cy * sxr * cz;

  const r20 = syr * cx;
  const r21 = -sxr;
  const r22 = cy * cx;

  out[0] = r00 * sx;
  out[1] = r01 * sx;
  out[2] = r02 * sx;
  out[3] = 0;

  out[4] = r10 * sy;
  out[5] = r11 * sy;
  out[6] = r12 * sy;
  out[7] = 0;

  out[8] = r20 * sz;
  out[9] = r21 * sz;
  out[10] = r22 * sz;
  out[11] = 0;

  out[12] = tx;
  out[13] = ty;
  out[14] = tz;
  out[15] = 1;
  return out;
}
