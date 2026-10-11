import { useState } from 'react'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { supabase } from '../lib/supabase'
import { Brand } from '../components/Brand'

export function ResetPasswordPage() {
  const { user } = useAuth()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  if (!user) return <Navigate to="/forgot-password" replace />
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) setError(updateError.message); else setMessage('Your password has been updated. You can now use it next time you log in.')
    setBusy(false)
  }
  return <main className="grid min-h-screen place-items-center bg-ink px-5 py-10 text-white"><div className="w-full max-w-md"><Link to="/" className="mb-10 inline-block"><Brand/></Link><h1 className="text-3xl font-black">Choose a new password</h1><p className="mb-7 mt-2 text-sm text-muted">Use at least 8 characters.</p>{error&&<p role="alert" className="mb-4 text-sm text-rose-200">{error}</p>}{message&&<p role="status" className="mb-4 text-sm text-lime">{message}</p>}<form onSubmit={submit} className="space-y-4"><label className="block text-sm font-bold">New password<input className="field mt-2" required minLength={8} type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="flex w-full items-center justify-center rounded-xl bg-lime px-5 py-4 font-extrabold text-ink disabled:opacity-50" disabled={busy}>{busy?<LoaderCircle className="animate-spin" size={20}/>:<>Update password<ArrowRight className="ml-2" size={17}/></>}</button></form></div></main>
}
