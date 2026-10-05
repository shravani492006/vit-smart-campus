import { Router } from 'express'
import { z } from 'zod'
import { AppError } from '../errors.js'
import { clientId } from '../middleware/index.js'
import type { Ctx } from '../services/context.js'
import { makeOrigin, presentLocation } from '../services/presenter.js'

/** Anonymous per-device data keyed by the X-Client-Id header. */
export function userRoutes(ctx: Ctx) {
  const r = Router()

  r.get('/me/saved', (req, res) => {
    const u = ctx.db.user(clientId(req)); const origin = makeOrigin(ctx, req.query.from as string | undefined)
    res.json({ saved: u.saved.map((id) => ctx.campus.location(id)).filter(Boolean).map((l) => presentLocation(ctx, l!, origin)) })
  })
  r.put('/me/saved/:locationId', (req, res) => {
    const l = ctx.campus.location(req.params.locationId)
    if (!l || l.restricted) throw new AppError(404, 'LOCATION_NOT_FOUND', 'Location not found.')
    const u = ctx.db.user(clientId(req))
    if (!u.saved.includes(l.id)) { u.saved.unshift(l.id); u.saved = u.saved.slice(0, 100); ctx.db.save() }
    res.status(201).json({ saved: u.saved })
  })
  r.delete('/me/saved/:locationId', (req, res) => {
    const u = ctx.db.user(clientId(req)); u.saved = u.saved.filter((id) => id !== req.params.locationId); ctx.db.save()
    res.json({ saved: u.saved })
  })

  r.get('/me/recent', (req, res) => res.json({ recent: ctx.db.user(clientId(req)).recent }))
  r.post('/me/recent', (req, res) => {
    const b = z.object({ type: z.enum(['query', 'location']), value: z.string().trim().min(1).max(200) }).parse(req.body)
    const u = ctx.db.user(clientId(req))
    u.recent = [{ ...b, at: new Date().toISOString() }, ...u.recent.filter((x) => !(x.type === b.type && x.value.toLowerCase() === b.value.toLowerCase()))].slice(0, 20)
    ctx.db.save(); res.status(201).json({ recent: u.recent })
  })
  r.delete('/me/recent', (req, res) => { ctx.db.user(clientId(req)).recent = []; ctx.db.save(); res.json({ recent: [] }) })
  return r
}
