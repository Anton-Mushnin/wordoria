import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth.tsx'
import { useFault } from '../i18n/fault.ts'
import { callApi } from '../lib/api.ts'
import { supabase } from '../lib/supabase.ts'
import { parseWordLines } from '../lib/words.ts'

type WordList = { id: string; title: string; source: 'server' | 'upload'; count: number }

export function ListsPage() {
  const { t, i18n } = useTranslation()
  const { session } = useAuth()
  const [lists, setLists] = useState<WordList[]>([])
  const [title, setTitle] = useState('')
  const [lines, setLines] = useState(() => t('lists.sample'))
  const fault = useFault()
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const samples = (['ru', 'en', 'fi'] as const).map((code) => i18n.getResource(code, 'translation', 'lists.sample'))
    setLines((current) => (samples.includes(current) ? t('lists.sample') : current))
  }, [i18n, i18n.language, t])

  async function load() {
    const { data, error: queryError } = await supabase
      .from('word_lists')
      .select('id, title, source, list_words(count)')
      .order('created_at', { ascending: true })
    if (queryError) {
      fault.local('lists.loadFailed')
      return
    }
    setLists(
      (data ?? []).map((row) => {
        const countField = (row as { list_words?: { count: number }[] }).list_words
        return {
          id: String(row.id),
          title: String(row.title),
          source: row.source as 'server' | 'upload',
          count: countField?.[0]?.count ?? 0,
        }
      }),
    )
  }

  useEffect(() => {
    if (session) void load()
  }, [session])

  async function upload(event: FormEvent) {
    event.preventDefault()
    fault.clear()
    const words = parseWordLines(lines)
    if (!title.trim() || words.length === 0 || words.some((word) => !word.translation)) {
      fault.local('lists.badLines')
      return
    }
    setPending(true)
    try {
      await callApi({ action: 'upload-list', title: title.trim(), words })
      setTitle('')
      await load()
    } catch (caught) {
      fault.caught(caught, 'lists.saveFailed')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <p className="eyebrow">{t('lists.eyebrow')}</p>
      {lists.length === 0 ? <p className="meta">{t('lists.empty')}</p> : null}
      <ul className="contents">
        {lists.map((list) => (
          <li key={list.id}>
            <span className="pen-name">{list.title}</span>
            <span className="meta">
              {list.source === 'server' ? t('lists.shared') : t('lists.mine')} · {list.count}
            </span>
          </li>
        ))}
      </ul>
      <form className="sheet" onSubmit={(event) => void upload(event)}>
        <label className="label" htmlFor="list-title">{t('lists.title')}</label>
        <input id="list-title" className="plain-input" value={title} onChange={(event) => setTitle(event.target.value)} />
        <label className="label" htmlFor="list-lines">{t('lists.lines')}</label>
        <textarea id="list-lines" value={lines} onChange={(event) => setLines(event.target.value)} />
        {fault.text ? <p className="error-line" role="alert">{fault.text}</p> : null}
        <button type="submit" disabled={pending}>{t('lists.upload')}</button>
      </form>
    </>
  )
}
