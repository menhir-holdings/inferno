export type ActionId =
  | 'stop'
  | 'attackMove'
  | 'attackMoveRange'
  | 'abilityQ'
  | 'abilityW'
  | 'abilityE'
  | 'abilityR'
  | 'active1'
  | 'active2'
  | 'active3'
  | 'ward'
  | 'aot'
  | 'scoreboard'

export type Bindings = Record<ActionId, string>

export const DEFAULT_BINDINGS: Bindings = {
  stop: 'KeyS',
  attackMove: 'KeyA',
  attackMoveRange: 'KeyX',
  abilityQ: 'KeyQ',
  abilityW: 'KeyW',
  abilityE: 'KeyE',
  abilityR: 'KeyR',
  active1: 'Digit1',
  active2: 'Digit2',
  active3: 'Digit3',
  ward: 'Digit4',
  aot: 'Backquote',
  scoreboard: 'Tab',
}

const STORAGE_KEY = 'inferno.bindings'

export function loadBindings(): Bindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_BINDINGS }
    return { ...DEFAULT_BINDINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_BINDINGS }
  }
}

export function saveBindings(b: Bindings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(b))
}

export function actionForCode(bindings: Bindings, code: string): ActionId | null {
  for (const [action, c] of Object.entries(bindings) as [ActionId, string][]) {
    if (c === code) return action
  }
  return null
}

export function labelForCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code === 'Backquote') return '`'
  if (code === 'Tab') return 'Tab'
  return code
}
