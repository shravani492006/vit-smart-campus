import { describe, expect, it } from 'vitest'
import { astar, bfs, buildAdj, costsFrom, dfs } from '../src/graph/algorithms.js'
import { normalizePrefs } from '../src/graph/routing.js'
import { createContext } from '../src/services/context.js'

const mk = () => createContext(':memory:')

describe('algorithms', () => {
  const ctx = mk()
  const edges = ctx.campus.edges().filter((e) => e.status === 'open' && !e.restricted)
  const adj = buildAdj(edges)
  it('BFS finds a path with the fewest hops', () => {
    const r = bfs(adj, 'entrance', 'library')
    expect(r.found).toBe(true)
    expect(r.nodes[0]).toBe('entrance'); expect(r.nodes.at(-1)).toBe('library')
    expect(r.edges.length).toBe(r.nodes.length - 1)
  })
  it('DFS finds some valid path', () => {
    const r = dfs(adj, 'entrance', 'den')
    expect(r.found).toBe(true)
    for (let i = 0; i < r.nodes.length - 1; i++) expect(edges.some((e) => (e.from === r.nodes[i] && e.to === r.nodes[i + 1]) || (e.to === r.nodes[i] && e.from === r.nodes[i + 1]))).toBe(true)
  })
  it('A* (admissible heuristic) matches Dijkstra optimum for every node pair', () => {
    const nodes = ctx.campus.nodes(), nm = new Map(nodes.map((n) => [n.id, n]))
    let rate = Infinity
    for (const e of edges) { const a = nm.get(e.from)!, b = nm.get(e.to)!; rate = Math.min(rate, e.distanceM / Math.hypot(a.x - b.x, a.y - b.y)) }
    for (const s of nodes) {
      const truth = costsFrom(adj, s.id, (e) => e.distanceM)
      for (const t of nodes) {
        const g = nm.get(t.id)!
        const r = astar(adj, s.id, t.id, (e) => e.distanceM, (id) => Math.hypot(nm.get(id)!.x - g.x, nm.get(id)!.y - g.y) * rate)
        expect(Math.round(r.cost)).toBe(Math.round(truth.get(t.id)!))
      }
    }
  })
  it('returns not found for disconnected goal', () => {
    expect(bfs(new Map(), 'a', 'b').found).toBe(false)
  })
})

describe('routing engine', () => {
  it('shortest route entrance -> library', () => {
    const { engine } = mk()
    const r = engine.route('entrance', 'library', normalizePrefs({ routePreference: 'shortest' }))
    expect(r.found).toBe(true)
    if (r.found) { expect(r.distanceM).toBeGreaterThan(0); expect(r.estimatedTimeMin).toBeGreaterThan(0); expect(r.instructions.at(-1)!.type).toBe('arrive') }
  })
  it('accessible route never uses stairs and is not shorter than the unrestricted shortest', () => {
    const { engine } = mk()
    const s = engine.route('blockB', 'library', normalizePrefs({ routePreference: 'shortest' }))
    const a = engine.route('blockB', 'library', normalizePrefs({ routePreference: 'accessible' }))
    if (!s.found || !a.found) throw new Error('expected routes')
    expect(s.accessibility.usesStairs).toBe(true)
    expect(a.accessibility.usesStairs).toBe(false)
    expect(a.accessibility.fullyAccessible).toBe(true)
    expect(a.distanceM).toBeGreaterThanOrEqual(s.distanceM)
  })
  it('avoid-stairs preference (frontend single-choice value) avoids stairs', () => {
    const { engine } = mk()
    const r = engine.route('entrance', 'library', normalizePrefs({ routePreference: 'avoid-stairs' }))
    expect(r.found && r.accessibility.usesStairs).toBe(false)
  })
  it('prefer lift picks the lift over stairs', () => {
    const { engine } = mk()
    const r = engine.route('blockC', 'library', normalizePrefs({ preferLift: true }))
    expect(r.found && r.accessibility.usesLift).toBe(true)
  })
  it('never routes through restricted staff corridor by default', () => {
    const { engine } = mk()
    const r = engine.route('blockD', 'blockE', normalizePrefs({}))
    if (!r.found) throw new Error('no route')
    expect(r.accessibility.passesRestrictedArea).toBe(false)
    expect(r.distanceM).toBe(70)
  })
  it('restricted edge usable only when user opts out, with a warning', () => {
    const { engine } = mk()
    const r = engine.route('blockD', 'blockE', normalizePrefs({ avoidRestricted: false }))
    if (!r.found) throw new Error('no route')
    expect(r.distanceM).toBe(40); expect(r.warnings.join(' ')).toMatch(/restricted/i)
  })
  it('closed/blocked edges are avoided and a detour is found', () => {
    const ctx = mk()
    const before = ctx.engine.route('blockA', 'blockB', normalizePrefs({}))
    ctx.db.state.edgeOverrides['e5'] = { status: 'blocked' }
    const after = ctx.engine.route('blockA', 'blockB', normalizePrefs({}))
    if (!before.found || !after.found) throw new Error('no route')
    expect(after.segments.some((s) => s.edgeId === 'e5')).toBe(false)
    expect(after.distanceM).toBeGreaterThan(before.distanceM)
  })
  it('explains failures caused by preferences vs. real disconnection', () => {
    const ctx = mk()
    for (const id of ['e11', 'e12']) ctx.db.state.edgeOverrides[id] = id === 'e12' ? { status: 'closed' } : {}
    const r = ctx.engine.route('blockC', 'library', normalizePrefs({ routePreference: 'accessible' }))
    // library still reachable via block D (e14) which is accessible -> route exists
    expect(r.found).toBe(true)
    ctx.db.state.edgeOverrides['e14'] = { status: 'closed' }
    const r2 = ctx.engine.route('blockC', 'library', normalizePrefs({ routePreference: 'accessible' }))
    expect(r2.found).toBe(false)
    if (!r2.found) expect(r2.reason).toBe('NO_ROUTE_WITH_PREFERENCES')
    ctx.db.state.edgeOverrides['e11'] = { status: 'closed' }
    const r3 = ctx.engine.route('blockC', 'library', normalizePrefs({}))
    expect(r3.found).toBe(false)
    if (!r3.found) expect(r3.reason).toBe('NO_ROUTE')
  })
  it('turn directions are left/right for a known geometry', () => {
    const { engine } = mk()
    const r = engine.route('entrance', 'library', normalizePrefs({}))
    if (!r.found) throw new Error('no route')
    expect(r.instructions.every((i) => i.text.length > 0)).toBe(true)
    expect(r.instructions[0].type).toBe('depart')
  })
  it('alternatives are distinct from the primary route (DFS enumeration)', () => {
    const { engine } = mk()
    const r = engine.route('entrance', 'library', normalizePrefs({}))
    if (!r.found) throw new Error('no route')
    const alts = engine.alternatives('entrance', 'library', normalizePrefs({}), r.nodes, 2)
    expect(alts.length).toBeGreaterThan(0)
    for (const a of alts) expect(a.nodes.join()).not.toBe(r.nodes.join())
  })
})
