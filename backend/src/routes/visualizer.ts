import { Router } from 'express'
import { z } from 'zod'
import { AppError } from '../errors.js'
import type { Ctx } from '../services/context.js'

/**
 * ALGORITHM VISUALIZER — separate technical section (viva / demo / education).
 * This is the ONLY place BFS / DFS / A* are exposed and selectable.
 */
export function visualizerRoutes(ctx: Ctx) {
  const r = Router()
  r.get('/graph', (_req, res) => res.json({ ...ctx.engine.visualizerGraph(), algorithms: ['bfs', 'dfs', 'astar'], astarFormula: 'f(n) = g(n) + h(n)' }))
  r.post('/run', (req, res) => {
    const b = z.object({ algorithm: z.enum(['bfs', 'dfs', 'astar']), start: z.string(), goal: z.string() }).parse(req.body)
    if (!ctx.campus.node(b.start) || !ctx.campus.node(b.goal)) throw new AppError(404, 'NODE_NOT_FOUND', 'Unknown start or goal node.')
    const out = ctx.engine.visualize(b.algorithm, b.start, b.goal)
    res.json({
      algorithm: b.algorithm, start: b.start, goal: b.goal, found: out.found, path: out.nodes,
      totalCostM: b.algorithm === 'astar' && out.found ? Math.round(out.cost) : undefined,
      hops: out.edges.length, explanation: EXPLAIN[b.algorithm], steps: out.trace,
    })
  })
  return r
}
const EXPLAIN = {
  bfs: 'Explores level by level using a queue; finds the path with the fewest hops.',
  dfs: 'Goes as deep as possible along one branch, then backtracks; finds a path, not necessarily the shortest.',
  astar: 'Goal-directed search using f(n) = g(n) + h(n): g = cost so far, h = straight-line estimate to goal.',
}
