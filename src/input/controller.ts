import { actionForCode, loadBindings, type Bindings } from './bindings'
import { castAbility, issueAttackMove, queueWard, useActive } from '../sim/world'
import { approachPoint } from '../sim/collision'
import { attackStopDist, unitAt } from '../sim/combat'
import type { InputFrame, World } from '../sim/types'

export type TargetingMode = 'none' | 'attackMoveRange'

export interface InputState {
  bindings: Bindings
  targeting: TargetingMode
  showScoreboard: boolean
  showRange: boolean
  pointer: { x: number; y: number }
  recording: InputFrame[]
}

export function createInputState(): InputState {
  return {
    bindings: loadBindings(),
    targeting: 'none',
    showScoreboard: false,
    showRange: false,
    pointer: { x: 0, y: 0 },
    recording: [],
  }
}

function record(state: InputState, world: World, frame: Omit<InputFrame, 't'>) {
  state.recording.push({ t: world.time, ...frame })
}

export function targetingLabel(mode: TargetingMode): string | null {
  if (mode === 'attackMoveRange') return 'RANGE'
  return null
}

export function cancelTargeting(state: InputState) {
  state.targeting = 'none'
  state.showRange = false
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

    if (e.code === 'Escape') {
      cancelTargeting(state)
      player.pendingWard = null
      return
    }

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
        player.pendingWard = null
        cancelTargeting(state)
        record(state, world, { type: 'stop' })
        break
      case 'attackMove': {
        const pos = state.pointer
        issueAttackMove(world, player, pos)
        cancelTargeting(state)
        record(state, world, { type: 'amove', x: pos.x, y: pos.y })
        break
      }
      case 'attackMoveRange':
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
      case 'ward': {
        const pos = state.pointer
        if (queueWard(world, player, pos)) {
          record(state, world, { type: 'ward', x: pos.x, y: pos.y })
        }
        cancelTargeting(state)
        break
      }
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
    cancelTargeting(state)

    const enemy = unitAt(world, pos, 40, player.team === 'blue' ? 'red' : 'blue')
    if (enemy) {
      player.targetId = enemy.id
      player.moveTo = approachPoint(player.pos, enemy.pos, attackStopDist(player))
      player.attackMoveTo = null
      player.pendingWard = null
      record(state, world, { type: 'attack', x: pos.x, y: pos.y })
    } else {
      player.targetId = null
      player.attackMoveTo = null
      player.pendingWard = null
      player.moveTo = { ...pos }
      record(state, world, { type: 'move', x: pos.x, y: pos.y })
    }
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    const world = getWorld()
    if (!world || world.ended) return
    const player = world.units[world.playerId]
    if (!player?.alive) return
    const pos = screenToWorld(e.clientX, e.clientY)
    state.pointer = pos

    if (state.targeting === 'attackMoveRange') {
      e.preventDefault()
      issueAttackMove(world, player, pos)
      record(state, world, { type: 'amove', x: pos.x, y: pos.y })
      cancelTargeting(state)
    }
  }

  const onMove = (e: PointerEvent) => {
    state.pointer = screenToWorld(e.clientX, e.clientY)
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  canvas.addEventListener('contextmenu', onContextMenu)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onMove)

  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    canvas.removeEventListener('contextmenu', onContextMenu)
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onMove)
  }
}
