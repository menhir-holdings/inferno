import { Application, Container, Graphics, Sprite, Text, TextStyle, Assets, Texture } from 'pixi.js'
import { champIconUrl } from '../sim/champions'
import { COLORS, ICON_RADIUS, UNIT_RADIUS } from '../sim/constants'
import type { InputState } from '../input/controller'
import { drawLaneOverlay } from '../sim/laning'
import type { Unit, World } from '../sim/types'

interface UnitView {
  root: Container
  ring: Graphics
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
    this.bgLayer.fill({ color: COLORS.arena })
    const step = 44
    for (let x = 0; x <= w; x += step) {
      this.bgLayer.moveTo(x, 0)
      this.bgLayer.lineTo(x, h)
    }
    for (let y = 0; y <= h; y += step) {
      this.bgLayer.moveTo(0, y)
      this.bgLayer.lineTo(w, y)
    }
    this.bgLayer.stroke({ width: 1, color: COLORS.grid, alpha: 0.35 })
    this.bgLayer.rect(8, 8, w - 16, h - 16)
    this.bgLayer.stroke({ width: 2, color: 0x2a3020, alpha: 0.8 })
    if (mode === 'laning') {
      drawLaneOverlay(w, h, this.bgLayer)
    } else {
      const mid = w / 2
      this.bgLayer.moveTo(mid, 12)
      this.bgLayer.lineTo(mid, h - 12)
      this.bgLayer.stroke({ width: 1, color: 0xc4f000, alpha: 0.12 })
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
      const iconMask = new Graphics()
      iconMask.circle(0, 0, ICON_RADIUS)
      iconMask.fill(0xffffff)
      const hpBg = new Graphics()
      const hpFg = new Graphics()
      const targetRing = new Graphics()
      const name = new Text({
        text: u.champName,
        style: new TextStyle({
          fontFamily: 'Chakra Petch, Share Tech Mono, monospace',
          fontSize: 10,
          fill: 0xd6d2c4,
          fontWeight: '600',
        }),
      })
      name.anchor.set(0.5, 1)
      name.y = -UNIT_RADIUS - 10
      root.addChild(ring)
      root.addChild(targetRing)
      root.addChild(hpBg)
      root.addChild(hpFg)
      root.addChild(name)
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
      this.views.set(u.id, { root, ring, icon, iconMask, hpBg, hpFg, name, targetRing })
    }
  }

  drawUnit(u: Unit, view: UnitView, world: World) {
    const player = world.units[world.playerId]
    const playerTargetId = player?.targetId ?? null
    view.root.visible = u.alive || u.hp > 0
    view.root.alpha = u.alive ? 1 : 0.2
    view.root.x = u.pos.x
    view.root.y = u.pos.y
    view.root.zIndex = u.pos.y

    const teamColor = u.team === 'blue' ? COLORS.ally : COLORS.foe
    const stroke = u.isPlayer ? COLORS.player : teamColor
    const flash = u.hitFlashTtl > 0

    view.ring.clear()
    view.ring.circle(0, 0, UNIT_RADIUS)
    view.ring.fill({ color: teamColor, alpha: flash ? 0.95 : 0.88 })
    view.ring.circle(0, 0, UNIT_RADIUS)
    view.ring.stroke({
      width: u.isPlayer ? 3 : 2,
      color: flash ? 0xffffff : stroke,
      alpha: 1,
    })

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

    for (const p of world.projectiles) {
      const g = new Graphics()
      const isUlt = p.kind === 'ultimate'
      const isAbility = p.kind === 'ability' || isUlt
      const isMeleeAa = p.kind === 'aa' && p.radius >= 8
      const r = isUlt ? 14 : isAbility ? 8 : isMeleeAa ? 7 : 5
      const color = isUlt ? 0xc4f000 : isAbility ? 0xf472b6 : isMeleeAa ? 0xffe08a : 0xfde68a
      g.circle(p.pos.x, p.pos.y, r)
      g.fill({ color, alpha: 0.92 })
      if (isUlt) {
        g.circle(p.pos.x, p.pos.y, r + 6)
        g.stroke({ width: 2, color: 0xfff59e, alpha: 0.45 })
      } else if (isAbility) {
        g.circle(p.pos.x - p.vel.x * 0.03, p.pos.y - p.vel.y * 0.03, r * 0.6)
        g.fill({ color: 0xf472b6, alpha: 0.35 })
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
      g.stroke({ width: 1, color: 0xc4f000, alpha: 0.25 })
      this.fxLayer.addChild(g)
    }

    for (const m of world.minions) {
      if (!m.alive) continue
      const g = new Graphics()
      const color = m.team === 'blue' ? COLORS.ally : COLORS.foe
      g.circle(m.pos.x, m.pos.y, 14)
      g.fill({ color, alpha: 0.75 })
      g.rect(m.pos.x - 16, m.pos.y - 22, 32 * (m.hp / m.maxHp), 3)
      g.fill({ color: COLORS.hpHigh, alpha: 0.9 })
      this.fxLayer.addChild(g)
    }

    for (const f of world.floaters) {
      const g = new Text({
        text: f.text,
        style: new TextStyle({
          fontFamily: 'Share Tech Mono, monospace',
          fontSize: 11,
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
