export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const clamp01 = (v: number) => clamp(v, 0, 1)
