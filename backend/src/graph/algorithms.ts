/**
 * Path-finding algorithms. These are BACKEND IMPLEMENTATION DETAILS: the public
 * routing API never exposes which one ran. Only /visualizer/* returns traces.
 */
import type { GraphEdge } from '../types.js'

export interface Adj { edge: GraphEdge; to: string }
export type AdjMap = Map<string, Adj[]>

export interface TraceStep {
  step: number
  current: string
  visited: string[]
  openSet: string[]
  closedSet: string[]
  exploredEdges: { from: string; to: string }[]
  g?: number; h?: number; f?: number
  path: string[]
}
export interface AlgoResult { found: boolean; nodes: string[]; edges: GraphEdge[]; cost: number; trace: TraceStep[] }

export function buildAdj(edges: GraphEdge[], allow: (e: GraphEdge) => boolean = () => true): AdjMap {
  const m: AdjMap = new Map()
  const add = (a: string, b: string, edge: GraphEdge) => { if (!m.has(a)) m.set(a, []); m.get(a)!.push({ edge, to: b }) }
  for (const e of edges) { if (!allow(e)) continue; add(e.from, e.to, e); add(e.to, e.from, e) }
  return m
}

function rebuild(prev: Map<string, { node: string; edge: GraphEdge } | null>, goal: string) {
  const nodes: string[] = [], edges: GraphEdge[] = []
  let cur: string | undefined = goal
  while (cur) {
    nodes.push(cur)
    const p = prev.get(cur)
    if (!p) break
    edges.push(p.edge); cur = p.node
  }
  return { nodes: nodes.reverse(), edges: edges.reverse() }
}

/** Breadth-first search: fewest hops. Also used for reachability checks. */
export function bfs(adj: AdjMap, start: string, goal: string, trace = false): AlgoResult {
  const prev = new Map<string, { node: string; edge: GraphEdge } | null>([[start, null]])
  const queue = [start], visited: string[] = [start], explored: { from: string; to: string }[] = [], steps: TraceStep[] = []
  while (queue.length) {
    const cur = queue.shift()!
    if (trace) steps.push({ step: steps.length, current: cur, visited: [...visited], openSet: [...queue], closedSet: [], exploredEdges: [...explored], path: cur === goal ? rebuild(prev, goal).nodes : [] })
    if (cur === goal) { const r = rebuild(prev, goal); return { found: true, ...r, cost: r.edges.length, trace: steps } }
    for (const { to, edge } of adj.get(cur) ?? []) {
      if (prev.has(to)) continue
      prev.set(to, { node: cur, edge }); visited.push(to); queue.push(to); explored.push({ from: cur, to })
    }
  }
  return { found: false, nodes: [], edges: [], cost: Infinity, trace: steps }
}

/** Set of nodes reachable from start (BFS). */
export function reachable(adj: AdjMap, start: string): Set<string> {
  const seen = new Set([start]), q = [start]
  while (q.length) for (const { to } of adj.get(q.shift()!) ?? []) if (!seen.has(to)) { seen.add(to); q.push(to) }
  return seen
}

/** Depth-first search (iterative, with backtracking trace). */
export function dfs(adj: AdjMap, start: string, goal: string, trace = false): AlgoResult {
  const prev = new Map<string, { node: string; edge: GraphEdge } | null>([[start, null]])
  const stack: { node: string; via: { node: string; edge: GraphEdge } | null }[] = [{ node: start, via: null }]
  const visited: string[] = [], seen = new Set<string>(), explored: { from: string; to: string }[] = [], steps: TraceStep[] = []
  while (stack.length) {
    const { node, via } = stack.pop()!
    if (seen.has(node)) continue
    seen.add(node); visited.push(node)
    if (via) { prev.set(node, via); explored.push({ from: via.node, to: node }) }
    if (trace) steps.push({ step: steps.length, current: node, visited: [...visited], openSet: stack.map((s) => s.node), closedSet: [], exploredEdges: [...explored], path: node === goal ? rebuild(prev, goal).nodes : [] })
    if (node === goal) { const r = rebuild(prev, goal); return { found: true, ...r, cost: r.edges.length, trace: steps } }
    const nbrs = [...(adj.get(node) ?? [])].reverse()
    for (const { to, edge } of nbrs) if (!seen.has(to)) stack.push({ node: to, via: { node, edge } })
  }
  return { found: false, nodes: [], edges: [], cost: Infinity, trace: steps }
}

/**
 * A* search. f(n) = g(n) + h(n). `heuristic` MUST be admissible for the given
 * `cost` function (RoutingEngine guarantees this) so the result is optimal.
 */
export function astar(adj: AdjMap, start: string, goal: string, cost: (e: GraphEdge) => number, heuristic: (id: string) => number, trace = false): AlgoResult {
  const g = new Map<string, number>([[start, 0]])
  const prev = new Map<string, { node: string; edge: GraphEdge } | null>([[start, null]])
  const open = new Map<string, number>([[start, heuristic(start)]])
  const closed = new Set<string>(), visited: string[] = [], explored: { from: string; to: string }[] = [], steps: TraceStep[] = []
  while (open.size) {
    let cur = '', best = Infinity
    for (const [id, f] of open) if (f < best) { best = f; cur = id }
    open.delete(cur); closed.add(cur); visited.push(cur)
    if (trace) steps.push({ step: steps.length, current: cur, visited: [...visited], openSet: [...open.keys()], closedSet: [...closed], exploredEdges: [...explored], g: round(g.get(cur)!), h: round(heuristic(cur)), f: round(best), path: cur === goal ? rebuild(prev, goal).nodes : [] })
    if (cur === goal) { const r = rebuild(prev, goal); return { found: true, ...r, cost: g.get(goal)!, trace: steps } }
    for (const { to, edge } of adj.get(cur) ?? []) {
      if (closed.has(to)) continue
      const ng = g.get(cur)! + cost(edge)
      if (ng < (g.get(to) ?? Infinity)) {
        g.set(to, ng); prev.set(to, { node: cur, edge }); open.set(to, ng + heuristic(to)); explored.push({ from: cur, to })
      }
    }
  }
  return { found: false, nodes: [], edges: [], cost: Infinity, trace: steps }
}

/** Single-source shortest costs (Dijkstra) — used for distances in cards / near-me. */
export function costsFrom(adj: AdjMap, start: string, cost: (e: GraphEdge) => number): Map<string, number> {
  const dist = new Map<string, number>([[start, 0]]), done = new Set<string>()
  while (true) {
    let cur = '', best = Infinity
    for (const [id, d] of dist) if (!done.has(id) && d < best) { best = d; cur = id }
    if (!cur) break
    done.add(cur)
    for (const { to, edge } of adj.get(cur) ?? []) {
      const nd = best + cost(edge)
      if (nd < (dist.get(to) ?? Infinity)) dist.set(to, nd)
    }
  }
  return dist
}

/** Bounded DFS enumeration of simple paths (used for alternative routes). */
export function enumeratePaths(adj: AdjMap, start: string, goal: string, cost: (e: GraphEdge) => number, maxHops = 8, maxPaths = 200, budget = 2.5): { nodes: string[]; edges: GraphEdge[]; cost: number }[] {
  const out: { nodes: string[]; edges: GraphEdge[]; cost: number }[] = []
  const bestKnown = { v: Infinity }
  const onPath = new Set([start])
  const nodes = [start], edges: GraphEdge[] = []
  const walk = (cur: string, c: number) => {
    if (out.length >= maxPaths || c > bestKnown.v * budget) return
    if (cur === goal) { out.push({ nodes: [...nodes], edges: [...edges], cost: c }); bestKnown.v = Math.min(bestKnown.v, c); return }
    if (edges.length >= maxHops) return
    for (const { to, edge } of adj.get(cur) ?? []) {
      if (onPath.has(to)) continue
      onPath.add(to); nodes.push(to); edges.push(edge)
      walk(to, c + cost(edge))
      onPath.delete(to); nodes.pop(); edges.pop()
    }
  }
  walk(start, 0)
  return out.sort((a, b) => a.cost - b.cost)
}

const round = (n: number) => Math.round(n * 10) / 10
