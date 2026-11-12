import type { GameDefinition } from './types.ts'

export const GAMES: GameDefinition[] = [
  { id: 'flashcards', name: 'Карточки', costIv: 10, modes: ['solo'], words: 10 },
  { id: 'sprint', name: 'Спринт', costIv: 15, modes: ['solo', 'multi'], words: 10 },
  { id: 'dictation', name: 'Диктант', costIv: 12, modes: ['solo'], words: 10 },
  { id: 'pairs', name: 'Пары', costIv: 10, modes: ['solo', 'multi'], words: 8 },
  { id: 'blitz', name: 'Блиц', costIv: 20, modes: ['solo', 'multi'], words: 10 },
  { id: 'invaders', name: 'Налёт', costIv: 15, modes: ['solo', 'multi'], words: 12 },
  { id: 'labyrinth', name: 'Лабиринт', costIv: 15, modes: ['solo', 'multi'], words: 5 },
  { id: 'neon', name: 'Неон', costIv: 15, modes: ['solo', 'multi'], words: 12 },
  { id: 'teacher', name: 'Word Teacher', costIv: 12, modes: ['solo'], words: 10 },
]
