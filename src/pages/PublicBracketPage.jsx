import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Feedback } from '../components/Feedback'
import { StageLayout } from '../components/StageLayout'
import { StatusBadge } from '../components/StatusBadge'
import { listPublicBracket } from '../features/fixtures/api'

export function PublicBracketPage() {
  const { slug } = useParams()
  const [bracket, setBracket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let current = true
    listPublicBracket(slug).then(value => { if (current) setBracket(value) }).catch(err => { if (current) setError(err.message || 'Could not load fixtures.') }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [slug])
  return <StageLayout title={bracket?.tournament?.name || 'Tournament bracket'} description="Published knockout bracket and scheduled fixtures.">
    <Feedback error={error}/>
    {loading ? <div className="rounded-xl border border-white/10 p-5 text-sm text-muted">Loading published bracket…</div> : !bracket ? <div className="rounded-xl border border-white/10 p-6"><h2 className="font-extrabold">Tournament not found</h2><Link className="mt-3 inline-block text-sm text-lime" to="/tournaments">Browse tournaments</Link></div> : bracket.stages.length === 0 ? <div className="rounded-xl border border-white/10 p-6 text-sm text-muted">Fixtures have not been published yet.</div> : <div className="grid gap-5 lg:grid-cols-2">{bracket.stages.map(stage => <section key={stage.id} className="rounded-2xl border border-white/10 bg-white/[.025] p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-black">{stage.name}</h2><span className="text-xs text-muted">Round {stage.round_number}</span></div><div className="space-y-3">{bracket.matches.filter(match => match.stage_id === stage.id).map(match => <article key={match.id} className="rounded-xl bg-black/20 p-4"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-bold text-muted">Match {match.match_number}</span><StatusBadge status={match.status}/></div>{match.status === 'bye' ? <><div className="font-bold">{match.winner_name || match.team_a_name || match.team_b_name || 'Seed advances'}</div><p className="mt-1 text-xs text-muted">Bye advancement · no match scorecard</p></> : <><div className={`py-1.5 font-bold ${match.winner_team_id === match.team_a_id ? 'text-lime' : ''}`}>{match.team_a_name || (match.source_match_a_id ? 'Winner of previous match' : 'To be determined')}</div><div className="border-t border-white/[.07] py-1.5 text-sm text-muted">vs</div><div className={`py-1.5 font-bold ${match.winner_team_id === match.team_b_id ? 'text-lime' : ''}`}>{match.team_b_name || (match.source_match_b_id ? 'Winner of previous match' : 'To be determined')}</div>{match.scheduled_for&&<p className="mt-3 text-xs text-muted">{new Date(match.scheduled_for).toLocaleString()} · {match.venue}</p>}{match.status==='completed'&&<p className="mt-2 text-xs text-lime">Winner: {match.winner_name}</p>}</>}</article>)}</div></section>)}</div>}
  </StageLayout>
}
