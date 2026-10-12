import { useCallback, useEffect, useState } from 'react'
import { Check, Edit3, LockKeyhole, ShieldAlert, X } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { Feedback } from '../components/Feedback'
import { StageLayout } from '../components/StageLayout'
import { StatusBadge } from '../components/StatusBadge'
import { Button } from '../components/ui/button'
import { listRoster } from '../features/teams/api'
import { createTournament, listTournaments, transitionTournament, updateDraftTournament } from '../features/tournaments/api'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { AdminFixtures } from '../components/AdminFixtures'

const emptyForm = { name:'',slug:'',description:'',venue:'',starts_on:'',ends_on:'',registration_deadline:'',team_limit:16,roster_min:2,roster_max:12,scoring_rules:{overs_per_innings:6,wickets_per_innings:5,wide_runs:1,no_ball_runs:1,tie_rule:'super_over'} }
const asDate = value => value || null
const toSlug = value => value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')

function TournamentForm({ initial, onCancel, onSubmit, busy }) {
  const [form,setForm] = useState(initial || emptyForm)
  function change(name,value) { setForm(current=>({...current,[name]:value,...(name==='name'&&!initial?{slug:toSlug(value)}:{})})) }
  async function submit(e) {
    e.preventDefault()
    const base={p_name:form.name.trim(),p_slug:form.slug.trim(),p_description:form.description,p_venue:form.venue,p_starts_on:asDate(form.starts_on),p_ends_on:asDate(form.ends_on),p_registration_deadline:form.registration_deadline?new Date(form.registration_deadline).toISOString():null,p_team_limit:Number(form.team_limit),p_roster_min:Number(form.roster_min),p_roster_max:Number(form.roster_max),p_scoring_rules:Object.fromEntries(Object.entries(form.scoring_rules).map(([k,v])=>[k,k==='tie_rule'?v:Number(v)]))}
    await onSubmit(base)
  }
  return <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
    <label className="text-xs font-bold">Tournament name<input required minLength={2} maxLength={100} className="field mt-2" value={form.name} onChange={e=>change('name',e.target.value)} /></label>
    <label className="text-xs font-bold">Slug<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" className="field mt-2" value={form.slug} onChange={e=>change('slug',e.target.value)} /></label>
    <label className="text-xs font-bold sm:col-span-2">Description<textarea maxLength={4000} rows={3} className="field mt-2 resize-y" value={form.description} onChange={e=>change('description',e.target.value)} /></label>
    <label className="text-xs font-bold sm:col-span-2">Venue<input maxLength={200} className="field mt-2" value={form.venue} onChange={e=>change('venue',e.target.value)} /></label>
    <label className="text-xs font-bold">Starts<input type="date" className="field mt-2" value={form.starts_on||''} onChange={e=>change('starts_on',e.target.value)} /></label>
    <label className="text-xs font-bold">Ends<input type="date" className="field mt-2" value={form.ends_on||''} onChange={e=>change('ends_on',e.target.value)} /></label>
    <label className="text-xs font-bold sm:col-span-2">Registration deadline<input type="datetime-local" className="field mt-2" value={form.registration_deadline||''} onChange={e=>change('registration_deadline',e.target.value)} /></label>
    <label className="text-xs font-bold">Team limit<input type="number" min="2" max="64" required className="field mt-2" value={form.team_limit} onChange={e=>change('team_limit',e.target.value)} /></label>
    <div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold">Roster min<input type="number" min="1" max="30" required className="field mt-2" value={form.roster_min} onChange={e=>change('roster_min',e.target.value)} /></label><label className="text-xs font-bold">Roster max<input type="number" min="1" max="30" required className="field mt-2" value={form.roster_max} onChange={e=>change('roster_max',e.target.value)} /></label></div>
    <fieldset className="rounded-xl border border-white/10 p-4 sm:col-span-2"><legend className="px-2 text-xs font-bold text-lime">Box cricket scoring rules</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs font-bold">Overs per innings<input type="number" min="1" max="50" required className="field mt-2" value={form.scoring_rules.overs_per_innings} onChange={e=>setForm(f=>({...f,scoring_rules:{...f.scoring_rules,overs_per_innings:e.target.value}}))}/></label><label className="text-xs font-bold">Wickets per innings<input type="number" min="1" max="10" required className="field mt-2" value={form.scoring_rules.wickets_per_innings} onChange={e=>setForm(f=>({...f,scoring_rules:{...f.scoring_rules,wickets_per_innings:e.target.value}}))}/></label><label className="text-xs font-bold">Runs per wide<input type="number" min="1" max="5" required className="field mt-2" value={form.scoring_rules.wide_runs} onChange={e=>setForm(f=>({...f,scoring_rules:{...f.scoring_rules,wide_runs:e.target.value}}))}/></label><label className="text-xs font-bold">Runs per no-ball<input type="number" min="1" max="5" required className="field mt-2" value={form.scoring_rules.no_ball_runs} onChange={e=>setForm(f=>({...f,scoring_rules:{...f.scoring_rules,no_ball_runs:e.target.value}}))}/></label><label className="text-xs font-bold sm:col-span-2">Tie resolution<select className="field mt-2" value={form.scoring_rules.tie_rule} onChange={e=>setForm(f=>({...f,scoring_rules:{...f.scoring_rules,tie_rule:e.target.value}}))}><option value="super_over">Super over</option><option value="bowl_out">Bowl out</option><option value="shared">Shared result</option></select></label></div></fieldset>
    <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={busy}>{busy?'Saving…':initial?'Save draft':'Create draft'}</Button></div>
  </form>
}

export function AdminPage() {
  const { tournamentId } = useParams()
  const [tournaments,setTournaments] = useState([])
  const [teams,setTeams] = useState([])
  const [audit,setAudit] = useState([])
  const [rosters,setRosters] = useState({})
  const [reason,setReason] = useState({})
  const [editing,setEditing] = useState(null)
  const [busy,setBusy] = useState('')
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')
  const [message,setMessage] = useState('')

  const refresh = useCallback(async () => {
    if(!supabase){setLoading(false);return}
    setError('')
    try {
      const [t,teamResult] = await Promise.all([
        listTournaments(),
        supabase.from('teams').select('id,name,tournament_id,status,roster_locked_at,captain_id,created_at,tournaments(name,roster_min,roster_max)').eq('tournament_id',tournamentId).order('created_at',{ascending:false}),
      ])
      if(teamResult.error) throw teamResult.error
      setTournaments(t||[]); setTeams(teamResult.data||[])
      const teamRows=teamResult.data||[]
      const reviewRosters=await Promise.all(teamRows.filter(t=>['pending','approved'].includes(t.status)).map(async team=>[team.id,await listRoster(team.id)]))
      setRosters(Object.fromEntries(reviewRosters))
      const {data:matchRows,error:matchError}=await supabase.from('matches').select('id').eq('tournament_id',tournamentId)
      if(matchError) throw matchError
      const entityIds=[tournamentId,...teamRows.map(team=>team.id),...(matchRows||[]).map(match=>match.id)]
      const {data:auditRows,error:auditError}=await supabase.from('audit_logs').select('id,actor_id,action,entity_type,entity_id,reason,details,created_at').in('entity_id',entityIds).order('created_at',{ascending:false}).limit(50)
      if(auditError) throw auditError
      setAudit(auditRows||[])
    } catch(err){setError(err.message||'Could not load admin data.')}
    finally{setLoading(false)}
  },[tournamentId])
  useEffect(()=>{refresh()},[refresh])

  async function action(key,operation,success) {
    setBusy(key);setError('');setMessage('')
    try{await operation();setMessage(success);setEditing(null);await refresh()}
    catch(err){setError(err.message||'The action failed.')}
    finally{setBusy('')}
  }
  function editForm(t) { return {...t,registration_deadline:t.registration_deadline?new Date(t.registration_deadline).toISOString().slice(0,16):'',scoring_rules:{...emptyForm.scoring_rules,...(t.scoring_rules||{})}} }
  const selectedTournament=tournaments.find(t=>t.id===tournamentId)
  async function saveTournament(values,existing) {
    const payload=existing?{p_tournament_id:existing.id,...values}:values
    await action(existing?`save-${existing.id}`:'create',()=>existing?updateDraftTournament(payload):createTournament(values),existing?'Draft tournament updated.':'Draft tournament created.')
  }
  async function decideTeam(team,approve) {
    const why=reason[`team-${team.id}`]||null
    await action(`team-${team.id}`,async()=>{const {error:rpcError}=await supabase.rpc('admin_decide_team',{p_team_id:team.id,p_approve:approve,p_reason:why});if(rpcError)throw rpcError},approve?'Team approved.':'Team rejected.')
  }
  async function override(teamId,userId,kind) {
    const why=reason[`override-${teamId}`]||''
    await action(`override-${teamId}-${userId||kind}`,async()=>{const {error:rpcError}=await supabase.rpc('admin_override_roster',{p_team_id:teamId,p_user_id:userId||null,p_action:kind,p_reason:why});if(rpcError)throw rpcError},kind==='unlock'?'Roster unlocked with an audit entry.':'Roster override recorded.')
  }

  return <StageLayout title={selectedTournament?.name || 'Tournament details'} description="Manage this tournament's teams, fixtures, and match board." admin>
    {!isSupabaseConfigured && <Feedback error="Configure Supabase before using tournament administration."/>}<Feedback error={error} message={message}/>
    {loading ? <div className="rounded-xl border border-white/10 p-5 text-sm text-muted">Loading tournament…</div> : !selectedTournament ? <div className="rounded-xl border border-white/10 p-5 text-sm text-muted">Tournament not found or unavailable.</div> : <>
      <section className="mb-8 rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="flex items-center gap-2"><StatusBadge status={selectedTournament.state}/><span className="text-xs text-muted">{selectedTournament.team_limit} team limit · roster {selectedTournament.roster_min}–{selectedTournament.roster_max}</span></div><h2 className="mt-3 text-xl font-black">Tournament overview</h2><p className="mt-1 text-sm text-muted">{selectedTournament.venue || 'Venue not set'} · {selectedTournament.starts_on || 'Start date not set'}{selectedTournament.ends_on ? ` to ${selectedTournament.ends_on}` : ''}</p></div>
          <div className="flex flex-wrap gap-2">{selectedTournament.state === 'draft' && <><Button variant="outline" onClick={() => setEditing(selectedTournament)}>Edit draft</Button><Button onClick={() => action(`open-${selectedTournament.id}`, () => transitionTournament(selectedTournament.id, 'registration_open'), 'Registration opened.')}>Open registration</Button></>}{selectedTournament.state === 'registration_open' && <Button variant="outline" onClick={() => action(`close-${selectedTournament.id}`, () => transitionTournament(selectedTournament.id, 'registration_closed'), 'Registration closed.')}>Close registration</Button>}</div>
        </div>
        {editing && <div className="mt-5 rounded-xl border border-lime/20 bg-black/15 p-4"><div className="mb-4 flex items-center justify-between"><h3 className="font-extrabold">Edit draft tournament</h3><button onClick={() => setEditing(null)} aria-label="Close editor"><X size={17}/></button></div><TournamentForm key={editing.id} initial={editForm(editing)} onCancel={() => setEditing(null)} onSubmit={v => saveTournament(v, editing)} busy={busy === `save-${editing.id}`}/></div>}
        {!['cancelled','completed'].includes(selectedTournament.state) && <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4"><input aria-label={`Reason to cancel ${selectedTournament.name}`} className="field min-w-64 flex-1 py-2.5 text-xs" placeholder="Cancellation reason (at least 8 characters)" value={reason[`cancel-${selectedTournament.id}`] || ''} onChange={e => setReason(v => ({...v,[`cancel-${selectedTournament.id}`]:e.target.value}))}/><Button variant="outline" onClick={() => { const why = reason[`cancel-${selectedTournament.id}`] || ''; if (why.trim().length < 8) { setError('Enter a cancellation reason of at least 8 characters first.'); return } action(`cancel-${selectedTournament.id}`, () => transitionTournament(selectedTournament.id, 'cancelled', why), 'Tournament cancelled with an audit entry.') }}>Cancel tournament</Button></div>}
      </section>
      <nav aria-label="Tournament management sections" className="mb-6 flex flex-wrap gap-2"><a href="#teams" className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold hover:border-lime/40">Teams</a><a href="#fixtures" className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold hover:border-lime/40">Fixtures &amp; matches</a><a href="#activity" className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold hover:border-lime/40">Activity</a></nav>
      <section id="teams" className="mb-8 rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:p-6"><h2 className="text-xl font-black">Team eligibility</h2><p className="mb-5 mt-1 text-xs text-muted">Approve only after the captain locks a roster within the configured limits.</p>{teams.length===0?<p className="rounded-xl bg-black/15 p-4 text-sm text-muted">No teams have registered.</p>:<div className="space-y-4">{teams.map(team=>{const roster=rosters[team.id]||[];const pending=roster.filter(m=>m.membership_status==='pending');const active=roster.filter(m=>m.membership_status==='active');return <article key={team.id} className="rounded-xl bg-black/15 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-extrabold">{team.name}</div><div className="mt-1 text-xs text-muted">{team.tournaments?.name} · {active.length}/{team.tournaments?.roster_max||'?'} active players</div></div><div className="flex items-center gap-2"><StatusBadge status={team.status}/>{team.roster_locked_at&&<span className="flex items-center gap-1 text-xs text-lime"><LockKeyhole size={13}/> Locked</span>}</div></div>
          <div className="mt-3 space-y-2">{roster.map(member=><div key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/[.035] p-3"><div className="text-sm">{member.full_name||'Player'}<span className="ml-2 font-mono text-[10px] text-muted">{member.user_id.slice(0,8)}</span><div className="mt-1 text-xs text-muted">{member.member_role} · {member.membership_status}</div></div><div className="flex gap-2">{member.membership_status==='pending'&&<button onClick={()=>override(team.id,member.user_id,'approve_member')} className="rounded-lg bg-lime px-3 py-2 text-xs font-extrabold text-ink"><Check className="mr-1 inline" size={13}/> Approve request</button>}{member.membership_status==='active'&&member.member_role!=='captain'&&!team.roster_locked_at&&<button onClick={()=>override(team.id,member.user_id,'withdraw_member')} className="rounded-lg border border-rose-300/15 px-3 py-2 text-xs font-bold text-rose-200">Withdraw member</button>}</div></div>)}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">{team.roster_locked_at&&<button onClick={()=>override(team.id,null,'unlock')} className="rounded-lg border border-amber-200/20 px-3 py-2 text-xs font-bold text-amber-100">Unlock roster</button>}{team.status==='pending'&&<><button disabled={!team.roster_locked_at||pending.length>0} onClick={()=>decideTeam(team,true)} className="rounded-lg bg-lime px-3 py-2 text-xs font-extrabold text-ink disabled:opacity-40">Approve team</button><button onClick={()=>decideTeam(team,false)} className="rounded-lg border border-rose-300/15 px-3 py-2 text-xs font-bold text-rose-200">Reject team</button></>}<input aria-label={`Reason for ${team.name} overrides`} className="field min-w-48 flex-1 py-2 text-xs" placeholder="Required reason for override/rejection" value={reason[`override-${team.id}`]||reason[`team-${team.id}`]||''} onChange={e=>setReason(v=>({...v,[`override-${team.id}`]:e.target.value,[`team-${team.id}`]:e.target.value}))}/></div>
        </article>})}</div>}</section>
      <div id="fixtures" className="mb-8"><AdminFixtures key={selectedTournament.id} tournaments={[selectedTournament]} showTournamentSelector={false}/></div>
            <section id="activity" className="rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:p-6"><div className="mb-4 flex items-center gap-2"><ShieldAlert size={19} className="text-lime"/><h2 className="text-xl font-black">Recent audit history</h2></div>{audit.length===0?<p className="text-sm text-muted">No audited actions yet.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="text-muted"><tr><th className="pb-3">When</th><th className="pb-3">Action</th><th className="pb-3">Entity</th><th className="pb-3">Reason</th><th className="pb-3">Actor</th></tr></thead><tbody>{audit.map(row=><tr key={row.id} className="border-t border-white/[.06]"><td className="py-3 text-muted">{new Date(row.created_at).toLocaleString()}</td><td className="py-3 font-bold">{row.action.replaceAll('_',' ')}</td><td className="py-3">{row.entity_type}</td><td className="max-w-48 py-3 text-muted">{row.reason||'—'}</td><td className="py-3 font-mono text-muted">{row.actor_id?.slice(0,8)||'system'}</td></tr>)}</tbody></table></div>}</section>

    </>}
  </StageLayout>
}
