import { useState } from 'react'
import { ArrowLeft, ArrowRight, Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { ConfigNotice } from '../components/ConfigNotice'
import { Button } from '../components/ui/button'
import { useAuth } from '../features/auth/useAuth'
import { supabase } from '../lib/supabase'

export function AuthPage({ mode }) {
  const isRegister = mode === 'register'
  const isReset = mode === 'reset'
  const { user, configured } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const location = useLocation()

  if (user && !isReset) return <Navigate to="/dashboard" replace />

  async function handleSubmit(event) {
    event.preventDefault()
    setError(''); setMessage('')
    if (!supabase) { setError('Connect Supabase to enable this action.'); return }
    setBusy(true)
    try {
      if (isReset) {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
        if (authError) throw authError
        setMessage('If an account exists for that email, we’ve sent a password reset link.')
      } else if (isRegister) {
        const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name.trim() } } })
        if (authError) throw authError
        if (data.session) navigate('/dashboard', { replace: true })
        else setMessage('Check your inbox to confirm your email, then come back to log in.')
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
        if (authError) throw authError
        navigate(location.state?.from || '/dashboard', { replace: true })
      }
    } catch (authError) { setError(authError.message || 'Something went wrong. Please try again.') }
    finally { setBusy(false) }
  }

  const title = isReset ? 'Reset your password' : isRegister ? 'Join the game.' : 'Welcome back.'
  return <main className="grid min-h-screen bg-ink text-white lg:grid-cols-[1fr_.9fr]">
    <section className="relative hidden overflow-hidden border-r border-white/10 p-12 lg:flex lg:flex-col lg:justify-between"><div className="absolute -left-32 top-1/4 h-[30rem] w-[30rem] rounded-full bg-lime/10 blur-[120px]"/><Link to="/" className="relative"><Brand /></Link><div className="relative max-w-xl pb-16"><span className="font-mono text-sm text-lime">01 / THE SEASON STARTS HERE</span><h1 className="mt-5 text-6xl font-black leading-[1.02] tracking-[-.05em]">Make room<br/>for <span className="text-lime">great cricket.</span></h1><p className="mt-6 max-w-md text-lg leading-8 text-slate-300">Bring your people together, set the fixtures, and let the cricket do the talking.</p></div><div className="relative flex items-center gap-2 text-xs text-muted"><span className="h-px w-8 bg-lime"/>A better matchday starts with a little planning.</div></section>
    <section className="flex items-center justify-center px-5 py-10 sm:px-10"><div className="w-full max-w-md"><Link to="/" className="mb-10 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-white lg:hidden"><ArrowLeft size={16}/> Back to home</Link><div className="mb-8 lg:hidden"><Brand/></div><div className="mb-8"><div className="text-sm font-bold uppercase tracking-[.18em] text-lime">Cricket in Box</div><h2 className="mt-3 text-4xl font-black tracking-tight">{title}</h2><p className="mt-2 text-sm text-muted">{isReset ? 'We’ll send a secure link to your inbox.' : isRegister ? 'Create an account to get your team on the board.' : 'Sign in to pick up where your team left off.'}</p></div>
      {!configured && <div className="mb-6"><ConfigNotice/></div>}
      {error && <div role="alert" className="mb-5 rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}{message && <div role="status" className="mb-5 rounded-xl border border-lime/20 bg-lime/10 px-4 py-3 text-sm leading-6 text-lime">{message}</div>}
      <form onSubmit={handleSubmit} className="space-y-5">{isRegister && <label className="block text-sm font-bold">Your name<input autoComplete="name" required maxLength={80} value={name} onChange={e=>setName(e.target.value)} className="field mt-2" placeholder="Sam Patel" /></label>}<label className="block text-sm font-bold">Email address<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} className="field mt-2" placeholder="you@example.com" /></label>{!isReset && <label className="block text-sm font-bold">Password<div className="relative mt-2"><input type={showPassword?'text':'password'} autoComplete={isRegister?'new-password':'current-password'} minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} className="field pr-12" placeholder="At least 8 characters"/><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white" aria-label={showPassword?'Hide password':'Show password'} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>}{!isRegister&&!isReset&&<div className="-mt-1 text-right"><Link className="text-sm font-semibold text-lime hover:text-white" to="/forgot-password">Forgot password?</Link></div>}<Button type="submit" className="h-auto w-full py-4 text-base" disabled={!configured||busy}>{busy?<LoaderCircle className="animate-spin" size={20}/>:<>{isReset?'Send reset link':isRegister?'Create account':'Log in'}<ArrowRight className="ml-2" size={17}/></>}</Button></form>
      {!isReset&&<p className="mt-7 text-center text-sm text-muted">{isRegister?'Already have an account?':"New to Cricket in Box?"} <Link className="font-bold text-lime hover:text-white" to={isRegister?'/login':'/register'}>{isRegister?'Log in':'Create an account'}</Link></p>}{isReset&&<p className="mt-7 text-center text-sm"><Link className="font-bold text-lime hover:text-white" to="/login">Back to login</Link></p>}<p className="mt-9 text-center text-xs leading-5 text-muted">By continuing, you agree to keep the game fair and the community welcoming.</p></div></section>
  </main>
}
