/** Visual + physics radius for champ blobs */
export const UNIT_RADIUS = 28
export const UNIT_DIAMETER = UNIT_RADIUS * 2
/** Inner circle for icon fill (inside ring stroke) */
export const ICON_RADIUS = 24

/** Ward cast range (arena units). Must feel finite vs map size. */
export const WARD_CAST_RANGE = 240
/** Seconds between ward placements */
export const WARD_COOLDOWN = 45

export const COLORS = {
  ally: 0x5ec8ff,
  foe: 0xff5a4a,
  player: 0xc4f000,
  hpHigh: 0x7dd957,
  hpLow: 0xff6b35,
  hamper: 0xff4d00,
  buff: 0xc4f000,
  arena: 0x0e100c,
  grid: 0x1f2418,
} as const
