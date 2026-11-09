import type { GameDefinition } from './types.ts'

export const GAMES: GameDefinition[] = [
  { id: 'flashcards', name: 'Карточки', costIv: 10, modes: ['solo'] },
  { id: 'sprint', name: 'Спринт', costIv: 15, modes: ['solo', 'multi'] },
  { id: 'dictation', name: 'Диктант', costIv: 12, modes: ['solo'] },
  { id: 'pairs', name: 'Пары', costIv: 10, modes: ['solo', 'multi'] },
  { id: 'blitz', name: 'Блиц', costIv: 20, modes: ['solo', 'multi'] },
  { id: 'invaders', name: 'Налёт', costIv: 15, modes: ['solo', 'multi'] },
]
