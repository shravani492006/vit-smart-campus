export type NodeType = 'entrance' | 'parking' | 'building' | 'facility' | 'intersection' | 'assembly_point'
export interface GraphNode { id: string; label: string; type: NodeType; x: number; y: number; floor?: string }

export type EdgeType = 'walkway' | 'corridor' | 'staircase' | 'lift' | 'ramp'
export type EdgeStatus = 'open' | 'closed' | 'blocked'
export interface GraphEdge {
  id: string; from: string; to: string; distanceM: number; type: EdgeType
  accessible: boolean; hasStairs: boolean; hasLift: boolean; hasRamp: boolean
  restricted: boolean; status: EdgeStatus; congestion: number; name: string | null
}

export type ModePref = 'shortest' | 'fastest' | 'accessible'
export interface RoutePrefs {
  mode: ModePref
  avoidStairs: boolean
  preferLift: boolean
  preferRamp: boolean
  avoidRestricted: boolean
  /** emergency routing: safe/open/accessible-first, never restricted/blocked/closed */
  emergency?: boolean
}

export interface Building {
  id: string; name: string; shortLabel: string; nodeId: string | null; type: string; description: string
  floorOptions: string[]; verified: boolean
  layout: { col: number; row: number; w: number; d: number; floors: number; status: string }
}

export type AvailabilityStatus = 'open' | 'closed' | 'available' | 'busy' | 'restricted' | 'temporarily_closed' | 'unknown'

export interface LocationRecord {
  id: string; name: string; category: string; subcategory: string | null; group: string; description: string
  buildingId: string | null; floor: string | null; room: string | null; openingHours: string | null
  nodeId: string | null; tags: string[]; facilities: string[]
  accessibility: { accessible: boolean | null; lift: boolean; ramp: boolean; accessibleRestroom: boolean }
  isEmergency: boolean; emergencyTypes: string[]; restricted: boolean; navigable: boolean
  departmentId: string | null; labDepartmentId: string | null; verified: boolean
  kind?: 'building'
}

export interface Availability { status: AvailabilityStatus; note: string | null; updatedAt: string | null }
