import { Router } from 'express'
import { z } from 'zod'
import { AppError } from '../errors.js'
import { normalizePrefs } from '../graph/routing.js'
import type { Ctx } from '../services/context.js'
import { resolvePlace } from '../services/context.js'
import { EMERGENCY_TYPES, emergencyRoute, type EmergencyKind } from '../services/emergency.js'
import { presentLocation } from '../services/presenter.js'

/** Accept both the frontend's camelCase and the spec's snake_case field names. */
const routeBody = z.preprocess((raw) => {
  const b = (raw ?? {}) as Record<string, any>
  const acc = b.accessibility_preferences ?? b.accessibilityPreferences ?? {}
  return {
    from: b.from ?? b.current_location ?? b.currentLocation,
    to: b.to ?? b.destination,
    routePreference: b.routePreference ?? b.route_preference,
    avoidStairs: b.avoidStairs ?? acc.avoidStairs ?? acc.avoid_stairs,
    preferLift: b.preferLift ?? acc.preferLift ?? acc.prefer_lift,
    preferRamp: b.preferRamp ?? acc.preferRamp ?? acc.prefer_ramp,
    avoidRestricted: b.avoidRestricted ?? b.avoid_restricted_areas ?? acc.avoidRestricted,
    accessible: b.accessible ?? acc.accessibleRoute ?? acc.accessible_route,
  }
}, z.object({
  from: z.string().max(100).optional(),
  to: z.string().min(1, 'destination is required').max(100),
  routePreference: z.enum(['shortest', 'fastest', 'accessible', 'avoid-stairs']).optional(),
  avoidStairs: z.boolean().optional(), preferLift: z.boolean().optional(), preferRamp: z.boolean().optional(), avoidRestricted: z.boolean().optional(), accessible: z.boolean().optional(),
}))

const fmtDist = (m: number) => `${m} m`
const fmtTime = (min: number) => `${min} min`

export function navigationRoutes(ctx: Ctx) {
  const r = Router()

  /**
   * Main routing endpoint. Frontend sends only place + preferences.
   * The algorithm (A*, with BFS/DFS helpers) is chosen internally and never returned.
   */
  r.post('/routes', (req, res) => {
    const body = routeBody.parse(req.body)
    const from = resolvePlace(ctx, body.from, 'from')
    const to = resolvePlace(ctx, body.to, 'to')
    const prefs = normalizePrefs(body)
    const result = ctx.engine.route(from.nodeId, to.nodeId, prefs)
    if (!result.found) {
      const status = result.reason === 'SAME_LOCATION' ? 200 : 404
      return res.status(status).json({ status: result.reason, message: result.message, from: { label: from.label, nodeId: from.nodeId }, to: { label: to.label, nodeId: to.nodeId } })
    }
    const alternatives = ctx.engine.alternatives(from.nodeId, to.nodeId, prefs, result.nodes, 2)
    res.json({
      status: 'ROUTE_FOUND',
      from: { label: from.label, nodeId: from.nodeId },
      to: to.location ? { ...presentLocation(ctx, to.location) } : { label: to.label, nodeId: to.nodeId },
      preferences: prefs,
      route: {
        distanceM: result.distanceM, distance: fmtDist(result.distanceM),
        estimatedTimeMin: result.estimatedTimeMin, estimatedTime: fmtTime(result.estimatedTimeMin),
        path: result.waypoints.map((w) => w.label), waypoints: result.waypoints, segments: result.segments,
        instructions: result.instructions, accessibility: result.accessibility, warnings: result.warnings,
      },
      alternatives: alternatives.map((a) => ({ distanceM: a.distanceM, distance: fmtDist(a.distanceM), estimatedTimeMin: a.estimatedTimeMin, estimatedTime: fmtTime(a.estimatedTimeMin), path: a.waypoints.map((w) => w.label), nodes: a.nodes, accessibility: a.accessibility })),
      dataStatus: to.location && !to.location.verified ? 'Distances and mapping are demo values until campus data is verified.' : undefined,
    })
  })

  /** Live navigation: client reports its current graph node; server returns what remains. Stateless. */
  r.post('/navigation/progress', (req, res) => {
    const b = z.object({ nodes: z.array(z.string()).min(2).max(60), currentNodeId: z.string(), routePreference: z.enum(['shortest', 'fastest', 'accessible', 'avoid-stairs']).optional(), avoidStairs: z.boolean().optional() }).parse(req.body)
    const idx = b.nodes.indexOf(b.currentNodeId)
    if (idx < 0) return res.json({ status: 'OFF_ROUTE', rerouteRequired: true, message: 'You are off the planned route. Please recalculate.' })
    const prefs = normalizePrefs(b)
    const remaining = b.nodes.slice(idx)
    if (remaining.length === 1) return res.json({ status: 'ARRIVED', remainingDistanceM: 0, remainingTimeMin: 0, nextInstruction: null, progressPct: 100 })
    const edges = ctx.engine.pathEdges(remaining, prefs)
    if (!edges) return res.json({ status: 'BLOCKED', rerouteRequired: true, message: 'A segment on your route is no longer available. Please recalculate.' })
    const nm = new Map(ctx.campus.nodes().map((n) => [n.id, n]))
    const leg = ctx.engine.assemble(remaining, edges, nm, prefs)
    const total = ctx.engine.pathEdges(b.nodes, prefs)?.reduce((s, e) => s + e.distanceM, 0) ?? leg.distanceM
    res.json({ status: 'NAVIGATING', remainingDistanceM: leg.distanceM, remainingTimeMin: leg.estimatedTimeMin, nextInstruction: leg.instructions[0], upcoming: leg.instructions.slice(1, 3), progressPct: Math.round((1 - leg.distanceM / total) * 100) })
  })

  // ---- emergency mode ----
  r.get('/emergency/options', (_req, res) => res.json({ options: Object.entries(EMERGENCY_TYPES).map(([id, v]) => ({ id, label: v.label })), priorities: ['Safe route', 'Open route', 'Accessible route'], avoids: ['Restricted areas', 'Blocked paths', 'Closed facilities'] }))
  r.post('/emergency/route', (req, res) => {
    const b = z.object({ from: z.string().optional(), current_location: z.string().optional(), type: z.enum(Object.keys(EMERGENCY_TYPES) as [EmergencyKind, ...EmergencyKind[]]) }).parse(req.body)
    const out = emergencyRoute(ctx, b.type, b.from ?? b.current_location)
    const r2 = out.route
    res.json({ ...out, route: { distanceM: r2.distanceM, distance: fmtDist(r2.distanceM), estimatedTimeMin: r2.estimatedTimeMin, estimatedTime: fmtTime(r2.estimatedTimeMin), path: r2.waypoints.map((w) => w.label), waypoints: r2.waypoints, segments: r2.segments, instructions: r2.instructions, accessibility: r2.accessibility, warnings: r2.warnings } })
  })
  void AppError
  return r
}
