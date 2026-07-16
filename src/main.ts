import './style.css'
import { createApp, ArenaRenderer } from './render/arena'
import { generateScenario, scenarioToWorld } from './scenario/generate'
import { generateLaningScenario } from './scenario/laning'
import { attachInput, createInputState, cancelTargeting, targetingLabel } from './input/controller'
import {
  DEFAULT_BINDINGS,
  labelForCode,
  loadBindings,
  saveBindings,
  type ActionId,
  type Bindings,
} from './input/bindings'
import { tickWorld, DT } from './sim/world'
import { scoreWorld } from './score/score'
import type { FightResult, Scenario, ScoreBreakdown, World } from './sim/types'

const appRoot = document.querySelector<HTMLDivElement>('#app')!

let world: World | null = null
let scenario: Scenario | null = null
let running = false
let acc = 0
let last = 0
let raf = 0
let renderer: ArenaRenderer | null = null
let pixiApp: Awaited<ReturnType<typeof createApp>> | null = null
let detachInput: (() => void) | null = null
const inputState = createInputState()
let lastScenarioSeed = Date.now() & 0xffffffff

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (html != null) node.innerHTML = html
  return node
}

function showHome() {
  stopLoop()
  cleanupFight()
  appRoot.innerHTML = ''
  const shell = el('div', 'shell home')

  const top = el('div', 'home-top')
  top.innerHTML =
    '<div class="mark"><b>MENHIR</b> / WORKSHOP / RANGE</div><div class="mark">OODA DRILL</div>'
  shell.append(top)

  const hero = el('div', 'home-hero')
  hero.append(el('h1', 'brand', 'INFERNO'))
  hero.append(
    el(
      'p',
      'lede',
      'Endless LoL-targeted skills trainer. Not aim dots — <em>fight reads</em> under motor load.',
    ),
  )
  const ooda = el('div', 'ooda-rail')
  for (const s of ['Observe', 'Orient', 'Decide', 'Act']) {
    ooda.append(el('span', '', s))
  }
  hero.append(ooda)

  const cta = el('div', 'cta-row')
  const fire = el('button', 'btn-fire', 'Enter Teamfight') as HTMLButtonElement
  fire.addEventListener('click', () => startTeamfight(lastScenarioSeed))
  const lane = el('button', 'btn', 'Enter Laning') as HTMLButtonElement
  lane.addEventListener('click', () => startLaning((lastScenarioSeed ^ 0x1a4e) >>> 0))
  const soon = el('ul', 'soon-list')
  soon.innerHTML = '<li>Jungle shelved — teamfight + laning active</li>'
  cta.append(fire, lane, soon)
  hero.append(cta)
  shell.append(hero)

  const foot = el('div', 'home-foot')
  const settingsBtn = el('button', 'settings-link', 'Hotkeys')
  settingsBtn.addEventListener('click', () => openBindingsModal())
  foot.append(settingsBtn, document.createTextNode('Menhir Holdings'))
  shell.append(foot)
  appRoot.append(shell)
}

async function startTeamfight(seed: number, existing?: Scenario) {
  lastScenarioSeed = seed
  scenario = existing ?? generateScenario(seed, 60)
  await startFight(scenario)
}

async function startLaning(seed: number, existing?: Scenario) {
  lastScenarioSeed = seed
  scenario = existing ?? generateLaningScenario(seed, 90)
  await startFight(scenario)
}

async function startFight(sc: Scenario) {
  stopLoop()
  cleanupFight()
  scenario = sc
  world = scenarioToWorld(scenario)
  inputState.recording = []
  inputState.targeting = 'none'
  inputState.showRange = false
  inputState.showScoreboard = false

  appRoot.innerHTML = ''
  const shell = el('div', 'shell play-wrap')
  const hud = el('div', 'hud-bar')
  hud.id = 'hud-bar'
  const host = el('div', 'canvas-host')
  host.id = 'canvas-host'
  const abilityBar = el('div', 'ability-bar')
  abilityBar.id = 'ability-bar'
  shell.append(hud, host, abilityBar)
  appRoot.append(shell)

  pixiApp = await createApp(host, world.arena.w, world.arena.h)
  renderer = new ArenaRenderer(pixiApp)
  await renderer.bootstrapUnits(world)

  const canvas = pixiApp.canvas
  const rect = () => canvas.getBoundingClientRect()
  detachInput = attachInput(
    canvas,
    () => world,
    inputState,
    (cx, cy) => {
      const r = rect()
      const scaleX = world!.arena.w / r.width
      const scaleY = world!.arena.h / r.height
      return { x: (cx - r.left) * scaleX, y: (cy - r.top) * scaleY }
    },
  )

  updateHud()
  updateAbilityBar()
  running = true
  last = performance.now()
  acc = 0
  raf = requestAnimationFrame(frame)
}

function frame(now: number) {
  if (!running || !world || !renderer) return
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  acc += dt
  while (acc >= DT) {
    tickWorld(world)
    acc -= DT
  }
  renderer.render(world, inputState)
  if (!world.units[world.playerId]?.alive) {
    cancelTargeting(inputState)
  }
  updateHud()
  updateAbilityBar()
  syncScoreboard()

  if (world.ended) {
    running = false
    showOutcome(world.result)
    showDebrief(scoreWorld(world))
    return
  }
  raf = requestAnimationFrame(frame)
}

function updateHud() {
  const bar = document.getElementById('hud-bar')
  if (!bar || !world) return
  const p = world.units[world.playerId]!
  const remain = Math.max(0, world.duration - world.time)
  const target = p.targetId != null ? world.units[p.targetId] : null
  const mode = targetingLabel(inputState.targeting)
  const modeBadge = mode ? `<div class="stat mode-pill"><strong>${mode}</strong></div>` : ''
  const targetLine = target?.alive
    ? `<div class="stat">Target <strong>${target.champName}</strong></div>`
    : '<div class="stat">Target <strong>—</strong></div>'
  const csLine =
    world.mode === 'laning'
      ? `<div class="stat">CS <strong>${world.playerCs}</strong></div>`
      : ''
  bar.innerHTML = `
    <div class="stat">Time <strong>${remain.toFixed(1)}s</strong></div>
    <div class="stat">${p.champName} <strong>${p.archetype}</strong></div>
    <div class="stat">HP <strong>${Math.max(0, Math.round(p.hp))}</strong>/${p.stats.maxHp}</div>
    ${csLine}
    ${targetLine}
    ${modeBadge}
    <div class="stat">AOT <strong>${world.attackChampionsOnly ? 'ON' : 'off'}</strong></div>
    <div class="hint">RMB · A (A-move) · X+click · 4 ward · S · Tab · Esc</div>
  `
}

function updateAbilityBar() {
  const bar = document.getElementById('ability-bar')
  if (!bar || !world) return
  const p = world.units[world.playerId]!
  const slots: { key: string; label: string; ready: boolean; spent?: boolean; cd?: number; max?: number }[] = [
    { key: 'Q', label: 'Q', ready: p.abilities.q.ready, cd: p.abilities.q.cooldown, max: p.abilities.q.maxCooldown },
    { key: 'W', label: 'W', ready: p.abilities.w.ready, cd: p.abilities.w.cooldown, max: p.abilities.w.maxCooldown },
    { key: 'E', label: 'E', ready: p.abilities.e.ready, cd: p.abilities.e.cooldown, max: p.abilities.e.maxCooldown },
    { key: 'R', label: 'R', ready: p.abilities.r.ready && !p.abilities.r.spent, spent: p.abilities.r.spent },
  ]
  for (const a of p.actives) {
    slots.push({
      key: String(a.slot),
      label: String(a.slot),
      ready: a.ready,
      cd: a.cooldown,
      max: a.maxCooldown,
    })
  }
  slots.push({ key: '4', label: '4', ready: true })
  bar.innerHTML = slots
    .map((s) => {
      const cls = ['slot', s.ready ? 'ready' : 'down', s.spent ? 'spent' : ''].filter(Boolean).join(' ')
      const pct =
        !s.ready && s.cd && s.max && s.max > 0
          ? `<div class="cd-sweep" style="height:${Math.round((s.cd / s.max) * 100)}%"></div>`
          : ''
      const cd =
        !s.ready && s.cd && s.cd > 0
          ? `<small>${Math.ceil(s.cd)}</small>`
          : s.key === '4'
            ? '<small>ward</small>'
            : ''
      return `<div class="${cls}">${pct}<span>${s.label}</span>${cd}</div>`
    })
    .join('')
}

function syncScoreboard() {
  const host = document.getElementById('canvas-host')
  if (!host || !world) return
  let board = host.querySelector('.scoreboard') as HTMLDivElement | null
  if (!inputState.showScoreboard) {
    board?.remove()
    return
  }
  if (!board) {
    board = el('div', 'scoreboard')
    host.append(board)
  }
  const rows = world.units
    .slice()
    .sort((a, b) => (a.team === b.team ? a.id - b.id : a.team === 'blue' ? -1 : 1))
    .map((u) => {
      const items = u.items.map((i) => i.name.slice(0, 3)).join(' · ')
      return `<tr class="${u.team}">
        <td>${u.champName}${u.isPlayer ? ' ★' : ''}</td>
        <td>${u.level}</td>
        <td>${u.kills}/${u.deaths}/${u.assists}</td>
        <td>${u.archetype}</td>
        <td>${items}</td>
      </tr>`
    })
    .join('')
  board.innerHTML = `<table>
    <thead><tr><th>Champion</th><th>Lvl</th><th>KDA</th><th>Arch</th><th>Items</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

function showOutcome(result: FightResult) {
  const host = document.getElementById('canvas-host')
  if (!host) return
  host.querySelector('.outcome')?.remove()
  if (!result || result === 'timeout') return
  const box = el('div', `outcome outcome-${result}`)
  box.innerHTML =
    result === 'victory'
      ? '<span class="outcome-label">VICTORY</span><span class="outcome-sub">Enemy team eliminated</span>'
      : '<span class="outcome-label">DEFEAT</span><span class="outcome-sub">Your team fell</span>'
  host.append(box)
}

function showDebrief(score: ScoreBreakdown) {
  const shell = appRoot.querySelector('.shell')
  if (!shell || !scenario || !world) return
  document.querySelector('.debrief')?.remove()
  const box = el('div', 'debrief')
  const headline =
    world.result === 'victory'
      ? 'Victory'
      : world.result === 'defeat'
        ? 'Defeat'
        : world.result === 'timeout'
          ? 'Time'
          : 'Round over'
  box.innerHTML = `
    <h2>${headline} — ${score.total}</h2>
    <div class="scores">
      <div><strong>${score.focus}</strong><span>Focus</span></div>
      <div><strong>${score.spacing}</strong><span>Spacing</span></div>
      <div><strong>${score.execution}</strong><span>Execution</span></div>
      <div><strong>${score.survival}</strong><span>Survival</span></div>
      <div><strong>${score.damageDealt}</strong><span>Dmg out</span></div>
      <div><strong>${score.damageTaken}</strong><span>Dmg in</span></div>
    </div>
    <ul class="notes">${score.notes.map((n) => `<li>${n}</li>`).join('')}</ul>
    <div class="actions"></div>
  `
  const actions = box.querySelector('.actions')!
  const again = el('button', 'btn primary', 'Fight again')
  again.addEventListener('click', () =>
    scenario!.mode === 'laning'
      ? startLaning(scenario!.seed, scenario!)
      : startTeamfight(scenario!.seed, scenario!),
  )
  const regen = el('button', 'btn', 'New fight')
  regen.addEventListener('click', () =>
    scenario!.mode === 'laning'
      ? startLaning((Math.random() * 1e9) | 0)
      : startTeamfight((Math.random() * 1e9) | 0),
  )
  const home = el('button', 'btn', 'Exit')
  home.addEventListener('click', () => showHome())
  actions.append(again, regen, home)
  shell.append(box)
}

function openBindingsModal() {
  const bindings = loadBindings()
  const backdrop = el('div', 'modal-backdrop')
  const modal = el('div', 'modal')
  modal.innerHTML = `<h3>Hotkeys</h3><div class="bind-list"></div>`
  const list = modal.querySelector('.bind-list')!
  const labels: Record<ActionId, string> = {
    stop: 'Stop',
    attackMove: 'Attack-move at cursor (A)',
    attackMoveRange: 'Attack-move + range (X)',
    abilityQ: 'Ability Q',
    abilityW: 'Ability W',
    abilityE: 'Ability E',
    abilityR: 'Ability R',
    active1: 'Active 1',
    active2: 'Active 2',
    active3: 'Active 3',
    ward: 'Ward',
    aot: 'Attack champions only',
    scoreboard: 'Scoreboard',
  }
  ;(Object.keys(labels) as ActionId[]).forEach((action) => {
    const row = el('div', 'bind-row')
    row.innerHTML = `<span>${labels[action]}</span>`
    const btn = el('button', '', labelForCode(bindings[action]))
    btn.addEventListener('click', () => {
      btn.textContent = '…'
      const once = (e: KeyboardEvent) => {
        e.preventDefault()
        bindings[action] = e.code
        btn.textContent = labelForCode(e.code)
        window.removeEventListener('keydown', once, true)
      }
      window.addEventListener('keydown', once, true)
    })
    row.append(btn)
    list.append(row)
  })
  const row = el('div', 'actions')
  const save = el('button', 'btn primary', 'Save')
  save.addEventListener('click', () => {
    saveBindings(bindings)
    inputState.bindings = { ...bindings }
    backdrop.remove()
  })
  const reset = el('button', 'btn', 'Reset')
  reset.addEventListener('click', () => {
    const d = { ...DEFAULT_BINDINGS } as Bindings
    saveBindings(d)
    inputState.bindings = d
    backdrop.remove()
    openBindingsModal()
  })
  const close = el('button', 'btn', 'Close')
  close.addEventListener('click', () => backdrop.remove())
  row.append(save, reset, close)
  modal.append(row)
  backdrop.append(modal)
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove()
  })
  document.body.append(backdrop)
}

function stopLoop() {
  running = false
  if (raf) cancelAnimationFrame(raf)
  raf = 0
}

function cleanupFight() {
  detachInput?.()
  detachInput = null
  renderer?.destroy()
  renderer = null
  pixiApp = null
  world = null
}

showHome()
