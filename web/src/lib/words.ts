export type WordDraft = { term: string; translation: string }

export function parseWordLines(text: string): WordDraft[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const dash = line.split(/\s+[—–]\s+/)
      if (dash.length >= 2) {
        return { term: dash[0]!.trim(), translation: dash.slice(1).join(' — ').trim() }
      }
      const hyphen = line.split(/\s+-\s+/)
      if (hyphen.length >= 2) {
        return { term: hyphen[0]!.trim(), translation: hyphen.slice(1).join(' - ').trim() }
      }
      return { term: line, translation: '' }
    })
}

export function asIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') return value.replace(/^\{|\}$/g, '').split(',').filter(Boolean)
  return []
}

export function formatWhen(iso: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))
}
