import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth.tsx'
import { ApiError, callApi } from '../lib/api.ts'
import { supabase } from '../lib/supabase.ts'
import { parseWordLines } from '../lib/words.ts'

type WordList = { id: string; title: string; source: 'server' | 'upload'; count: number }

export function ListsPage() {
  const { session } = useAuth()
  const [lists, setLists] = useState<WordList[]>([])
  const [title, setTitle] = useState('')
  const [lines, setLines] = useState('cat — кот\ndog — собака')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function load() {
    const { data, error: queryError } = await supabase
      .from('word_lists')
      .select('id, title, source, list_words(count)')
      .order('created_at', { ascending: true })
    if (queryError) {
      setError('Списки не открылись')
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
    setError('')
    const words = parseWordLines(lines)
    if (!title.trim() || words.length === 0 || words.some((word) => !word.translation)) {
      setError('В каждой строке нужны слово и перевод через тире: cat — кот')
      return
    }
    setPending(true)
    try {
      await callApi({ action: 'upload-list', title: title.trim(), words })
      setTitle('')
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Список не сохранился')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <p className="eyebrow">Словарные списки</p>
      {lists.length === 0 ? <p className="meta">Пока пусто. Загрузите свой список ниже.</p> : null}
      <ul className="contents">
        {lists.map((list) => (
          <li key={list.id}>
            <span className="pen-name">{list.title}</span>
            <span className="meta">
              {list.source === 'server' ? 'Общий список' : 'Мой список'} · {list.count}
            </span>
          </li>
        ))}
      </ul>
      <form className="sheet" onSubmit={(event) => void upload(event)}>
        <label className="label" htmlFor="list-title">Название своего списка</label>
        <input id="list-title" className="plain-input" value={title} onChange={(event) => setTitle(event.target.value)} />
        <label className="label" htmlFor="list-lines">Слова, по одному в строке</label>
        <textarea id="list-lines" value={lines} onChange={(event) => setLines(event.target.value)} />
        {error ? <p className="error-line" role="alert">{error}</p> : null}
        <button type="submit" disabled={pending}>Загрузить список</button>
      </form>
    </>
  )
}
