import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, GitBranch, RefreshCw, ShieldCheck } from 'lucide-react'
import { Feedback } from './Feedback'
import { StatusBadge } from './StatusBadge'
import { Button } from './ui/button'
import { assignMatchOfficial, changeMatchStatus, finalizeAdministrativeResult, generateFixtures, listMatchOfficials, publishFixtures, saveMatchSchedule, swapOpeningRoundTeams } from '../features/fixtures/api'
import { supabase } from '../lib/supabase'

function toLocalDate(value) {
  if (!value) return ''
  const date = new Date(value)
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function AdminFixtures({ tournaments, showTournamentSelector = true }) {
  const [tournamentId, setTournamentId] = useState('')
  const [rounds, setRounds] = useState([])
  const [matches, setMatches] = useState([])
  const [approvedTeams, setApprovedTeams] = useState([])
  const [officials, setOfficials] = useState([])
  const [assignments, setAssignments] = useState({})
  const [forms, setForms] = useState({})
  const [filter, setFilter] = useState('all')
  const [roundFilter, setRoundFilter] = useState('all')
  const [dayFilter, setDayFilter] = useState('')
  const [venueFilter, setVenueFilter] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [swapSelection, setSwapSelection] = useState({ first: '', second: '' })
  const selectedTournament = tournaments.find(t => t.id === tournamentId)
  const currentRoundNumber = useMemo(() => {
    const activeRounds = matches.filter(match => ['draft','scheduled'].includes(match.status) && match.team_a_id && match.team_b_id).map(match => match.round_number)
    return activeRounds.length ? Math.min(...activeRounds) : null
  }, [matches])
  const filtered = useMemo(() => matches.filter(match =>
    (filter === 'all' || match.status === filter) &&
    (roundFilter === 'all' || match.round_number === Number(roundFilter)) &&
    (!dayFilter || toLocalDate(match.scheduled_for).slice(0, 10) === dayFilter) &&
    (!venueFilter || (match.venue || '').toLowerCase().includes(venueFilter.toLowerCase()))
  ), [matches, filter, roundFilter, dayFilter, venueFilter])
  const editablePreview = rounds.length > 0 && rounds.every(round => !round.published_at) && ['registration_open', 'registration_closed'].includes(selectedTournament?.state)
  const openingRoundMatches = matches.filter(match => match.round_number === 1 && match.status === 'draft' && match.team_a_id && match.team_b_id)
  const openingRoundTeams = openingRoundMatches.flatMap(match => [
    { id: match.team_a_id, name: match.team_a_name, matchId: match.id, matchNumber: match.match_number },
    { id: match.team_b_id, name: match.team_b_name, matchId: match.id, matchNumber: match.match_number },
  ])
  const eligibleTeamCount = approvedTeams.filter(team => Boolean(team.roster_locked_at)).length

  useEffect(() => { if (tournaments[0]?.id && tournamentId !== tournaments[0].id) setTournamentId(tournaments[0].id) }, [tournaments, tournamentId])
  const refresh = useCallback(async () => {
    if (!tournamentId) return
    setError('')
    try {
      const [{ data: stageData, error: stageError }, { data: matchData, error: matchError }, availableOfficials] = await Promise.all([
        supabase.from('tournament_stages').select('id,round_number,name,match_count,published_at').eq('tournament_id', tournamentId).order('round_number'),
        supabase.from('matches').select('id,stage_id,tournament_id,round_number,match_number,seed_a,seed_b,team_a_id,team_b_id,source_match_a_id,source_match_b_id,status,winner_team_id,scheduled_for,venue,result_note').eq('tournament_id', tournamentId).order('round_number').order('match_number'),
        listMatchOfficials(),
      ])
      if (stageError) throw stageError
      if (matchError) throw matchError
      const teamIds = [...new Set((matchData || []).flatMap(m => [m.team_a_id,m.team_b_id,m.winner_team_id].filter(Boolean)))]
      const { data: teamData, error: teamError } = teamIds.length ? await supabase.from('teams').select('id,name').in('id', teamIds) : { data: [], error: null }
      if (teamError) throw teamError
        const { data: approvedData, error: approvedError } = await supabase.from('teams').select('id,name,roster_locked_at,created_at').eq('tournament_id', tournamentId).eq('status', 'approved').order('created_at')
        if (approvedError) throw approvedError
      const names = new Map((teamData || []).map(team => [team.id, team.name]))
      const { data: officialLinks, error: assignmentError } = matchData?.length ? await supabase.from('match_officials').select('match_id,user_id').in('match_id', matchData.map(m => m.id)).is('revoked_at', null) : { data: [], error: null }
      if (assignmentError) throw assignmentError
      setRounds(stageData || [])
        setApprovedTeams(approvedData || [])
      setMatches((matchData || []).map(m => ({ ...m, team_a_name: names.get(m.team_a_id), team_b_name: names.get(m.team_b_id), winner_name: names.get(m.winner_team_id) })))
      setOfficials(availableOfficials)
      setAssignments(Object.fromEntries((officialLinks || []).map(link => [link.match_id, link.user_id])))
      setForms(Object.fromEntries((matchData || []).map(m => [m.id, { scheduled_for: toLocalDate(m.scheduled_for), venue: m.venue || '', reason: '', winner_team_id: m.winner_team_id || '' }])))
    } catch (err) { setError(err.message || 'Could not load fixtures.') }
  }, [tournamentId])
  useEffect(() => { refresh() }, [refresh])
  function edit(matchId, key, value) { setForms(current => ({ ...current, [matchId]: { ...current[matchId], [key]: value } })) }
  async function run(key, operation, success) {
    setBusy(key); setError(''); setMessage('')
    try { await operation(); setMessage(success); await refresh() } catch (err) { setError(err.message || 'The fixture action failed.') } finally { setBusy('') }
  }
  async function schedule(match) {
    const form = forms[match.id]
    if (!form?.scheduled_for) { setError('Choose a date and time first.'); return }
    const chosen = new Date(form.scheduled_for)
    if (match.scheduled_for && (new Date(match.scheduled_for).getTime() !== chosen.getTime() || match.venue !== form.venue)) {
        await run(`schedule-${match.id}`, () => saveMatchSchedule(match.id, chosen.toISOString(), form.venue, form.reason.trim() || null, true), 'Match rescheduled.')
    } else await run(`schedule-${match.id}`, () => saveMatchSchedule(match.id, chosen.toISOString(), form.venue), 'Match scheduled.')
  }
  async function statusAction(match, action) {
    const reason = forms[match.id]?.reason || ''
      await run(`${action}-${match.id}`, () => changeMatchStatus(match.id, action, reason.trim() || null), action === 'cancel' ? 'Match cancelled.' : 'Match marked abandoned.')
  }
  async function result(match) {
    const form = forms[match.id]
      if (!form.winner_team_id) { setError('Choose the winning team first.'); return }
      await run(`result-${match.id}`, () => finalizeAdministrativeResult(match.id, form.winner_team_id, form.reason.trim() || null), 'Administrative result recorded and advancement updated.')
  }
          async function swapSelectedTeams() {
            const first = openingRoundTeams.find(team => team.id === swapSelection.first)
            const second = openingRoundTeams.find(team => team.id === swapSelection.second)
            if (!first || !second || first.matchId === second.matchId) return
            await run('swap-teams', () => swapOpeningRoundTeams(first.matchId, first.id, second.matchId, second.id), 'Opening-round teams swapped in the preview.')
            setSwapSelection({ first: '', second: '' })
          }

  return <section className="rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:p-6">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><GitBranch className="text-lime" size={19}/><h2 className="text-xl font-black">Fixtures and match board</h2></div><p className="mt-1 text-xs text-muted">Preview and publish the bracket, follow match progress, and optionally assign an admin umpire.</p></div><button onClick={refresh} className="rounded-lg border border-white/10 p-2.5" aria-label="Refresh fixture data"><RefreshCw size={16}/></button></div>
              <Feedback error={error} message={message}/>
            {['registration_open','registration_closed'].includes(selectedTournament?.state)&&approvedTeams.length>eligibleTeamCount&&<p className="mt-2 rounded-lg border border-amber-200/15 bg-amber-200/[.04] p-3 text-xs text-amber-100">Lock every approved team roster before generating the bracket. {approvedTeams.length-eligibleTeamCount} approved {approvedTeams.length-eligibleTeamCount===1?'team has':'teams have'} an unlocked roster.</p>}
            {editablePreview&&selectedTournament?.state==='registration_open'&&rounds.length>0&&<div className="mt-3 flex justify-end"><Button onClick={()=>run('publish',()=>publishFixtures(tournamentId),'Fixtures published and tournament marked ready. Registration is now closed.')} disabled={busy==='publish'}>{busy==='publish'?'Publishing…':'Fix & publish schedule'}</Button></div>}
            {editablePreview&&openingRoundMatches.length>1&&<div className="mt-3 rounded-xl border border-white/10 bg-black/15 p-4"><p className="text-xs text-muted">Edit the random opening round by swapping teams between two different matches. Bye slots are assigned automatically.</p><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><select className="field py-2" aria-label="First team to swap" value={swapSelection.first} onChange={e=>setSwapSelection(value=>({...value,first:e.target.value}))}><option value="">Select first team</option>{openingRoundTeams.map(team=><option key={`${team.matchId}-${team.id}`} value={team.id}>Match {team.matchNumber} · {team.name}</option>)}</select><select className="field py-2" aria-label="Second team to swap" value={swapSelection.second} onChange={e=>setSwapSelection(value=>({...value,second:e.target.value}))}><option value="">Select second team</option>{openingRoundTeams.filter(team=>team.matchId!==openingRoundTeams.find(candidate=>candidate.id===swapSelection.first)?.matchId).map(team=><option key={`${team.matchId}-${team.id}`} value={team.id}>Match {team.matchNumber} · {team.name}</option>)}</select><Button disabled={!swapSelection.first||!swapSelection.second||busy==='swap-teams'} onClick={swapSelectedTeams}>{busy==='swap-teams'?'Swapping…':'Swap teams'}</Button></div></div>}
    {tournaments.length === 0 ? <p className="text-sm text-muted">Create a tournament first.</p> : <>
                <section className="mb-5 rounded-xl border border-white/10 bg-black/15 p-4"><div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h3 className="font-extrabold">Approved teams</h3><p className="mt-1 text-xs text-muted">Only approved teams with locked rosters are eligible for this knockout schedule.</p></div><span className="text-xs font-bold text-lime">{eligibleTeamCount} eligible · {approvedTeams.length} approved</span></div>{approvedTeams.length===0?<p className="text-sm text-muted">No approved teams yet.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[420px] text-left text-xs"><thead className="text-muted"><tr><th className="pb-2">Team</th><th className="pb-2">Roster</th><th className="pb-2">Eligibility</th></tr></thead><tbody>{approvedTeams.map(team=><tr key={team.id} className="border-t border-white/[.06]"><td className="py-2 font-bold">{team.name}</td><td className="py-2">{team.roster_locked_at?'Locked':'Unlocked'}</td><td className={`py-2 ${team.roster_locked_at?'text-lime':'text-amber-200'}`}>{team.roster_locked_at?'Eligible':'Lock roster first'}</td></tr>)}</tbody></table></div>}</section>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{showTournamentSelector&&<label className="text-xs font-bold lg:col-span-2">Tournament<select className="field mt-2" value={tournamentId} onChange={e=>setTournamentId(e.target.value)}>{tournaments.map(t=><option key={t.id} value={t.id}>{t.name} · {t.state.replaceAll('_',' ')}</option>)}</select></label>}<label className="text-xs font-bold">Status<select className="field mt-2" value={filter} onChange={e=>setFilter(e.target.value)}>{['all','draft','scheduled','waiting','bye','completed','cancelled','abandoned'].map(value=><option key={value} value={value}>{value==='all'?'All statuses':value.replaceAll('_',' ')}</option>)}</select></label><label className="text-xs font-bold">Round<select className="field mt-2" value={roundFilter} onChange={e=>setRoundFilter(e.target.value)}><option value="all">All rounds</option>{rounds.map(round=><option key={round.id} value={round.round_number}>{round.name}</option>)}</select></label><label className="text-xs font-bold">Date<input type="date" className="field mt-2" value={dayFilter} onChange={e=>setDayFilter(e.target.value)}/></label><label className="text-xs font-bold sm:col-span-2 lg:col-span-1">Venue search<input className="field mt-2" value={venueFilter} onChange={e=>setVenueFilter(e.target.value)} placeholder="All venues"/></label></div>
                {['registration_open','registration_closed'].includes(selectedTournament?.state) && <div className="mt-4 rounded-xl border border-white/10 bg-black/15 p-4"><p className="text-sm text-muted">Generate a random pairing preview at any time. Future rounds stay TBA until earlier matches finish. You can regenerate or edit the opening round before publishing.</p><Button className="mt-3" onClick={()=>run('generate',()=>generateFixtures(tournamentId),'Random bracket preview generated. Review it before publishing.')} disabled={busy==='generate'||approvedTeams.length<2||rounds.some(r=>r.published_at)}>{busy==='generate'?'Generating…':rounds.length?'Regenerate random preview':'Generate random bracket preview'}</Button>{approvedTeams.length<2&&<p className="mt-2 text-xs text-muted">At least two approved teams are needed.</p>}{rounds.some(r=>r.published_at)&&<p className="mt-2 text-xs text-muted">Published brackets cannot be regenerated.</p>}</div>}
        {rounds.length > 0 && <div className="mt-5 rounded-xl border border-white/10 bg-black/15 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-extrabold">{rounds.some(r=>r.published_at)?'Fixed tournament schedule':'Schedule preview'}</h3><p className="mt-1 text-xs text-muted">{rounds.length} rounds · {currentRoundNumber?`round ${currentRoundNumber} highlighted as current`:'no playable matches yet'} · byes advance without creating scorecards.</p></div>{selectedTournament?.state==='registration_closed'&&rounds.every(r=>!r.published_at)&&<Button onClick={()=>run('publish',()=>publishFixtures(tournamentId),'Fixtures published and tournament marked ready.')} disabled={busy==='publish'}>{busy==='publish'?'Publishing…':'Fix & publish schedule'}</Button>}</div><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rounds.map(round=><div key={round.id} className="rounded-xl border border-white/[.07] p-3"><div className="mb-3 flex items-center justify-between"><h4 className="font-bold">{round.name}</h4><span className="text-[11px] text-muted">{round.match_count} slots</span></div><div className="space-y-2">{matches.filter(m=>m.stage_id===round.id).map(match=><div key={match.id} className={`rounded-lg p-3 text-xs ${match.round_number===currentRoundNumber&&match.status!=='bye'?'border border-lime/30 bg-lime/[.07]':'bg-white/[.035]'}`}><div className="mb-2 flex justify-between"><b>Match {match.match_number}</b><StatusBadge status={match.status}/></div>{match.status==='bye'?<span className="text-lime">{match.winner_name || match.team_a_name || match.team_b_name} advances · bye</span>:<><div>{match.team_a_name || (match.source_match_a_id?'TBA':`Seed ${match.seed_a}`) || 'TBA'}</div><div className="my-1 border-t border-white/[.08]"/><div>{match.team_b_name || (match.source_match_b_id?'TBA':`Seed ${match.seed_b}`) || 'TBA'}</div></>}</div>)}</div></div>)}</div></div>}
      {matches.length > 0 && <div className="mt-5"><h3 className="mb-3 flex items-center gap-2 font-extrabold"><CalendarDays size={16} className="text-lime"/>Match management</h3><div className="space-y-3">{filtered.map(match=>{const form=forms[match.id]||{};return <article key={match.id} className="rounded-xl border border-white/[.07] bg-black/15 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs text-muted">{rounds.find(r=>r.id===match.stage_id)?.name} · Match {match.match_number}</div><div className="mt-1 font-bold">{match.team_a_name||'TBD'} <span className="text-muted">vs</span> {match.team_b_name||'TBD'}</div></div><StatusBadge status={match.status}/></div>
        {match.status==='bye'?<p className="mt-3 text-xs text-lime">{match.winner_name||match.team_a_name||match.team_b_name} receives a bye advancement. No scorecard is created.</p>:<>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-[11px] font-bold">Date and time<input type="datetime-local" className="field mt-1 py-2.5" value={form.scheduled_for||''} disabled={match.status!=='scheduled'} onChange={e=>edit(match.id,'scheduled_for',e.target.value)}/></label><label className="text-[11px] font-bold">Venue<input maxLength={200} className="field mt-1 py-2.5" value={form.venue||''} disabled={match.status!=='scheduled'} onChange={e=>edit(match.id,'venue',e.target.value)}/></label><label className="text-[11px] font-bold">Assigned admin umpire (optional)<select className="field mt-1 py-2.5" value={officials.some(person=>person.user_id===assignments[match.id])?assignments[match.id]:''} disabled={!['draft','scheduled'].includes(match.status)} onChange={e=>run(`official-${match.id}`,()=>assignMatchOfficial(match.id,e.target.value),'Match official assigned.')}><option value="">Unassigned</option>{officials.map(person=><option key={person.user_id} value={person.user_id}>{person.full_name||person.user_id.slice(0,8)}</option>)}</select></label>{match.status==='completed'?<div className="text-[11px] font-bold">Winner<div className="mt-2 text-sm text-lime">Winner: {match.winner_name}</div><div className="mt-1 text-xs text-muted">Eliminated: {match.winner_team_id===match.team_a_id?match.team_b_name:match.team_a_name}</div><div className="mt-1 text-xs text-muted">{rounds.at(-1)?.id===match.stage_id?"Tournament champion":"Advances to the next round"}</div></div>:<label className="text-[11px] font-bold">Administrative winner review<select className="field mt-1 py-2.5" value={form.winner_team_id||''} disabled={!['scheduled','abandoned','cancelled'].includes(match.status)} onChange={e=>edit(match.id,'winner_team_id',e.target.value)}><option value="">Select winner</option>{[[match.team_a_id,match.team_a_name],[match.team_b_id,match.team_b_name]].filter(row=>row[0]).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>}</div>
          {assignments[match.id]&&!officials.some(person=>person.user_id===assignments[match.id])&&<div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200/15 bg-amber-200/[.04] p-3 text-xs text-amber-100"><span>An existing non-admin assignment is preserved until you change it.</span>{['draft','scheduled'].includes(match.status)&&<Button variant="outline" onClick={()=>run('clear-official-' + match.id,()=>assignMatchOfficial(match.id,null),'Existing assignment cleared.')}>Clear existing assignment</Button>}</div>}
            {match.status!=='completed'&&<label className="mt-3 block text-[11px] font-bold">Optional action reason<input className="field mt-1 py-2.5" maxLength={300} placeholder="Add a note if helpful (optional)" value={form.reason||''} onChange={e=>edit(match.id,'reason',e.target.value)}/></label>}
          <div className="mt-3 flex flex-wrap gap-2">{match.status==='scheduled'&&<Button variant="outline" onClick={()=>schedule(match)} disabled={busy===`schedule-${match.id}`}>{match.scheduled_for?'Save schedule':'Schedule match'}</Button>}{['scheduled','abandoned','cancelled'].includes(match.status)&&<Button onClick={()=>result(match)} disabled={busy===`result-${match.id}`}><ShieldCheck size={15} className="mr-1"/> Record admin result</Button>}{['draft','scheduled','waiting','abandoned'].includes(match.status)&&<><Button variant="outline" onClick={()=>statusAction(match,'cancel')} disabled={busy===`cancel-${match.id}`}>Cancel match</Button>{match.status==='scheduled'&&<Button variant="outline" onClick={()=>statusAction(match,'abandon')} disabled={busy===`abandon-${match.id}`}>Mark abandoned</Button>}</>}</div>
        </>}</article>})}{filtered.length===0&&<p className="rounded-xl bg-black/15 p-4 text-sm text-muted">No matches in this status.</p>}</div></div>}
    </>}
  </section>
}
