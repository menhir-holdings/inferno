import { Application, Container, Graphics, Sprite, Text, TextStyle, Assets } from 'pixi.js'
import { champIconUrl } from '../sim/champions'
import type { InputState } from '../input/controller'
import type { Unit, World } from '../sim/types'

interface UnitView {
  root: Container
  ring: Graphics
  icon: Sprite | null
  hpBg: Graphics
  hpFg: Graphics
  name: Text
}

export class ArenaRenderer {
  app: Application
  worldLayer = new Container()
  fxLayer = new Container()
  views = new Map<number, UnitView>()
  rangeRing = new Graphics()
  private iconCache = new Map<string, Awaited<ReturnType<typeof Assets.load>>>()

  constructor(app: Application) {
    this.app = app
    app.stage.addChild(this.worldLayer)
    app.stage.addChild(this.fxLayer)
    this.fxLayer.addChild(this.rangeRing)
  }

  async ensureIcon(champId: string) {
    if (this.iconCache.has(champId)) return this.iconCache.get(champId)!
    try {
      const tex = await Assets.load(champIconUrl(champId))
      this.iconCache.set(champId, tex)
      return tex
    } catch {
      return null
    }
  }

  async bootstrapUnits(world: World) {
    this.worldLayer.removeChildren()
    this.views.clear()
    for (const u of world.units) {
      const root = new Container()
      const ring = new Graphics()
      const hpBg = new Graphics()
      const hpFg = new Graphics()
      const name = new Text({
        text: u.champName,
        style: new TextStyle({
          fontFamily: 'IBM Plex Sans, sans-serif',
          fontSize: 11,
          fill: 0xe8e6e3,
          fontWeight: '500',
        }),
      })
      name.anchor.set(0.5, 1)
      name.y = -42
      root.addChild(ring)
      root.addChild(hpBg)
      root.addChild(hpFg)
      root.addChild(name)
      this.worldLayer.addChild(root)

      const tex = await this.ensureIcon(u.champId)
      let icon: Sprite | null = null
      if (tex) {
        icon = new Sprite(tex)
        icon.anchor.set(0.5)
        icon.width = 36
        icon.height = 36
        root.addChildAt(icon, 1)
      }
      this.views.set(u.id, { root, ring, icon, hpBg, hpFg, name })
    }
  }

  drawUnit(u: Unit, view: UnitView) {
    view.root.visible = u.alive || u.hp > 0
    if (!u.alive) {
      view.root.alpha = 0.25
    } else {
      view.root.alpha = 1
    }
    view.root.x = u.pos.x
    view.root.y = u.pos.y

    const color = u.team === 'blue' ? 0x3b82f6 : 0xef4444
    const accent = u.isPlayer ? 0xfbbf24 : color
    view.ring.clear()
    view.ring.circle(0, 0, 28)
    view.ring.fill({ color, alpha: 0.85 })
    view.ring.circle(0, 0, 28)
    view.ring.stroke({ width: u.isPlayer ? 3 : 2, color: accent, alpha: 1 })

    const ratio = Math.max(0, u.hp / u.stats.maxHp)
    view.hpBg.clear()
    view.hpBg.rect(-22, -38, 44, 5)
    view.hpBg.fill({ color: 0x111111, alpha: 0.85 })
    view.hpFg.clear()
    view.hpFg.rect(-22, -38, 44 * ratio, 5)
    view.hpFg.fill({ color: ratio > 0.35 ? 0x22c55e : 0xf97316 })
  }

  render(world: World, input: InputState) {
    // arena floor
    // units
    for (const u of world.units) {
      const v = this.views.get(u.id)
      if (v) this.drawUnit(u, v)
    }

    // projectiles
    this.fxLayer.removeChildren()
    this.fxLayer.addChild(this.rangeRing)
    for (const p of world.projectiles) {
      const g = new Graphics()
      g.circle(p.pos.x, p.pos.y, p.kind === 'ability' ? 7 : 4)
      g.fill({ color: p.kind === 'ability' ? 0xf472b6 : 0xfde68a })
      this.fxLayer.addChild(g)
    }
    for (const w of world.wards) {
      const g = new Graphics()
      g.circle(w.pos.x, w.pos.y, 8)
      g.fill({ color: w.team === 'blue' ? 0x93c5fd : 0xfca5a5, alpha: 0.8 })
      this.fxLayer.addChild(g)
    }

    this.rangeRing.clear()
    if (input.showRange) {
      const player = world.units[world.playerId]
      if (player?.alive) {
        this.rangeRing.circle(player.pos.x, player.pos.y, player.stats.aaRange)
        this.rangeRing.stroke({ width: 1.5, color: 0xfbbf24, alpha: 0.7 })
      }
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
    background: 0x0e100c,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  })
  host.appendChild(app.canvas)
  app.canvas.style.display = 'block'
  app.canvas.style.borderRadius = '8px'
  app.canvas.style.cursor = 'crosshair'
  return app
}
