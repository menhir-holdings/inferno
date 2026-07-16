import { actionForCode, loadBindings, type Bindings } from './bindings'
import { castAbility, placeWard, useActive } from '../sim/world'
import { unitAt } from '../sim/combat'
import type { InputFrame, World } from '../sim/types'

export type TargetingMode = 'none' | 'attackMove' | 'attackMoveRange' | 'ward' | 'ability'

export interface InputState {
  bindings: Bindings
  targeting: TargetingMode
  pendingAbility: 'q' | 'w' | 'e' | 'r' | null
  showScoreboard: boolean
  showRange: boolean
  pointer: { x: number; y: number }
  recording: InputFrame[]
}

export function createInputState(): InputState {
  return {
    bindings: loadBindings(),
    targeting: 'none',
    pendingAbility: null,
    showScoreboard: false,
    showRange: false,
    pointer: { x: 0, y: 0 },
    recording: [],
  }
}

function record(state: InputState, world: World, frame: Omit<InputFrame, 't'>) {
  state.recording.push({ t: world.time, ...frame })
}

export function attachInput(
  canvas: HTMLCanvasElement,
  getWorld: () => World | null,
  state: InputState,
  screenToWorld: (x: number, y: number) => { x: number; y: number },
) {
  const onKeyDown = (e: KeyboardEvent) => {
    const world = getWorld()
    if (!world || world.ended) return
    const player = world.units[world.playerId]
    if (!player?.alive) return

    const action = actionForCode(state.bindings, e.code)
    if (!action) return
    if (action === 'scoreboard') {
      e.preventDefault()
      state.showScoreboard = true
      return
    }
    e.preventDefault()

    switch (action) {
      case 'stop':
        player.moveTo = null
        player.attackMoveTo = null
        player.targetId = null
        state.targeting = 'none'
        state.showRange = false
        record(state, world, { type: 'stop' })
        break
      case 'attackMove':
        // A: arm attack-move immediately, no range
        state.targeting = 'attackMove'
        state.showRange = false
        break
      case 'attackMoveRange':
        // X: show range, wait for LMB
        state.targeting = 'attackMoveRange'
        state.showRange = true
        break
      case 'abilityQ':
      case 'abilityW':
      case 'abilityE':
      case 'abilityR': {
        const slot = action.slice(-1).toLowerCase() as 'q' | 'w' | 'e' | 'r'
        const aim = state.pointer
        if (castAbility(world, player, slot, aim)) {
          record(state, world, { type: 'ability', slot, x: aim.x, y: aim.y })
        }
        break
      }
      case 'active1':
      case 'active2':
      case 'active3': {
        const n = Number(action.slice(-1)) as 1 | 2 | 3
        if (useActive(world, player, n)) {
          record(state, world, { type: 'active', slot: String(n) })
        }
        break
      }
      case 'ward':
        state.targeting = 'ward'
        state.showRange = false
        break
      case 'aot':
        world.attackChampionsOnly = !world.attackChampionsOnly
        record(state, world, { type: 'aot' })
        break
    }
  }

  const onKeyUp = (e: KeyboardEvent) => {
    const action = actionForCode(state.bindings, e.code)
    if (action === 'scoreboard') state.showScoreboard = false
  }

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    const world = getWorld()
    if (!world || world.ended) return
    const player = world.units[world.playerId]
    if (!player?.alive) return
    const pos = screenToWorld(e.clientX, e.clientY)
    state.pointer = pos
    state.targeting = 'none'
    state.showRange = false

    const enemy = unitAt(world, pos, 40, player.team === 'blue' ? 'red' : 'blue')
    if (enemy) {
      player.targetId = enemy.id
      player.moveTo = null
      player.attackMoveTo = null
      record(state, world, { type: 'attack', x: pos.x, y: pos.y })
    } else {
      player.targetId = null
      player.attackMoveTo = null
      player.moveTo = { ...pos }
      record(state, world, { type: 'move', x: pos.x, y: pos.y })
    }
  }

  const onClick = (e: MouseEvent) => {
    if (e.button !== 0) return
    const world = getWorld()
    if (!world || world.ended) return
    const player = world.units[world.playerId]
    if (!player?.alive) return
    const pos = screenToWorld(e.clientX, e.clientY)
    state.pointer = pos

    if (state.targeting === 'attackMove' || state.targeting === 'attackMoveRange') {
      player.targetId = null
      player.moveTo = null
      player.attackMoveTo = { ...pos }
      record(state, world, { type: 'amove', x: pos.x, y: pos.y })
      state.targeting = 'none'
      state.showRange = false
      return
    }
    if (state.targeting === 'ward') {
      placeWard(world, player, pos)
      record(state, world, { type: 'ward', x: pos.x, y: pos.y })
      state.targeting = 'none'
    }
  }

  const onMove = (e: MouseEvent) => {
    state.pointer = screenToWorld(e.clientX, e.clientY)
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  canvas.addEventListener('contextmenu', onContextMenu)
  canvas.addEventListener('click', onClick)
  canvas.addEventListener('mousemove', onMove)

  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    canvas.removeEventListener('contextmenu', onContextMenu)
    canvas.removeEventListener('click', onClick)
    canvas.removeEventListener('mousemove', onMove)
  }
}
