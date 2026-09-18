import './style.css'
import { ArenaRenderer } from './render/arena'
import { champIconUrl } from './sim/champions'
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
import { WARD_COOLDOWN } from './sim/constants'
import { WAVE_TELEGRAPH } from './sim/laning'
import { scoreWorld } from './score/score'
import { scoreLaningWorld } from './score/laning'
import type { FightResult, Scenario, ScoreBreakdown, Unit, World } from './sim/types'

const appRoot = document.querySelector<HTMLDivElement>('#app')!

let world: World | null = null
let scenario: Scenario | null = null
let running = false
let acc = 0
let last = 0
let raf = 0
let renderer: ArenaRenderer | null = null
let detachInput: (() => void) | null = null
let detachFit: (() => void) | null = null
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

function modeCard(title: string, copy: string, kind: 'go' | 'open' | 'shelved') {
  const btn = el('button', `mode-card${kind === 'go' ? ' mode-card-go' : kind === 'shelved' ? ' mode-card-shelved' : ''}`) as HTMLButtonElement
  btn.type = 'button'
  btn.innerHTML = `<span class="mode-name">${title}</span><span class="mode-copy">${copy}</span>`
  if (kind === 'shelved') btn.disabled = true
  return btn
}

function showHome() {
  stopLoop()
  cleanupFight()
  appRoot.innerHTML = ''

  const world = el('div', 'home-world')
  world.setAttribute('aria-hidden', 'true')

  const shell = el('div', 'shell home')
  const hud = el('div', 'home-hud')

  const kicker = el('div', 'pause-kicker')
  kicker.innerHTML = '<i></i> Range <i></i>'
  hud.append(kicker)
  hud.append(el('h1', 'brand', 'INFERNO'))
  hud.append(
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
  hud.append(ooda)

  const sheet = el('div', 'mode-sheet')
  sheet.append(el('p', 'pick-label', 'Pick your drill'))
  const stack = el('div', 'mode-stack')
  const fire = modeCard('Teamfight', 'Fight reads. Five champs. Motor load.', 'go')
  fire.addEventListener('click', () => startTeamfight(lastScenarioSeed))
  const lane = modeCard('Laning', 'Wave, last-hit, and trades on a clock.', 'open')
  lane.addEventListener('click', () => startLaning((lastScenarioSeed ^ 0x1a4e) >>> 0))
  const jungle = modeCard('Jungle', 'Pathing under fog — shelved.', 'shelved')
  stack.append(fire, lane, jungle)
  sheet.append(stack)
  hud.append(sheet)

  const foot = el('div', 'home-foot')
  const settingsBtn = el('button', 'settings-link', 'Hotkeys')
  settingsBtn.addEventListener('click', () => openBindingsModal())
  foot.append(settingsBtn, document.createTextNode('Menhir Holdings'))
  hud.append(foot)
  shell.append(hud)
  appRoot.append(world, shell)
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
  const shell = el('div', 'play-wrap')
  const host = el('div', 'canvas-host')
  host.id = 'canvas-host'
  const overlay = el('div', 'play-hud')
  overlay.innerHTML = `
    <div class="play-hud-top">
      <div class="pause-kicker play-kicker"><i></i><span id="hud-clock">—</span><i></i></div>
      <button type="button" class="hud-exit" id="hud-exit">Exit</button>
    </div>
    <div class="play-stats" id="hud-stats"></div>
    <div class="play-rail play-rail-left" id="hud-allies"></div>
    <div class="play-rail play-rail-right" id="hud-foes"></div>
    <div class="play-dock">
      <div class="portrait-card" id="hud-player"></div>
      <div class="ability-bar" id="ability-bar"></div>
      <div class="portrait-card" id="hud-target"></div>
    </div>
    <p class="play-hint" id="hud-hint"></p>
    <div class="drill-brief" id="drill-brief" hidden>
      <div class="pause-kicker play-kicker"><i></i> Drill <i></i></div>
      <h2 id="brief-title"></h2>
      <p id="brief-line"></p>
      <div class="brief-count" id="brief-count">3</div>
    </div>
  `
  const hint = overlay.querySelector('#hud-hint') as HTMLElement
  hint.innerHTML =
    'RMB · A · X+click · QWER · 1234 · S · Tab · Esc · <button type="button" class="settings-link" id="hud-hotkeys">Hotkeys</button>'
  overlay.querySelector('#hud-exit')!.addEventListener('click', () => showHome())
  overlay.querySelector('#hud-hotkeys')!.addEventListener('click', () => openBindingsModal())
  const brief = overlay.querySelector('#drill-brief') as HTMLElement
  const laning = world.mode === 'laning'
  ;(overlay.querySelector('#brief-title') as HTMLElement).textContent = laning ? 'Laning' : 'Teamfight'
  ;(overlay.querySelector('#brief-line') as HTMLElement).textContent = laning
    ? 'Last-hit the wave. Trade when they CS. Don\'t die.'
    : 'Dodge the floor. Focus a carry. Execute.'
  brief.hidden = false
  shell.append(host, overlay)
  appRoot.append(shell)

  renderer = new ArenaRenderer(host, world.arena.w, world.arena.h)
  await renderer.bootstrapUnits(world)
  detachFit = renderer.attachResize()
  detachInput = attachInput(renderer.canvas, () => world, inputState, (cx, cy) => renderer!.screenToSim(cx, cy))

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
  syncBrief()
  syncScoreboard()
  syncDeathRematch()

  if (world.ended) {
    running = false
    document.querySelector('.death-panel')?.remove()
    showOutcome(world.result)
    showDebrief(world.mode === 'laning' ? scoreLaningWorld(world) : scoreWorld(world))
    return
  }
  raf = requestAnimationFrame(frame)
}

function hpPct(u: Unit) {
  return Math.max(0, Math.min(100, (u.hp / u.stats.maxHp) * 100))
}

function chipHtml(u: Unit) {
  const cls = [
    'portrait-chip',
    u.isPlayer ? 'player' : '',
    u.team === 'red' ? 'foe' : 'ally',
    !u.alive ? 'dead' : '',
    hpPct(u) <= 35 ? 'hurt' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return `<div class="${cls}" data-id="${u.id}">
    <img src="${champIconUrl(u.champId)}" alt="" draggable="false">
    <div class="hp-track"><i style="width:${hpPct(u)}%"></i></div>
  </div>`
}

function syncRail(node: HTMLElement | null, units: Unit[]) {
  if (!node) return
  const ids = units.map((u) => String(u.id)).join(',')
  if (node.dataset.ids !== ids) {
    node.dataset.ids = ids
    node.innerHTML = units.map(chipHtml).join('')
  }
  for (const u of units) {
    const chip = node.querySelector(`[data-id="${u.id}"]`)
    if (!chip) continue
    chip.classList.toggle('dead', !u.alive)
    chip.classList.toggle('hurt', hpPct(u) <= 35)
    const fill = chip.querySelector('i') as HTMLElement | null
    if (fill) fill.style.width = `${hpPct(u)}%`
  }
}

function syncBrief() {
  const brief = document.getElementById('drill-brief')
  const count = document.getElementById('brief-count')
  if (!brief || !world) return
  if (world.warmup <= 0 || world.ended) {
    brief.hidden = true
    return
  }
  brief.hidden = false
  const n = Math.ceil(world.warmup)
  if (count) count.textContent = n > 0 ? String(n) : 'GO'
}

function portraitCardHtml(u: Unit | null, empty: string) {
  if (!u) return `<div class="portrait-card-empty">${empty}</div>`
  const hp = Math.max(0, Math.round(u.hp))
  const face = ['portrait-face', u.team === 'red' ? 'foe' : 'ally', u.isPlayer ? 'player' : '', !u.alive ? 'dead' : '']
    .filter(Boolean)
    .join(' ')
  return `
    <div class="${face}"><img src="${champIconUrl(u.champId)}" alt="" draggable="false"></div>
    <div class="portrait-meta">
      <strong>${u.champName}</strong>
      <span>${u.archetype}</span>
      <div class="hp-track hp-track-wide${hpPct(u) <= 35 ? ' hurt-bar' : ''}"><i style="width:${hpPct(u)}%"></i></div>
      <em>${hp} / ${u.stats.maxHp}</em>
    </div>
  `
}

function syncPortraitCard(node: HTMLElement | null, u: Unit | null, empty: string) {
  if (!node) return
  const id = u ? String(u.id) : ''
  if (node.dataset.id !== id) {
    node.dataset.id = id
    node.innerHTML = portraitCardHtml(u, empty)
    return
  }
  if (!u) return
  node.querySelector('.portrait-face')?.classList.toggle('dead', !u.alive)
  const track = node.querySelector('.hp-track')
  track?.classList.toggle('hurt-bar', hpPct(u) <= 35)
  const fill = node.querySelector('.hp-track i') as HTMLElement | null
  if (fill) fill.style.width = `${hpPct(u)}%`
  const em = node.querySelector('em')
  if (em) em.textContent = `${Math.max(0, Math.round(u.hp))} / ${u.stats.maxHp}`
}

function updateHud() {
  if (!world) return
  const p = world.units[world.playerId]!
  const remain = Math.max(0, world.duration - world.time)
  const clock = document.getElementById('hud-clock')
  if (clock) clock.textContent = world.warmup > 0 ? 'HOLD' : `${remain.toFixed(1)}s`
  const target = p.targetId != null ? world.units[p.targetId] : null
  const mode = targetingLabel(inputState.targeting)
  const stats = document.getElementById('hud-stats')
  if (stats) {
    const chips: string[] = []
    if (mode) chips.push(`<span class="stat-pill mode-pill">${mode}</span>`)
    if (world.mode === 'laning') chips.push(`<span class="stat-pill">CS <strong>${world.playerCs}</strong></span>`)
    if (world.mode === 'laning' && world.waveTimer <= WAVE_TELEGRAPH) {
      chips.push(`<span class="stat-pill stat-wave">Wave <strong>${world.waveTimer.toFixed(0)}s</strong></span>`)
    }
    if (world.mode === 'laning' && world.lastHitMinionId != null) {
      chips.push(`<span class="stat-pill stat-lasthit">Last hit <strong>!</strong></span>`)
    }
    chips.push(`<span class="stat-pill">AOT <strong>${world.attackChampionsOnly ? 'ON' : 'off'}</strong></span>`)
    stats.innerHTML = chips.join('')
  }
  syncRail(
    document.getElementById('hud-allies'),
    world.units.filter((u) => u.team === p.team).sort((a, b) => a.id - b.id),
  )
  syncRail(
    document.getElementById('hud-foes'),
    world.units.filter((u) => u.team !== p.team).sort((a, b) => a.id - b.id),
  )
  syncPortraitCard(document.getElementById('hud-player'), p, 'You')
  syncPortraitCard(document.getElementById('hud-target'), target?.alive ? target : null, 'No target')
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
  slots.push({
    key: '4',
    label: '4',
    ready: p.wardCooldown <= 0,
    cd: Math.max(0, p.wardCooldown),
    max: WARD_COOLDOWN,
  })
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

function rematchActions(container: HTMLElement) {
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
  container.append(again, regen)
}

/** Mid-fight death: rematch without waiting for team wipe. */
function syncDeathRematch() {
  const host = document.getElementById('canvas-host')
  if (!host || !world || !scenario) return
  const player = world.units[world.playerId]
  if (!player || player.alive || world.ended) {
    host.querySelector('.death-panel')?.remove()
    return
  }
  if (host.querySelector('.death-panel')) return
  const box = el('div', 'death-panel')
  box.innerHTML =
    '<span class="death-label">YOU DIED</span><span class="death-sub">Spectating — or rematch</span><div class="actions"></div>'
  rematchActions(box.querySelector('.actions') as HTMLElement)
  const exit = el('button', 'btn', 'Exit')
  exit.addEventListener('click', () => showHome())
  ;(box.querySelector('.actions') as HTMLElement).append(exit)
  host.append(box)
}

function showDebrief(score: ScoreBreakdown) {
  const shell = appRoot.querySelector('.play-wrap')
  if (!shell || !scenario || !world) return
  document.querySelector('.debrief')?.remove()
  const box = el('div', 'debrief')
  document.querySelector('.play-hud')?.classList.add('play-hud-ended')
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
      ${
        world.mode === 'laning'
          ? `
      <div><strong>${score.cs ?? 0}</strong><span>CS</span></div>
      <div><strong>${score.lastHitMissed ?? 0}</strong><span>Missed</span></div>
      <div><strong>${score.focus}</strong><span>CS pace</span></div>
      <div><strong>${score.spacing}</strong><span>Last-hit</span></div>
      <div><strong>${score.execution}</strong><span>Trades</span></div>
      <div><strong>${score.survival}</strong><span>Survival</span></div>`
          : `
      <div><strong>${score.focus}</strong><span>Focus</span></div>
      <div><strong>${score.spacing}</strong><span>Spacing</span></div>
      <div><strong>${score.execution}</strong><span>Execution</span></div>
      <div><strong>${score.survival}</strong><span>Survival</span></div>
      <div><strong>${score.damageDealt}</strong><span>Dmg out</span></div>
      <div><strong>${score.damageTaken}</strong><span>Dmg in</span></div>`
      }
    </div>
    <ul class="notes">${score.notes.map((n) => `<li>${n}</li>`).join('')}</ul>
    <div class="actions"></div>
  `
  const actions = box.querySelector('.actions') as HTMLElement
  rematchActions(actions)
  const home = el('button', 'btn', 'Exit')
  home.addEventListener('click', () => showHome())
  actions.append(home)
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
  detachFit?.()
  detachFit = null
  renderer?.destroy()
  renderer = null
  world = null
}

showHome()
