import * as THREE from 'three'
import { champIconUrl } from '../sim/champions'
import { COLORS, UNIT_RADIUS } from '../sim/constants'
import type { InputState } from '../input/controller'
import type { GroundMark, Telegraph, Unit, World } from '../sim/types'

export const MATCH_FOV = 40
export const MATCH_PITCH_DEG = 56
/** Vertical ground span the locked camera shows (sim units). Not the full pit. */
export const MATCH_VIEW_DEPTH = 460

const PITCH = THREE.MathUtils.degToRad(MATCH_PITCH_DEG)
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const LOADER = new THREE.TextureLoader()
LOADER.setCrossOrigin('anonymous')

const TEAM_HEX = {
  ally: 0x5ec8ff,
  foe: 0xff5a4a,
  player: 0xff5a1a,
} as const

function simToWorld(x: number, y: number, h = 0, out = new THREE.Vector3()) {
  return out.set(x, h, y)
}

function yawFromFacing(facing: number) {
  return Math.PI / 2 - facing
}

function shortestAngle(from: number, to: number) {
  let d = to - from
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

function hexColor(n: number) {
  return new THREE.Color(n)
}

function makeCircleDecal(radius: number, color: number, opacity: number, y = 0.06) {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 48),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = y
  mesh.renderOrder = 2
  return mesh
}

function makeRingDecal(radius: number, color: number, opacity: number, y = 0.08) {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(Math.max(1, radius - 2.2), radius + 1.4, 56),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = y
  mesh.renderOrder = 3
  return mesh
}

function makeLineDecal(from: THREE.Vector3, to: THREE.Vector3, halfW: number, color: number, opacity: number) {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const len = Math.hypot(dx, dz) || 1
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(halfW * 2, len),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.rotation.z = Math.atan2(dx, dz)
  mesh.position.set((from.x + to.x) / 2, 0.07, (from.z + to.z) / 2)
  mesh.renderOrder = 2
  return mesh
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const mat = mesh.material
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
    else if (mat) mat.dispose()
  })
}

function clearGroup(group: THREE.Group, dispose = true) {
  while (group.children.length) {
    const child = group.children[0]!
    group.remove(child)
    if (dispose) disposeObject(child)
  }
}

function makeHpTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 10
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.NearestFilter
  return { canvas, tex, ctx: canvas.getContext('2d')! }
}

function paintHp(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, ratio: number, hurt: boolean) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#0a0c08'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = hurt ? '#ff5a1a' : '#e8b86d'
  ctx.fillRect(1, 1, Math.max(0, (canvas.width - 2) * ratio), canvas.height - 2)
}

interface UnitRig {
  root: THREE.Group
  body: THREE.Group
  face: THREE.Mesh
  faceRig: THREE.Group
  hp: THREE.Sprite
  hpCanvas: HTMLCanvasElement
  hpCtx: CanvasRenderingContext2D
  hpTex: THREE.CanvasTexture
  targetRing: THREE.Mesh
  yaw: number
  faceMat: THREE.MeshBasicMaterial
}

function makeStickman(teamColor: number, isPlayer: boolean): Omit<UnitRig, 'yaw'> {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  const shadow = makeCircleDecal(UNIT_RADIUS * 0.78, 0x000000, 0.38, 0.03)
  root.add(shadow)

  const skin = new THREE.MeshStandardMaterial({
    color: teamColor,
    roughness: 0.48,
    metalness: 0.12,
    emissive: hexColor(isPlayer ? COLORS.player : teamColor),
    emissiveIntensity: isPlayer ? 0.18 : 0.06,
  })

  const hip = new THREE.Mesh(new THREE.SphereGeometry(5.2, 12, 10), skin)
  hip.position.y = 14
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(7.4, 18, 6, 12), skin)
  torso.position.y = 32
  const lLeg = new THREE.Mesh(new THREE.CapsuleGeometry(2.8, 12, 4, 8), skin)
  lLeg.position.set(-4.6, 9, 0)
  const rLeg = new THREE.Mesh(new THREE.CapsuleGeometry(2.8, 12, 4, 8), skin)
  rLeg.position.set(4.6, 9, 0)
  const lArm = new THREE.Mesh(new THREE.CapsuleGeometry(2.3, 14, 4, 8), skin)
  lArm.position.set(-11, 34, 0)
  lArm.rotation.z = 0.28
  const rArm = new THREE.Mesh(new THREE.CapsuleGeometry(2.3, 14, 4, 8), skin)
  rArm.position.set(11, 34, 0)
  rArm.rotation.z = -0.28
  const head = new THREE.Mesh(new THREE.SphereGeometry(10.2, 18, 14), skin)
  head.position.y = 52
  body.add(hip, torso, lLeg, rLeg, lArm, rArm, head)

  const faceMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthWrite: true,
  })
  const faceBack = new THREE.Mesh(
    new THREE.CircleGeometry(15.2, 28),
    new THREE.MeshBasicMaterial({ color: 0x140c08, depthWrite: true, side: THREE.DoubleSide }),
  )
  const face = new THREE.Mesh(new THREE.CircleGeometry(14.2, 28), faceMat)
  face.position.z = 0.4
  const faceRig = new THREE.Group()
  faceRig.position.set(0, 58, 0)
  faceRig.add(faceBack, face)
  root.add(faceRig)

  const { canvas, tex, ctx } = makeHpTexture()
  const hp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }),
  )
  hp.scale.set(42, 6.5, 1)
  hp.position.y = 86
  root.add(hp)

  const targetRing = makeRingDecal(UNIT_RADIUS + 6, COLORS.player, 0)
  root.add(targetRing)

  return { root, body, face, faceRig, hp, hpCanvas: canvas, hpCtx: ctx, hpTex: tex, targetRing, faceMat }
}

export class ArenaRenderer {
  readonly canvas: HTMLCanvasElement
  private host: HTMLElement
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(MATCH_FOV, 1, 8, 8000)
  private renderer: THREE.WebGLRenderer
  private raycaster = new THREE.Raycaster()
  private ndc = new THREE.Vector2()
  private hit = new THREE.Vector3()
  private tmp = new THREE.Vector3()
  private tmpB = new THREE.Vector3()
  private arena = { w: 1100, h: 700 }
  private aim = new THREE.Vector3()
  private aimReady = false
  private ground = new THREE.Group()
  private decals = new THREE.Group()
  private fx = new THREE.Group()
  private units = new THREE.Group()
  private views = new Map<number, UnitRig>()
  private iconCache = new Map<string, THREE.Texture>()
  private sharedMats = {
    aa: new THREE.MeshStandardMaterial({ color: 0xe8b86d, emissive: 0xe8b86d, emissiveIntensity: 0.45 }),
    melee: new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffc857, emissiveIntensity: 0.5 }),
    ability: new THREE.MeshStandardMaterial({ color: 0xff8c42, emissive: 0xff8c42, emissiveIntensity: 0.55 }),
    ult: new THREE.MeshStandardMaterial({ color: 0xff5a1a, emissive: 0xff5a1a, emissiveIntensity: 0.7 }),
    minionBlue: new THREE.MeshStandardMaterial({ color: TEAM_HEX.ally, roughness: 0.6 }),
    minionRed: new THREE.MeshStandardMaterial({ color: TEAM_HEX.foe, roughness: 0.6 }),
  }

  constructor(host: HTMLElement, arenaW: number, arenaH: number) {
    this.host = host
    this.arena = { w: arenaW, h: arenaH }
    this.scene.background = hexColor(0x16110e)

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setClearColor(0x16110e, 1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.enabled = false
    this.canvas = this.renderer.domElement
    this.canvas.style.display = 'block'
    this.canvas.style.cursor = 'crosshair'
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    host.appendChild(this.canvas)

    const hemi = new THREE.HemisphereLight(0xffe8d0, 0x2a1c14, 1.35)
    const key = new THREE.DirectionalLight(0xffe0c0, 1.45)
    key.position.set(arenaW * 0.35, 420, arenaH * 0.85)
    const fill = new THREE.DirectionalLight(0x5ec8ff, 0.35)
    fill.position.set(-200, 180, -80)
    this.scene.add(new THREE.AmbientLight(0xfff4e8, 0.55), hemi, key, fill)

    this.ground = this.buildGround(arenaW, arenaH)
    this.scene.add(this.ground)
    this.decals.name = 'decals'
    this.fx.name = 'fx'
    this.units.name = 'units'
    this.scene.add(this.decals, this.fx, this.units)

    this.resize()
  }

  private buildGround(w: number, h: number) {
    const group = new THREE.Group()
    const dirt = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 220, h + 220),
      new THREE.MeshStandardMaterial({ color: 0x3d342c, roughness: 0.92, metalness: 0.02 }),
    )
    dirt.rotation.x = -Math.PI / 2
    dirt.position.set(w / 2, 0, h / 2)
    group.add(dirt)

    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ color: 0x4a4036, roughness: 0.88, metalness: 0.04 }),
    )
    pad.rotation.x = -Math.PI / 2
    pad.position.set(w / 2, 0.02, h / 2)
    group.add(pad)

    const grid = new THREE.GridHelper(Math.max(w, h), Math.floor(Math.max(w, h) / 44), 0x6a5c4e, 0x5a4e42)
    grid.position.set(w / 2, 0.03, h / 2)
    const gridMat = grid.material as THREE.Material
    gridMat.transparent = true
    gridMat.opacity = 0.42
    group.add(grid)

    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(w - 16, h - 16)),
      new THREE.LineBasicMaterial({ color: 0x3d342e, transparent: true, opacity: 0.85 }),
    )
    edge.rotation.x = -Math.PI / 2
    edge.position.set(w / 2, 0.05, h / 2)
    group.add(edge)

    const mid = new THREE.Mesh(
      new THREE.PlaneGeometry(4, h - 28),
      new THREE.MeshBasicMaterial({ color: 0xc45c32, transparent: true, opacity: 0.28, depthWrite: false }),
    )
    mid.rotation.x = -Math.PI / 2
    mid.position.set(w / 2, 0.04, h / 2)
    group.add(mid)

    return group
  }

  private cameraDist() {
    const halfFov = THREE.MathUtils.degToRad(MATCH_FOV / 2)
    return (MATCH_VIEW_DEPTH / 2 / Math.tan(halfFov)) / Math.sin(PITCH)
  }

  private frameCamera(x = this.arena.w / 2, z = this.arena.h / 2) {
    const dist = this.cameraDist()
    this.camera.fov = MATCH_FOV
    this.camera.position.set(x, dist * Math.sin(PITCH), z + dist * Math.cos(PITCH))
    this.camera.lookAt(x, 0, z)
    this.camera.updateProjectionMatrix()
  }

  private frameOnFight(world: World) {
    const p = world.units[world.playerId]
    const tx = p?.pos.x ?? this.arena.w / 2
    const tz = p?.pos.y ?? this.arena.h / 2
    this.aim.set(tx, 0, tz)
    this.aimReady = true
    this.frameCamera(tx, tz)
  }

  resize() {
    const rw = Math.max(1, this.host.clientWidth)
    const rh = Math.max(1, this.host.clientHeight)
    this.renderer.setSize(rw, rh, false)
    this.camera.aspect = rw / rh
    this.camera.updateProjectionMatrix()
    if (this.aimReady) this.frameCamera(this.aim.x, this.aim.z)
    else this.frameCamera()
  }

  attachResize() {
    const on = () => this.resize()
    on()
    const ro = new ResizeObserver(on)
    ro.observe(this.host)
    return () => ro.disconnect()
  }

  screenToSim(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return null
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, this.camera)
    const hit = this.raycaster.ray.intersectPlane(GROUND, this.hit)
    if (!hit) return null
    return { x: hit.x, y: hit.z }
  }

  private async loadFace(champId: string) {
    if (this.iconCache.has(champId)) return this.iconCache.get(champId)!
    const tex = await LOADER.loadAsync(champIconUrl(champId)).catch(() => null)
    if (!tex) return null
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    this.iconCache.set(champId, tex)
    return tex
  }

  async bootstrapUnits(world: World) {
    this.arena = { w: world.arena.w, h: world.arena.h }
    clearGroup(this.units)
    this.views.clear()
    this.scene.remove(this.ground)
    this.ground = this.buildGround(world.arena.w, world.arena.h)
    this.scene.add(this.ground)
    this.aimReady = false
    this.frameOnFight(world)

    if (world.mode === 'laning') {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(140, world.arena.h - 24),
        new THREE.MeshStandardMaterial({ color: 0x1c1814, roughness: 0.9, transparent: true, opacity: 0.7 }),
      )
      strip.rotation.x = -Math.PI / 2
      strip.position.set(world.arena.w / 2, 0.025, world.arena.h / 2)
      this.ground.add(strip)
    }

    for (const u of world.units) {
      const teamColor = u.team === 'blue' ? TEAM_HEX.ally : TEAM_HEX.foe
      const rig = { ...makeStickman(teamColor, u.isPlayer), yaw: yawFromFacing(u.facing) }
      this.units.add(rig.root)
      this.views.set(u.id, rig)
      const tex = await this.loadFace(u.champId)
      if (tex) {
        rig.faceMat.map = tex
        rig.faceMat.needsUpdate = true
      }
    }
  }

  private syncUnit(u: Unit, view: UnitRig, world: World) {
    const player = world.units[world.playerId]
    view.root.visible = u.alive || u.hp > 0
    view.root.position.set(u.pos.x, 0, u.pos.y)
    const want = yawFromFacing(u.facing)
    view.yaw += shortestAngle(view.yaw, want) * 0.2
    view.body.rotation.y = view.yaw
    view.faceRig.quaternion.copy(this.camera.quaternion)
    view.root.scale.setScalar(u.alive ? 1.15 : 0.95)
    if (!u.alive) view.body.position.y = -6
    else view.body.position.y = u.hitFlashTtl > 0 ? 1.6 : 0

    const ratio = Math.max(0, u.hp / u.stats.maxHp)
    paintHp(view.hpCtx, view.hpCanvas, ratio, ratio <= 0.35)
    view.hpTex.needsUpdate = true

    const ring = view.targetRing.material as THREE.MeshBasicMaterial
    if (player?.alive && player.targetId === u.id && u.alive) {
      ring.opacity = 0.9
      ring.color.setHex(COLORS.player)
    } else if (player?.alive && u.alive && u.team !== player.team && u.targetId === world.playerId) {
      ring.opacity = 0.75
      ring.color.setHex(COLORS.foe)
    } else {
      ring.opacity = 0
    }
  }

  private drawTelegraph(t: Telegraph) {
    const pulse = 0.35 + (1 - t.ttl / t.maxTtl) * 0.5
    const color = t.team === 'blue' ? TEAM_HEX.ally : TEAM_HEX.foe
    const from = simToWorld(t.from.x, t.from.y, 0, this.tmp)
    const to = simToWorld(t.to.x, t.to.y, 0, this.tmpB)
    if (t.kind === 'circle') {
      const fill = makeCircleDecal(t.radius, color, 0.14 + pulse * 0.12, 0.06)
      fill.position.set(t.to.x, 0.06, t.to.y)
      const rim = makeRingDecal(t.radius, color, 0.55 + pulse * 0.3, 0.08)
      rim.position.set(t.to.x, 0.08, t.to.y)
      this.decals.add(fill, rim)
    } else {
      this.decals.add(makeLineDecal(from, to, t.radius, color, 0.2 + pulse * 0.16))
    }
  }

  private drawMark(m: GroundMark) {
    const a = Math.min(1, m.ttl * 2)
    const col = m.kind === 'amove' ? COLORS.player : m.kind === 'ward' ? COLORS.buff : 0xe8ddd3
    const ring = makeRingDecal(11, col, a * 0.95, 0.09)
    ring.position.set(m.x, 0.09, m.y)
    const arm = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 2.2),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: a, depthWrite: false }),
    )
    arm.rotation.x = -Math.PI / 2
    arm.position.set(m.x, 0.1, m.y)
    const arm2 = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 2.2),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: a, depthWrite: false }),
    )
    arm2.rotation.x = -Math.PI / 2
    arm2.rotation.z = Math.PI / 2
    arm2.position.set(m.x, 0.1, m.y)
    this.decals.add(ring, arm, arm2)
  }

  render(world: World, input: InputState) {
    this.frameOnFight(world)
    const player = world.units[world.playerId]
    for (const u of world.units) {
      const v = this.views.get(u.id)
      if (v) this.syncUnit(u, v, world)
    }

    clearGroup(this.decals)
    clearGroup(this.fx)

    for (const t of world.telegraphs) this.drawTelegraph(t)
    for (const m of world.marks) this.drawMark(m)

    if (input.showRange && player?.alive) {
      const fill = makeCircleDecal(player.stats.aaRange, COLORS.player, 0.05, 0.05)
      fill.position.set(player.pos.x, 0.05, player.pos.y)
      const rim = makeRingDecal(player.stats.aaRange, COLORS.player, 0.75, 0.07)
      rim.position.set(player.pos.x, 0.07, player.pos.y)
      this.decals.add(fill, rim)
    }

    for (const p of world.projectiles) {
      const isUlt = p.kind === 'ultimate'
      const isAbility = p.kind === 'ability' || isUlt
      const isMeleeAa = p.kind === 'aa' && p.radius >= 8
      const r = isUlt ? 14 : isAbility ? Math.max(8, p.radius * 0.28) : isMeleeAa ? 7 : 5
      const mat = isUlt
        ? this.sharedMats.ult
        : isAbility
          ? this.sharedMats.ability
          : isMeleeAa
            ? this.sharedMats.melee
            : this.sharedMats.aa
      const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat)
      ball.position.set(p.pos.x, 16, p.pos.y)
      this.fx.add(ball)
    }

    for (const s of world.swipes) {
      const a = simToWorld(s.x1, s.y1, 18, this.tmp)
      const b = simToWorld(s.x2, s.y2, 18, this.tmpB)
      this.fx.add(makeLineDecal(a, b, 3, 0xfde68a, Math.min(1, s.ttl * 6)))
    }

    for (const w of world.wards) {
      const gem = new THREE.Mesh(
        new THREE.SphereGeometry(6, 10, 8),
        new THREE.MeshStandardMaterial({
          color: w.team === 'blue' ? TEAM_HEX.ally : TEAM_HEX.foe,
          emissive: w.team === 'blue' ? TEAM_HEX.ally : TEAM_HEX.foe,
          emissiveIntensity: 0.4,
        }),
      )
      gem.position.set(w.pos.x, 10, w.pos.y)
      const ring = makeRingDecal(14, COLORS.player, 0.28, 0.08)
      ring.position.set(w.pos.x, 0.08, w.pos.y)
      this.fx.add(gem, ring)
    }

    for (const m of world.minions) {
      if (!m.alive) continue
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(9, 10, 8),
        m.team === 'blue' ? this.sharedMats.minionBlue : this.sharedMats.minionRed,
      )
      body.position.set(m.pos.x, 9, m.pos.y)
      this.fx.add(body)
    }

    this.renderer.render(this.scene, this.camera)
  }

  destroy() {
    clearGroup(this.units)
    clearGroup(this.decals)
    clearGroup(this.fx)
    this.views.clear()
    for (const tex of this.iconCache.values()) tex.dispose()
    this.iconCache.clear()
    for (const mat of Object.values(this.sharedMats)) mat.dispose()
    this.renderer.dispose()
    this.canvas.remove()
  }
}

export function attachCanvasFit(renderer: ArenaRenderer) {
  return renderer.attachResize()
}
