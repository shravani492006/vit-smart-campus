import { TBV, UNAVAILABLE } from '../config/index.js'
import { DEFAULT_PREFS } from '../graph/routing.js'
import type { LocationRecord } from '../types.js'
import type { Ctx } from './context.js'
import { resolvePlace } from './context.js'

export interface Origin { nodeId: string; distM: Map<string, number>; timeSec: Map<string, number> }

export function makeOrigin(ctx: Ctx, from?: string): Origin {
  const p = resolvePlace(ctx, from, 'from')
  const d = ctx.engine.distancesFrom(p.nodeId, DEFAULT_PREFS)
  return { nodeId: p.nodeId, ...d }
}

const STATUS_LABEL: Record<string, string> = { open: 'Open', closed: 'Closed', available: 'Available', busy: 'Busy', restricted: 'Restricted', temporarily_closed: 'Temporarily closed', unknown: 'Availability information unavailable' }

export function presentLocation(ctx: Ctx, l: LocationRecord, origin?: Origin, opts: { withNearby?: boolean } = {}) {
  const av = ctx.campus.availability(l.id)
  const b = l.buildingId ? ctx.campus.building(l.buildingId) : null
  const distM = origin && l.nodeId ? origin.distM.get(l.nodeId) : undefined
  const timeSec = origin && l.nodeId ? origin.timeSec.get(l.nodeId) : undefined
  const acc = l.accessibility
  const card: Record<string, unknown> = {
    id: l.id,
    name: l.name,
    kind: l.kind ?? 'location',
    category: l.category,
    subcategory: l.subcategory,
    group: l.group,
    description: l.description,
    building: b ? b.name : TBV,
    buildingId: l.buildingId,
    floor: l.floor ?? TBV,
    room: l.room ?? TBV,
    openingHours: l.openingHours ?? UNAVAILABLE,
    availability: { status: av.status, label: STATUS_LABEL[av.status], note: av.note, updatedAt: av.updatedAt },
    accessibility: {
      accessible: acc.accessible, lift: acc.lift, ramp: acc.ramp, accessibleRestroom: acc.accessibleRestroom,
      label: acc.accessible === true ? 'Accessible' : acc.accessible === false ? 'Not accessible' : UNAVAILABLE,
    },
    facilities: l.facilities,
    tags: l.tags,
    isEmergency: l.isEmergency,
    restricted: l.restricted,
    navigable: l.navigable && !!l.nodeId,
    nodeId: l.nodeId,
    dataStatus: l.verified ? 'verified' : 'to_be_verified',
    routeMapping: !l.nodeId ? 'unmapped' : l.verified ? 'verified' : 'demo',
    distanceM: distM === undefined ? null : Math.round(distM),
    distance: distM === undefined ? UNAVAILABLE : `${Math.round(distM)} m`,
    walkingTimeMin: timeSec === undefined ? null : Math.max(0, Math.ceil(timeSec / 60)),
    walkingTime: timeSec === undefined ? UNAVAILABLE : timeSec === 0 ? '0 min' : `${Math.max(1, Math.ceil(timeSec / 60))} min`,
    distanceNote: distM === undefined ? undefined : l.verified ? undefined : 'Demo value until campus coordinates are verified',
  }
  if (opts.withNearby && l.nodeId) {
    const from = ctx.engine.distancesFrom(l.nodeId, DEFAULT_PREFS)
    card.nearby = ctx.campus.locations()
      .filter((o) => o.id !== l.id && !o.restricted && o.nodeId && o.nodeId !== l.nodeId && o.kind !== 'building' && from.distM.has(o.nodeId))
      .sort((a, b) => from.distM.get(a.nodeId!)! - from.distM.get(b.nodeId!)!)
      .slice(0, 4)
      .map((o) => ({ id: o.id, name: o.name, category: o.category, distanceM: Math.round(from.distM.get(o.nodeId!)!) }))
  }
  return card
}

export const publicLocations = (ctx: Ctx) => ctx.campus.locations().filter((l) => !l.restricted)
