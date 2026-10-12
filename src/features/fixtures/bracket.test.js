import { describe, expect, it } from 'vitest'
import { buildKnockoutBracket } from './bracket'

describe('buildKnockoutBracket', () => {
  it.each([2, 3, 4, 5, 7, 8])('builds a deterministic complete bracket for %i teams', count => {
    const teams = Array.from({ length: count }, (_, index) => ({ id: `team-${index + 1}` }))
    const rounds = buildKnockoutBracket(teams)
    const bracketSize = 2 ** Math.ceil(Math.log2(count))
    const opening = rounds[0]
    const openingTeams = opening.flatMap(match => [match.teamA, match.teamB].filter(Boolean))

    expect(opening).toHaveLength(bracketSize / 2)
    expect(openingTeams.map(team => team.id).sort()).toEqual(teams.map(team => team.id).sort())
    expect(opening.filter(match => match.isBye)).toHaveLength(bracketSize - count)
    expect(rounds.at(-1)).toHaveLength(1)
    expect(rounds.map(round => round.length)).toEqual(Array.from({ length: Math.log2(bracketSize) }, (_, index) => bracketSize / 2 ** (index + 1)))
  })

  it('rejects fewer than two teams', () => {
    expect(() => buildKnockoutBracket([])).toThrow('At least two eligible teams are required.')
  })
})
