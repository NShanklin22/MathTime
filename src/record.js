// A finished run as the record kept for it (runs spec §5): the game's result
// (game.js), with an id made here, so a retried upload is never stored
// twice, and the moment it finished, as an ISO time in UTC. Times are whole
// ms. The record is plain data, a copy: nothing else holds on to it.
export function buildRecord(result, { id = crypto.randomUUID(), finishedAt = new Date() } = {}) {
  return {
    id,
    level: result.level,
    finishedAt: finishedAt.toISOString(),
    totalMs: Math.round(result.totalMs),
    misses: result.misses,
    problems: result.problems.map(({ a, b, ms, misses }) => ({ a, b, ms: Math.round(ms), misses })),
  };
}
