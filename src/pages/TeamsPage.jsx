import { useCallback, useEffect, useState } from 'react'
import { Clipboard, LockKeyhole, RefreshCw, ShieldCheck, UserRoundPlus, Users, XCircle } from 'lucide-react'
import { Feedback } from '../components/Feedback'
import { StageLayout } from '../components/StageLayout'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../features/auth/useAuth'
import { listMyMemberships, listRoster, listInvites } from '../features/teams/api'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

async function runRpc(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}

export function TeamsPage() {
  const { user } = useAuth()
  const [memberships, setMemberships] = useState([])
  const [rosters, setRosters] = useState({})
  const [invites, setInvites] = useState({})
  const [inviteCode, setInviteCode] = useState('')
  const [newCodes, setNewCodes] = useState({})
  const [transfer, setTransfer] = useState({})
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    if (!supabase || !user) { setLoading(false); return }
    setError('')
    try {
      const [mine, alerts] = await Promise.all([
        listMyMemberships(user.id),
        supabase.from('notifications').select('id,title,body,created_at,read_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(8),
      ])
      if (alerts.error) throw alerts.error
      setMemberships(mine || [])
      setNotifications(alerts.data || [])
      const captainTeams = (mine || []).filter(m => m.status === 'active' && m.teams?.captain_id === user.id)
      const rosterResults = await Promise.all(captainTeams.map(async m => {
        const [roster, inviteRows] = await Promise.all([listRoster(m.team_id), listInvites(m.team_id)])
        return [m.team_id, roster, inviteRows]
      }))
      setRosters(Object.fromEntries(rosterResults.map(([id, roster]) => [id, roster])))
      setInvites(Object.fromEntries(rosterResults.map(([id, _roster, inviteRows]) => [id, inviteRows])))
    } catch (err) { setError(err.message || 'Could not load your team information.') }
    finally { setLoading(false) }
  }, [user])

  useEffect(() => { refresh() }, [refresh])

  async function act(label, operation, successText) {
    setBusy(label); setError(''); setMessage('')
    try { const result = await operation(); if (result?.code) setNewCodes(c => ({ ...c, [label]: result.code })); setMessage(successText); await refresh() }
    catch (err) { setError(err.message || 'That action could not be completed.') }
    finally { setBusy('') }
  }

  async function join(event) {
    event.preventDefault()
    await act('join', () => runRpc('request_team_membership', { p_invite_code: inviteCode.trim() }), 'Your membership request was sent to the captain.')
    setInviteCode('')
  }

  async function createInvite(teamId) {
    setBusy(`invite-${teamId}`); setError(''); setMessage('')
    try {
      const code = await runRpc('create_team_invite', { p_team_id: teamId, p_expires_in_days: 7 })
      setNewCodes(c => ({ ...c, [teamId]: code })); setMessage('Invite created. Copy the code now; it is shown only once.')
      await refresh()
    } catch (err) { setError(err.message || 'Could not create invite.') }
    finally { setBusy('') }
  }

  async function copyCode(teamId) {
    try { await navigator.clipboard.writeText(newCodes[teamId]); setMessage('Invite code copied.') }
    catch { setError('Clipboard access is unavailable. Select and copy the invite code manually.') }
  }

  return <StageLayout title="My teams" description="Manage your team requests and roster, share invitations, and lock your squad when it is ready.">
    {!isSupabaseConfigured&&<Feedback error="Supabase isn’t configured in this environment."/>}
    <Feedback error={error} message={message}/>
    {notifications.length>0&&<section className="mb-6 rounded-2xl border border-white/10 bg-white/[.025] p-5"><div className="mb-3 flex items-center justify-between"><h2 className="font-extrabold">Notifications</h2><span className="text-xs text-muted">Latest 8</span></div><div className="space-y-2">{notifications.map(n=><div key={n.id} className={`flex items-start justify-between gap-4 rounded-xl p-3 ${n.read_at?'bg-black/10':'bg-lime/5'}`}><div><div className="text-sm font-bold">{n.title}</div><div className="mt-1 text-xs leading-5 text-muted">{n.body}</div></div>{!n.read_at&&<button onClick={()=>act(`read-${n.id}`,()=>runRpc('mark_notification_read',{p_notification_id:n.id}),'Notification marked read.')} className="text-xs font-bold text-lime">Mark read</button>}</div>)}</div></section>}
    <form onSubmit={join} className="mb-6 rounded-2xl border border-white/10 bg-white/[.025] p-5"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime/10 text-lime"><UserRoundPlus size={20}/></div><div className="flex-1"><h2 className="font-extrabold">Join a team</h2><p className="mt-1 text-xs leading-5 text-muted">Enter the invitation code from a team captain. You can only belong to one team per tournament.</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><input required maxLength={32} minLength={32} value={inviteCode} onChange={e=>setInviteCode(e.target.value)} className="field flex-1 font-mono" placeholder="32-character invitation code"/><button disabled={busy==='join'||!isSupabaseConfigured} className="rounded-xl bg-lime px-5 py-3 text-sm font-extrabold text-ink disabled:opacity-50">{busy==='join'?'Sending…':'Request to join'}</button></div></div></div></form>
    {loading?<div className="rounded-xl border border-white/10 p-5 text-sm text-muted">Loading your teams…</div>:memberships.length===0?<div className="rounded-2xl border border-dashed border-white/15 p-10 text-center"><Users className="mx-auto text-lime" size={28}/><h2 className="mt-4 font-extrabold">You’re not on a team yet</h2><p className="mt-2 text-sm text-muted">Create one from an open tournament or ask a captain for an invite.</p></div>:<div className="space-y-5">{memberships.map(m=>{
      const team=m.teams; const captain=team?.captain_id===user.id; const roster=rosters[m.team_id]||[]; const teamInvites=invites[m.team_id]||[]
      return <article key={m.id} className="rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-xs font-bold uppercase tracking-[.16em] text-muted">{m.tournaments?.name||'Tournament'}</div><h2 className="mt-1 text-xl font-black">{team?.name||'Team request'}</h2><div className="mt-3 flex items-center gap-2"><StatusBadge status={m.status}/>{team&&<StatusBadge status={team.status}/>}<span className="text-xs text-muted">{captain?'Captain':'Player'}</span></div></div>{team?.roster_locked_at&&<span className="flex items-center gap-1.5 text-xs font-bold text-lime"><LockKeyhole size={14}/> Roster locked</span>}</div>
        {m.status==='pending'&&<p className="mt-4 text-sm text-muted">Your request is waiting for the team captain.</p>}
        {m.status==='rejected'&&<p className="mt-4 text-sm text-muted">This request was declined. Ask for a new invitation if you want to join another team.</p>}
        {m.status==='withdrawn'&&<p className="mt-4 text-sm text-muted">This membership is withdrawn. Historical records are retained.</p>}
        {m.status==='active'&&captain&&<div className="mt-5 border-t border-white/10 pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-extrabold">Squad</h3><p className="mt-1 text-xs text-muted">{roster.filter(r=>r.membership_status==='active').length} active · {m.tournaments?.roster_min}–{m.tournaments?.roster_max} required</p></div><button disabled={busy===`invite-${m.team_id}`||Boolean(team?.roster_locked_at)} onClick={()=>createInvite(m.team_id)} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold hover:bg-white/5 disabled:opacity-40">{busy===`invite-${m.team_id}`?'Creating…':'Create invite'}</button></div>
          {newCodes[m.team_id]&&<div className="mt-4 rounded-xl border border-lime/20 bg-lime/5 p-3"><div className="text-xs font-bold text-lime">New invite code · shown once</div><div className="mt-2 flex flex-wrap items-center gap-2"><code className="break-all rounded bg-black/30 px-2 py-2 font-mono text-sm">{newCodes[m.team_id]}</code><button onClick={()=>copyCode(m.team_id)} className="rounded-lg bg-lime px-3 py-2 text-xs font-extrabold text-ink"><Clipboard className="mr-1 inline" size={14}/> Copy</button></div></div>}
          <div className="mt-4 space-y-2">{roster.map(r=><div key={r.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/15 p-3"><div><div className="text-sm font-bold">{r.full_name||'Player'} {r.user_id===user.id&&<span className="text-xs text-muted">(you)</span>}</div><div className="mt-1 flex items-center gap-2 text-xs text-muted"><StatusBadge status={r.membership_status}/><span>{r.member_role}</span></div></div>{r.membership_status==='pending'&&<div className="flex gap-2"><button disabled={Boolean(team?.roster_locked_at)} onClick={()=>act(`approve-${r.user_id}`,()=>runRpc('decide_team_membership',{p_team_id:m.team_id,p_user_id:r.user_id,p_approve:true}),'Player approved.')} className="rounded-lg bg-lime px-3 py-2 text-xs font-extrabold text-ink disabled:opacity-40">Approve</button><button disabled={Boolean(team?.roster_locked_at)} onClick={()=>act(`reject-${r.user_id}`,()=>runRpc('decide_team_membership',{p_team_id:m.team_id,p_user_id:r.user_id,p_approve:false}),'Request declined.')} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold disabled:opacity-40">Reject</button></div>}</div>)}</div>
          {teamInvites.length>0&&<details className="mt-4 rounded-xl border border-white/10 p-3"><summary className="cursor-pointer text-xs font-bold text-slate-200">Invitation history ({teamInvites.length})</summary><div className="mt-3 space-y-2">{teamInvites.map(inv=><div key={inv.id} className="flex items-center justify-between gap-3 text-xs"><span className="text-muted">Expires {new Date(inv.expires_at).toLocaleDateString()} {inv.revoked_at?'· revoked':''}</span>{!inv.revoked_at&&new Date(inv.expires_at)>new Date()&&<button onClick={()=>act(`revoke-${inv.id}`,()=>runRpc('revoke_team_invite',{p_invite_id:inv.id}),'Invite revoked.')} className="font-bold text-rose-200">Revoke</button>}</div>)}</div></details>}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">{team?.roster_locked_at?<span className="text-xs text-muted">Roster changes are disabled while locked.</span>:<button onClick={()=>act(`lock-${m.team_id}`,()=>runRpc('lock_team_roster',{p_team_id:m.team_id}),'Roster locked. An administrator can review your team.')} className="rounded-lg bg-lime px-4 py-2.5 text-xs font-extrabold text-ink"><LockKeyhole className="mr-1 inline" size={14}/> Lock roster</button>}<div className="flex flex-wrap items-center gap-2"><select aria-label="Transfer captaincy" className="field w-auto py-2 text-xs" value={transfer[m.team_id]||''} onChange={e=>setTransfer(v=>({...v,[m.team_id]:e.target.value}))}><option value="">Choose new captain</option>{roster.filter(r=>r.membership_status==='active'&&r.user_id!==user.id).map(r=><option key={r.user_id} value={r.user_id}>{r.full_name||r.user_id.slice(0,8)}</option>)}</select><button disabled={!transfer[m.team_id]||Boolean(team?.roster_locked_at)} onClick={()=>act(`transfer-${m.team_id}`,()=>runRpc('transfer_team_captain',{p_team_id:m.team_id,p_new_captain:transfer[m.team_id]}),'Captaincy transferred.')} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold disabled:opacity-40">Transfer</button></div><button onClick={()=>window.confirm('Withdraw this team from the tournament? This keeps the history but removes the team from active registration.')&&act(`withdraw-${m.team_id}`,()=>runRpc('withdraw_team',{p_team_id:m.team_id}),'Team withdrawn.')} className="rounded-lg border border-rose-300/15 px-3 py-2 text-xs font-bold text-rose-200"><XCircle className="mr-1 inline" size={14}/> Withdraw team</button></div>
        </div>}
        {m.status==='active'&&!captain&&<div className="mt-4 flex justify-end border-t border-white/10 pt-4"><button onClick={()=>window.confirm('Withdraw your membership? This keeps the history but removes you from the active roster.')&&act(`leave-${m.team_id}`,()=>runRpc('withdraw_from_team',{p_team_id:m.team_id}),'You withdrew from the team.')} className="rounded-lg border border-rose-300/15 px-3 py-2 text-xs font-bold text-rose-200"><XCircle className="mr-1 inline" size={14}/> Withdraw membership</button></div>}
        {team?.roster_locked_at&&captain&&<div className="mt-4 text-xs text-muted"><ShieldCheck className="mr-1 inline text-lime" size={14}/> Need a correction? Ask an administrator to review and unlock the roster.</div>}
      </article>
    })}</div>}
    <div className="mt-5 flex justify-end"><button onClick={refresh} className="flex items-center gap-2 text-xs font-bold text-muted hover:text-white"><RefreshCw size={14}/> Refresh</button></div>
  </StageLayout>
}
