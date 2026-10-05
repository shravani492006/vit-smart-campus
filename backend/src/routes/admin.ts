import { Router } from 'express'
import { z } from 'zod'
import { AppError } from '../errors.js'
import { requireAdmin } from '../middleware/index.js'
import type { Ctx } from '../services/context.js'
import { presentLocation } from '../services/presenter.js'
import type { LocationRecord } from '../types.js'

const locPatch = z.object({
  name: z.string().min(1).max(120), description: z.string().max(1000), category: z.string().max(40), subcategory: z.string().max(80).nullable(),
  buildingId: z.string().nullable(), floor: z.string().max(40).nullable(), room: z.string().max(40).nullable(), openingHours: z.string().max(120).nullable(),
  nodeId: z.string().nullable(), tags: z.array(z.string().max(40)).max(40), facilities: z.array(z.string().max(80)).max(40),
  accessibility: z.object({ accessible: z.boolean().nullable(), lift: z.boolean(), ramp: z.boolean(), accessibleRestroom: z.boolean() }).partial(),
  restricted: z.boolean(), navigable: z.boolean(), verified: z.boolean(),
}).partial().strict()

const newLoc = z.object({ id: z.string().regex(/^[a-z0-9-]{2,60}$/), name: z.string().min(1).max(120), category: z.string().max(40), group: z.string().max(40).default('SERVICES'), description: z.string().max(1000).default('') }).merge(locPatch.omit({ name: true, category: true, description: true }))

export function adminRoutes(ctx: Ctx) {
  const r = Router()
  r.use(requireAdmin)

  const check = (p: { buildingId?: string | null; nodeId?: string | null }) => {
    if (p.buildingId && !ctx.campus.building(p.buildingId)) throw new AppError(400, 'UNKNOWN_BUILDING', `Unknown buildingId "${p.buildingId}".`)
    if (p.nodeId && !ctx.campus.node(p.nodeId)) throw new AppError(400, 'UNKNOWN_NODE', `Unknown nodeId "${p.nodeId}".`)
  }

  r.patch('/locations/:id', (req, res) => {
    const base = ctx.campus.location(req.params.id)
    if (!base) throw new AppError(404, 'LOCATION_NOT_FOUND', 'Location not found.')
    const p = locPatch.parse(req.body); check(p)
    const merged: Partial<LocationRecord> = { ...p, ...(p.accessibility ? { accessibility: { ...base.accessibility, ...p.accessibility } } : {}) } as any
    const custom = ctx.db.state.customLocations.find((l) => l.id === base.id)
    if (custom) Object.assign(custom, merged); else ctx.db.state.locationOverrides[base.id] = { ...(ctx.db.state.locationOverrides[base.id] ?? {}), ...merged }
    ctx.db.save(); res.json({ location: presentLocation(ctx, ctx.campus.location(base.id)!) })
  })
  r.post('/locations', (req, res) => {
    const p = newLoc.parse(req.body); check(p)
    if (ctx.campus.location(p.id)) throw new AppError(409, 'LOCATION_EXISTS', 'A location with this id already exists.')
    const rec: LocationRecord = {
      subcategory: null, buildingId: null, floor: null, room: null, openingHours: null, nodeId: null, tags: [], facilities: [], isEmergency: false, emergencyTypes: [], restricted: false, navigable: true, departmentId: null, labDepartmentId: null, verified: false,
      ...p, accessibility: { accessible: null, lift: false, ramp: false, accessibleRestroom: false, ...(p.accessibility ?? {}) },
    } as LocationRecord
    ctx.db.state.customLocations.push(rec); ctx.db.save(); res.status(201).json({ location: presentLocation(ctx, rec) })
  })
  r.put('/locations/:id/availability', (req, res) => {
    if (!ctx.campus.location(req.params.id)) throw new AppError(404, 'LOCATION_NOT_FOUND', 'Location not found.')
    const b = z.object({ status: z.enum(['open', 'closed', 'available', 'busy', 'restricted', 'temporarily_closed', 'unknown']), note: z.string().max(300).nullable().default(null) }).parse(req.body)
    ctx.db.state.availability[req.params.id] = { ...b, updatedAt: new Date().toISOString() }; ctx.db.save()
    res.json({ availability: ctx.db.state.availability[req.params.id] })
  })

  r.get('/edges', (_req, res) => res.json({ edges: ctx.campus.edges() }))
  r.patch('/edges/:id', (req, res) => {
    if (!ctx.campus.edges().some((e) => e.id === req.params.id)) throw new AppError(404, 'EDGE_NOT_FOUND', 'Edge not found.')
    const p = z.object({ status: z.enum(['open', 'closed', 'blocked']), restricted: z.boolean(), accessible: z.boolean(), congestion: z.number().min(0).max(1), distanceM: z.number().positive().max(5000) }).partial().strict().parse(req.body)
    ctx.db.state.edgeOverrides[req.params.id] = { ...(ctx.db.state.edgeOverrides[req.params.id] ?? {}), ...p }; ctx.db.save()
    res.json({ edge: ctx.campus.edges().find((e) => e.id === req.params.id) })
  })

  r.get('/reports', (_req, res) => res.json({ reports: ctx.db.state.reports }))
  r.patch('/reports/:id', (req, res) => {
    const rep = ctx.db.state.reports.find((x) => x.id === req.params.id)
    if (!rep) throw new AppError(404, 'REPORT_NOT_FOUND', 'Report not found.')
    rep.status = z.object({ status: z.enum(['open', 'resolved']) }).parse(req.body).status; ctx.db.save(); res.json({ report: rep })
  })

  r.post('/notifications', (req, res) => {
    const b = z.object({ title: z.string().min(1).max(120), body: z.string().min(1).max(500), level: z.enum(['info', 'warning', 'critical']).default('info') }).parse(req.body)
    const list = (ctx.db.state.notifications ??= [...ctx.campus.notifications()])
    const n = { id: `n_${Date.now().toString(36)}`, ...b, createdAt: new Date().toISOString() }
    list.unshift(n); ctx.db.save(); res.status(201).json({ notification: n })
  })
  r.delete('/notifications/:id', (req, res) => {
    const list = (ctx.db.state.notifications ??= [...ctx.campus.notifications()])
    ctx.db.state.notifications = list.filter((n: any) => n.id !== req.params.id); ctx.db.save(); res.json({ ok: true })
  })
  return r
}
