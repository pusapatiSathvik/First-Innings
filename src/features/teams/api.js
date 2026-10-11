import { supabase } from '../../lib/supabase'

export async function listMyMemberships(userId) {
  const { data, error } = await supabase.from('tournament_members').select('id,tournament_id,team_id,status,requested_at,teams(id,name,status,roster_locked_at,captain_id),tournaments(name,state,roster_min,roster_max)').eq('user_id', userId).order('requested_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createTeam(tournamentId, name) {
  const { data, error } = await supabase.rpc('create_team', { p_tournament_id: tournamentId, p_name: name })
  if (error) throw error
  return data
}

export async function requestMembership(code) {
  const { data, error } = await supabase.rpc('request_team_membership', { p_invite_code: code })
  if (error) throw error
  return data
}

export async function listRoster(teamId) {
  const { data, error } = await supabase.rpc('list_team_roster', { p_team_id: teamId })
  if (error) throw error
  return data
}

export async function listInvites(teamId) {
  const { data, error } = await supabase.rpc('list_team_invites', { p_team_id: teamId })
  if (error) throw error
  return data
}
