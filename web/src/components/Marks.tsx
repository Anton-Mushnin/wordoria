import type { ReactNode } from 'react'

export function PenLine({ progress }: { progress: number }) {
  const width = Math.max(0, Math.min(1, progress)) * 100
  return (
    <svg className="pen-line" viewBox="0 0 300 18" aria-hidden="true">
      <path
        d="M2 11 C 36 6, 68 15, 104 9 S 168 4, 206 11 S 262 16, 298 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        pathLength="100"
        strokeDasharray="100"
        strokeDashoffset={100 - width}
      />
    </svg>
  )
}

export function Stamp({ tone, children }: { tone: 'ok' | 'bad'; children: ReactNode }) {
  return <p className={`stamp stamp-${tone}`}>{children}</p>
}
