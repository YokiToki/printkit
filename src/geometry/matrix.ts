import type { Mat4 } from '../editor/scene'

export function identityMat4(): Mat4 {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]
}

export function multiplyMat4(a: Mat4, b: Mat4): Mat4 {
  const out = new Array(16) as unknown as Mat4
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3]
    }
  }
  return out
}

export function invertMat4(m: Mat4): Mat4 {
  const n00 = m[0], n01 = m[4], n02 = m[8],  n03 = m[12]
  const n10 = m[1], n11 = m[5], n12 = m[9],  n13 = m[13]
  const n20 = m[2], n21 = m[6], n22 = m[10], n23 = m[14]
  const n30 = m[3], n31 = m[7], n32 = m[11], n33 = m[15]

  const t0 = n22 * n33 - n23 * n32
  const t1 = n21 * n33 - n23 * n31
  const t2 = n21 * n32 - n22 * n31
  const t3 = n20 * n33 - n23 * n30
  const t4 = n20 * n32 - n22 * n30
  const t5 = n20 * n31 - n21 * n30

  const c00 =  (n11 * t0 - n12 * t1 + n13 * t2)
  const c10 = -(n10 * t0 - n12 * t3 + n13 * t4)
  const c20 =  (n10 * t1 - n11 * t3 + n13 * t5)
  const c30 = -(n10 * t2 - n11 * t4 + n12 * t5)

  const det = n00 * c00 + n01 * c10 + n02 * c20 + n03 * c30
  if (Math.abs(det) < 1e-12) {
    return identityMat4()
  }

  const invDet = 1 / det

  const d00 = c00 * invDet
  const d10 = c10 * invDet
  const d20 = c20 * invDet
  const d30 = c30 * invDet

  const d01 = -(n01 * t0 - n02 * t1 + n03 * t2) * invDet
  const d11 =  (n00 * t0 - n02 * t3 + n03 * t4) * invDet
  const d21 = -(n00 * t1 - n01 * t3 + n03 * t5) * invDet
  const d31 =  (n00 * t2 - n01 * t4 + n02 * t5) * invDet

  const u0 = n02 * n13 - n03 * n12
  const u1 = n01 * n13 - n03 * n11
  const u2 = n01 * n12 - n02 * n11
  const u3 = n00 * n13 - n03 * n10
  const u4 = n00 * n12 - n02 * n10
  const u5 = n00 * n11 - n01 * n10

  const d02 =  (n31 * u0 - n32 * u1 + n33 * u2) * invDet
  const d12 = -(n30 * u0 - n32 * u3 + n33 * u4) * invDet
  const d22 =  (n30 * u1 - n31 * u3 + n33 * u5) * invDet
  const d32 = -(n30 * u2 - n31 * u4 + n32 * u5) * invDet

  const d03 = -(n21 * u0 - n22 * u1 + n23 * u2) * invDet
  const d13 =  (n20 * u0 - n22 * u3 + n23 * u4) * invDet
  const d23 = -(n20 * u1 - n21 * u3 + n23 * u5) * invDet
  const d33 =  (n20 * u2 - n21 * u4 + n22 * u5) * invDet

  const z = (v: number) => (Object.is(v, -0) || Math.abs(v) < 1e-15 ? 0 : v)

  return [
    z(d00), z(d10), z(d20), z(d30),
    z(d01), z(d11), z(d21), z(d31),
    z(d02), z(d12), z(d22), z(d32),
    z(d03), z(d13), z(d23), z(d33),
  ]
}

export function relativeMatrix(targetWorld: Mat4, toolWorld: Mat4): Mat4 {
  return multiplyMat4(invertMat4(targetWorld), toolWorld)
}
