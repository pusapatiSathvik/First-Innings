const nextPowerOfTwo = value => 2 ** Math.ceil(Math.log2(value))

// Standard seeded knockout ordering: [1,4,2,3] for four slots and
// [1,8,4,5,2,7,3,6] for eight. Seeds are assigned deterministically by the
// database using each approved team's creation time and UUID.
export function buildKnockoutBracket(teams) {
  if (!Array.isArray(teams) || teams.length < 2) throw new Error('At least two eligible teams are required.')
  const size = nextPowerOfTwo(teams.length)
  let order = [1, 2]
  while (order.length < size) {
    const current = order
    order = current.flatMap(seed => [seed, 2 * current.length + 1 - seed])
  }
  const rounds = []
  let currentMatches = order.reduce((matches, seed, index) => {
    const matchIndex = Math.floor(index / 2)
    matches[matchIndex] ||= { matchNumber: matchIndex + 1, seedA: null, seedB: null, teamA: null, teamB: null, isBye: false }
    const match = matches[matchIndex]
    if (index % 2 === 0) { match.seedA = seed; match.teamA = teams[seed - 1] || null }
    else { match.seedB = seed; match.teamB = teams[seed - 1] || null }
    match.isBye = Boolean(match.teamA) !== Boolean(match.teamB)
    return matches
  }, [])
  rounds.push(currentMatches)
  while (currentMatches.length > 1) {
    currentMatches = Array.from({ length: currentMatches.length / 2 }, (_, index) => ({
      matchNumber: index + 1,
      sourceA: rounds.at(-1)[index * 2],
      sourceB: rounds.at(-1)[index * 2 + 1],
      teamA: null,
      teamB: null,
      isBye: false,
    }))
    rounds.push(currentMatches)
  }
  return rounds
}
