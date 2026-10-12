import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Plus, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Feedback } from '../components/Feedback'
import { StageLayout } from '../components/StageLayout'
import { StatusBadge } from '../components/StatusBadge'
import { Button } from '../components/ui/button'
import { createTournament, listTournaments } from '../features/tournaments/api'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const initialForm = { name:'',slug:'',description:'',venue:'',starts_on:'',ends_on:'',registration_deadline:'',team_limit:16,roster_min:2,roster_max:12 }
const makeSlug = value => value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')

function CreateTournamentForm({ onCancel, onCreated }) {
  const [form,setForm] = useState(initialForm)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  function change(key,value) { setForm(current=>({...current,[key]:value,...(key==='name'&&!current.slug?{slug:makeSlug(value)}:{})})) }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const tournamentId = await createTournament({
        p_name:form.name.trim(),p_slug:form.slug.trim(),p_description:form.description,p_venue:form.venue,
        p_starts_on:form.starts_on||null,p_ends_on:form.ends_on||null,
        p_registration_deadline:form.registration_deadline?new Date(form.registration_deadline).toISOString():null,
        p_team_limit:Number(form.team_limit),p_roster_min:Number(form.roster_min),p_roster_max:Number(form.roster_max),
        p_scoring_rules:{overs_per_innings:6,wickets_per_innings:5,wide_runs:1,no_ball_runs:1,tie_rule:'super_over'},
      })
      await onCreated(tournamentId)
    } catch (err) { setError(err.message||'Could not create the tournament.') }
    finally { setBusy(false) }
  }
  return <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
    <Feedback error={error} className="sm:col-span-2"/>
    <label className="text-xs font-bold">Tournament name<input required minLength={2} maxLength={100} className="field mt-2" value={form.name} onChange={e=>change('name',e.target.value)}/></label>
    <label className="text-xs font-bold">Slug<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" className="field mt-2" value={form.slug} onChange={e=>change('slug',e.target.value)}/></label>
    <label className="text-xs font-bold sm:col-span-2">Description<textarea maxLength={4000} rows={2} className="field mt-2 resize-y" value={form.description} onChange={e=>change('description',e.target.value)}/></label>
    <label className="text-xs font-bold sm:col-span-2">Venue<input maxLength={200} className="field mt-2" value={form.venue} onChange={e=>change('venue',e.target.value)}/></label>
    <label className="text-xs font-bold">Starts<input type="date" className="field mt-2" value={form.starts_on} onChange={e=>change('starts_on',e.target.value)}/></label>
    <label className="text-xs font-bold">Ends<input type="date" className="field mt-2" value={form.ends_on} onChange={e=>change('ends_on',e.target.value)}/></label>
    <label className="text-xs font-bold sm:col-span-2">Registration deadline<input type="datetime-local" className="field mt-2" value={form.registration_deadline} onChange={e=>change('registration_deadline',e.target.value)}/></label>
    <label className="text-xs font-bold">Team limit<input type="number" min="2" max="64" required className="field mt-2" value={form.team_limit} onChange={e=>change('team_limit',e.target.value)}/></label>
    <div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold">Roster min<input type="number" min="1" max="30" required className="field mt-2" value={form.roster_min} onChange={e=>change('roster_min',e.target.value)}/></label><label className="text-xs font-bold">Roster max<input type="number" min="1" max="30" required className="field mt-2" value={form.roster_max} onChange={e=>change('roster_max',e.target.value)}/></label></div>
    <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={busy}>{busy?'Creating…':'Create draft tournament'}</Button></div>
  </form>
}

function formatDate(start,end) {
  if (!start && !end) return 'Dates not set'
  const fmt = value => value ? new Intl.DateTimeFormat(undefined,{dateStyle:'medium'}).format(new Date(`${value}T00:00:00`)) : null
  if (start && end && start !== end) return `${fmt(start)} – ${fmt(end)}`
  return fmt(start||end)
}

export function AdminTournamentsPage() {
  const [tournaments,setTournaments] = useState([])
  const [showCreate,setShowCreate] = useState(false)
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')
  const navigate = useNavigate()
  const refresh = useCallback(async () => {
    if (!supabase) { setLoading(false); return }
    setError('')
    try { setTournaments(await listTournaments() || []) }
    catch (err) { setError(err.message||'Could not load tournaments.') }
    finally { setLoading(false) }
  },[])
  useEffect(()=>{refresh()},[refresh])
  const sections = [
    { title:'Current tournaments', description:'Matches are in progress.', states:['live'] },
    { title:'Upcoming tournaments', description:'Drafts, registration, and published fixtures.', states:['draft','registration_open','registration_closed','ready'] },
    { title:'Past tournaments', description:'Completed or cancelled tournaments.', states:['completed','cancelled'] },
  ]
  async function created(tournamentId) { await refresh(); navigate(`/admin/tournaments/${tournamentId}`) }
  return <StageLayout title="Tournament administration" description="Create tournaments and open one to manage its teams, fixtures, and match board." admin>
    {!isSupabaseConfigured&&<Feedback error="Configure Supabase before using tournament administration."/>}<Feedback error={error}/>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-black">Your tournaments</h2><p className="mt-1 text-sm text-muted">Select a tournament to manage its workflow.</p></div><div className="flex flex-wrap gap-2"><Link to="/admin/umpire" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold hover:bg-white/5">Umpire desk</Link><Button onClick={()=>setShowCreate(true)}><Plus className="mr-1" size={16}/> Create tournament</Button></div></div>
    {showCreate&&<div className="mb-7 rounded-2xl border border-white/10 bg-white/[.025] p-5"><div className="mb-5 flex items-center justify-between"><h3 className="text-lg font-extrabold">New tournament</h3><button onClick={()=>setShowCreate(false)} aria-label="Close create tournament form"><X size={18}/></button></div><CreateTournamentForm onCancel={()=>setShowCreate(false)} onCreated={created}/></div>}
    {loading?<div className="rounded-xl border border-white/10 p-5 text-sm text-muted">Loading tournaments…</div>:<div className="space-y-8">{sections.map(section=>{const rows=tournaments.filter(t=>section.states.includes(t.state));return <section key={section.title}><div className="mb-3"><h3 className="text-lg font-black">{section.title}</h3><p className="mt-1 text-xs text-muted">{section.description}</p></div>{rows.length===0?<div className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-muted">No {section.title.toLowerCase()}.</div>:<div className="grid gap-3 md:grid-cols-2">{rows.map(tournament=><Link key={tournament.id} to={`/admin/tournaments/${tournament.id}`} className="rounded-2xl border border-white/10 bg-white/[.025] p-5 transition hover:border-lime/30 hover:bg-white/[.04]"><div className="flex items-start justify-between gap-3"><div><h4 className="font-extrabold">{tournament.name}</h4><p className="mt-1 text-xs text-muted">{tournament.venue||'Venue not set'}</p></div><StatusBadge status={tournament.state}/></div><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-300"><span><CalendarDays className="mr-1 inline text-lime" size={14}/>{formatDate(tournament.starts_on,tournament.ends_on)}</span><span>{tournament.team_limit} team limit</span></div><div className="mt-4 text-xs font-bold text-lime">Open tournament →</div></Link>)}</div>}</section>})}</div>}
  </StageLayout>
}
