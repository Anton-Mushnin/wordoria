import i18n from '../i18n/index.ts'
import { supabase } from './supabase.ts'

export class ApiError extends Error {
  readonly code: string

  constructor(message: string, code = 'ERROR') {
    super(message)
    this.code = code
  }
}

export async function callApi<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('api', { body })
  if (error) {
    const context = (error as { context?: Response }).context
    if (context) {
      try {
        const payload = (await context.json()) as { error?: { message?: string; code?: string } }
        if (payload.error?.message) throw new ApiError(payload.error.message, payload.error.code)
      } catch (parseError) {
        if (parseError instanceof ApiError) throw parseError
      }
    }
    throw new ApiError(i18n.t('errors.SERVER'), 'SERVER')
  }
  const payload = data as { error?: { message?: string; code?: string } }
  if (payload?.error?.message) throw new ApiError(payload.error.message, payload.error.code)
  return data as T
}
