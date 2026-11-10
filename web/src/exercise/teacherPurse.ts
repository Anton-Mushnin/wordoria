const PURSE_KEY = 'wordoria-teacher-purse'

export function readPurse(): number {
  const value = Number(sessionStorage.getItem(PURSE_KEY))
  return Number.isFinite(value) ? Math.trunc(value) : 0
}

export function writePurse(value: number) {
  sessionStorage.setItem(PURSE_KEY, String(Math.trunc(value)))
}

export function resetPurse() {
  sessionStorage.removeItem(PURSE_KEY)
}

export function levelKey(sessionId: string) {
  return `wordoria-teacher-level:${sessionId}`
}

export function roundKey(sessionId: string) {
  return `wordoria-teacher-round:${sessionId}`
}

export function bustKey(sessionId: string) {
  return `wordoria-teacher-bust:${sessionId}`
}

export function rememberLevel(sessionId: string, level: number) {
  sessionStorage.setItem(levelKey(sessionId), String(level))
}

export function readLevel(sessionId: string): number {
  const level = Number(sessionStorage.getItem(levelKey(sessionId)))
  return Number.isInteger(level) ? level : 1
}
