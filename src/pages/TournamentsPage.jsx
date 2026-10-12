import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, MapPin, Plus, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Feedback } from '../components/Feedback'
import { StageLayout } from '../components/StageLayout'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../features/auth/useAuth'
import { createTeam, listMyMemberships } from '../features/teams/api'
import { listTournaments } from '../features/tournaments/api'
import { isSupabaseConfigured } from '../lib/supabase'

function dateLabel(value) {
  if (!value) return 'Dates to be announced'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`))
}

export function TournamentsPage() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [memberships, setMemberships] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [teamNames, setTeamNames] = useState({})
  const [busyId, setBusyId] = useState('')

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return }
    setError('')
    try {
      const [tournaments, myMemberships] = await Promise.all([listTournaments(), user ? listMyMemberships(user.id) : Promise.resolve([])])
      setItems(tournaments || [])
      setMemberships(myMemberships || [])
    } catch (err) { setError(err.message || 'Could not load tournaments.') }
    finally { setLoading(false) }
  }, [user])

  useEffect(() => { refresh() }, [refresh])

  async function submitTeam(event, tournament) {
    event.preventDefault(); setBusyId(tournament.id); setError(''); setMessage('')
    try {
      await createTeam(tournament.id, teamNames[tournament.id] || '')
      setMessage(`Team created for ${tournament.name}. Add players from My teams.`)
      setTeamNames(current => ({ ...current, [tournament.id]: '' }))
      await refresh()
    } catch (err) { setError(err.message || 'Could not create the team.') }
    finally { setBusyId('') }
  }

  const membershipByTournament = new Map(memberships.map(m => [m.tournament_id, m]))
  return <StageLayout title="Tournaments" description="Find an open tournament, register a team, and follow its status.">
    {!isSupabaseConfigured && <Feedback error="Supabase isn’t configured in this environment. Set the project URL and public key to load tournament data." />}
    <Feedback error={error} message={message} />
    {loading ? <div className="rounded-2xl border border-white/10 p-6 text-sm text-muted">Loading tournaments…</div> : items.length === 0 ? <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center"><Trophy className="mx-auto text-lime" size={28}/><h2 className="mt-4 text-lg font-extrabold">No tournaments to show yet</h2><p className="mt-2 text-sm text-muted">When an administrator opens registration, the tournament will appear here.</p></div> : <div className="grid gap-4 lg:grid-cols-2">{items.map(tournament => {
      const membership = membershipByTournament.get(tournament.id)
      const canCreate = user && tournament.state === 'registration_open' && (!membership || ['withdrawn','rejected'].includes(membership.status))
      return <article key={tournament.id} className="rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-black">{tournament.name}</h2><p className="mt-2 text-sm leading-6 text-muted">{tournament.description || 'Tournament details will be shared by the organizer.'}</p></div><StatusBadge status={tournament.state}/></div><div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-300"><span><CalendarDays className="mr-1 inline text-lime" size={14}/>{dateLabel(tournament.starts_on)}</span>{tournament.venue&&<span><MapPin className="mr-1 inline text-lime" size={14}/>{tournament.venue}</span>}</div><div className="mt-5 flex flex-wrap gap-2 text-xs text-muted"><span className="rounded-lg bg-white/5 px-2.5 py-1.5">Knockout</span><span className="rounded-lg bg-white/5 px-2.5 py-1.5">Team limit {tournament.team_limit}</span><span className="rounded-lg bg-white/5 px-2.5 py-1.5">Squad {tournament.roster_min}–{tournament.roster_max}</span></div>{membership&&<div className="mt-5 flex items-center justify-between rounded-xl bg-black/20 p-3"><div><div className="text-xs font-bold text-slate-200">{membership.teams?.name || 'Team request'}</div><div className="mt-1 text-xs text-muted">Your team status</div></div><StatusBadge status={membership.status}/></div>}{['ready','live','completed'].includes(tournament.state)&&<Link to={`/tournaments/${tournament.slug}/fixtures`} className="mt-5 inline-block text-sm font-extrabold text-lime hover:text-white">View knockout bracket →</Link>}{canCreate&&<form onSubmit={event=>submitTeam(event,tournament)} className="mt-5 flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row"><input required minLength={2} maxLength={60} className="field flex-1" placeholder="Your team name" value={teamNames[tournament.id]||''} onChange={e=>setTeamNames(v=>({...v,[tournament.id]:e.target.value}))}/><button className="rounded-xl bg-lime px-4 py-3 text-sm font-extrabold text-ink disabled:opacity-50" disabled={busyId===tournament.id}>{busyId===tournament.id?'Creating…':<><Plus className="mr-1 inline" size={16}/> Create team</>}</button></form>}{!user&&tournament.state==='registration_open'&&<Link to="/login" className="mt-5 inline-block text-sm font-bold text-lime hover:text-white">Log in to register a team →</Link>}</article>
    })}</div>}
  </StageLayout>
}
