import { useCallback, useEffect, useMemo, useState } from 'react'
import { BadgeCheck, RefreshCw, ShieldCheck } from 'lucide-react'
import { Feedback } from '../components/Feedback'
import { StageLayout } from '../components/StageLayout'
import { StatusBadge } from '../components/StatusBadge'
import { Button } from '../components/ui/button'
import { listMyUmpireMatches, listOpenUmpireMatches, joinMatchAsUmpire, finalizeUmpireResult } from '../features/fixtures/api'
import { listTournaments } from '../features/tournaments/api'

export function AdminUmpirePage() {
  const [tournaments, setTournaments] = useState([])
  const [openMatches, setOpenMatches] = useState([])
  const [assigned, setAssigned] = useState([])
  const [tournamentId, setTournamentId] = useState('')
  const [matchId, setMatchId] = useState('')
  const [winners, setWinners] = useState({})
  const [notes, setNotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [tournamentRows, ownRows, openRows] = await Promise.all([listTournaments(), listMyUmpireMatches(), listOpenUmpireMatches()])
      setTournaments(tournamentRows || [])
      setAssigned(ownRows || [])
      setOpenMatches(openRows || [])
    } catch (err) { setError(err.message || 'Could not load umpire assignments.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { refresh() }, [refresh])
  const tournamentMatches = useMemo(() => openMatches.filter(match => match.tournament_id === tournamentId), [openMatches, tournamentId])
  const selectedMatch = tournamentMatches.find(match => match.id === matchId)

  async function run(key, operation, success) {
    setBusy(key); setError(''); setMessage('')
    try { await operation(); setMessage(success); await refresh() }
    catch (err) { setError(err.message || 'The umpire action failed.') }
    finally { setBusy('') }
  }

  function declareWinner(match) {
    const winnerId = winners[match.match_id]
    if (![match.team_a_id, match.team_b_id].includes(winnerId)) {
      setError('Choose one of the two teams as the winner.')
      return
    }
    run(`result-${match.match_id}`, () => finalizeUmpireResult(match.match_id, winnerId, notes[match.match_id]?.trim() || null), 'Winner recorded and the bracket advanced.')
  }

  return <StageLayout title="Umpire desk" description="Admins can join an upcoming match as umpire and record its winner. Ball-by-ball scoring will be added later." admin>
    <Feedback error={error} message={message}/>
    {loading ? <div className="rounded-xl border border-white/10 p-5 text-sm text-muted">Loading umpire desk…</div> : <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-lg font-black">Join a match</h2><p className="mt-1 text-xs text-muted">Select a tournament and a published match that has not started. Only one admin umpire can join each match.</p></div><button onClick={refresh} className="rounded-lg border border-white/10 p-2.5" aria-label="Refresh umpire matches"><RefreshCw size={16}/></button></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">Tournament<select className="field mt-2" value={tournamentId} onChange={event=>{setTournamentId(event.target.value);setMatchId('')}}><option value="">Choose tournament</option>{tournaments.filter(t=>['ready','live'].includes(t.state)).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label className="text-xs font-bold">Match<select className="field mt-2" value={matchId} onChange={event=>setMatchId(event.target.value)} disabled={!tournamentId}><option value="">Choose match</option>{tournamentMatches.map(match=><option key={match.id} value={match.id}>{match.team_a_name||'TBA'} vs {match.team_b_name||'TBA'} · Round {match.round_number}, match {match.match_number}</option>)}</select></label></div>
        {selectedMatch&&<div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-lime/20 bg-lime/[.04] p-4"><div><div className="font-bold">{selectedMatch.team_a_name} vs {selectedMatch.team_b_name}</div><p className="mt-1 text-xs text-muted">{selectedMatch.scheduled_for?new Date(selectedMatch.scheduled_for).toLocaleString():'Time not set'} · {selectedMatch.venue||'Venue not set'}</p></div><Button disabled={busy==='join'} onClick={()=>run('join',()=>joinMatchAsUmpire(selectedMatch.id),'You joined as this match’s umpire.')}>{busy==='join'?'Joining…':'Join as umpire'}</Button></div>}
        {tournamentId&&tournamentMatches.length===0&&<p className="mt-4 rounded-xl bg-black/15 p-3 text-sm text-muted">No available scheduled matches for this tournament.</p>}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:p-6"><div className="mb-4 flex items-center gap-2"><ShieldCheck className="text-lime" size={18}/><h2 className="text-lg font-black">My umpire matches</h2></div>{assigned.length===0?<p className="rounded-xl bg-black/15 p-4 text-sm text-muted">You have not joined any matches as umpire.</p>:<div className="space-y-3">{assigned.map(match=><article key={match.match_id} className="rounded-xl bg-black/15 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs text-muted">{match.tournament_name} · Round {match.round_number}, match {match.match_number}</div><div className="mt-1 font-extrabold">{match.team_a_name||'TBA'} <span className="text-muted">vs</span> {match.team_b_name||'TBA'}</div><p className="mt-1 text-xs text-muted">{match.scheduled_for?new Date(match.scheduled_for).toLocaleString():'Time not set'} · {match.venue||'Venue not set'}</p></div><StatusBadge status={match.status}/></div>{match.status==='completed'?<p className="mt-3 flex items-center gap-2 text-sm font-bold text-lime"><BadgeCheck size={16}/> Winner recorded</p>:<div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><label className="text-xs font-bold">Winner<select className="field mt-2" value={winners[match.match_id]||''} onChange={event=>setWinners(value=>({...value,[match.match_id]:event.target.value}))}><option value="">Select winning team</option><option value={match.team_a_id}>{match.team_a_name}</option><option value={match.team_b_id}>{match.team_b_name}</option></select></label><label className="text-xs font-bold">Optional note<input className="field mt-2" maxLength={300} placeholder="Add a note if useful" value={notes[match.match_id]||''} onChange={event=>setNotes(value=>({...value,[match.match_id]:event.target.value}))}/></label><Button className="self-end" disabled={busy===`result-${match.match_id}`} onClick={()=>declareWinner(match)}>{busy===`result-${match.match_id}`?'Saving…':'Declare winner'}</Button></div>}</article>)}</div>}</section>
    </div>}
  </StageLayout>
}
