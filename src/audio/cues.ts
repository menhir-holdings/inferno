import type { CueId } from '../sim/types'

let ctx: AudioContext | null = null

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  return ctx
}

function beep(freq: number, dur: number, gain = 0.07, type: OscillatorType = 'square') {
  const audio = ac()
  if (!audio) return
  if (audio.state === 'suspended') void audio.resume()
  const osc = audio.createOscillator()
  const g = audio.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(gain, audio.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0008, audio.currentTime + dur)
  osc.connect(g)
  g.connect(audio.destination)
  osc.start()
  osc.stop(audio.currentTime + dur)
}

export function playCue(id: CueId) {
  switch (id) {
    case 'count':
      beep(220, 0.09, 0.05, 'triangle')
      break
    case 'go':
      beep(440, 0.16, 0.08, 'sawtooth')
      beep(660, 0.12, 0.05, 'triangle')
      break
    case 'cast':
      beep(310, 0.07, 0.045, 'square')
      break
    case 'ult':
      beep(140, 0.22, 0.09, 'sawtooth')
      break
    case 'hit':
      beep(180, 0.04, 0.035, 'square')
      break
    case 'kill':
      beep(520, 0.12, 0.07, 'triangle')
      beep(780, 0.1, 0.04, 'square')
      break
    case 'cs':
      beep(880, 0.06, 0.055, 'square')
      break
    case 'dodge':
      beep(640, 0.08, 0.05, 'triangle')
      break
    case 'death':
      beep(90, 0.28, 0.08, 'sawtooth')
      break
  }
}

export function flushCues(cues: CueId[]) {
  const seen = new Set<CueId>()
  for (const c of cues) {
    if (seen.has(c) && (c === 'hit' || c === 'cast')) continue
    seen.add(c)
    playCue(c)
  }
  cues.length = 0
}
