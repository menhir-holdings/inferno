/**
 * Vendored snapshot of League gameplayRadius for Inferno's curated champ set.
 *
 * Patch 14.24 CommunityDragon character bins:
 *   game/data/characters/{alias}/{alias}.bin.json
 *   Characters/{Alias}/CharacterRecords/Root.overrideGameplayCollisionRadius
 *
 * The engine default is 65 when that override is omitted (most champions).
 * This module is static in-repo -- do not live-fetch at runtime.
 * A fuller wiki/database dump is later work, not this pickup.
 */
export const GAMEPLAY_RADIUS_BASELINE = 65

/** Riot champion key → gameplayRadius (sim units match League's). */
export const GAMEPLAY_RADIUS: Record<string, number> = {
  Zed: 65,
  Akali: 65,
  KhaZix: 65,
  Talon: 65,
  Qiyana: 65,
  Jinx: 65,
  Ashe: 65,
  Caitlyn: 65,
  Jhin: 65,
  KaiSa: 65,
  Ahri: 65,
  Syndra: 65,
  Lux: 65,
  Viktor: 65,
  Orianna: 65,
  Darius: 65,
  Garen: 65,
  Sett: 65,
  Renekton: 80,
  XinZhao: 65,
  Ornn: 80,
  Sion: 80,
  Malphite: 80,
  Leona: 65,
  Nautilus: 80,
  Lulu: 55,
  Nami: 65,
  Thresh: 65,
  Janna: 65,
  Milio: 55,
}

export function gameplayRadius(champId: string): number {
  return GAMEPLAY_RADIUS[champId] ?? GAMEPLAY_RADIUS_BASELINE
}

/** Visual + collision scale vs a typical 65-radius champ. */
export function champScale(champId: string): number {
  return gameplayRadius(champId) / GAMEPLAY_RADIUS_BASELINE
}
