import { supabase } from '../../lib/supabase'

export async function generateFixtures(tournamentId) {
  const { data, error } = await supabase.rpc('admin_generate_fixtures', { p_tournament_id: tournamentId })
  if (error) throw error
  return data
}

export async function publishFixtures(tournamentId) {
  const { error } = await supabase.rpc('admin_publish_fixtures', { p_tournament_id: tournamentId })
  if (error) throw error
}

export async function listMatchOfficials() {
  const { data, error } = await supabase.rpc('admin_list_match_officials')
  if (error) throw error
  return data || []
}

export async function assignMatchOfficial(matchId, userId) {
  const { error } = await supabase.rpc('admin_assign_match_official', { p_match_id: matchId, p_user_id: userId || null })
  if (error) throw error
}

export async function saveMatchSchedule(matchId, scheduledFor, venue, rescheduleReason = null) {
  const rpc = rescheduleReason ? 'admin_reschedule_match' : 'admin_schedule_match'
  const args = { p_match_id: matchId, p_scheduled_for: scheduledFor, p_venue: venue }
  if (rescheduleReason) args.p_reason = rescheduleReason
  const { error } = await supabase.rpc(rpc, args)
  if (error) throw error
}

export async function changeMatchStatus(matchId, action, reason) {
  const rpc = action === 'cancel' ? 'admin_cancel_match' : 'admin_mark_match_abandoned'
  const { error } = await supabase.rpc(rpc, { p_match_id: matchId, p_reason: reason })
  if (error) throw error
}

export async function finalizeAdministrativeResult(matchId, winnerId, reason) {
  const { error } = await supabase.rpc('admin_finalize_match', { p_match_id: matchId, p_winner_team_id: winnerId, p_reason: reason })
  if (error) throw error
}

export async function listPublicBracket(slug) {
  const { data: tournament, error: tournamentError } = await supabase.from('tournaments').select('id,name,slug,state').eq('slug', slug).maybeSingle()
  if (tournamentError) throw tournamentError
  if (!tournament) return null
  const [{ data: stages, error: stageError }, { data: matches, error: matchError }] = await Promise.all([
    supabase.from('tournament_stages').select('id,round_number,name,match_count,published_at').eq('tournament_id', tournament.id).order('round_number'),
    supabase.from('matches').select('id,stage_id,round_number,match_number,seed_a,seed_b,team_a_id,team_b_id,source_match_a_id,source_match_b_id,status,winner_team_id,scheduled_for,venue').eq('tournament_id', tournament.id).order('round_number').order('match_number'),
  ])
  if (stageError) throw stageError
  if (matchError) throw matchError
  const teamIds = [...new Set((matches || []).flatMap(match => [match.team_a_id, match.team_b_id, match.winner_team_id].filter(Boolean)))]
  const teamNames = new Map()
  if (teamIds.length) {
    const { data: teams, error: teamsError } = await supabase.from('teams').select('id,name').in('id', teamIds)
    if (teamsError) throw teamsError
    for (const team of teams || []) teamNames.set(team.id, team.name)
  }
  return { tournament, stages: stages || [], matches: (matches || []).map(match => ({ ...match, team_a_name: teamNames.get(match.team_a_id), team_b_name: teamNames.get(match.team_b_id), winner_name: teamNames.get(match.winner_team_id) })) }
}
