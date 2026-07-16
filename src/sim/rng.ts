/** Mulberry32 seeded PRNG */
export function createRng(seed: number) {
  let s = seed >>> 0
  const next = () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int(min: number, max: number) {
      return min + Math.floor(next() * (max - min + 1))
    },
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(next() * arr.length)]!
    },
    shuffle<T>(arr: T[]): T[] {
      const a = [...arr]
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[a[i], a[j]] = [a[j]!, a[i]!]
      }
      return a
    },
    /** Truncated Poisson(λ): support {0,1,2,3}. λ=1 → mean ~1, 3 infrequent, 4+ never. */
    poissonActives(lambda = 1): number {
      // P(k) ∝ e^-λ λ^k / k! for k=0..3, renormalized
      const raw = [0, 1, 2, 3].map((k) => {
        let fact = 1
        for (let i = 2; i <= k; i++) fact *= i
        return Math.exp(-lambda) * Math.pow(lambda, k) / fact
      })
      const sum = raw.reduce((a, b) => a + b, 0)
      let u = next() * sum
      for (let k = 0; k < raw.length; k++) {
        u -= raw[k]!
        if (u <= 0) return k
      }
      return 3
    },
    /** Randomish CD in [lo, hi] seconds */
    cooldown(lo: number, hi: number) {
      return lo + next() * (hi - lo)
    },
  }
}

export type Rng = ReturnType<typeof createRng>
