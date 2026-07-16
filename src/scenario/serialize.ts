import type { Scenario } from '../sim/types'

const LIB_KEY = 'inferno.scenarios'

export function saveScenarioLocal(scenario: Scenario, name?: string) {
  const lib = loadScenarioLibrary()
  const entry = {
    name: name ?? `Teamfight ${scenario.seed}`,
    savedAt: Date.now(),
    scenario,
  }
  lib.unshift(entry)
  localStorage.setItem(LIB_KEY, JSON.stringify(lib.slice(0, 40)))
  return entry
}

export function loadScenarioLibrary(): { name: string; savedAt: number; scenario: Scenario }[] {
  try {
    return JSON.parse(localStorage.getItem(LIB_KEY) || '[]')
  } catch {
    return []
  }
}

export function downloadScenario(scenario: Scenario) {
  const blob = new Blob([JSON.stringify(scenario, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `inferno-teamfight-${scenario.seed}.json`
  a.click()
  URL.revokeObjectURL(url)
}
