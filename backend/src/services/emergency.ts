import { AppError } from '../errors.js'
import type { RoutePrefs } from '../types.js'
import type { Ctx } from './context.js'
import { resolvePlace } from './context.js'
import { presentLocation } from './presenter.js'

export const EMERGENCY_TYPES = {
  nearest_exit: { label: 'Nearest Exit', type: 'exit' },
  nearest_security: { label: 'Nearest Security', type: 'security' },
  nearest_first_aid: { label: 'Nearest First Aid', type: 'first_aid' },
  nearest_sick_room: { label: 'Nearest Sick Room', type: 'sick_room' },
  assembly_point: { label: 'Emergency Assembly Point', type: 'assembly' },
} as const
export type EmergencyKind = keyof typeof EMERGENCY_TYPES

/** Safe, open, accessible-first routing. Never uses restricted / blocked / closed edges or closed facilities. */
export function emergencyRoute(ctx: Ctx, kind: EmergencyKind, fromRef?: string) {
  const def = EMERGENCY_TYPES[kind]
  const from = resolvePlace(ctx, fromRef, 'from')
  const prefs: RoutePrefs = { mode: 'fastest', avoidStairs: false, preferLift: false, preferRamp: false, avoidRestricted: true, emergency: true }
  const cands = ctx.campus.locations().filter((l) => l.emergencyTypes.includes(def.type) && l.nodeId && !l.restricted)
    .filter((l) => !['closed', 'temporarily_closed', 'restricted'].includes(ctx.campus.availability(l.id).status))
  let best: { loc: typeof cands[number]; route: ReturnType<typeof ctx.engine.route> & { found: true } } | null = null
  for (const l of cands) {
    const r = l.nodeId === from.nodeId ? null : ctx.engine.route(from.nodeId, l.nodeId!, prefs)
    if (l.nodeId === from.nodeId) {
      const atPlace = ctx.engine.assemble([from.nodeId], [], new Map(ctx.campus.nodes().map((n) => [n.id, n])), prefs)
      best = { loc: l, route: atPlace as any }; break
    }
    if (r && r.found && (!best || r.estimatedTimeSec < best.route.estimatedTimeSec)) best = { loc: l, route: r }
  }
  if (!best) throw new AppError(404, 'NO_EMERGENCY_ROUTE', `No open route to "${def.label}" is currently available. Please contact campus security.`)
  return {
    mode: 'emergency', type: kind, label: def.label,
    destination: presentLocation(ctx, best.loc),
    route: best.route,
    guidance: ['Stay calm and follow the route.', 'Avoid lifts during a fire evacuation unless you need step-free access.'],
    contact: { security: null, note: 'Emergency contact numbers: information unavailable — to be verified.' },
  }
}
