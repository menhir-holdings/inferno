import { Application, Container, Graphics, Sprite, Text, TextStyle, Assets, Texture } from 'pixi.js'
import { champIconUrl } from '../sim/champions'
import { COLORS, ICON_RADIUS, UNIT_RADIUS } from '../sim/constants'
import type { InputState } from '../input/controller'
import { drawLaneOverlay } from '../sim/laning'
import type { Unit, World } from '../sim/types'

interface UnitView {
  root: Container
  ring: Graphics
  outline: Graphics
  icon: Sprite | null
  iconMask: Graphics
  hpBg: Graphics
  hpFg: Graphics
  name: Text
  targetRing: Graphics
}

export class ArenaRenderer {
  app: Application
  worldLayer = new Container()
  fxLayer = new Container()
  bgLayer = new Graphics()
  views = new Map<number, UnitView>()
  rangeRing = new Graphics()
  private iconCache = new Map<string, Texture>()

  constructor(app: Application) {
    this.app = app
    app.stage.eventMode = 'none'
    app.stage.interactiveChildren = false
    for (const layer of [this.bgLayer, this.worldLayer, this.fxLayer, this.rangeRing]) {
      layer.eventMode = 'none'
    }
    app.stage.addChild(this.bgLayer)
    app.stage.addChild(this.worldLayer)
    app.stage.addChild(this.fxLayer)
    this.fxLayer.addChild(this.rangeRing)
  }

  drawArena(w: number, h: number, mode: World['mode'] = 'teamfight') {
    this.bgLayer.clear()
    this.bgLayer.rect(0, 0, w, h)
    this.bgLayer.fill({ color: 0x161310 })
    // Floor concentric range rings (125/250/375/500) removed — they stacked with
    // champ chrome and read as leftover AA. Player AA is X-key `showRange` only.
    for (let i = 0; i < 7; i++) {
      const y = 70 + i * ((h - 140) / 6)
      this.bgLayer.moveTo(28, y)
      this.bgLayer.lineTo(52, y)
      this.bgLayer.moveTo(w - 52, y)
      this.bgLayer.lineTo(w - 28, y)
    }
    this.bgLayer.stroke({ width: 1, color: 0x3d342e, alpha: 0.55 })
    this.bgLayer.rect(10, 10, w - 20, h - 20)
    this.bgLayer.stroke({ width: 2, color: 0x3d342e, alpha: 0.9 })
    if (mode === 'laning') {
      drawLaneOverlay(w, h, this.bgLayer)
    } else {
      const mid = w / 2
      this.bgLayer.moveTo(mid, 28)
      this.bgLayer.lineTo(mid, h - 28)
      this.bgLayer.stroke({ width: 2, color: 0xc45c32, alpha: 0.18 })
      this.bgLayer.circle(mid, h * 0.5, 90)
      this.bgLayer.stroke({ width: 1, color: 0xe8b86d, alpha: 0.12 })
    }
  }

  async ensureIcon(champId: string) {
    if (this.iconCache.has(champId)) return this.iconCache.get(champId)!
    try {
      const tex = await Assets.load<Texture>(champIconUrl(champId))
      this.iconCache.set(champId, tex)
      return tex
    } catch {
      return null
    }
  }

  layoutIconCover(sprite: Sprite, tex: Texture, diameter: number) {
    const tw = tex.width || 1
    const th = tex.height || 1
    const scale = Math.max(diameter / tw, diameter / th)
    sprite.scale.set(scale)
    sprite.anchor.set(0.5)
  }

  async bootstrapUnits(world: World) {
    this.drawArena(world.arena.w, world.arena.h, world.mode)
    this.worldLayer.removeChildren()
    this.views.clear()
    for (const u of world.units) {
      const root = new Container()
      const ring = new Graphics()
      const outline = new Graphics()
      const iconMask = new Graphics()
      iconMask.circle(0, 0, ICON_RADIUS)
      iconMask.fill(0xffffff)
      const hpBg = new Graphics()
      const hpFg = new Graphics()
      const targetRing = new Graphics()
      const name = new Text({
        text: u.champName,
        style: new TextStyle({
          fontFamily: 'Barlow Condensed, Barlow, sans-serif',
          fontSize: 11,
          fill: 0xe8ddd3,
          fontWeight: '600',
        }),
      })
      name.anchor.set(0.5, 1)
      name.y = -UNIT_RADIUS - 10
      root.addChild(ring)
      this.worldLayer.addChild(root)

      const tex = await this.ensureIcon(u.champId)
      let icon: Sprite | null = null
      if (tex) {
        icon = new Sprite(tex)
        this.layoutIconCover(icon, tex, ICON_RADIUS * 2)
        icon.mask = iconMask
        root.addChild(icon)
        root.addChild(iconMask)
      }
      root.addChild(outline)
      root.addChild(targetRing)
      root.addChild(hpBg)
      root.addChild(hpFg)
      root.addChild(name)
      this.views.set(u.id, { root, ring, outline, icon, iconMask, hpBg, hpFg, name, targetRing })
    }
  }

  drawUnit(u: Unit, view: UnitView, world: World) {
    const player = world.units[world.playerId]
    const playerTargetId = player?.targetId ?? null
    view.root.x = u.pos.x
    view.root.y = u.pos.y
    view.root.zIndex = u.pos.y

    if (!u.alive) {
      view.root.visible = false
      view.root.alpha = 0
      view.ring.clear()
      view.outline.clear()
      view.targetRing.clear()
      view.hpBg.clear()
      view.hpFg.clear()
      if (view.icon) view.icon.visible = false
      return
    }

    view.root.visible = true
    view.root.alpha = 1
    if (view.icon) view.icon.visible = true

    const teamColor = u.team === 'blue' ? COLORS.ally : COLORS.foe
    const stroke = u.isPlayer ? COLORS.player : teamColor
    const flash = u.hitFlashTtl > 0

    view.ring.clear()
    view.ring.ellipse(2, UNIT_RADIUS * 0.62, UNIT_RADIUS * 0.85, UNIT_RADIUS * 0.32)
    view.ring.fill({ color: 0x000000, alpha: 0.35 })
    // Auras: player only, while those radii exist, faint. Never on every champ.
    if (u.isPlayer && u.stats.hamperRadius > 0) {
      view.ring.circle(0, 0, u.stats.hamperRadius)
      view.ring.stroke({ width: 1, color: COLORS.hamper, alpha: 0.08 })
    }
    if (u.isPlayer && u.stats.buffRadius > 0) {
      view.ring.circle(0, 0, u.stats.buffRadius)
      view.ring.stroke({ width: 1, color: COLORS.buff, alpha: 0.07 })
    }

    view.outline.clear()
    if (!view.icon) {
      view.outline.circle(0, 0, UNIT_RADIUS)
      view.outline.fill({ color: 0x1a1612, alpha: 0.95 })
    }
    view.outline.circle(0, 0, UNIT_RADIUS)
    view.outline.stroke({
      width: u.isPlayer ? 2.5 : 2,
      color: flash ? 0xffffff : stroke,
      alpha: 1,
    })
    if (view.icon) {
      view.icon.rotation = u.facing * 0.12
      view.icon.tint = flash ? 0xffe8dc : 0xffffff
    }

    view.targetRing.clear()
    if (player?.alive && playerTargetId === u.id && u.alive) {
      view.targetRing.circle(0, 0, UNIT_RADIUS + 5)
      view.targetRing.stroke({ width: 2, color: COLORS.player, alpha: 0.85 })
    } else if (
      player?.alive &&
      u.alive &&
      u.team !== player.team &&
      u.targetId === world.playerId
    ) {
      view.targetRing.moveTo(-8, -UNIT_RADIUS - 14)
      view.targetRing.lineTo(0, -UNIT_RADIUS - 6)
      view.targetRing.lineTo(8, -UNIT_RADIUS - 14)
      view.targetRing.stroke({ width: 2, color: COLORS.foe, alpha: 0.9 })
    }

    const ratio = Math.max(0, u.hp / u.stats.maxHp)
    const barW = 44
    view.hpBg.clear()
    view.hpBg.rect(-barW / 2, -UNIT_RADIUS - 8, barW, 5)
    view.hpBg.fill({ color: 0x0a0c08, alpha: 0.9 })
    view.hpFg.clear()
    view.hpFg.rect(-barW / 2, -UNIT_RADIUS - 8, barW * ratio, 5)
    view.hpFg.fill({ color: ratio > 0.35 ? COLORS.hpHigh : COLORS.hpLow })
  }

  render(world: World, input: InputState) {
    const player = world.units[world.playerId]
    const sorted = [...world.units].sort((a, b) => a.pos.y - b.pos.y)
    for (const u of sorted) {
      const v = this.views.get(u.id)
      if (v) {
        this.worldLayer.addChild(v.root)
        this.drawUnit(u, v, world)
      }
    }

    this.fxLayer.removeChildren()
    this.fxLayer.addChild(this.rangeRing)
    this.app.stage.x = 0
    this.app.stage.y = 0

    for (const t of world.telegraphs) {
      const g = new Graphics()
      const pulse = 0.35 + (1 - t.ttl / t.maxTtl) * 0.5
      const color = t.team === 'blue' ? COLORS.ally : COLORS.foe
      if (t.kind === 'circle') {
        g.circle(t.to.x, t.to.y, t.radius)
        g.fill({ color, alpha: 0.12 + pulse * 0.12 })
        g.circle(t.to.x, t.to.y, t.radius)
        g.stroke({ width: 2, color, alpha: 0.55 + pulse * 0.3 })
      } else {
        const dx = t.to.x - t.from.x
        const dy = t.to.y - t.from.y
        const len = Math.hypot(dx, dy) || 1
        const nx = -dy / len
        const ny = dx / len
        const hw = t.radius
        g.moveTo(t.from.x + nx * hw, t.from.y + ny * hw)
        g.lineTo(t.to.x + nx * hw, t.to.y + ny * hw)
        g.lineTo(t.to.x - nx * hw, t.to.y - ny * hw)
        g.lineTo(t.from.x - nx * hw, t.from.y - ny * hw)
        g.closePath()
        g.fill({ color, alpha: 0.14 + pulse * 0.1 })
        g.stroke({ width: 2, color, alpha: 0.7 })
      }
      this.fxLayer.addChild(g)
    }

    for (const m of world.marks) {
      const g = new Graphics()
      const a = Math.min(1, m.ttl * 2)
      const col = m.kind === 'amove' ? COLORS.player : m.kind === 'ward' ? COLORS.buff : 0xe8ddd3
      g.circle(m.x, m.y, 10)
      g.stroke({ width: 2, color: col, alpha: a })
      g.moveTo(m.x - 6, m.y)
      g.lineTo(m.x + 6, m.y)
      g.moveTo(m.x, m.y - 6)
      g.lineTo(m.x, m.y + 6)
      g.stroke({ width: 1.5, color: col, alpha: a })
      this.fxLayer.addChild(g)
    }

    for (const p of world.projectiles) {
      const g = new Graphics()
      const isUlt = p.kind === 'ultimate'
      const isAbility = p.kind === 'ability' || isUlt
      const isMeleeAa = p.kind === 'aa' && p.radius >= 8
      const r = isUlt ? 14 : isAbility ? 8 : isMeleeAa ? 7 : 5
      const color = isUlt ? COLORS.player : isAbility ? COLORS.buff : isMeleeAa ? 0xffe08a : 0xe8b86d
      g.circle(p.pos.x, p.pos.y, r)
      g.fill({ color, alpha: 0.92 })
      if (isUlt) {
        g.circle(p.pos.x, p.pos.y, r + 6)
        g.stroke({ width: 2, color: 0xff8c42, alpha: 0.45 })
      } else if (isAbility) {
        g.circle(p.pos.x - p.vel.x * 0.03, p.pos.y - p.vel.y * 0.03, r * 0.6)
        g.fill({ color: COLORS.buff, alpha: 0.35 })
      } else if (isMeleeAa) {
        g.circle(p.pos.x - p.vel.x * 0.012, p.pos.y - p.vel.y * 0.012, r * 0.55)
        g.fill({ color: 0xffc857, alpha: 0.4 })
      }
      this.fxLayer.addChild(g)
    }

    for (const s of world.swipes) {
      const g = new Graphics()
      const alpha = Math.min(1, s.ttl * 6)
      g.moveTo(s.x1, s.y1)
      g.lineTo(s.x2, s.y2)
      g.stroke({ width: 5, color: 0xfde68a, alpha })
      this.fxLayer.addChild(g)
    }
    for (const w of world.wards) {
      const g = new Graphics()
      g.circle(w.pos.x, w.pos.y, 7)
      g.fill({ color: w.team === 'blue' ? COLORS.ally : COLORS.foe, alpha: 0.55 })
      g.circle(w.pos.x, w.pos.y, 14)
      g.stroke({ width: 1, color: COLORS.player, alpha: 0.28 })
      this.fxLayer.addChild(g)
    }

    for (const m of world.minions) {
      if (!m.alive) continue
      const g = new Graphics()
      const color = m.team === 'blue' ? COLORS.ally : COLORS.foe
      g.ellipse(m.pos.x + 1, m.pos.y + 6, 11, 5)
      g.fill({ color: 0x000000, alpha: 0.3 })
      g.circle(m.pos.x, m.pos.y, 11)
      g.fill({ color, alpha: 0.82 })
      g.circle(m.pos.x, m.pos.y, 11)
      g.stroke({ width: 1.5, color: 0x140c08, alpha: 0.7 })
      g.rect(m.pos.x - 14, m.pos.y - 20, 28, 3)
      g.fill({ color: 0x0a0c08, alpha: 0.85 })
      g.rect(m.pos.x - 14, m.pos.y - 20, 28 * (m.hp / m.maxHp), 3)
      g.fill({ color: world.lastHitMinionId === m.id ? COLORS.player : COLORS.hpHigh, alpha: 0.95 })
      this.fxLayer.addChild(g)
    }

    for (const f of world.floaters) {
      const g = new Text({
        text: f.text,
        style: new TextStyle({
          fontFamily: 'Barlow Condensed, Barlow, sans-serif',
          fontSize: 12,
          fill: f.color,
          fontWeight: '600',
        }),
      })
      g.anchor.set(0.5, 1)
      g.x = f.x
      g.y = f.y - (0.75 - f.ttl) * 28
      g.alpha = Math.min(1, f.ttl * 2)
      this.fxLayer.addChild(g)
    }

    this.rangeRing.clear()
    this.rangeRing.visible = Boolean(input.showRange && player?.alive)
    if (input.showRange && player?.alive) {
      this.rangeRing.circle(player.pos.x, player.pos.y, player.stats.aaRange)
      this.rangeRing.stroke({ width: 1.5, color: COLORS.player, alpha: 0.75 })
      this.rangeRing.circle(player.pos.x, player.pos.y, player.stats.aaRange)
      this.rangeRing.fill({ color: COLORS.player, alpha: 0.04 })
    }
  }

  destroy() {
    this.app.destroy(true)
  }
}

export function fitCanvasToHost(host: HTMLElement, canvas: HTMLCanvasElement, worldW: number, worldH: number) {
  const rw = host.clientWidth
  const rh = host.clientHeight
  if (rw < 1 || rh < 1) return
  const scale = Math.min(rw / worldW, rh / worldH)
  canvas.style.width = `${Math.floor(worldW * scale)}px`
  canvas.style.height = `${Math.floor(worldH * scale)}px`
}

export function attachCanvasFit(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  worldW: number,
  worldH: number,
) {
  const fit = () => fitCanvasToHost(host, canvas, worldW, worldH)
  fit()
  const ro = new ResizeObserver(fit)
  ro.observe(host)
  return () => ro.disconnect()
}

export async function createApp(host: HTMLElement, w: number, h: number): Promise<Application> {
  const app = new Application()
  await app.init({
    width: w,
    height: h,
    background: COLORS.arena,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  })
  host.appendChild(app.canvas)
  app.canvas.style.display = 'block'
  app.canvas.style.cursor = 'crosshair'
  app.stage.sortableChildren = true
  return app
}
