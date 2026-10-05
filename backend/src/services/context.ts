import { config } from '../config/index.js'
import { AppError } from '../errors.js'
import { RoutingEngine } from '../graph/routing.js'
import { Campus } from '../store/campus.js'
import { Db } from '../store/db.js'
import type { LocationRecord } from '../types.js'

export interface Ctx { db: Db; campus: Campus; engine: RoutingEngine }
export function createContext(dbPath?: string): Ctx {
  const db = new Db(dbPath ?? config.dbPath)
  const campus = new Campus(db)
  return { db, campus, engine: new RoutingEngine(campus) }
}

export interface ResolvedPlace { nodeId: string; label: string; location?: LocationRecord }

/**
 * A place reference can be: "current_location" (demo: default origin node, no GPS yet),
 * a location id, a building id, or a raw graph node id.
 */
export function resolvePlace(ctx: Ctx, ref: string | undefined, role: 'from' | 'to'): ResolvedPlace {
  const r = (ref ?? '').trim()
  if (!r || r === 'current_location' || r === 'current') {
    if (role === 'to') throw new AppError(400, 'DESTINATION_REQUIRED', 'A destination is required.')
    const n = ctx.campus.node(config.defaultOriginNode)!
    return { nodeId: n.id, label: 'Current Location' }
  }
  const loc = ctx.campus.location(r)
  if (loc) {
    if (loc.restricted) throw new AppError(403, 'RESTRICTED_AREA', `${loc.name} is a restricted area (authorised personnel only) and is not a public navigation destination.`)
    if (!loc.nodeId) throw new AppError(422, 'LOCATION_NOT_MAPPED', `${loc.name}: location to be verified — not yet mapped on the campus graph.`)
    return { nodeId: loc.nodeId, label: loc.name, location: loc }
  }
  const b = ctx.campus.building(r)
  if (b?.nodeId) return { nodeId: b.nodeId, label: b.name }
  const n = ctx.campus.node(r)
  if (n) return { nodeId: n.id, label: n.label }
  throw new AppError(404, 'PLACE_NOT_FOUND', `Unknown ${role === 'from' ? 'starting point' : 'destination'}: "${r}".`)
}
