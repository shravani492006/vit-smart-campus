import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createContext } from '../src/services/context.js'

let app: ReturnType<typeof createApp>
let ctx: ReturnType<typeof createContext>
beforeEach(() => { ctx = createContext(':memory:'); app = createApp(ctx) })
const api = (p: string) => `/api/v1${p}`
const H = { 'X-Admin-Key': 'test-key' }

describe('health & meta', () => {
  it('health + ready', async () => {
    expect((await request(app).get('/health')).body.status).toBe('ok')
    expect((await request(app).get('/ready')).body.locations).toBeGreaterThan(50)
  })
  it('meta exposes preferences but no algorithm choices', async () => {
    const r = await request(app).get(api('/meta'))
    expect(r.status).toBe(200)
    expect(r.body.institute).toMatch(/Vidyalankar/)
    expect(JSON.stringify(r.body.routePreferences)).not.toMatch(/bfs|dfs|a\*|astar/i)
  })
})

describe('search (natural language)', () => {
  const top = async (q: string, extra = '') => (await request(app).get(api(`/search?q=${encodeURIComponent(q)}${extra}`))).body
  it.each([
    ['Where is the IT department?', 'it-dept'],
    ['Find the library.', 'library'],
    ['Where can I print?', 'v-print'],
    ['Find the computer lab.', 'comp-lab'],
    ['Where is the auditorium?', 'auditorium'],
    ['Take me to Biomedical Engineering', 'bme-dept'],
    ['Where is the Training and Placement Cell?', 'tpc'],
    ['Find the nearest first aid.', 'first-aid'],
  ])('%s -> %s', async (q, id) => { expect((await top(q)).results[0].id).toBe(id) })
  it('nearest washroom returns a washroom sorted by distance', async () => {
    const b = await top('Nearest washroom', '&from=blockE')
    expect(b.interpreted.intent).toBe('nearest')
    expect(b.results[0].nodeId).toBe('blockE')
  })
  it('accessible-route intent is detected', async () => {
    const b = await top('Find an accessible route to the library')
    expect(b.interpreted.routePreference).toBe('accessible')
    expect(b.results[0].id).toBe('library')
    expect(b.suggestedRoute).toMatchObject({ to: 'library', routePreference: 'accessible' })
  })
  it('tolerates typos', async () => { expect((await top('libary')).results[0].id).toBe('library') })
  it('hides restricted data centre from search', async () => {
    const b = await top('data centre'); expect(b.results.find((x: any) => x.id === 'datacentre')).toBeUndefined()
  })
  it('validates input', async () => { expect((await request(app).get(api('/search'))).status).toBe(400) })
  it('never invents unknown info: shows To be verified', async () => {
    const c = (await top('IT department')).results[0]
    expect(c.building).toBe('To be verified'); expect(c.floor).toBe('To be verified'); expect(c.room).toBe('To be verified')
    expect(c.availability.label).toBe('Availability information unavailable')
    expect(c.openingHours).toBe('Information unavailable')
  })
})

describe('routing API', () => {
  it('returns a route using the spec field names and never leaks algorithm names', async () => {
    const r = await request(app).post(api('/routes')).send({ current_location: 'current_location', destination: 'library', route_preference: 'shortest', accessibility_preferences: { avoidStairs: false } })
    expect(r.status).toBe(200)
    expect(r.body.status).toBe('ROUTE_FOUND')
    expect(r.body.route.distanceM).toBeGreaterThan(0)
    expect(r.body.route.path[0]).toBe('Main Gate'); expect(r.body.route.path.at(-1)).toBe('Library')
    expect(r.body.route.instructions.length).toBeGreaterThan(1)
    expect(JSON.stringify(r.body)).not.toMatch(/\b(bfs|dfs|astar|a\*)\b/i)
  })
  it('accessible route has no stairs', async () => {
    const r = await request(app).post(api('/routes')).send({ from: 'blockB', to: 'library', routePreference: 'accessible' })
    expect(r.body.route.accessibility.usesStairs).toBe(false)
  })
  it('restricted destination -> 403; unmapped -> 422; unknown -> 404; missing -> 400', async () => {
    expect((await request(app).post(api('/routes')).send({ to: 'datacentre' })).status).toBe(403)
    expect((await request(app).post(api('/routes')).send({ to: 'mtech-ce' })).status).toBe(422)
    expect((await request(app).post(api('/routes')).send({ to: 'nowhere' })).status).toBe(404)
    expect((await request(app).post(api('/routes')).send({})).status).toBe(400)
  })
  it('same location', async () => {
    const r = await request(app).post(api('/routes')).send({ from: 'library', to: 'library' })
    expect(r.body.status).toBe('SAME_LOCATION')
  })
  it('live navigation progress', async () => {
    const r = (await request(app).post(api('/routes')).send({ to: 'library' })).body.route
    const p = await request(app).post(api('/navigation/progress')).send({ nodes: r.waypoints.map((w: any) => w.nodeId), currentNodeId: r.waypoints[1].nodeId })
    expect(p.body.status).toBe('NAVIGATING'); expect(p.body.remainingDistanceM).toBeLessThan(r.distanceM)
    const off = await request(app).post(api('/navigation/progress')).send({ nodes: r.waypoints.map((w: any) => w.nodeId), currentNodeId: 'den' })
    expect(off.body.rerouteRequired).toBe(true)
  })
})

describe('emergency', () => {
  it.each(['nearest_exit', 'nearest_security', 'nearest_first_aid', 'nearest_sick_room', 'assembly_point'])('%s', async (type) => {
    const r = await request(app).post(api('/emergency/route')).send({ from: 'blockD', type })
    expect(r.status).toBe(200); expect(r.body.mode).toBe('emergency'); expect(r.body.route.warnings).toEqual([])
  })
  it('skips closed facilities', async () => {
    await request(app).put(api('/admin/locations/first-aid/availability')).set(H).send({ status: 'closed' })
    await request(app).put(api('/admin/locations/doctor/availability')).set(H).send({ status: 'temporarily_closed' })
    const r = await request(app).post(api('/emergency/route')).send({ from: 'blockD', type: 'nearest_first_aid' })
    expect(r.status).toBe(404)
  })
})

describe('directories', () => {
  it('departments include the 5 UG + PG/PhD programmes', async () => {
    const r = await request(app).get(api('/departments'))
    expect(r.body.departments.length).toBe(10)
    expect(r.body.departments.find((d: any) => d.id === 'ecs-dept').note).toMatch(/2022/)
  })
  it('department detail and labs', async () => {
    const d = await request(app).get(api('/departments/ce-dept'))
    expect(d.body.department.focusAreas).toContain('Generative AI')
    expect((await request(app).get(api('/labs'))).body.groups.length).toBe(5)
  })
  it('facilities grouped', async () => { expect((await request(app).get(api('/facilities'))).body.groups.map((g: any) => g.group)).toContain('HEALTH') })
  it('filters & location detail & near-me', async () => {
    expect((await request(app).get(api('/locations?filter=food'))).body.locations.every((l: any) => l.category === 'food')).toBe(true)
    const d = await request(app).get(api('/locations/library?from=entrance'))
    expect(d.body.location.nearby.length).toBeGreaterThan(0); expect(d.body.location.distanceM).toBeGreaterThan(0)
    const n = await request(app).get(api('/near-me?from=blockA'))
    expect(n.body.nearby.map((x: any) => x.nearKind)).toEqual(expect.arrayContaining(['canteen', 'washroom', 'lift', 'first-aid']))
    expect((await request(app).get(api('/locations/datacentre'))).body.location.navigable).toBe(false)
    expect((await request(app).get(api('/locations/unknown'))).status).toBe(404)
  })
  it('buildings + floors', async () => {
    const f = await request(app).get(api('/buildings/block-a/floors'))
    expect(f.body.floors.map((x: any) => x.floor)).toEqual(['Ground', '1', '2', '3', '4'])
  })
})

describe('per-user data', () => {
  const id = 'client-abc-123'
  it('saved places', async () => {
    await request(app).put(api('/me/saved/library')).set('X-Client-Id', id)
    await request(app).put(api('/me/saved/den-loc')).set('X-Client-Id', id)
    expect((await request(app).get(api('/me/saved')).set('X-Client-Id', id)).body.saved.map((s: any) => s.id)).toEqual(['den-loc', 'library'])
    await request(app).delete(api('/me/saved/library')).set('X-Client-Id', id)
    expect((await request(app).get(api('/me/saved')).set('X-Client-Id', id)).body.saved.length).toBe(1)
    expect((await request(app).get(api('/me/saved')).set('X-Client-Id', 'other-client-1')).body.saved.length).toBe(0)
  })
  it('recent searches dedupe & cap', async () => {
    for (const v of ['Library', 'library', 'Canteen']) await request(app).post(api('/me/recent')).set('X-Client-Id', id).send({ type: 'query', value: v })
    expect((await request(app).get(api('/me/recent')).set('X-Client-Id', id)).body.recent.map((x: any) => x.value)).toEqual(['Canteen', 'library'])
  })
  it('report incorrect location', async () => {
    const r = await request(app).post(api('/locations/library/report')).send({ type: 'wrong_location', message: 'Library is on the 2nd floor' })
    expect(r.status).toBe(201)
    expect((await request(app).get(api('/admin/reports')).set(H)).body.reports.length).toBe(1)
  })
})

describe('admin', () => {
  it('requires the key', async () => {
    expect((await request(app).get(api('/admin/edges'))).status).toBe(401)
    expect((await request(app).get(api('/admin/edges')).set('X-Admin-Key', 'wrong')).status).toBe(401)
  })
  it('verifying a location updates public data', async () => {
    const r = await request(app).patch(api('/admin/locations/it-dept')).set(H).send({ buildingId: 'block-a', floor: '3', room: '301', openingHours: '9:00–17:00', verified: true })
    expect(r.body.location).toMatchObject({ building: 'Block A', floor: '3', room: '301', dataStatus: 'verified', routeMapping: 'verified' })
    const s = (await request(app).get(api('/search?q=IT department'))).body.results[0]
    expect(s.floor).toBe('3')
  })
  it('rejects unknown building / fields', async () => {
    expect((await request(app).patch(api('/admin/locations/it-dept')).set(H).send({ buildingId: 'nope' })).status).toBe(400)
    expect((await request(app).patch(api('/admin/locations/it-dept')).set(H).send({ hack: 1 })).status).toBe(400)
  })
  it('blocking an edge changes routes; availability shows up in cards', async () => {
    const before = (await request(app).post(api('/routes')).send({ from: 'blockA', to: 'blockB' })).body.route.distanceM
    await request(app).patch(api('/admin/edges/e5')).set(H).send({ status: 'blocked' })
    const after = (await request(app).post(api('/routes')).send({ from: 'blockA', to: 'blockB' })).body.route.distanceM
    expect(after).toBeGreaterThan(before)
    await request(app).put(api('/admin/locations/library/availability')).set(H).send({ status: 'busy', note: 'Exam week' })
    expect((await request(app).get(api('/locations/library'))).body.location.availability).toMatchObject({ status: 'busy', label: 'Busy' })
  })
  it('creates a location and it becomes searchable', async () => {
    await request(app).post(api('/admin/locations')).set(H).send({ id: 'chess-club', name: 'Chess Club Room', category: 'student-life', nodeId: 'den', tags: ['chess'] })
    expect((await request(app).get(api('/search?q=chess'))).body.results[0].id).toBe('chess-club')
  })
  it('notifications', async () => {
    await request(app).post(api('/admin/notifications')).set(H).send({ title: 'Lift under maintenance', body: 'Block A lift is out of service today', level: 'warning' })
    expect((await request(app).get(api('/notifications'))).body.notifications[0].title).toBe('Lift under maintenance')
  })
})

describe('algorithm visualizer (technical section only)', () => {
  it('runs each algorithm with a trace', async () => {
    for (const algorithm of ['bfs', 'dfs', 'astar']) {
      const r = await request(app).post(api('/visualizer/run')).send({ algorithm, start: 'entrance', goal: 'library' })
      expect(r.status).toBe(200); expect(r.body.found).toBe(true); expect(r.body.steps.length).toBeGreaterThan(0)
      expect(r.body.path[0]).toBe('entrance'); expect(r.body.path.at(-1)).toBe('library')
      if (algorithm === 'astar') { const s = r.body.steps[0]; expect(s.f).toBeCloseTo(s.g + s.h, 0); expect(s.closedSet).toContain('entrance') }
    }
  })
  it('rejects unknown algorithm / node', async () => {
    expect((await request(app).post(api('/visualizer/run')).send({ algorithm: 'dijkstra', start: 'entrance', goal: 'library' })).status).toBe(400)
    expect((await request(app).post(api('/visualizer/run')).send({ algorithm: 'bfs', start: 'x', goal: 'library' })).status).toBe(404)
  })
})

describe('misc', () => {
  it('404 + bad json', async () => {
    expect((await request(app).get(api('/nope'))).status).toBe(404)
    const r = await request(app).post(api('/routes')).set('Content-Type', 'application/json').send('{bad')
    expect(r.status).toBe(400)
  })
})
