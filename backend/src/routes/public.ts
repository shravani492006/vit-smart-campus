import { Router } from 'express'
import { z } from 'zod'
import { config, TBV } from '../config/index.js'
import { AppError } from '../errors.js'
import { DEFAULT_PREFS } from '../graph/routing.js'
import type { Ctx } from '../services/context.js'
import { FILTERS, SEARCH_CATEGORIES, findFilter } from '../services/filters.js'
import { nearMe } from '../services/nearby.js'
import { makeOrigin, presentLocation, publicLocations } from '../services/presenter.js'
import { search } from '../services/search.js'
import { clientId } from '../middleware/index.js'

const listQuery = z.object({ category: z.string().optional(), filter: z.string().optional(), buildingId: z.string().optional(), q: z.string().max(200).optional(), from: z.string().optional(), limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) })

export function publicRoutes(ctx: Ctx) {
  const r = Router()
  const { campus } = ctx

  r.get('/meta', (_req, res) => {
    const locs = publicLocations(ctx)
    res.json({
      name: config.appName, subtitle: config.subtitle, institute: config.institute, version: '1.0.0',
      dataAccuracy: `Building/floor/room, opening hours, coordinates and live availability are ${TBV} unless marked verified. Distances are demo values until campus coordinates are verified.`,
      counts: { locations: locs.length, buildings: campus.buildings().length, departments: campus.departments.length, graphNodes: campus.nodes().length },
      routePreferences: [
        { id: 'shortest', label: 'Shortest Route', type: 'single' }, { id: 'fastest', label: 'Fastest Route', type: 'single' }, { id: 'accessible', label: 'Accessible Route', type: 'single' },
        { id: 'avoidStairs', label: 'Avoid Stairs', type: 'toggle' }, { id: 'preferLift', label: 'Prefer Lift', type: 'toggle' }, { id: 'preferRamp', label: 'Prefer Ramp', type: 'toggle' }, { id: 'avoidRestricted', label: 'Avoid Restricted Areas', type: 'toggle', default: true },
      ],
      filters: FILTERS.map((f) => ({ id: f.id, label: f.label })),
      searchCategories: SEARCH_CATEGORIES.map((f) => ({ id: f.id, label: f.label })),
      availabilityStatuses: ['open', 'closed', 'available', 'busy', 'restricted', 'temporarily_closed', 'unknown'],
    })
  })

  r.get('/filters', (_req, res) => res.json({ filters: FILTERS.map((f) => ({ id: f.id, label: f.label, count: publicLocations(ctx).filter(f.test).length })) }))

  // ---- buildings ----
  r.get('/buildings', (_req, res) => res.json({ buildings: campus.buildings().map((b) => ({ ...b, floorStatus: TBV })) }))
  r.get('/buildings/:id', (req, res) => {
    const b = campus.building(req.params.id)
    if (!b) throw new AppError(404, 'BUILDING_NOT_FOUND', 'Building not found.')
    const locs = publicLocations(ctx).filter((l) => l.buildingId === b.id)
    res.json({ building: b, locations: locs.map((l) => presentLocation(ctx, l)), note: locs.length ? undefined : 'Contents of this building are to be verified.' })
  })
  r.get('/buildings/:id/floors', (req, res) => {
    const b = campus.building(req.params.id)
    if (!b) throw new AppError(404, 'BUILDING_NOT_FOUND', 'Building not found.')
    const locs = publicLocations(ctx).filter((l) => l.buildingId === b.id)
    res.json({ building: { id: b.id, name: b.name }, verified: b.verified, note: 'Floor layouts are placeholders and editable via the admin API.', floors: b.floorOptions.map((f) => ({ floor: f, label: f === 'Ground' ? 'Ground' : `Floor ${f}`, rooms: locs.filter((l) => l.floor === f).map((l) => presentLocation(ctx, l)) })) })
  })

  // ---- locations ----
  r.get('/locations', (req, res) => {
    const q = listQuery.parse(req.query)
    let pool = publicLocations(ctx)
    const f = findFilter(q.filter ?? q.category ?? 'all')
    if (!f) throw new AppError(400, 'UNKNOWN_FILTER', `Unknown filter/category "${q.filter ?? q.category}".`)
    pool = pool.filter(f.test)
    if (q.buildingId) pool = pool.filter((l) => l.buildingId === q.buildingId)
    const origin = makeOrigin(ctx, q.from)
    if (q.q) pool = search(ctx, q.q, { origin, category: f.id === 'all' ? undefined : f.id, limit: 200 }).results.filter((l) => pool.includes(l))
    res.json({ total: pool.length, limit: q.limit, offset: q.offset, locations: pool.slice(q.offset, q.offset + q.limit).map((l) => presentLocation(ctx, l, origin)) })
  })
  r.get('/locations/:id', (req, res) => {
    const l = campus.location(req.params.id)
    if (!l) throw new AppError(404, 'LOCATION_NOT_FOUND', 'Location not found.')
    const origin = l.restricted ? undefined : makeOrigin(ctx, req.query.from as string | undefined)
    res.json({ location: presentLocation(ctx, l, origin, { withNearby: true }), actions: { navigate: l.navigable && !!l.nodeId, save: true, reportIncorrect: true } })
  })
  r.post('/locations/:id/report', (req, res) => {
    const l = campus.location(req.params.id)
    if (!l) throw new AppError(404, 'LOCATION_NOT_FOUND', 'Location not found.')
    const body = z.object({ type: z.enum(['wrong_location', 'wrong_details', 'closed', 'other']).default('wrong_location'), message: z.string().trim().min(3).max(1000) }).parse(req.body)
    const report = { id: `r_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, locationId: l.id, ...body, clientId: clientId(req), createdAt: new Date().toISOString(), status: 'open' as const }
    ctx.db.state.reports.push(report); ctx.db.save()
    res.status(201).json({ report: { id: report.id, status: report.status }, message: 'Thanks — this will be reviewed.' })
  })

  // ---- directories ----
  r.get('/departments', (_req, res) => res.json({ departments: campus.departments.map((d) => ({ ...d, location: presentLocation(ctx, campus.location(d.locationId)!) })) }))
  r.get('/departments/:id', (req, res) => {
    const d = campus.departments.find((x) => x.id === req.params.id)
    if (!d) throw new AppError(404, 'DEPARTMENT_NOT_FOUND', 'Department not found.')
    const labs = publicLocations(ctx).filter((l) => l.labDepartmentId === d.id)
    res.json({ department: { ...d, location: presentLocation(ctx, campus.location(d.locationId)!, makeOrigin(ctx), { withNearby: true }), labs: labs.map((l) => presentLocation(ctx, l)) }, actions: { viewLabs: `/api/v1/labs?department=${d.id}`, navigate: { to: d.locationId } } })
  })
  r.get('/labs', (req, res) => {
    const only = req.query.department as string | undefined
    const groups = campus.labCategories.filter((c) => !only || c.departmentId === only).map((c) => ({
      id: c.id, name: c.name, department: campus.departments.find((d) => d.id === c.departmentId)?.name ?? TBV,
      labs: publicLocations(ctx).filter((l) => l.labDepartmentId === c.departmentId).map((l) => presentLocation(ctx, l)),
    }))
    res.json({ groups })
  })
  r.get('/facilities', (_req, res) => {
    const order = ['ACADEMICS', 'FOOD', 'STUDENT_LIFE', 'SPORTS', 'SERVICES', 'HEALTH', 'SAFETY', 'ACCESSIBILITY', 'UTILITIES']
    const locs = publicLocations(ctx).filter((l) => l.kind !== 'building' && l.category !== 'departments')
    res.json({ groups: order.map((g) => ({ group: g, facilities: locs.filter((l) => l.group === g).map((l) => presentLocation(ctx, l)) })).filter((g) => g.facilities.length) })
  })
  r.get('/student-services', (_req, res) => res.json({ services: publicLocations(ctx).filter((l) => l.category === 'student-services').map((l) => presentLocation(ctx, l)) }))
  r.get('/digital-services', (_req, res) => res.json({ services: campus.digitalServices.map((s) => ({ ...s, description: s.description ?? 'Details unavailable', physicalLocationId: s.id === 'v-print' ? 'v-print' : null })) }))
  r.get('/notifications', (_req, res) => res.json({ notifications: campus.notifications() }))

  // ---- search ----
  r.get('/search', (req, res) => {
    const q = z.object({ q: z.string().trim().min(1).max(200), from: z.string().optional(), category: z.string().optional(), limit: z.coerce.number().int().min(1).max(50).default(10) }).parse(req.query)
    if (q.category && !findFilter(q.category)) throw new AppError(400, 'UNKNOWN_FILTER', `Unknown category "${q.category}".`)
    const origin = makeOrigin(ctx, q.from)
    const { info, results } = search(ctx, q.q, { origin, category: q.category, limit: q.limit })
    const top = results[0]
    res.json({
      query: q.q,
      interpreted: { intent: info.intent, routePreference: info.routePreference ?? null, avoidStairs: info.avoidStairs ?? false },
      total: results.length,
      results: results.map((l) => presentLocation(ctx, l, origin)),
      suggestedRoute: top && top.nodeId && (info.intent === 'route' || info.intent === 'nearest') ? { to: top.id, routePreference: info.routePreference ?? 'shortest', avoidStairs: info.avoidStairs ?? false } : null,
      message: results.length ? undefined : 'No matching locations found. Try a building, department, room or facility name.',
    })
  })
  r.get('/search/suggest', (req, res) => {
    const q = z.object({ q: z.string().trim().min(1).max(100) }).parse(req.query)
    res.json({ suggestions: search(ctx, q.q, { limit: 6 }).results.map((l) => ({ id: l.id, name: l.name, category: l.category })) })
  })

  r.get('/near-me', (req, res) => {
    const origin = makeOrigin(ctx, req.query.from as string | undefined)
    res.json({ from: origin.nodeId, nearby: nearMe(ctx, origin), note: 'Distances are demo values until connected to actual campus coordinates.' })
  })

  r.get('/map/graph', (_req, res) => res.json({ nodes: campus.nodes(), edges: campus.edges().filter((e) => !e.restricted).map(({ id, from, to, type, accessible, status, distanceM }) => ({ id, from, to, type, accessible, status, distanceM })), status: 'demo' }))
  void DEFAULT_PREFS
  return r
}
