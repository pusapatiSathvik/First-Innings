import { supabase } from '../../lib/supabase'

export async function listTournaments() {
  const { data, error } = await supabase.from('tournaments').select('id,name,slug,description,venue,starts_on,ends_on,registration_deadline,format,team_limit,roster_min,roster_max,state,created_at').order('starts_on', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data
}

export async function createTournament(values) {
  const { data, error } = await supabase.rpc('admin_create_tournament', values)
  if (error) throw error
  return data
}

export async function updateDraftTournament(values) {
  const { error } = await supabase.rpc('admin_update_draft_tournament', values)
  if (error) throw error
}

export async function transitionTournament(id, nextState, reason = null) {
  const { error } = await supabase.rpc('admin_transition_tournament_optional', { p_tournament_id: id, p_new_state: nextState, p_reason: reason })
  if (error) throw error
}
