import { config } from '../config/index.js'
import type { GraphEdge, GraphNode, ModePref, RoutePrefs } from '../types.js'
import { astar, bfs, buildAdj, costsFrom, dfs, enumeratePaths, reachable, type AdjMap } from './algorithms.js'
import { buildInstructions, type Instruction } from './instructions.js'
import type { Campus } from '../store/campus.js'

export const DEFAULT_PREFS: RoutePrefs = { mode: 'shortest', avoidStairs: false, preferLift: false, preferRamp: false, avoidRestricted: true }

/** Accepts the frontend's single-choice `routePreference` plus the extra checkboxes. */
export function normalizePrefs(input: { routePreference?: string; avoidStairs?: boolean; preferLift?: boolean; preferRamp?: boolean; avoidRestricted?: boolean; accessible?: boolean } = {}): RoutePrefs {
  const p: RoutePrefs = { ...DEFAULT_PREFS }
  const rp = input.routePreference
  if (rp === 'fastest' || rp === 'accessible' || rp === 'shortest') p.mode = rp as ModePref
  if (rp === 'avoid-stairs') p.avoidStairs = true
  if (input.accessible) p.mode = 'accessible'
  if (input.avoidStairs) p.avoidStairs = true
  if (input.preferLift) p.preferLift = true
  if (input.preferRamp) p.preferRamp = true
  if (input.avoidRestricted === false) p.avoidRestricted = false
  if (p.mode === 'accessible') p.avoidStairs = true
  return p
}

export interface RouteResult {
  found: true
  distanceM: number
  estimatedTimeSec: number
  estimatedTimeMin: number
  nodes: string[]
  waypoints: { nodeId: string; label: string; type: string; x: number; y: number }[]
  segments: { edgeId: string; from: string; to: string; type: string; distanceM: number; accessible: boolean; restricted: boolean }[]
  instructions: Instruction[]
  accessibility: { fullyAccessible: boolean; usesStairs: boolean; usesLift: boolean; usesRamp: boolean; passesRestrictedArea: boolean }
  warnings: string[]
}
export interface RouteFailure { found: false; reason: 'NO_ROUTE' | 'NO_ROUTE_WITH_PREFERENCES' | 'SAME_LOCATION'; message: string }

const speedFactor: Record<string, number> = { walkway: 1, corridor: 0.95, ramp: 0.8, staircase: 0.55, lift: 1 }
const LIFT_WAIT_SEC = 25

export class RoutingEngine {
  constructor(private campus: Campus) {}

  private nodeMap() { return new Map(this.campus.nodes().map((n) => [n.id, n])) }

  timeSec(e: GraphEdge) {
    const base = e.distanceM / (config.walkSpeed * (speedFactor[e.type] ?? 1)) + (e.type === 'lift' ? LIFT_WAIT_SEC : 0)
    return base * (1 + Math.min(1, Math.max(0, e.congestion)) * 0.5)
  }

  private policy(prefs: RoutePrefs) {
    const allowed = (e: GraphEdge) => {
      if (e.status !== 'open') return false
      if (e.restricted && (prefs.avoidRestricted || prefs.emergency)) return false
      if (prefs.mode === 'accessible' && !e.accessible) return false
      if (prefs.avoidStairs && e.hasStairs) return false
      return true
    }
    const cost = (e: GraphEdge) => {
      let c = prefs.mode === 'shortest' && !prefs.emergency ? e.distanceM : this.timeSec(e)
      if (prefs.preferLift && e.hasLift) c *= 0.7
      if (prefs.preferLift && e.hasStairs) c *= 1.3
      if (prefs.preferRamp && e.hasRamp) c *= 0.7
      if (prefs.emergency && !e.accessible) c *= 1.4
      return c
    }
    return { allowed, cost }
  }

  private heuristic(prefs: RoutePrefs, goal: string, nodes: Map<string, GraphNode>, edges: GraphEdge[]) {
    const { allowed, cost } = this.policy(prefs)
    // admissible: cheapest cost-per-pixel among usable edges * straight-line pixel distance
    let rate = Infinity
    for (const e of edges) {
      if (!allowed(e)) continue
      const a = nodes.get(e.from)!, b = nodes.get(e.to)!
      const px = Math.hypot(a.x - b.x, a.y - b.y)
      if (px > 0) rate = Math.min(rate, cost(e) / px)
    }
    if (!isFinite(rate)) rate = 0
    const g = nodes.get(goal)!
    return (id: string) => { const n = nodes.get(id)!; return Math.hypot(n.x - g.x, n.y - g.y) * rate }
  }

  /** Public entry: pick the algorithm automatically. Caller never chooses. */
  route(from: string, to: string, prefs: RoutePrefs): RouteResult | RouteFailure {
    if (from === to) return { found: false, reason: 'SAME_LOCATION', message: 'You are already at your destination.' }
    const edges = this.campus.edges(), nodes = this.nodeMap()
    const { allowed, cost } = this.policy(prefs)
    const adj = buildAdj(edges, allowed)
    const res = astar(adj, from, to, cost, this.heuristic(prefs, to, nodes, edges))
    if (!res.found) {
      // BFS on the unconstrained (but still open/non-restricted) graph tells us *why* it failed
      const loose = buildAdj(edges, (e) => e.status === 'open' && !e.restricted)
      const possible = reachable(loose, from).has(to)
      return possible
        ? { found: false, reason: 'NO_ROUTE_WITH_PREFERENCES', message: 'No route matches your preferences. Try relaxing accessibility / stairs options.' }
        : { found: false, reason: 'NO_ROUTE', message: 'No open route is currently available to this destination.' }
    }
    return this.assemble(res.nodes, res.edges, nodes, prefs)
  }

  /** Up to `n` alternatives (DFS enumeration of simple paths), excluding the primary. */
  alternatives(from: string, to: string, prefs: RoutePrefs, primary: string[], n = 2): RouteResult[] {
    const edges = this.campus.edges(), nodes = this.nodeMap()
    const { allowed, cost } = this.policy(prefs)
    const adj = buildAdj(edges, allowed)
    const key = primary.join('>')
    const seenKeys = new Set([key])
    const out: RouteResult[] = []
    for (const p of enumeratePaths(adj, from, to, cost)) {
      const k = p.nodes.join('>') + '|' + p.edges.map((e) => e.id).join(',')
      if (seenKeys.has(p.nodes.join('>'))) continue
      seenKeys.add(p.nodes.join('>')); void k
      out.push(this.assemble(p.nodes, p.edges, nodes, prefs))
      if (out.length >= n) break
    }
    return out
  }

  /** Costs (metres for `shortest`, else seconds) from origin to every node — for cards & near-me. */
  distancesFrom(from: string, prefs: RoutePrefs): { distM: Map<string, number>; timeSec: Map<string, number> } {
    const adj: AdjMap = buildAdj(this.campus.edges(), this.policy(prefs).allowed)
    return { distM: costsFrom(adj, from, (e) => e.distanceM), timeSec: costsFrom(adj, from, (e) => this.timeSec(e)) }
  }

  pathEdges(nodeIds: string[], prefs: RoutePrefs): GraphEdge[] | null {
    const { allowed, cost } = this.policy(prefs)
    const edges = this.campus.edges()
    const out: GraphEdge[] = []
    for (let i = 0; i < nodeIds.length - 1; i++) {
      const cands = edges.filter((e) => allowed(e) && ((e.from === nodeIds[i] && e.to === nodeIds[i + 1]) || (e.to === nodeIds[i] && e.from === nodeIds[i + 1])))
      if (!cands.length) return null
      out.push(cands.sort((a, b) => cost(a) - cost(b))[0])
    }
    return out
  }

  assemble(nodeIds: string[], edges: GraphEdge[], nodes: Map<string, GraphNode>, prefs: RoutePrefs): RouteResult {
    const distanceM = edges.reduce((s, e) => s + e.distanceM, 0)
    const timeSec = edges.reduce((s, e) => s + this.timeSec(e), 0)
    const warnings: string[] = []
    const passesRestrictedArea = edges.some((e) => e.restricted)
    if (passesRestrictedArea) warnings.push('This route passes through a restricted area (authorised access only).')
    const usesStairs = edges.some((e) => e.hasStairs)
    if (prefs.mode === 'accessible' && usesStairs) warnings.push('Route uses stairs.')
    return {
      found: true,
      distanceM: Math.round(distanceM),
      estimatedTimeSec: Math.round(timeSec),
      estimatedTimeMin: timeSec === 0 ? 0 : Math.max(1, Math.ceil(timeSec / 60)),
      nodes: nodeIds,
      waypoints: nodeIds.map((id) => { const n = nodes.get(id)!; return { nodeId: id, label: n.label, type: n.type, x: n.x, y: n.y } }),
      segments: edges.map((e, i) => ({ edgeId: e.id, from: nodeIds[i], to: nodeIds[i + 1], type: e.type, distanceM: e.distanceM, accessible: e.accessible, restricted: e.restricted })),
      instructions: buildInstructions(nodeIds, edges, nodes, (e) => this.timeSec(e)),
      accessibility: { fullyAccessible: edges.every((e) => e.accessible), usesStairs, usesLift: edges.some((e) => e.hasLift), usesRamp: edges.some((e) => e.hasRamp), passesRestrictedArea },
      warnings,
    }
  }

  /** Used by the visualizer (technical section only). */
  visualizerGraph() { return { nodes: this.campus.nodes(), edges: this.campus.edges().filter((e) => e.status === 'open' && !e.restricted) } }
  /** Technical demo only: run one named algorithm with a full step trace. */
  visualize(algorithm: 'bfs' | 'dfs' | 'astar', start: string, goal: string) {
    const { nodes, edges } = this.visualizerGraph()
    const adj = buildAdj(edges)
    const nm = new Map(nodes.map((n) => [n.id, n]))
    if (algorithm === 'bfs') return bfs(adj, start, goal, true)
    if (algorithm === 'dfs') return dfs(adj, start, goal, true)
    let rate = Infinity
    for (const e of edges) { const a = nm.get(e.from)!, b = nm.get(e.to)!, px = Math.hypot(a.x - b.x, a.y - b.y); if (px > 0) rate = Math.min(rate, e.distanceM / px) }
    const g = nm.get(goal)!
    return astar(adj, start, goal, (e) => e.distanceM, (id) => { const n = nm.get(id)!; return Math.hypot(n.x - g.x, n.y - g.y) * rate }, true)
  }
  bfsHops(from: string, to: string) {
    const adj = buildAdj(this.campus.edges(), (e) => e.status === 'open' && !e.restricted)
    return bfs(adj, from, to)
  }
}
