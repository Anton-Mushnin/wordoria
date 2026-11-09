import type { ParseKeys, TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../lib/api.ts'
import { errorText } from './labels.ts'

type TextKey = ParseKeys
type Fault = { kind: 'key'; key: TextKey } | { kind: 'api'; code: string; message: string }

function textOf(t: TFunction, key: TextKey) {
  const value = t(key)
  return typeof value === 'string' ? value : key
}

export function useFault() {
  const { t } = useTranslation()
  const [fault, setFault] = useState<Fault | null>(null)
  const text = !fault ? '' : fault.kind === 'key' ? textOf(t, fault.key) : errorText(t, fault.code, fault.message)
  return {
    text,
    clear() {
      setFault(null)
    },
    local(key: TextKey) {
      setFault({ kind: 'key', key })
    },
    caught(error: unknown, key: TextKey) {
      if (error instanceof ApiError) setFault({ kind: 'api', code: error.code, message: error.message })
      else setFault({ kind: 'key', key })
    },
  }
}
