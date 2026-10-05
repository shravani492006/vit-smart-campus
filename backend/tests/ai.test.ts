import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { createContext } from '../src/services/context.js'

let app: ReturnType<typeof createApp>
let ctx: ReturnType<typeof createContext>
beforeEach(() => { ctx = createContext(':memory:'); app = createApp(ctx) })
afterEach(() => { vi.unstubAllGlobals() })
const api = (p: string) => `/api/v1${p}`

/**
 * These tests stub global fetch so they run without needing the real Python
 * service up (matching Part 5's "no network access" requirement) while still
 * exercising the proxy's request shaping, place resolution, and error
 * handling exactly as it behaves against the real service.
 */
describe('POST /api/v1/ai/route (Python AI service proxy)', () => {
  it('resolves place names and forwards node ids to the Python service', async () => {
    const fetchMock = vi.fn(async (url: string, init: any) => {
      expect(url).toBe('http://localhost:8000/api/route')
      const sent = JSON.parse(init.body)
      expect(sent).toEqual({ start: 'entrance', destination: 'library' })
      return new Response(JSON.stringify({
        found: true, start: 'entrance', destination: 'library',
        path: ['entrance', 'canteen', 'blockB', 'blockC', 'library'],
        path_labels: ['Main Gate', 'Canteen', 'Block B', 'Block C', 'Library'],
        total_cost_m: 310, nodes_expanded: 10, nodes_generated: 13,
        algorithm: 'A* (heapq-based, f(n) = g(n) + h(n))', heuristic: 'admissible', message: null,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const r = await request(app).post(api('/ai/route')).send({ from: 'entrance', to: 'library' })
    expect(r.status).toBe(200)
    expect(r.body.found).toBe(true)
    expect(r.body.path).toEqual(['entrance', 'canteen', 'blockB', 'blockC', 'library'])
    expect(r.body.total_cost_m).toBe(310)
    expect(r.body.from.nodeId).toBe('entrance')
    expect(r.body.to.nodeId).toBe('library')
  })

  it('returns 502 (not a crash) when the Python service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const r = await request(app).post(api('/ai/route')).send({ from: 'entrance', to: 'library' })
    expect(r.status).toBe(502)
    expect(r.body.error.code).toBe('AI_SERVICE_UNAVAILABLE')
  })

  it('propagates a clean 502 (no stack trace) when the Python service errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: 'boom' }), { status: 500 })))
    const r = await request(app).post(api('/ai/route')).send({ from: 'entrance', to: 'library' })
    expect(r.status).toBe(502)
    expect(r.body.error.code).toBe('AI_SERVICE_ERROR')
    expect(JSON.stringify(r.body)).not.toMatch(/at Object|Traceback/)
  })

  it('still validates place names locally before calling Python (unknown destination -> 404)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const r = await request(app).post(api('/ai/route')).send({ from: 'entrance', to: 'not-a-real-place' })
    expect(r.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a missing destination with a validation error', async () => {
    const r = await request(app).post(api('/ai/route')).send({ from: 'entrance' })
    expect(r.status).toBe(400)
  })
})

describe('GET /api/v1/ai/health', () => {
  it('reports unreachable cleanly when the Python service is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const r = await request(app).get(api('/ai/health'))
    expect(r.status).toBe(502)
    expect(r.body.reachable).toBe(false)
  })
})
