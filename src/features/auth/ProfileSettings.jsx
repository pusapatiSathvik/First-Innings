import { useEffect, useState } from 'react'
import { Check, UserRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export function ProfileSettings({ userId }) {
  const [username, setUsername] = useState('')
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    async function loadProfile() {
      setLoading(true)
      const { data, error: loadError } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .single()
      if (!active) return
      if (loadError) setError(loadError.message)
      else {
        setUsername(data.username)
        setDraft(data.username)
      }
      setLoading(false)
    }
    if (userId) loadProfile()
    return () => { active = false }
  }, [userId])

  async function saveUsername(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setSaving(true)
    try {
      const { data, error: saveError } = await supabase.rpc('update_my_username', {
        p_username: draft,
      })
      if (saveError) throw saveError
      setUsername(data)
      setDraft(data)
      setMessage('Username updated. Your account ID and team memberships stay the same.')
    } catch (err) {
      setError(err.message || 'Could not update your username.')
    } finally {
      setSaving(false)
    }
  }

  const changed = draft.trim().toLowerCase() !== username

  return <section className="mt-6 max-w-3xl rounded-2xl border border-white/10 bg-white/[.03] p-5 sm:p-6">
    <div className="flex items-start gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime/10 text-lime"><UserRound size={19}/></div>
      <div>
        <h2 className="font-extrabold">Profile</h2>
        <p className="mt-1 text-sm leading-5 text-muted">Your username is a unique, changeable handle. Your UUID remains your permanent account identity.</p>
      </div>
    </div>
    <form onSubmit={saveUsername} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <label className="text-xs font-bold">Username
        <div className="mt-2 flex items-center rounded-xl border border-white/10 bg-black/20 px-3 focus-within:border-lime/40">
          <span className="text-sm text-muted">@</span>
          <input required minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9-]{2,31}" autoComplete="username" disabled={loading || saving} className="w-full bg-transparent px-2 py-3 text-sm outline-none disabled:opacity-50" value={draft} onChange={event=>setDraft(event.target.value.toLowerCase())} placeholder={loading?'Loading…':'your-username'}/>
        </div>
      </label>
      <button disabled={loading || saving || !changed} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-lime px-4 py-3 text-sm font-extrabold text-ink disabled:cursor-not-allowed disabled:opacity-40">{saving?'Saving…':<><Check size={16}/> Save username</>}</button>
    </form>
    <p className="mt-2 text-xs text-muted">3–32 characters: letters, numbers, and hyphens. Usernames are unique without regard to capitalization.</p>
    {error&&<p role="alert" className="mt-3 text-sm text-rose-200">{error}</p>}
    {message&&<p role="status" className="mt-3 text-sm text-lime">{message}</p>}
  </section>
}
