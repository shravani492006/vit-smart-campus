import { useState, useEffect, useRef, useCallback } from 'react'
import { api, type AiRouteResponse } from './api/client'

// ─── THEME SYSTEM ─────────────────────────────────────────────────────────────

interface ThemeColors {
  bgBase: string; bgSurface: string; bgCard: string; bgElevated: string
  border: string; borderStrong: string
  text: string; textSub: string; textMuted: string
  accent: string; accentBlue: string
  sidebar: string; header: string
  navActive: string; navActiveBorder: string; navActiveText: string; navText: string
  inputBg: string; cardHover: string; shadow: string
  glass: string; glassBorder: string
  mapBg: string; switchBg: string
}

function makeTheme(dark: boolean): ThemeColors {
  return dark ? {
    bgBase: '#060c18', bgSurface: '#091525', bgCard: '#0d1e38', bgElevated: '#112344',
    border: '#1a3050', borderStrong: '#254570',
    text: '#e2ecff', textSub: '#7fa8d4', textMuted: '#3d5a80',
    accent: '#22d3ee', accentBlue: '#3b82f6',
    sidebar: '#060c18', header: '#091525',
    navActive: 'rgba(34,211,238,0.1)', navActiveBorder: 'rgba(34,211,238,0.3)',
    navActiveText: '#22d3ee', navText: '#7fa8d4',
    inputBg: '#0d1e38', cardHover: '#112344', shadow: 'rgba(0,0,0,0.5)',
    glass: 'rgba(13,30,56,0.8)', glassBorder: 'rgba(37,69,112,0.6)',
    mapBg: '#060c18', switchBg: '#0d1e38',
  } : {
    bgBase: '#f0f4fb', bgSurface: '#ffffff', bgCard: '#ffffff', bgElevated: '#f8faff',
    border: '#dde4f0', borderStrong: '#b8c8e0',
    text: '#0f172a', textSub: '#4a6080', textMuted: '#94a3b8',
    accent: '#2563eb', accentBlue: '#1d4ed8',
    sidebar: '#ffffff', header: '#ffffff',
    navActive: 'rgba(37,99,235,0.08)', navActiveBorder: 'rgba(37,99,235,0.25)',
    navActiveText: '#2563eb', navText: '#4a6080',
    inputBg: '#f8faff', cardHover: '#f0f6ff', shadow: 'rgba(15,23,42,0.12)',
    glass: 'rgba(255,255,255,0.9)', glassBorder: 'rgba(176,192,216,0.7)',
    mapBg: '#e8eef8', switchBg: '#e8f0fe',
  }
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

type Screen = 'home' | 'map' | 'navigate' | 'algorithm' | 'directory' | 'departments' | 'facilities' | 'indoor' | 'saved' | 'emergency' | 'route'
type AlgoType = 'bfs' | 'dfs' | 'astar'
type RoutePreference = 'shortest' | 'fastest' | 'accessible' | 'avoid-stairs'

interface CampusBuilding {
  id: string; name: string; shortLabel: string
  col: number; row: number; w: number; d: number; floors: number
  topColor: string; rightColor: string; frontColor: string; glowColor: string
  category: string; description: string; departments: string[]; facilities: string[]
}

interface Location {
  id: string; name: string; building: string; buildingId: string
  floor: string; category: string; distance: string; walkTime: string
  description: string; hours?: string; tags: string[]; isEmergency?: boolean
}

interface AlgoNode { id: string; label: string; shortLabel: string; x: number; y: number }
interface AlgoEdge { from: string; to: string; weight: number }
interface AlgoStep {
  visited: string[]; current: string; frontier: string[]
  path: string[]; g?: number; h?: number; f?: number
}

// ─── ISO HELPERS ──────────────────────────────────────────────────────────────

const ISO_W = 60, ISO_H = 30, UNIT_H = 13, OX = 430, OY = 88

function isoXY(col: number, row: number, elev = 0): [number, number] {
  return [OX + (col - row) * ISO_W / 2, OY + (col + row) * ISO_H / 2 - elev]
}

// ─── CAMPUS DATA ─────────────────────────────────────────────────────────────

const BUILDINGS: CampusBuilding[] = [
  { id: 'block-a', name: 'Block A', shortLabel: 'A', col: 1, row: 3, w: 2, d: 3, floors: 5, topColor: '#1d4ed8', rightColor: '#1e3a8a', frontColor: '#172554', glowColor: '#3b82f6', category: 'academic', description: 'Computer Engineering & IT Department. Modern labs, seminar halls, and faculty offices across 5 floors.', departments: ['Computer Engineering', 'Information Technology'], facilities: ['Computer Labs', 'Seminar Hall', 'Faculty Rooms', 'Washrooms', 'Lift'] },
  { id: 'block-b', name: 'Block B', shortLabel: 'B', col: 3, row: 3, w: 2, d: 2, floors: 4, topColor: '#4338ca', rightColor: '#3730a3', frontColor: '#2e2680', glowColor: '#6366f1', category: 'academic', description: 'Engineering departments. EXTC and Mechanical with modern labs and drawing halls.', departments: ['Electronics & Telecom (EXTC)', 'Mechanical Engineering'], facilities: ['Electronics Lab', 'Workshop', 'Drawing Hall', 'Faculty Rooms', 'Washrooms'] },
  { id: 'block-c', name: 'Block C', shortLabel: 'C', col: 4, row: 1, w: 3, d: 2, floors: 5, topColor: '#0891b2', rightColor: '#0e7490', frontColor: '#155e75', glowColor: '#22d3ee', category: 'academic', description: 'Central academic hub. Main library, reading rooms, auditorium, and primary lecture halls.', departments: ['Central Library', 'Reading Room', 'Seminar Halls'], facilities: ['Library', 'Reading Area', 'Seminar Hall', 'Auditorium', 'Washrooms', 'Lift'] },
  { id: 'block-d', name: 'Block D', shortLabel: 'D', col: 7, row: 2, w: 2, d: 2, floors: 4, topColor: '#1e40af', rightColor: '#1e3a8a', frontColor: '#172554', glowColor: '#60a5fa', category: 'academic', description: 'Advanced labs and research center. AI/ML lab, IoT lab, and cloud computing facilities.', departments: ['AI & Data Science', 'Advanced Labs', 'Research Center'], facilities: ['AI/ML Lab', 'IoT Lab', 'Server Room', 'Conference Room', 'Washrooms'] },
  { id: 'block-e', name: 'Block E', shortLabel: 'E', col: 8, row: 4, w: 2, d: 2, floors: 3, topColor: '#6d28d9', rightColor: '#5b21b6', frontColor: '#4c1d95', glowColor: '#a78bfa', category: 'admin', description: 'Administrative building. Principal office, examination cell, accounts, and student services.', departments: ["Principal's Office", 'Examination Cell', 'Accounts Dept'], facilities: ['Admin Office', 'Examination Cell', 'Accounts', 'Training & Placement', 'Student Section'] },
  { id: 'block-f', name: 'Block F', shortLabel: 'F', col: 6, row: 4, w: 2, d: 2, floors: 3, topColor: '#047857', rightColor: '#065f46', frontColor: '#064e3b', glowColor: '#34d399', category: 'facility', description: 'Student activity center and multipurpose facilities. Sports, recreation, and student events.', departments: ['DEN Student Activity', 'Sports Facilities', 'Student Council'], facilities: ['DEN', 'Sports Area', 'Common Rooms', 'ATM Area'] },
  { id: 'canteen', name: 'Canteen', shortLabel: 'CA', col: 2, row: 6, w: 2, d: 1, floors: 1, topColor: '#b45309', rightColor: '#92400e', frontColor: '#78350f', glowColor: '#fbbf24', category: 'food', description: 'Main student canteen serving breakfast, lunch, and snacks. Fresh food daily.', departments: ['Food Court', 'Cafeteria'], facilities: ['Canteen', 'Food Stalls', 'Seating Area', 'Drinking Water'] },
  { id: 'den', name: 'DEN Center', shortLabel: 'DN', col: 7, row: 6, w: 2, d: 1, floors: 1, topColor: '#be185d', rightColor: '#9d174d', frontColor: '#831843', glowColor: '#f472b6', category: 'student', description: 'Student cultural and activity hub. Events, clubs, and student programs.', departments: ['Student Council', 'Cultural Committee'], facilities: ['Event Space', 'Club Rooms', 'Open Stage', 'Seating'] },
]

const LOCATIONS: Location[] = [
  { id: 'library', name: 'Central Library', building: 'Block C', buildingId: 'block-c', floor: '1st Floor', category: 'academic', distance: '250 m', walkTime: '3 min', description: 'Main library with extensive book collection, digital resources, and quiet reading areas.', hours: '8:00 AM – 8:00 PM', tags: ['library', 'books', 'study', 'reading'] },
  { id: 'canteen-loc', name: 'Student Canteen', building: 'Canteen Block', buildingId: 'canteen', floor: 'Ground Floor', category: 'food', distance: '80 m', walkTime: '1 min', description: 'Main student canteen with hot meals, snacks and beverages.', hours: '7:30 AM – 6:00 PM', tags: ['food', 'canteen', 'lunch', 'breakfast', 'eat'] },
  { id: 'comp-lab', name: 'Computer Laboratory', building: 'Block A', buildingId: 'block-a', floor: '2nd Floor', category: 'lab', distance: '120 m', walkTime: '2 min', description: 'Modern computer lab with workstations and high-speed internet.', tags: ['lab', 'computer', 'programming', 'coding'] },
  { id: 'it-dept', name: 'IT Department', building: 'Block A', buildingId: 'block-a', floor: '3rd Floor', category: 'department', distance: '130 m', walkTime: '2 min', description: 'Information Technology department office and faculty rooms.', tags: ['it', 'department', 'information technology', 'faculty'] },
  { id: 'comp-dept', name: 'Computer Engineering Dept', building: 'Block A', buildingId: 'block-a', floor: '2nd Floor', category: 'department', distance: '120 m', walkTime: '2 min', description: 'Computer Engineering department with faculty offices and HOD cabin.', tags: ['computer engineering', 'ce', 'department', 'hod'] },
  { id: 'extc-dept', name: 'EXTC Department', building: 'Block B', buildingId: 'block-b', floor: '2nd Floor', category: 'department', distance: '200 m', walkTime: '3 min', description: 'Electronics and Telecommunication Engineering department.', tags: ['extc', 'electronics', 'telecom', 'department'] },
  { id: 'ai-lab', name: 'AI & Machine Learning Lab', building: 'Block D', buildingId: 'block-d', floor: '3rd Floor', category: 'lab', distance: '320 m', walkTime: '4 min', description: 'AI/ML research laboratory with GPU clusters for deep learning.', tags: ['ai', 'machine learning', 'data science', 'lab'] },
  { id: 'exam-cell', name: 'Examination Cell', building: 'Block E', buildingId: 'block-e', floor: '1st Floor', category: 'admin', distance: '380 m', walkTime: '5 min', description: 'Handles all examination schedules, hall tickets, and results.', hours: '9:00 AM – 5:00 PM', tags: ['exam', 'examination', 'hall ticket', 'result'] },
  { id: 'principal', name: "Principal's Office", building: 'Block E', buildingId: 'block-e', floor: '2nd Floor', category: 'admin', distance: '390 m', walkTime: '5 min', description: "VIT's principal office and administrative headquarters.", hours: '9:00 AM – 5:00 PM', tags: ['principal', 'director', 'office', 'admin'] },
  { id: 'tpc', name: 'Training & Placement Cell', building: 'Block E', buildingId: 'block-e', floor: '1st Floor', category: 'admin', distance: '380 m', walkTime: '5 min', description: 'Manages campus placements, internships and industry connect.', hours: '9:00 AM – 5:00 PM', tags: ['placement', 'training', 'tpc', 'job', 'internship'] },
  { id: 'seminar', name: 'Seminar Hall', building: 'Block C', buildingId: 'block-c', floor: '2nd Floor', category: 'facility', distance: '260 m', walkTime: '3 min', description: 'AC seminar hall with 200-student capacity, projector and stage.', tags: ['seminar', 'hall', 'presentation', 'event'] },
  { id: 'auditorium', name: 'Auditorium', building: 'Block C', buildingId: 'block-c', floor: 'Ground Floor', category: 'facility', distance: '270 m', walkTime: '3 min', description: 'Main auditorium for college events, fests, and ceremonies.', tags: ['auditorium', 'event', 'fest', 'ceremony'] },
  { id: 'den-loc', name: 'DEN – Student Activity', building: 'Block F', buildingId: 'block-f', floor: 'Ground Floor', category: 'student', distance: '350 m', walkTime: '4 min', description: 'Student cultural and activity center. Events, clubs, and gatherings.', tags: ['den', 'student', 'activity', 'cultural', 'club'] },
  { id: 'security', name: 'Security Gate', building: 'Main Entrance', buildingId: 'entrance', floor: 'Ground Floor', category: 'emergency', distance: '0 m', walkTime: '0 min', description: '24/7 security at main campus entrance.', isEmergency: true, tags: ['security', 'gate', 'entrance', 'guard'] },
  { id: 'first-aid', name: 'First Aid / Medical Room', building: 'Block E', buildingId: 'block-e', floor: 'Ground Floor', category: 'emergency', distance: '380 m', walkTime: '5 min', description: 'Campus medical facility with first aid and basic healthcare.', hours: '8:00 AM – 6:00 PM', isEmergency: true, tags: ['medical', 'first aid', 'doctor', 'health', 'emergency'] },
  { id: 'parking', name: 'Student Parking', building: 'Parking Zone', buildingId: 'parking', floor: 'Ground', category: 'utility', distance: '150 m', walkTime: '2 min', description: 'Two-wheeler and four-wheeler parking area near main gate.', tags: ['parking', 'vehicle', 'bike', 'car'] },
  { id: 'accounts', name: 'Accounts Department', building: 'Block E', buildingId: 'block-e', floor: '1st Floor', category: 'admin', distance: '380 m', walkTime: '5 min', description: 'Fee payment, scholarships, and financial services.', hours: '9:00 AM – 4:00 PM', tags: ['accounts', 'fees', 'payment', 'scholarship', 'finance'] },
  { id: 'reading-room', name: 'Reading Room', building: 'Block C', buildingId: 'block-c', floor: '1st Floor', category: 'academic', distance: '255 m', walkTime: '3 min', description: 'Quiet study area adjacent to library.', hours: '8:00 AM – 9:00 PM', tags: ['reading', 'study', 'quiet', 'library'] },
  { id: 'lift-a', name: 'Lift – Block A', building: 'Block A', buildingId: 'block-a', floor: 'All Floors', category: 'utility', distance: '120 m', walkTime: '2 min', description: 'Accessible elevator in Block A serving all floors.', tags: ['lift', 'elevator', 'accessible', 'disability'] },
  { id: 'sports', name: 'Sports Ground', building: 'Campus Ground', buildingId: 'block-f', floor: 'Ground', category: 'student', distance: '200 m', walkTime: '3 min', description: 'Open sports ground for cricket, football, and athletics.', tags: ['sports', 'ground', 'cricket', 'football', 'athletics'] },
]

const QUICK_ACCESS = [
  { id: 'library', icon: '📚', label: 'Library', color: '#22d3ee' },
  { id: 'canteen-loc', icon: '🍽️', label: 'Canteen', color: '#fbbf24' },
  { id: 'den-loc', icon: '🎭', label: 'DEN', color: '#f472b6' },
  { id: 'comp-lab', icon: '💻', label: 'Comp Lab', color: '#3b82f6' },
  { id: 'sports', icon: '🏃', label: 'Sports', color: '#34d399' },
  { id: 'first-aid', icon: '🏥', label: 'First Aid', color: '#f87171' },
]

// ─── ALGORITHM DATA ───────────────────────────────────────────────────────────

const ALGO_NODES: AlgoNode[] = [
  { id: 'entrance', label: 'Main Gate', shortLabel: 'Gate', x: 310, y: 390 },
  { id: 'parking', label: 'Parking', shortLabel: 'Park', x: 155, y: 325 },
  { id: 'blockA', label: 'Block A', shortLabel: 'A', x: 188, y: 218 },
  { id: 'canteen', label: 'Canteen', shortLabel: 'Cant', x: 258, y: 308 },
  { id: 'blockB', label: 'Block B', shortLabel: 'B', x: 310, y: 188 },
  { id: 'blockC', label: 'Block C', shortLabel: 'C', x: 428, y: 148 },
  { id: 'blockD', label: 'Block D', shortLabel: 'D', x: 548, y: 188 },
  { id: 'library', label: 'Library', shortLabel: 'Lib', x: 428, y: 72 },
  { id: 'blockF', label: 'Block F', shortLabel: 'F', x: 508, y: 278 },
  { id: 'blockE', label: 'Block E', shortLabel: 'E', x: 608, y: 278 },
  { id: 'den', label: 'DEN', shortLabel: 'DEN', x: 558, y: 362 },
]

const ALGO_EDGES: AlgoEdge[] = [
  { from: 'entrance', to: 'parking', weight: 2 }, { from: 'entrance', to: 'canteen', weight: 3 },
  { from: 'entrance', to: 'blockA', weight: 4 }, { from: 'parking', to: 'blockA', weight: 2 },
  { from: 'blockA', to: 'blockB', weight: 2 }, { from: 'blockA', to: 'canteen', weight: 2 },
  { from: 'canteen', to: 'blockB', weight: 3 }, { from: 'blockB', to: 'blockC', weight: 2 },
  { from: 'blockC', to: 'library', weight: 1 }, { from: 'blockC', to: 'blockD', weight: 3 },
  { from: 'blockD', to: 'library', weight: 2 }, { from: 'blockD', to: 'blockE', weight: 2 },
  { from: 'blockD', to: 'blockF', weight: 2 }, { from: 'blockE', to: 'blockF', weight: 2 },
  { from: 'blockE', to: 'den', weight: 2 }, { from: 'blockF', to: 'den', weight: 2 },
  { from: 'canteen', to: 'den', weight: 5 },
]

function buildAdj(edges: AlgoEdge[]): Record<string, string[]> {
  const adj: Record<string, string[]> = {}
  for (const e of edges) { ;(adj[e.from] ??= []).push(e.to); (adj[e.to] ??= []).push(e.from) }
  return adj
}
function buildWeightedAdj(edges: AlgoEdge[]): Record<string, { to: string; cost: number }[]> {
  const adj: Record<string, { to: string; cost: number }[]> = {}
  for (const e of edges) { ;(adj[e.from] ??= []).push({ to: e.to, cost: e.weight }); (adj[e.to] ??= []).push({ to: e.from, cost: e.weight }) }
  return adj
}

function runBFS(start: string, goal: string): AlgoStep[] {
  const adj = buildAdj(ALGO_EDGES)
  const queue: string[][] = [[start]], visited = new Set<string>([start]), steps: AlgoStep[] = []
  while (queue.length > 0) {
    const path = queue.shift()!, node = path[path.length - 1]
    steps.push({ visited: [...visited], current: node, frontier: queue.map(p => p[p.length - 1]), path: node === goal ? path : [] })
    if (node === goal) break
    for (const nb of (adj[node] ?? [])) { if (!visited.has(nb)) { visited.add(nb); queue.push([...path, nb]) } }
  }
  return steps
}

function runDFS(start: string, goal: string): AlgoStep[] {
  const adj = buildAdj(ALGO_EDGES)
  const stack: string[][] = [[start]], visited = new Set<string>(), steps: AlgoStep[] = []
  while (stack.length > 0) {
    const path = stack.pop()!, node = path[path.length - 1]
    if (visited.has(node)) continue
    visited.add(node)
    steps.push({ visited: [...visited], current: node, frontier: stack.map(p => p[p.length - 1]), path: node === goal ? path : [] })
    if (node === goal) break
    for (const nb of [...(adj[node] ?? [])].reverse()) { if (!visited.has(nb)) stack.push([...path, nb]) }
  }
  return steps
}

function runAStar(start: string, goal: string): AlgoStep[] {
  const adj = buildWeightedAdj(ALGO_EDGES)
  const h = (id: string) => { const a = ALGO_NODES.find(n => n.id === id)!, b = ALGO_NODES.find(n => n.id === goal)!; return +(Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2) / 60).toFixed(1) }
  type S = { f: number; g: number; id: string; path: string[] }
  const open: S[] = [{ f: h(start), g: 0, id: start, path: [start] }], closed = new Set<string>(), g = new Map<string, number>([[start, 0]]), steps: AlgoStep[] = []
  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f); const cur = open.shift()!
    if (closed.has(cur.id)) continue
    closed.add(cur.id)
    steps.push({ visited: [...closed], current: cur.id, frontier: open.map(s => s.id), path: cur.id === goal ? cur.path : [], g: +cur.g.toFixed(1), h: h(cur.id), f: +cur.f.toFixed(1) })
    if (cur.id === goal) break
    for (const { to, cost } of (adj[cur.id] ?? [])) {
      if (closed.has(to)) continue
      const ng = cur.g + cost
      if (ng < (g.get(to) ?? Infinity)) { g.set(to, ng); open.push({ f: ng + h(to), g: ng, id: to, path: [...cur.path, to] }) }
    }
  }
  return steps
}

// ─── ISOMETRIC MAP ────────────────────────────────────────────────────────────

interface IsoMapProps {
  selectedId: string | null; routePath: string[]
  onSelect: (b: CampusBuilding) => void; mode: '2d' | '3d'
  filterCategory: string
}

function IsometricMap({ selectedId, routePath, onSelect, mode, filterCategory }: IsoMapProps) {
  const sorted = [...BUILDINGS]
    .filter(b => filterCategory === 'all' || b.category === filterCategory)
    .sort((a, b) => (a.col + a.w / 2 + a.row + a.d / 2) - (b.col + b.w / 2 + b.row + b.d / 2))

  const routePoints = routePath.map(id => {
    const b = BUILDINGS.find(x => x.id === id); if (!b) return null
    const [x, y] = isoXY(b.col + b.w / 2, b.row + b.d / 2, (b.floors * UNIT_H) / 2)
    return `${x},${y}`
  }).filter(Boolean).join(' ')

  function renderBuilding(b: CampusBuilding) {
    const h = b.floors * UNIT_H, { col, row, w, d } = b
    const nw = isoXY(col, row), ne = isoXY(col + w, row), se = isoXY(col + w, row + d), sw = isoXY(col, row + d)
    const nwT = isoXY(col, row, h), neT = isoXY(col + w, row, h), seT = isoXY(col + w, row + d, h), swT = isoXY(col, row + d, h)
    const topPts = [nwT, neT, seT, swT].map(p => p.join(',')).join(' ')
    const rightPts = [neT, seT, se, ne].map(p => p.join(',')).join(' ')
    const frontPts = [seT, swT, sw, se].map(p => p.join(',')).join(' ')
    const lx = (nwT[0] + neT[0] + seT[0] + swT[0]) / 4
    const ly = (nwT[1] + neT[1] + seT[1] + swT[1]) / 4
    const isSelected = selectedId === b.id, onRoute = routePath.includes(b.id)
    const winLines = Array.from({ length: b.floors - 1 }, (_, fl) => {
      const elev = (fl + 1) * UNIT_H
      const [rx1, ry1] = isoXY(col + w, row, elev), [rx2, ry2] = isoXY(col + w, row + d, elev)
      const [fx1, fy1] = isoXY(col + w, row + d, elev), [fx2, fy2] = isoXY(col, row + d, elev)
      return [
        <line key={`r${fl}`} x1={rx1} y1={ry1} x2={rx2} y2={ry2} stroke="rgba(255,255,255,0.1)" strokeWidth="0.4" />,
        <line key={`f${fl}`} x1={fx1} y1={fy1} x2={fx2} y2={fy2} stroke="rgba(255,255,255,0.1)" strokeWidth="0.4" />
      ]
    }).flat()
    return (
      <g key={b.id} className="iso-building" onClick={() => onSelect(b)}>
        {isSelected && <ellipse cx={(nw[0]+ne[0]+se[0]+sw[0])/4} cy={(nw[1]+ne[1]+se[1]+sw[1])/4} rx={w*32} ry={d*17} fill={b.glowColor} opacity="0.15" style={{ filter: 'blur(10px)' }} />}
        <polygon points={frontPts} fill={b.frontColor} />
        <polygon points={rightPts} fill={b.rightColor} />
        {winLines}
        <polygon points={topPts} fill={b.topColor} stroke={isSelected ? b.glowColor : onRoute ? '#22d3ee' : 'rgba(255,255,255,0.08)'} strokeWidth={isSelected ? 2 : onRoute ? 1.5 : 0.5} style={isSelected ? { filter: `drop-shadow(0 0 6px ${b.glowColor})` } : {}} />
        <line x1={nwT[0]} y1={nwT[1]} x2={neT[0]} y2={neT[1]} stroke={isSelected ? b.glowColor : 'rgba(255,255,255,0.22)'} strokeWidth={isSelected ? 1.5 : 0.7} />
        <text x={lx} y={ly + 4} textAnchor="middle" fontSize="9" fontWeight="700" fontFamily="Manrope, sans-serif" fill="white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)', pointerEvents: 'none' }}>{b.shortLabel}</text>
      </g>
    )
  }

  function renderTree(col: number, row: number, size = 1) {
    const [x, y] = isoXY(col, row), s = size * 10
    return (
      <g key={`t${col}${row}`}>
        <circle cx={x} cy={y - s * 0.6} r={s * 0.9} fill="#064e3b" opacity="0.9" />
        <circle cx={x} cy={y - s} r={s * 0.65} fill="#065f46" opacity="0.9" />
        <circle cx={x} cy={y - s * 1.3} r={s * 0.4} fill="#047857" opacity="0.9" />
        <line x1={x} y1={y} x2={x} y2={y - s * 0.5} stroke="#3f1c02" strokeWidth="1.5" />
      </g>
    )
  }

  const groundPts = [isoXY(0, 0), isoXY(12, 0), isoXY(12, 9), isoXY(0, 9)].map(p => p.join(',')).join(' ')
  const perspective = mode === '3d' ? 'perspective(1200px) rotateX(8deg)' : 'none'
  const [exX, exY] = isoXY(4.5, 8.5)

  return (
    <svg width="100%" height="100%" viewBox="100 30 750 380" style={{ transform: perspective, transformOrigin: '50% 50%', transition: 'transform 0.6s ease' }}>
      <defs>
        <radialGradient id="gnd" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#0d1e38" /><stop offset="100%" stopColor="#060c18" />
        </radialGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <polygon points={groundPts} fill="url(#gnd)" />
      {Array.from({ length: 13 }, (_, c) => { const [x1,y1]=isoXY(c,0),[x2,y2]=isoXY(c,9); return <line key={`gc${c}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#121f36" strokeWidth="0.5" /> })}
      {Array.from({ length: 10 }, (_, r) => { const [x1,y1]=isoXY(0,r),[x2,y2]=isoXY(12,r); return <line key={`gr${r}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#121f36" strokeWidth="0.5" /> })}
      {[[4.5,1,4.5,8],[1,5,11,5],[1,6.5,4,6.5],[7,6.5,11,6.5]].map(([c1,r1,c2,r2],i) => {
        const [x1,y1]=isoXY(c1,r1),[x2,y2]=isoXY(c2,r2)
        return <g key={i}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1a3050" strokeWidth="6" strokeLinecap="round"/><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#22d3ee" strokeWidth="0.5" strokeOpacity="0.15"/></g>
      })}
      {[[2.5,2,0.9],[3.5,1.5,0.8],[5.5,5.5,1],[4,5.5,0.8],[9.5,1.5,0.9],[10,3,0.8],[0.5,5,0.9],[0.5,7,0.8],[10,7.5,0.8]].map(([c,r,s]) => renderTree(c,r,s))}
      <polygon points={[isoXY(0,7),isoXY(2,7),isoXY(2,8),isoXY(0,8)].map(p=>p.join(',')).join(' ')} fill="#0a1628" stroke="#1a3050" strokeWidth="1"/>
      <text x={isoXY(1,7.5)[0]} y={isoXY(1,7.5)[1]+4} textAnchor="middle" fontSize="7" fill="#3d5a80" fontFamily="Inter,sans-serif">PARKING</text>
      {sorted.map(b => renderBuilding(b))}
      {BUILDINGS.filter(b => filterCategory === 'all' || b.category === filterCategory).map(b => {
        const [lx,ly] = isoXY(b.col+b.w/2,b.row+b.d/2,b.floors*UNIT_H+10)
        return <text key={`lbl${b.id}`} x={lx} y={ly} textAnchor="middle" fontSize="7.5" fontWeight="600" fontFamily="Manrope,sans-serif" fill="rgba(226,236,255,0.55)">{b.name}</text>
      })}
      {routePoints && <>
        <polyline points={routePoints} fill="none" stroke="#22d3ee" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="10,6" opacity="0.9" className="route-line" style={{ filter: 'drop-shadow(0 0 6px #22d3ee)' }}/>
        <polyline points={routePoints} fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="10,6" opacity="0.5" className="route-line"/>
      </>}
      <circle cx={exX} cy={exY} r="10" fill="#fb923c" opacity="0.15"/>
      <circle cx={exX} cy={exY} r="6" fill="#fb923c" opacity="0.8"/>
      <circle cx={exX} cy={exY} r="3" fill="white"/>
      <text x={exX} y={exY+20} textAnchor="middle" fontSize="8" fill="#fb923c" fontFamily="Manrope,sans-serif" fontWeight="600">MAIN GATE</text>
      <g transform="translate(820,60)">
        <circle cx="0" cy="0" r="18" fill="rgba(13,30,56,0.85)" stroke="#1a3050" strokeWidth="1"/>
        <text x="0" y="-6" textAnchor="middle" fontSize="8" fill="#22d3ee" fontWeight="700">N</text>
        <text x="0" y="14" textAnchor="middle" fontSize="7" fill="#3d5a80">S</text>
        <text x="-13" y="4" textAnchor="middle" fontSize="7" fill="#3d5a80">W</text>
        <text x="13" y="4" textAnchor="middle" fontSize="7" fill="#3d5a80">E</text>
        <polygon points="0,-14 -3,-2 0,2 3,-2" fill="#22d3ee"/>
        <polygon points="0,14 -3,2 0,-2 3,2" fill="#3d5a80" opacity="0.5"/>
      </g>
    </svg>
  )
}

// ─── ALGORITHM VISUALIZER ─────────────────────────────────────────────────────

function AlgorithmVisualizer({ t }: { t: ThemeColors }) {
  const [algo, setAlgo] = useState<AlgoType>('bfs')
  const [start, setStart] = useState('entrance')
  const [goal, setGoal] = useState('library')
  const [steps, setSteps] = useState<AlgoStep[]>([])
  const [stepIdx, setStepIdx] = useState(-1)
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(600)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const runAlgo = useCallback(() => {
    const s = algo === 'bfs' ? runBFS(start, goal) : algo === 'dfs' ? runDFS(start, goal) : runAStar(start, goal)
    setSteps(s); setStepIdx(0); setRunning(true)
  }, [algo, start, goal])

  useEffect(() => {
    if (running && stepIdx >= 0) {
      intervalRef.current = setInterval(() => {
        setStepIdx(prev => { if (prev >= steps.length - 1) { setRunning(false); return prev }; return prev + 1 })
      }, speed)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running, stepIdx, steps.length, speed])

  const cur = stepIdx >= 0 ? steps[stepIdx] : null
  const finalPath = cur?.path ?? []
  const nodeMap = Object.fromEntries(ALGO_NODES.map(n => [n.id, n]))

  function nodeColor(id: string) {
    if (!cur) return '#1a3050'
    if (id === cur.current) return '#f59e0b'
    if (finalPath.includes(id)) return '#22d3ee'
    if (cur.visited.includes(id)) return '#34d399'
    if (cur.frontier.includes(id)) return '#818cf8'
    return '#1e3a5f'
  }
  function nodeStroke(id: string) {
    if (id === start) return '#fb923c'
    if (id === goal) return '#f87171'
    if (!cur) return '#254570'
    if (id === cur.current) return '#fbbf24'
    return 'transparent'
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4" style={{ borderBottom: `1px solid ${t.border}`, background: t.bgSurface }}>
        <div className="flex items-center gap-3 mb-2">
          <div style={{ padding: '3px 10px', borderRadius: '999px', background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em' }}>
            TECHNICAL DEMO · DEVELOPER MODE
          </div>
        </div>
        <h2 style={{ fontFamily: 'Manrope,sans-serif', color: t.text, fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Route Algorithm Visualizer</h2>
        <p style={{ color: t.textSub, fontSize: '0.78rem', margin: '2px 0 0' }}>Educational demo of graph traversal — not visible to regular navigation users</p>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 flex-shrink-0 p-4 overflow-y-auto" style={{ borderRight: `1px solid ${t.border}`, background: t.bgSurface }}>
          <p style={{ color: t.textMuted, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>Algorithm</p>
          <div className="flex gap-2 mb-5">
            {(['bfs', 'dfs', 'astar'] as AlgoType[]).map(a => (
              <button key={a} onClick={() => { setAlgo(a); setStepIdx(-1); setRunning(false) }}
                style={{ flex: 1, padding: '8px 4px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, border: '1.5px solid', cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'JetBrains Mono,monospace', background: algo === a ? (a === 'astar' ? '#22d3ee' : a === 'bfs' ? '#3b82f6' : '#6366f1') : t.inputBg, borderColor: algo === a ? 'transparent' : t.border, color: algo === a ? (a === 'astar' ? '#000' : '#fff') : t.textSub }}>
                {a === 'astar' ? 'A*' : a.toUpperCase()}
              </button>
            ))}
          </div>
          {algo === 'astar' && <div className="mb-4 p-2 rounded" style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)' }}><p style={{ color: '#22d3ee', fontSize: '0.72rem', fontFamily: 'JetBrains Mono,monospace', margin: 0 }}>f(n) = g(n) + h(n)</p><p style={{ color: t.textSub, fontSize: '0.65rem', margin: '4px 0 0' }}>g = cost · h = heuristic</p></div>}
          <p style={{ color: t.textMuted, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>Start</p>
          <select value={start} onChange={e => { setStart(e.target.value); setStepIdx(-1); setRunning(false) }} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', background: t.inputBg, border: `1.5px solid ${t.border}`, color: t.text, fontSize: '0.8rem', marginBottom: '12px' }}>
            {ALGO_NODES.map(n => <option key={n.id} value={n.id} style={{ background: t.bgCard, color: t.text }}>{n.label}</option>)}
          </select>
          <p style={{ color: t.textMuted, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>Goal</p>
          <select value={goal} onChange={e => { setGoal(e.target.value); setStepIdx(-1); setRunning(false) }} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', background: t.inputBg, border: `1.5px solid ${t.border}`, color: t.text, fontSize: '0.8rem', marginBottom: '16px' }}>
            {ALGO_NODES.map(n => <option key={n.id} value={n.id} style={{ background: t.bgCard, color: t.text }}>{n.label}</option>)}
          </select>
          <p style={{ color: t.textMuted, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>Speed</p>
          <input type="range" min="100" max="1200" step="100" value={1200 - speed + 100} onChange={e => setSpeed(1200 - +e.target.value + 100)} style={{ width: '100%', accentColor: '#22d3ee', marginBottom: '16px' }}/>
          <div className="flex gap-2 mb-2">
            <button onClick={runAlgo} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: '#22d3ee', color: '#000', fontWeight: 700, fontSize: '0.8rem', border: 'none', cursor: 'pointer' }}>▶ Run</button>
            <button onClick={() => { setRunning(false); if (intervalRef.current) clearInterval(intervalRef.current) }} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: t.inputBg, color: t.textSub, fontWeight: 600, fontSize: '0.8rem', border: `1.5px solid ${t.border}`, cursor: 'pointer' }}>⏸ Pause</button>
          </div>
          <div className="flex gap-2 mb-2">
            <button onClick={() => setStepIdx(p => Math.max(0, p - 1))} style={{ flex: 1, padding: '8px', borderRadius: '8px', background: t.inputBg, color: t.textSub, fontWeight: 600, fontSize: '0.8rem', border: `1.5px solid ${t.border}`, cursor: 'pointer' }}>◀ Prev</button>
            <button onClick={() => setStepIdx(p => Math.min(steps.length - 1, p + 1))} style={{ flex: 1, padding: '8px', borderRadius: '8px', background: t.inputBg, color: t.textSub, fontWeight: 600, fontSize: '0.8rem', border: `1.5px solid ${t.border}`, cursor: 'pointer' }}>Next ▶</button>
          </div>
          <button onClick={() => { setStepIdx(-1); setRunning(false) }} style={{ width: '100%', padding: '8px', borderRadius: '8px', background: t.inputBg, color: '#f87171', fontWeight: 600, fontSize: '0.8rem', border: '1.5px solid rgba(248,113,113,0.3)', cursor: 'pointer', marginBottom: '16px' }}>↺ Reset</button>
          {cur && (
            <div className="p-3 rounded-lg" style={{ background: t.bgElevated, border: `1px solid ${t.border}` }}>
              <p style={{ color: t.textMuted, fontSize: '0.62rem', textTransform: 'uppercase', marginBottom: '8px' }}>Step {stepIdx + 1}/{steps.length}</p>
              {[['Current', nodeMap[cur.current]?.label, '#f59e0b'], ['Visited', String(cur.visited.length), '#34d399'], ['Frontier', String(cur.frontier.length), '#818cf8']].map(([k, v, c]) => (
                <div key={k} className="flex justify-between mb-1"><span style={{ color: t.textSub, fontSize: '0.75rem' }}>{k}:</span><span style={{ color: c, fontWeight: 600, fontSize: '0.75rem' }}>{v}</span></div>
              ))}
              {algo === 'astar' && cur.g !== undefined && <>
                <div style={{ height: 1, background: t.border, margin: '6px 0' }}/>
                {[['g(n)', String(cur.g), '#60a5fa'], ['h(n)', String(cur.h), '#a78bfa'], ['f(n)', String(cur.f), '#22d3ee']].map(([k, v, c]) => (
                  <div key={k} className="flex justify-between mb-1"><span style={{ color: t.textSub, fontSize: '0.75rem', fontFamily: 'JetBrains Mono,monospace' }}>{k}:</span><span style={{ color: c, fontWeight: 700, fontSize: '0.75rem', fontFamily: 'JetBrains Mono,monospace' }}>{v}</span></div>
                ))}
              </>}
              {cur.path.length > 0 && <div className="mt-2 p-2 rounded" style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)' }}><p style={{ color: '#22d3ee', fontSize: '0.7rem', fontWeight: 700, margin: '0 0 3px' }}>✓ Path Found!</p><p style={{ color: t.textSub, fontSize: '0.65rem', margin: 0 }}>{cur.path.map(id => nodeMap[id]?.shortLabel).join(' → ')}</p></div>}
            </div>
          )}
          <div className="mt-4 p-3 rounded-lg" style={{ background: t.bgElevated, border: `1px solid ${t.border}` }}>
            <p style={{ color: t.textMuted, fontSize: '0.62rem', textTransform: 'uppercase', marginBottom: '8px' }}>Legend</p>
            {[['#fb923c','Start'],['#f87171','Goal'],['#f59e0b','Current'],['#818cf8','Frontier'],['#34d399','Visited'],['#22d3ee','Final Path']].map(([c,l]) => (
              <div key={l} className="flex items-center gap-2 mb-1.5"><div style={{ width: 10, height: 10, borderRadius: '50%', background: c, flexShrink: 0 }}/><span style={{ color: t.textSub, fontSize: '0.7rem' }}>{l}</span></div>
            ))}
          </div>
        </div>
        <div className="flex-1 relative overflow-hidden" style={{ background: '#060c18' }}>
          <svg width="100%" height="100%" viewBox="80 30 620 430">
            {Array.from({ length: 20 }, (_, i) => <line key={`vg${i}`} x1={80+i*32} y1="30" x2={80+i*32} y2="460" stroke="#0d1e38" strokeWidth="0.5"/>)}
            {Array.from({ length: 14 }, (_, i) => <line key={`hg${i}`} x1="80" y1={30+i*32} x2="700" y2={30+i*32} stroke="#0d1e38" strokeWidth="0.5"/>)}
            {ALGO_EDGES.map(({ from, to, weight }, i) => {
              const a = nodeMap[from], b = nodeMap[to]
              const onPath = cur?.path.includes(from) && cur?.path.includes(to) && Math.abs(cur.path.indexOf(from) - cur.path.indexOf(to)) === 1
              return <g key={i}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={onPath ? '#22d3ee' : '#1a3050'} strokeWidth={onPath ? 3 : 1.5} style={{ filter: onPath ? 'drop-shadow(0 0 4px #22d3ee)' : 'none', transition: 'all 0.3s' }}/><text x={(a.x+b.x)/2} y={(a.y+b.y)/2-4} textAnchor="middle" fontSize="8" fill="#3d5a80" fontFamily="JetBrains Mono,monospace">{weight}</text></g>
            })}
            {ALGO_NODES.map(node => {
              const nc = nodeColor(node.id), ns = nodeStroke(node.id)
              const isActive = cur?.current === node.id, onFinalPath = finalPath.includes(node.id)
              return (
                <g key={node.id}>
                  {isActive && <circle cx={node.x} cy={node.y} r="24" fill={nc} opacity="0.15" className="pulse-ring"/>}
                  {onFinalPath && <circle cx={node.x} cy={node.y} r="18" fill="#22d3ee" opacity="0.2" style={{ filter: 'blur(4px)' }}/>}
                  <circle cx={node.x} cy={node.y} r="16" fill={nc} stroke={ns === 'transparent' ? '#1a3050' : ns} strokeWidth="2.5" style={{ transition: 'all 0.3s', filter: isActive ? `drop-shadow(0 0 8px ${nc})` : 'none' }}/>
                  <text x={node.x} y={node.y+4} textAnchor="middle" fontSize="8" fontWeight="700" fill="white" fontFamily="Manrope,sans-serif">{node.shortLabel}</text>
                  <text x={node.x} y={node.y+26} textAnchor="middle" fontSize="9" fill="#7fa8d4" fontFamily="Inter,sans-serif">{node.label}</text>
                  {node.id === start && <text x={node.x} y={node.y-22} textAnchor="middle" fontSize="8" fill="#fb923c" fontWeight="700" fontFamily="Manrope,sans-serif">START</text>}
                  {node.id === goal && <text x={node.x} y={node.y-22} textAnchor="middle" fontSize="8" fill="#f87171" fontWeight="700" fontFamily="Manrope,sans-serif">GOAL</text>}
                </g>
              )
            })}
            {steps.length > 0 && <>
              <rect x="80" y="450" width="620" height="4" rx="2" fill="#0d1e38"/>
              <rect x="80" y="450" width={620*(stepIdx+1)/steps.length} height="4" rx="2" fill="#22d3ee" style={{ filter: 'drop-shadow(0 0 4px #22d3ee)' }}/>
            </>}
          </svg>
          <div className="absolute top-4 right-4 p-3 rounded-xl" style={{ background: 'rgba(6,12,24,0.92)', border: '1px solid #1a3050', maxWidth: '200px' }}>
            <p style={{ color: '#22d3ee', fontSize: '0.8rem', fontWeight: 700, margin: '0 0 4px', fontFamily: 'Manrope,sans-serif' }}>{algo === 'bfs' ? 'Breadth-First Search' : algo === 'dfs' ? 'Depth-First Search' : 'A* Search'}</p>
            <p style={{ color: '#7fa8d4', fontSize: '0.68rem', margin: 0, lineHeight: 1.4 }}>{algo === 'bfs' ? 'Level-by-level exploration. Shortest unweighted path.' : algo === 'dfs' ? 'Depth-first. Memory efficient, not optimal.' : 'Heuristic-guided. Optimal & complete.'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── SEARCH BAR ───────────────────────────────────────────────────────────────

function SearchBar({ onSelectLoc, t, recentSearches, onAddRecent }: {
  onSelectLoc: (l: Location) => void; t: ThemeColors
  recentSearches: string[]; onAddRecent: (name: string) => void
}) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const results = query.trim().length > 0
    ? LOCATIONS.filter(l => l.name.toLowerCase().includes(query.toLowerCase()) || l.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase())) || l.building.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : []

  useEffect(() => {
    function click(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setFocused(false) }
    document.addEventListener('mousedown', click)
    return () => document.removeEventListener('mousedown', click)
  }, [])

  const catIcons: Record<string, string> = { academic: '📚', food: '🍽️', lab: '💻', department: '🎓', admin: '🏛️', facility: '🎭', student: '🎨', utility: '⚙️', emergency: '🚨' }

  function selectLoc(loc: Location) { onAddRecent(loc.name); onSelectLoc(loc); setQuery(''); setFocused(false) }

  const showDropdown = focused && (results.length > 0 || (query.trim() === '' && recentSearches.length > 0))

  return (
    <div ref={ref} style={{ position: 'relative', width: '460px', maxWidth: '100%' }}>
      <div className="flex items-center gap-3" style={{ background: t.inputBg, border: `1.5px solid ${focused ? t.accent : t.border}`, borderRadius: '12px', padding: '0 14px', transition: 'all 0.2s', boxShadow: focused ? `0 0 20px ${t.accent}18` : 'none' }}>
        <span style={{ color: t.textMuted, fontSize: '0.9rem', flexShrink: 0 }}>🔍</span>
        <input value={query} onChange={e => setQuery(e.target.value)} onFocus={() => setFocused(true)}
          placeholder="Search buildings, departments, labs, facilities..."
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: t.text, fontSize: '0.87rem', padding: '11px 0', fontFamily: 'Inter,sans-serif' }}/>
        {query && <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: '1rem' }}>✕</button>}
      </div>
      {showDropdown && (
        <div className="absolute top-full mt-2 w-full rounded-xl overflow-hidden" style={{ background: t.bgCard, border: `1px solid ${t.border}`, zIndex: 100, boxShadow: `0 16px 40px ${t.shadow}` }}>
          {query.trim() === '' && recentSearches.length > 0 && (
            <>
              <div className="px-4 py-2" style={{ borderBottom: `1px solid ${t.border}` }}>
                <span style={{ color: t.textMuted, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Recent Searches</span>
              </div>
              {recentSearches.slice(0,5).map((name, i) => (
                <button key={i} onClick={() => { const loc = LOCATIONS.find(l => l.name === name); if (loc) selectLoc(loc) }}
                  className="w-full text-left flex items-center gap-3 px-4 py-2.5" style={{ background: 'transparent', border: 'none', borderBottom: `1px solid ${t.border}`, cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = t.cardHover)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <span style={{ color: t.textMuted, fontSize: '0.8rem' }}>🕐</span>
                  <span style={{ color: t.text, fontSize: '0.83rem' }}>{name}</span>
                </button>
              ))}
            </>
          )}
          {results.length === 0 && query.trim() !== '' ? (
            <div className="p-4 text-center" style={{ color: t.textMuted, fontSize: '0.82rem' }}>No results for "{query}"</div>
          ) : results.map(loc => (
            <button key={loc.id} onClick={() => selectLoc(loc)}
              className="w-full text-left flex items-center gap-3 px-4 py-3"
              style={{ background: 'transparent', border: 'none', borderBottom: `1px solid ${t.border}`, cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = t.cardHover)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <span style={{ fontSize: '1rem', flexShrink: 0 }}>{catIcons[loc.category] ?? '📍'}</span>
              <div className="flex-1 min-w-0">
                <div style={{ color: t.text, fontWeight: 600, fontSize: '0.85rem' }}>{loc.name}</div>
                <div style={{ color: t.textSub, fontSize: '0.72rem' }}>{loc.building} · {loc.floor}</div>
              </div>
              <span style={{ color: t.accent, fontSize: '0.72rem', flexShrink: 0 }}>{loc.distance}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── LOCATION PANEL ───────────────────────────────────────────────────────────

function LocationPanel({ location, onClose, onNavigate, t }: { location: Location; onClose: () => void; onNavigate: () => void; t: ThemeColors }) {
  const catIcons: Record<string, string> = { academic: '📚', food: '🍽️', lab: '💻', department: '🎓', admin: '🏛️', facility: '🎭', student: '🎨', utility: '⚙️', emergency: '🚨' }
  const building = BUILDINGS.find(b => b.id === location.buildingId)
  const nearby = LOCATIONS.filter(l => l.buildingId === location.buildingId && l.id !== location.id).slice(0, 4)

  return (
    <div className="slide-right h-full flex flex-col overflow-hidden" style={{ width: '310px', background: t.bgCard, borderLeft: `1px solid ${t.border}` }}>
      <div className="flex items-start justify-between p-5" style={{ borderBottom: `1px solid ${t.border}` }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span style={{ fontSize: '1rem' }}>{catIcons[location.category] ?? '📍'}</span>
            <span style={{ fontSize: '0.65rem', color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{location.category}</span>
          </div>
          <h3 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1rem', fontWeight: 700, color: t.text, margin: 0, lineHeight: 1.3 }}>{location.name}</h3>
          <p style={{ color: t.textSub, fontSize: '0.78rem', margin: '4px 0 0' }}>{location.building} · {location.floor}</p>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: '1.2rem', padding: '4px' }}>✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex gap-3 mb-4">
          <div className="flex-1 rounded-lg p-3 text-center" style={{ background: t.bgElevated, border: `1px solid ${t.border}` }}>
            <div style={{ color: t.accent, fontFamily: 'Manrope,sans-serif', fontWeight: 700, fontSize: '1rem' }}>{location.distance}</div>
            <div style={{ color: t.textSub, fontSize: '0.68rem', marginTop: '2px' }}>Distance</div>
          </div>
          <div className="flex-1 rounded-lg p-3 text-center" style={{ background: t.bgElevated, border: `1px solid ${t.border}` }}>
            <div style={{ color: t.accentBlue, fontFamily: 'Manrope,sans-serif', fontWeight: 700, fontSize: '1rem' }}>{location.walkTime}</div>
            <div style={{ color: t.textSub, fontSize: '0.68rem', marginTop: '2px' }}>Walk Time</div>
          </div>
        </div>
        <p style={{ color: t.textSub, fontSize: '0.8rem', lineHeight: 1.55, marginBottom: '14px' }}>{location.description}</p>
        {location.hours && (
          <div className="flex items-center gap-2 mb-4 p-3 rounded-lg" style={{ background: t.bgElevated, border: `1px solid ${t.border}` }}>
            <span>🕐</span>
            <div><div style={{ color: t.textMuted, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Hours</div><div style={{ color: t.text, fontSize: '0.8rem', fontWeight: 600 }}>{location.hours}</div></div>
          </div>
        )}
        {building && (
          <div className="p-3 rounded-lg mb-4" style={{ background: t.bgElevated, border: `1px solid ${building.glowColor}20` }}>
            <div style={{ color: t.textMuted, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Building</div>
            <div className="flex items-center gap-2">
              <div style={{ width: 28, height: 28, borderRadius: '6px', background: building.topColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, color: 'white', fontFamily: 'Manrope,sans-serif' }}>{building.shortLabel}</div>
              <div><div style={{ color: t.text, fontSize: '0.82rem', fontWeight: 600 }}>{building.name}</div><div style={{ color: t.textSub, fontSize: '0.7rem' }}>{building.floors} floors</div></div>
            </div>
          </div>
        )}
        {building && (
          <div className="mb-4">
            <div style={{ color: t.textMuted, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Facilities</div>
            <div className="flex flex-wrap gap-2">{building.facilities.map(f => <span key={f} style={{ padding: '3px 9px', borderRadius: '999px', background: t.bgElevated, border: `1px solid ${t.border}`, color: t.textSub, fontSize: '0.68rem' }}>{f}</span>)}</div>
          </div>
        )}
        {nearby.length > 0 && (
          <div>
            <div style={{ color: t.textMuted, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Nearby</div>
            {nearby.map(n => (
              <div key={n.id} className="flex items-center justify-between p-2.5 rounded-lg mb-2" style={{ background: t.bgElevated, border: `1px solid ${t.border}` }}>
                <div><div style={{ color: t.text, fontSize: '0.8rem', fontWeight: 500 }}>{n.name}</div><div style={{ color: t.textSub, fontSize: '0.68rem' }}>{n.floor}</div></div>
                <span style={{ color: t.accent, fontSize: '0.7rem' }}>{n.distance}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="p-4 flex flex-col gap-2" style={{ borderTop: `1px solid ${t.border}` }}>
        <button onClick={onNavigate} style={{ width: '100%', padding: '12px', borderRadius: '10px', background: `linear-gradient(135deg, ${t.accent}, ${t.accentBlue})`, color: '#000', fontWeight: 700, fontSize: '0.88rem', border: 'none', cursor: 'pointer', fontFamily: 'Manrope,sans-serif' }}>
          Navigate Here →
        </button>
        <div className="flex gap-2">
          <button style={{ flex: 1, padding: '9px', borderRadius: '10px', background: t.bgElevated, color: t.textSub, fontWeight: 600, fontSize: '0.8rem', border: `1.5px solid ${t.border}`, cursor: 'pointer' }}>♥ Save</button>
          <button style={{ flex: 1, padding: '9px', borderRadius: '10px', background: t.bgElevated, color: t.textSub, fontWeight: 600, fontSize: '0.8rem', border: `1.5px solid ${t.border}`, cursor: 'pointer' }}>Share</button>
        </div>
      </div>
    </div>
  )
}

// ─── NAVIGATE SCREEN — no algorithm selection visible ─────────────────────────

function NavigateScreen({ onStartRoute, t }: { onStartRoute: (from: string, to: string, pref: RoutePreference) => void; t: ThemeColors }) {
  const [from, setFrom] = useState('entrance')
  const [to, setTo] = useState('library')
  const [pref, setPref] = useState<RoutePreference>('shortest')

  const routeStats: Record<RoutePreference, { distance: string; time: string; steps: number; desc: string; color: string; icon: string }> = {
    shortest: { distance: '285 m', time: '3 min', steps: 4, desc: 'Minimum distance route via direct campus pathways', color: '#22d3ee', icon: '📍' },
    fastest: { distance: '310 m', time: '3 min', steps: 5, desc: 'Least congested route for quickest arrival time', color: '#fbbf24', icon: '⚡' },
    accessible: { distance: '320 m', time: '4 min', steps: 5, desc: 'Barrier-free route using ramps and wider corridors', color: '#34d399', icon: '♿' },
    'avoid-stairs': { distance: '350 m', time: '4 min', steps: 6, desc: 'Lifts only — avoids all staircases and steps', color: '#a78bfa', icon: '🛗' },
  }

  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: t.bgBase }}>
      <div style={{ maxWidth: '580px', margin: '0 auto' }}>
        <h2 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1.3rem', fontWeight: 800, color: t.text, margin: '0 0 4px' }}>Plan Your Route</h2>
        <p style={{ color: t.textSub, fontSize: '0.82rem', marginBottom: '24px' }}>Select start and destination — route is calculated automatically</p>

        {/* From/To selector */}
        <div className="rounded-2xl p-5 mb-6" style={{ background: t.bgCard, border: `1px solid ${t.border}`, boxShadow: `0 4px 20px ${t.shadow}` }}>
          <div className="flex items-center gap-3 pb-4" style={{ borderBottom: `1px solid ${t.border}` }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#fb923c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', flexShrink: 0, color: 'white' }}>A</div>
            <div className="flex-1">
              <div style={{ color: t.textMuted, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>From</div>
              <select value={from} onChange={e => setFrom(e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', color: t.text, fontSize: '0.9rem', fontWeight: 600, fontFamily: 'Manrope,sans-serif', cursor: 'pointer', outline: 'none' }}>
                {ALGO_NODES.map(n => <option key={n.id} value={n.id} style={{ background: t.bgCard, color: t.text }}>{n.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-center py-2">
            <button onClick={() => { const tmp = from; setFrom(to); setTo(tmp) }} style={{ background: t.bgElevated, border: `1px solid ${t.border}`, borderRadius: '8px', padding: '5px 14px', color: t.textSub, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>⇅ Swap</button>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', flexShrink: 0, color: '#000' }}>B</div>
            <div className="flex-1">
              <div style={{ color: t.textMuted, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>To</div>
              <select value={to} onChange={e => setTo(e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', color: t.text, fontSize: '0.9rem', fontWeight: 600, fontFamily: 'Manrope,sans-serif', cursor: 'pointer', outline: 'none' }}>
                {ALGO_NODES.map(n => <option key={n.id} value={n.id} style={{ background: t.bgCard, color: t.text }}>{n.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Route Preference — no algorithm exposed */}
        <h3 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.8rem', fontWeight: 700, color: t.textSub, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>Route Preference</h3>
        <div className="flex flex-col gap-3 mb-6">
          {(Object.entries(routeStats) as [RoutePreference, typeof routeStats[RoutePreference]][]).map(([key, stat]) => (
            <button key={key} onClick={() => setPref(key)} className="text-left p-4 rounded-xl"
              style={{ background: pref === key ? `${stat.color}08` : t.bgCard, border: `2px solid ${pref === key ? stat.color : t.border}`, cursor: 'pointer', transition: 'all 0.2s' }}>
              <div className="flex items-center gap-3 mb-1.5">
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2.5px solid ${stat.color}`, background: pref === key ? stat.color : 'transparent', transition: 'all 0.2s', flexShrink: 0 }}/>
                <span style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 700, color: t.text, fontSize: '0.9rem' }}>{stat.icon} {key === 'avoid-stairs' ? 'Avoid Stairs (Lift Route)' : key.charAt(0).toUpperCase() + key.slice(1) + ' Route'}</span>
              </div>
              <p style={{ color: t.textSub, fontSize: '0.76rem', margin: '0 0 8px 30px', lineHeight: 1.4 }}>{stat.desc}</p>
              <div className="flex gap-5 ml-8">
                <span style={{ color: stat.color, fontSize: '0.78rem', fontWeight: 600, fontFamily: 'JetBrains Mono,monospace' }}>📍 {stat.distance}</span>
                <span style={{ color: t.textSub, fontSize: '0.78rem', fontFamily: 'JetBrains Mono,monospace' }}>⏱ {stat.time}</span>
                <span style={{ color: t.textSub, fontSize: '0.78rem', fontFamily: 'JetBrains Mono,monospace' }}>{stat.steps} waypoints</span>
              </div>
            </button>
          ))}
        </div>

        {/* Accessibility options */}
        <div className="rounded-xl p-4 mb-6" style={{ background: t.bgCard, border: `1px solid ${t.border}` }}>
          <div style={{ color: t.textMuted, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>Additional Options</div>
          <div className="flex gap-5 flex-wrap">
            {['Wheelchair Accessible', 'Well Lit Path', 'Less Crowded', 'Open Air Route'].map(opt => (
              <label key={opt} className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
                <input type="checkbox" style={{ accentColor: t.accent }}/>
                <span style={{ color: t.textSub, fontSize: '0.78rem' }}>{opt}</span>
              </label>
            ))}
          </div>
        </div>

        <button onClick={() => onStartRoute(from, to, pref)}
          style={{ width: '100%', padding: '16px', borderRadius: '12px', background: `linear-gradient(135deg, ${t.accent}, ${t.accentBlue})`, color: '#000', fontWeight: 800, fontSize: '1rem', border: 'none', cursor: 'pointer', fontFamily: 'Manrope,sans-serif', boxShadow: `0 0 30px ${t.accent}22`, letterSpacing: '0.02em' }}>
          Find Route →
        </button>
        <p style={{ color: t.textMuted, fontSize: '0.68rem', textAlign: 'center', marginTop: '10px' }}>
          Powered by intelligent graph routing algorithms
        </p>
      </div>
    </div>
  )
}

// ─── ROUTE SCREEN — wired to the real Python A* AI service (via the Node proxy at /api/v1/ai/route) ──

function RouteScreen({ from, to, pref, onBack, t }: { from: string; to: string; pref: RoutePreference; onBack: () => void; t: ThemeColors }) {
  const [status, setStatus] = useState<'loading' | 'found' | 'not-found' | 'error'>('loading')
  const [result, setResult] = useState<AiRouteResponse | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [activeStep, setActiveStep] = useState(0)
  const [navigating, setNavigating] = useState(false)
  const [showAiInfo, setShowAiInfo] = useState(false)

  useEffect(() => {
    let cancelled = false
    setStatus('loading'); setResult(null); setActiveStep(0); setNavigating(false)
    api.aiRoute(from, to).then(r => {
      if (cancelled) return
      setResult(r)
      setStatus(r.found ? 'found' : 'not-found')
    }).catch(e => {
      if (cancelled) return
      setErrorMsg(e?.message || 'The AI navigation service is unavailable.')
      setStatus('error')
    })
    return () => { cancelled = true }
  }, [from, to])

  const color = '#22d3ee'
  const path = result?.path ?? []
  const labels = result?.path_labels ?? []
  // Distance comes straight from the Python A* service (real metres, sum of real edge
  // weights). Walk time is estimated client-side at the same 1.3 m/s used elsewhere in
  // this project — the Python service does not compute travel time.
  const distanceM = result?.total_cost_m ?? 0
  const timeMin = distanceM > 0 ? Math.max(1, Math.ceil(distanceM / 1.3 / 60)) : 0

  const directions = labels.map((label, i) => {
    if (i === 0) return `Start at ${label}`
    if (i === labels.length - 1) return `Arrive at ${label} — you have reached your destination`
    return ['Walk toward', 'Continue to', 'Pass through', 'Head to'][i % 4] + ` ${label}`
  })

  if (status === 'loading') {
    return (
      <div className="h-full flex items-center justify-center p-6" style={{ background: t.bgBase }}>
        <div style={{ color: t.textSub, fontSize: '0.9rem', fontFamily: 'Manrope,sans-serif' }}>🧭 Asking the Python A* service for a route…</div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="h-full overflow-y-auto p-6" style={{ background: t.bgBase }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: t.textSub, cursor: 'pointer', fontSize: '0.85rem', padding: 0, marginBottom: '16px' }}>← Back</button>
          <div className="rounded-2xl p-5" style={{ background: t.bgCard, border: '1.5px solid #f87171' }}>
            <div style={{ color: '#f87171', fontWeight: 700, fontFamily: 'Manrope,sans-serif', marginBottom: '6px' }}>⚠ AI Navigation Service Unavailable</div>
            <p style={{ color: t.textSub, fontSize: '0.82rem', lineHeight: 1.5 }}>{errorMsg}</p>
            <p style={{ color: t.textMuted, fontSize: '0.74rem', marginTop: '10px' }}>Make sure the Python service is running: <code>uvicorn app.main:app --port 8000</code> inside <code>python-ai/</code>, and that the Node backend is running too.</p>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'not-found') {
    return (
      <div className="h-full overflow-y-auto p-6" style={{ background: t.bgBase }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: t.textSub, cursor: 'pointer', fontSize: '0.85rem', padding: 0, marginBottom: '16px' }}>← Back</button>
          <div className="rounded-2xl p-5" style={{ background: t.bgCard, border: `1.5px solid ${t.border}` }}>
            <div style={{ color: t.text, fontWeight: 700, fontFamily: 'Manrope,sans-serif', marginBottom: '6px' }}>No route found</div>
            <p style={{ color: t.textSub, fontSize: '0.82rem' }}>{result?.message ?? 'No open path connects these two locations.'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: t.bgBase }}>
      <div style={{ maxWidth: '540px', margin: '0 auto' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: t.textSub, cursor: 'pointer', fontSize: '0.85rem', padding: 0, marginBottom: '16px' }}>← Back</button>
        <div className="rounded-2xl p-5 mb-5" style={{ background: t.bgCard, border: `1px solid ${t.border}` }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 700, color: t.text, fontSize: '1rem' }}>{result?.from.label} → {result?.to.label}</div>
              <div style={{ color: t.textSub, fontSize: '0.78rem', marginTop: '2px' }}>Computed by the Python A* AI service{pref !== 'shortest' ? ' — preference filters are not yet supported by the AI service; showing the physically shortest route' : ''}</div>
            </div>
            <div style={{ padding: '4px 10px', borderRadius: '999px', background: `${color}18`, color, fontSize: '0.68rem', fontWeight: 700 }}>ROUTE FOUND</div>
          </div>
          <div className="flex gap-5">
            {[{ val: `${Math.round(distanceM)} m`, label: 'Distance', c: color }, { val: `${timeMin} min`, label: 'Walk Time (est.)', c: t.accentBlue }, { val: String(path.length), label: 'Waypoints', c: '#34d399' }].map(({ val, label, c }) => (
              <div key={label}><div style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1.4rem', fontWeight: 800, color: c }}>{val}</div><div style={{ color: t.textSub, fontSize: '0.7rem' }}>{label}</div></div>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <div style={{ color: t.textMuted, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>Route</div>
          <div className="flex flex-wrap items-center gap-2">
            {labels.map((label, i) => (
              <div key={path[i] + i} className="flex items-center gap-2">
                <div style={{ padding: '5px 11px', borderRadius: '8px', background: i === 0 ? 'rgba(251,146,60,0.18)' : i === labels.length - 1 ? `${color}18` : t.bgCard, border: `1px solid ${i === 0 ? '#fb923c' : i === labels.length - 1 ? color : t.border}`, color: i === 0 ? '#fb923c' : i === labels.length - 1 ? color : t.text, fontSize: '0.8rem', fontWeight: 600 }}>{label}</div>
                {i < labels.length - 1 && <span style={{ color: t.textMuted, fontSize: '0.8rem' }}>→</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <div style={{ color: t.textMuted, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>Step-by-Step Directions</div>
          {directions.map((dir, i) => (
            <button key={i} onClick={() => setActiveStep(i)} className="w-full text-left flex items-start gap-3 p-3 rounded-xl mb-2"
              style={{ background: activeStep === i ? `${color}10` : t.bgCard, border: `1.5px solid ${activeStep === i ? color : t.border}`, cursor: 'pointer', transition: 'all 0.2s' }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: i === 0 ? '#fb923c' : i === directions.length - 1 ? color : t.bgElevated, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, color: 'white', flexShrink: 0 }}>{i + 1}</div>
              <div style={{ color: activeStep === i ? t.text : t.textSub, fontSize: '0.83rem', fontWeight: activeStep === i ? 500 : 400, lineHeight: 1.4 }}>{dir}</div>
            </button>
          ))}
        </div>

        <button onClick={() => setShowAiInfo(v => !v)} className="w-full text-left flex items-center justify-between p-3 rounded-xl mb-6" style={{ background: t.bgCard, border: `1px solid ${t.border}`, cursor: 'pointer' }}>
          <span style={{ color: t.textSub, fontSize: '0.78rem', fontFamily: 'JetBrains Mono,monospace' }}>⚙ How the AI computed this (f(n)=g(n)+h(n))</span>
          <span style={{ color: t.textMuted }}>{showAiInfo ? '▲' : '▼'}</span>
        </button>
        {showAiInfo && (
          <div className="mb-6 rounded-xl p-4" style={{ background: t.bgElevated, border: `1px solid ${t.border}`, fontFamily: 'JetBrains Mono,monospace', fontSize: '0.72rem', color: t.textSub, lineHeight: 1.7 }}>
            <div>algorithm: {result?.algorithm}</div>
            <div>heuristic: {result?.heuristic}</div>
            <div>nodes expanded: {result?.nodes_expanded} · nodes generated: {result?.nodes_generated}</div>
            <div>compute time: {result?.computation_time_ms} ms</div>
            <div style={{ marginTop: '6px', color: t.textMuted }}>{result?.cost_basis}</div>
          </div>
        )}

        <button onClick={() => setNavigating(!navigating)}
          style={{ width: '100%', padding: '15px', borderRadius: '12px', background: navigating ? '#f87171' : `linear-gradient(135deg, ${color}, ${t.accentBlue})`, color: navigating ? 'white' : '#000', fontWeight: 800, fontSize: '0.95rem', border: 'none', cursor: 'pointer', fontFamily: 'Manrope,sans-serif' }}>
          {navigating ? '⏹ End Navigation' : '▶ Start Navigation'}
        </button>

        {navigating && (
          <div className="mt-4 rounded-xl p-4" style={{ background: `${color}0a`, border: `1.5px solid ${color}35` }}>
            <div className="flex items-center gap-3 mb-3">
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 12px ${color}` }} className="pulse-ring"/>
              <span style={{ color, fontWeight: 700, fontFamily: 'Manrope,sans-serif' }}>Navigating to {result?.to.label}</span>
            </div>
            <div style={{ color: t.text, fontSize: '1.3rem', fontWeight: 800, fontFamily: 'Manrope,sans-serif' }}>{directions[activeStep]}</div>
            <div style={{ color: t.textSub, fontSize: '0.78rem', marginTop: '6px' }}>Step {activeStep + 1} of {directions.length}</div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setActiveStep(Math.max(0, activeStep - 1))} style={{ flex: 1, padding: '8px', borderRadius: '8px', background: t.bgElevated, border: `1px solid ${t.border}`, color: t.textSub, cursor: 'pointer' }}>← Prev</button>
              <button onClick={() => setActiveStep(Math.min(directions.length - 1, activeStep + 1))} style={{ flex: 1, padding: '8px', borderRadius: '8px', background: color, border: 'none', color: '#000', cursor: 'pointer', fontWeight: 700 }}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── HOME SCREEN ──────────────────────────────────────────────────────────────

function HomeScreen({ onNavigate, onSelectLoc, t }: { onNavigate: (s: Screen) => void; onSelectLoc: (l: Location) => void; t: ThemeColors }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { setTimeout(() => setVisible(true), 80) }, [])

  const stats = [{ value: '6+', label: 'Blocks', icon: '🏛️' }, { value: '20+', label: 'Facilities', icon: '⚡' }, { value: '10+', label: 'Departments', icon: '🎓' }, { value: '100+', label: 'Locations', icon: '📍' }]

  return (
    <div className="h-full overflow-y-auto" style={{ background: t.bgBase }}>
      <div className="relative overflow-hidden" style={{ padding: '70px 60px 50px' }}>
        <div style={{ position: 'absolute', top: -100, left: '30%', width: 500, height: 500, borderRadius: '50%', background: `radial-gradient(circle, ${t.accent}08 0%, transparent 70%)`, pointerEvents: 'none' }}/>
        <div style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.65s ease', maxWidth: '680px' }}>
          <div className="inline-flex items-center gap-2 mb-5" style={{ padding: '5px 14px', borderRadius: '999px', background: `${t.accent}12`, border: `1px solid ${t.accent}30` }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: t.accent, boxShadow: `0 0 8px ${t.accent}` }}/>
            <span style={{ color: t.accent, fontSize: '0.72rem', fontWeight: 600, fontFamily: 'Manrope,sans-serif', letterSpacing: '0.08em' }}>VIT MUMBAI · INTELLIGENT CAMPUS NAVIGATION</span>
          </div>
          <h1 style={{ fontFamily: 'Manrope,sans-serif', fontSize: 'clamp(2.2rem, 5vw, 3.4rem)', fontWeight: 800, lineHeight: 1.1, color: t.text, margin: '0 0 18px' }}>
            Navigate VIT<br/>
            <span style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.accentBlue})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Smarter.</span>
          </h1>
          <p style={{ color: t.textSub, fontSize: '1.05rem', lineHeight: 1.65, margin: '0 0 32px', maxWidth: '520px' }}>
            Find buildings, departments and campus facilities instantly. Powered by intelligent campus routing.
          </p>
          <div className="flex gap-4 flex-wrap">
            <button onClick={() => onNavigate('map')} style={{ padding: '13px 26px', borderRadius: '12px', background: `linear-gradient(135deg, ${t.accent}, ${t.accentBlue})`, color: '#000', fontWeight: 700, fontSize: '0.9rem', border: 'none', cursor: 'pointer', fontFamily: 'Manrope,sans-serif' }}>
              Explore Campus →
            </button>
            <button onClick={() => onNavigate('navigate')} style={{ padding: '13px 26px', borderRadius: '12px', background: 'transparent', color: t.text, fontWeight: 600, fontSize: '0.9rem', border: `1.5px solid ${t.border}`, cursor: 'pointer' }}>
              Find a Location
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-4 px-14 pb-8 flex-wrap">
        {stats.map(s => (
          <div key={s.label} className="flex-1 rounded-xl p-5" style={{ minWidth: '130px', background: t.bgCard, border: `1px solid ${t.border}` }}>
            <div style={{ fontSize: '1.4rem', marginBottom: '4px' }}>{s.icon}</div>
            <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1.7rem', fontWeight: 800, color: t.accent, lineHeight: 1 }}>{s.value}</div>
            <div style={{ color: t.textSub, fontSize: '0.78rem', marginTop: '4px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="px-14 pb-8">
        <h2 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1.05rem', fontWeight: 700, color: t.text, marginBottom: '14px' }}>Quick Access</h2>
        <div className="flex gap-3 flex-wrap">
          {QUICK_ACCESS.map(qa => {
            const loc = LOCATIONS.find(l => l.id === qa.id)
            return (
              <button key={qa.id} onClick={() => { if (loc) onSelectLoc(loc) }}
                style={{ padding: '11px 16px', borderRadius: '12px', background: t.bgCard, border: `1.5px solid ${qa.color}20`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = qa.color; e.currentTarget.style.background = `${qa.color}0f` }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = `${qa.color}20`; e.currentTarget.style.background = t.bgCard }}>
                <span style={{ fontSize: '1.1rem' }}>{qa.icon}</span>
                <span style={{ color: t.text, fontWeight: 600, fontSize: '0.83rem' }}>{qa.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="px-14 pb-12">
        <h2 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1.05rem', fontWeight: 700, color: t.text, marginBottom: '14px' }}>Campus Modules</h2>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
          {[
            { label: 'Campus Map', desc: '3D isometric visualization', icon: '🗺️', screen: 'map' as Screen, color: t.accent },
            { label: 'Navigate', desc: 'Smart route finder', icon: '🧭', screen: 'navigate' as Screen, color: t.accentBlue },
            { label: 'Algorithm Lab', desc: 'Graph traversal · developer only', icon: '⚙️', screen: 'algorithm' as Screen, color: '#a78bfa' },
            { label: 'Directory', desc: 'All 6+ campus blocks', icon: '🏛️', screen: 'directory' as Screen, color: '#34d399' },
            { label: 'Departments', desc: 'Find your department', icon: '🎓', screen: 'departments' as Screen, color: '#fbbf24' },
            { label: 'Facilities', desc: 'Labs, canteen & more', icon: '⚡', screen: 'facilities' as Screen, color: '#fb923c' },
          ].map(item => (
            <button key={item.label} onClick={() => onNavigate(item.screen)}
              className="text-left p-5 rounded-xl" style={{ background: t.bgCard, border: `1.5px solid ${item.color}18`, cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = `${item.color}45`; e.currentTarget.style.background = `${item.color}08` }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = `${item.color}18`; e.currentTarget.style.background = t.bgCard }}>
              <div style={{ fontSize: '1.6rem', marginBottom: '10px' }}>{item.icon}</div>
              <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.92rem', fontWeight: 700, color: t.text, marginBottom: '3px' }}>{item.label}</div>
              <div style={{ color: t.textSub, fontSize: '0.76rem' }}>{item.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── DIRECTORY / DEPARTMENTS / FACILITIES / INDOOR / SAVED / EMERGENCY ────────

function DirectoryScreen({ onSelectBuilding, t }: { onSelectBuilding: (b: CampusBuilding) => void; t: ThemeColors }) {
  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: t.bgBase }}>
      <h2 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1.25rem', fontWeight: 800, color: t.text, margin: '0 0 4px' }}>Campus Directory</h2>
      <p style={{ color: t.textSub, fontSize: '0.8rem', marginBottom: '22px' }}>All buildings and blocks at VIT Mumbai</p>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {BUILDINGS.map(b => (
          <button key={b.id} onClick={() => onSelectBuilding(b)} className="text-left rounded-2xl p-5"
            style={{ background: t.bgCard, border: `1.5px solid ${b.glowColor}20`, cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = `${b.glowColor}50`; e.currentTarget.style.boxShadow = `0 0 20px ${b.glowColor}12` }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = `${b.glowColor}20`; e.currentTarget.style.boxShadow = 'none' }}>
            <div className="flex items-center gap-4 mb-4">
              <div style={{ width: 52, height: 52, position: 'relative', flexShrink: 0 }}>
                <svg width="52" height="52" viewBox="0 0 52 52"><polygon points="26,4 46,16 46,40 26,28" fill={b.rightColor}/><polygon points="26,4 6,16 6,40 26,28" fill={b.frontColor}/><polygon points="26,4 46,16 26,28 6,16" fill={b.topColor}/></svg>
              </div>
              <div>
                <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1.05rem', fontWeight: 800, color: t.text }}>{b.name}</div>
                <div style={{ color: t.textSub, fontSize: '0.72rem', marginTop: '2px' }}>{b.floors} Floors · {b.category}</div>
              </div>
            </div>
            <p style={{ color: t.textSub, fontSize: '0.78rem', lineHeight: 1.4, marginBottom: '12px' }}>{b.description}</p>
            <div className="flex flex-wrap gap-2">{b.departments.map(d => <span key={d} style={{ padding: '3px 9px', borderRadius: '999px', background: `${b.glowColor}12`, border: `1px solid ${b.glowColor}30`, color: b.glowColor, fontSize: '0.67rem', fontWeight: 600 }}>{d}</span>)}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function DepartmentsScreen({ onSelectLoc, t }: { onSelectLoc: (l: Location) => void; t: ThemeColors }) {
  const depts = [
    { name: 'Computer Engineering', building: 'Block A', floor: '2nd Floor', color: '#3b82f6', icon: '💻', locId: 'comp-dept' },
    { name: 'Information Technology', building: 'Block A', floor: '3rd Floor', color: '#6366f1', icon: '🖥️', locId: 'it-dept' },
    { name: 'AI & Data Science', building: 'Block D', floor: '3rd Floor', color: '#22d3ee', icon: '🤖', locId: 'ai-lab' },
    { name: 'Electronics & Telecom (EXTC)', building: 'Block B', floor: '2nd Floor', color: '#a78bfa', icon: '📡', locId: 'extc-dept' },
    { name: 'Mechanical Engineering', building: 'Block B', floor: '3rd Floor', color: '#34d399', icon: '⚙️', locId: 'extc-dept' },
    { name: "Principal's Office", building: 'Block E', floor: '2nd Floor', color: '#fbbf24', icon: '🏛️', locId: 'principal' },
    { name: 'Examination Cell', building: 'Block E', floor: '1st Floor', color: '#f87171', icon: '📝', locId: 'exam-cell' },
    { name: 'Training & Placement', building: 'Block E', floor: '1st Floor', color: '#fb923c', icon: '💼', locId: 'tpc' },
    { name: 'Accounts Department', building: 'Block E', floor: '1st Floor', color: '#818cf8', icon: '💰', locId: 'accounts' },
  ]
  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: t.bgBase }}>
      <h2 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1.25rem', fontWeight: 800, color: t.text, margin: '0 0 4px' }}>Departments</h2>
      <p style={{ color: t.textSub, fontSize: '0.8rem', marginBottom: '22px' }}>Find department offices and faculty rooms</p>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {depts.map(d => {
          const loc = LOCATIONS.find(l => l.id === d.locId)
          return (
            <button key={d.name} onClick={() => { if (loc) onSelectLoc(loc) }} className="text-left p-4 rounded-xl"
              style={{ background: t.bgCard, border: `1.5px solid ${d.color}18`, cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = `${d.color}45`)} onMouseLeave={e => (e.currentTarget.style.borderColor = `${d.color}18`)}>
              <div className="flex items-start gap-3">
                <div style={{ width: 40, height: 40, borderRadius: '10px', background: `${d.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>{d.icon}</div>
                <div className="flex-1">
                  <div style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 700, color: t.text, fontSize: '0.88rem', marginBottom: '2px' }}>{d.name}</div>
                  <div style={{ color: d.color, fontSize: '0.72rem', fontWeight: 600 }}>{d.building} · {d.floor}</div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FacilitiesScreen({ onSelectLoc, t }: { onSelectLoc: (l: Location) => void; t: ThemeColors }) {
  const [cat, setCat] = useState('all')
  const cats = [{ id: 'all', label: 'All', icon: '⚡' }, { id: 'academic', label: 'Academic', icon: '📚' }, { id: 'food', label: 'Food', icon: '🍽️' }, { id: 'lab', label: 'Labs', icon: '💻' }, { id: 'admin', label: 'Admin', icon: '🏛️' }, { id: 'emergency', label: 'Emergency', icon: '🚨' }, { id: 'utility', label: 'Utilities', icon: '⚙️' }, { id: 'student', label: 'Student', icon: '🎭' }]
  const filtered = cat === 'all' ? LOCATIONS : LOCATIONS.filter(l => l.category === cat)
  const catColors: Record<string, string> = { academic: '#22d3ee', food: '#fbbf24', lab: '#3b82f6', department: '#6366f1', admin: '#a78bfa', facility: '#34d399', student: '#f472b6', utility: '#7fa8d4', emergency: '#f87171' }
  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: t.bgBase }}>
      <div className="p-6 pb-4" style={{ borderBottom: `1px solid ${t.border}`, background: t.bgSurface }}>
        <h2 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1.25rem', fontWeight: 800, color: t.text, margin: '0 0 4px' }}>Facilities</h2>
        <p style={{ color: t.textSub, fontSize: '0.8rem', marginBottom: '14px' }}>Discover all campus amenities</p>
        <div className="flex gap-2 flex-wrap">
          {cats.map(c => <button key={c.id} onClick={() => setCat(c.id)} style={{ padding: '6px 13px', borderRadius: '999px', border: '1.5px solid', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 600, transition: 'all 0.2s', background: cat === c.id ? t.accent : t.bgCard, borderColor: cat === c.id ? t.accent : t.border, color: cat === c.id ? '#000' : t.textSub }}>{c.icon} {c.label}</button>)}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
          {filtered.map(loc => {
            const c = catColors[loc.category] ?? t.textSub
            return (
              <button key={loc.id} onClick={() => onSelectLoc(loc)} className="text-left p-4 rounded-xl"
                style={{ background: t.bgCard, border: `1.5px solid ${loc.isEmergency ? '#f8717130' : t.border}`, cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = `${c}40`)} onMouseLeave={e => (e.currentTarget.style.borderColor = loc.isEmergency ? '#f8717130' : t.border)}>
                <div className="flex items-start justify-between mb-2">
                  <div style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 700, color: t.text, fontSize: '0.87rem' }}>{loc.name}</div>
                  {loc.isEmergency && <span style={{ padding: '2px 7px', borderRadius: '999px', background: 'rgba(248,113,113,0.15)', color: '#f87171', fontSize: '0.58rem', fontWeight: 700, flexShrink: 0 }}>EMERGENCY</span>}
                </div>
                <div style={{ color: t.textSub, fontSize: '0.73rem', marginBottom: '4px' }}>{loc.building} · {loc.floor}</div>
                <div className="flex items-center justify-between">
                  <span style={{ color: c, fontSize: '0.72rem', fontWeight: 600 }}>{loc.distance}</span>
                  {loc.hours && <span style={{ color: t.textMuted, fontSize: '0.66rem' }}>{loc.hours}</span>}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function IndoorScreen({ building, t }: { building: CampusBuilding | null; t: ThemeColors }) {
  const b = building ?? BUILDINGS.find(x => x.id === 'block-c')!
  const [floor, setFloor] = useState(1)
  const floorRooms: Record<number, { id: string; label: string; type: string; x: number; y: number; w: number; h: number }[]> = {
    0: [{ id: 'entrance', label: 'Main Entrance', type: 'entrance', x: 30, y: 185, w: 80, h: 30 }, { id: 'lobby', label: 'Lobby', type: 'lobby', x: 120, y: 165, w: 100, h: 60 }, { id: 'lift-g', label: 'Lift', type: 'lift', x: 230, y: 180, w: 28, h: 28 }, { id: 'stairs-g', label: 'Stairs', type: 'stairs', x: 265, y: 180, w: 28, h: 28 }, { id: 'washroom-g', label: 'Washroom', type: 'washroom', x: 300, y: 180, w: 50, h: 28 }, { id: 'security', label: 'Security', type: 'security', x: 30, y: 130, w: 80, h: 45 }, { id: 'auditorium', label: 'Auditorium', type: 'hall', x: 120, y: 60, w: 230, h: 95 }],
    1: [{ id: 'library', label: 'Central Library', type: 'library', x: 25, y: 80, w: 190, h: 120 }, { id: 'reading', label: 'Reading Room', type: 'library', x: 225, y: 80, w: 120, h: 120 }, { id: 'lift-1', label: 'Lift', type: 'lift', x: 355, y: 115, w: 28, h: 28 }, { id: 'stairs-1', label: 'Stairs', type: 'stairs', x: 390, y: 115, w: 28, h: 28 }, { id: 'washroom-1', label: 'Washroom', type: 'washroom', x: 25, y: 215, w: 70, h: 32 }, { id: 'office-1', label: 'Librarian Office', type: 'office', x: 105, y: 215, w: 90, h: 32 }],
    2: [{ id: 'seminar', label: 'Seminar Hall', type: 'hall', x: 25, y: 55, w: 200, h: 125 }, { id: 'faculty-a', label: 'Faculty Room A', type: 'faculty', x: 235, y: 55, w: 80, h: 55 }, { id: 'faculty-b', label: 'Faculty Room B', type: 'faculty', x: 325, y: 55, w: 80, h: 55 }, { id: 'lift-2', label: 'Lift', type: 'lift', x: 355, y: 125, w: 28, h: 28 }, { id: 'stairs-2', label: 'Stairs', type: 'stairs', x: 390, y: 125, w: 28, h: 28 }, { id: 'washroom-2', label: 'Washroom', type: 'washroom', x: 25, y: 195, w: 70, h: 32 }, { id: 'cr-201', label: 'Class 201', type: 'classroom', x: 105, y: 195, w: 100, h: 32 }, { id: 'cr-202', label: 'Class 202', type: 'classroom', x: 215, y: 195, w: 100, h: 32 }],
    3: [{ id: 'conf', label: 'Conference Room', type: 'conference', x: 25, y: 55, w: 130, h: 95 }, { id: 'hod', label: 'HOD Office', type: 'office', x: 165, y: 55, w: 100, h: 95 }, { id: 'faculty-3a', label: 'Faculty Rooms', type: 'faculty', x: 275, y: 55, w: 130, h: 95 }, { id: 'lift-3', label: 'Lift', type: 'lift', x: 355, y: 165, w: 28, h: 28 }, { id: 'stairs-3', label: 'Stairs', type: 'stairs', x: 390, y: 165, w: 28, h: 28 }, { id: 'washroom-3', label: 'Washroom', type: 'washroom', x: 25, y: 163, w: 70, h: 32 }, { id: 'cr-301', label: 'Classroom 301', type: 'classroom', x: 105, y: 163, w: 110, h: 32 }],
  }
  const typeColors: Record<string, { bg: string; border: string; text: string }> = {
    entrance: { bg: 'rgba(251,146,60,0.15)', border: '#fb923c', text: '#fb923c' },
    lobby: { bg: t.bgElevated, border: t.border, text: t.textSub },
    library: { bg: 'rgba(34,211,238,0.12)', border: 'rgba(34,211,238,0.5)', text: '#22d3ee' },
    hall: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.4)', text: '#60a5fa' },
    classroom: { bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.35)', text: '#818cf8' },
    faculty: { bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.35)', text: '#34d399' },
    office: { bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.35)', text: '#a78bfa' },
    conference: { bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.35)', text: '#fbbf24' },
    lift: { bg: t.bgElevated, border: '#3b82f6', text: '#3b82f6' },
    stairs: { bg: t.bgElevated, border: t.border, text: t.textSub },
    washroom: { bg: t.bgElevated, border: t.border, text: t.textMuted },
    security: { bg: 'rgba(248,113,113,0.1)', border: '#f87171', text: '#f87171' },
  }
  return (
    <div className="h-full flex flex-col overflow-hidden p-6" style={{ background: t.bgBase }}>
      <div className="flex items-center gap-4 mb-5">
        <div style={{ width: 44, height: 44, borderRadius: '10px', background: b.topColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Manrope,sans-serif', fontWeight: 800, fontSize: '1.1rem', color: 'white' }}>{b.shortLabel}</div>
        <div>
          <h2 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1.2rem', fontWeight: 800, color: t.text, margin: 0 }}>{b.name} – Floor Plan</h2>
          <p style={{ color: t.textSub, fontSize: '0.76rem', margin: '2px 0 0' }}>{b.description.split('.')[0]}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 mb-5">
        <span style={{ color: t.textSub, fontSize: '0.73rem', fontWeight: 600 }}>Floor:</span>
        <div className="flex gap-2">
          {Array.from({ length: b.floors }, (_, i) => i).map(f => (
            <button key={f} onClick={() => setFloor(f)} style={{ width: 38, height: 38, borderRadius: '8px', border: '1.5px solid', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'Manrope,sans-serif', transition: 'all 0.2s', background: floor === f ? b.topColor : t.bgCard, borderColor: floor === f ? b.topColor : t.border, color: floor === f ? 'white' : t.textSub }}>
              {f === 0 ? 'G' : f}
            </button>
          ))}
        </div>
        <span style={{ color: t.textMuted, fontSize: '0.73rem' }}>{floor === 0 ? 'Ground Floor' : `${floor}${floor===1?'st':floor===2?'nd':'rd'} Floor`}</span>
      </div>
      <div className="flex-1 rounded-2xl overflow-hidden relative" style={{ background: '#060c18', border: `1px solid ${t.border}` }}>
        <svg width="100%" height="100%" viewBox="0 0 480 270">
          <rect x="15" y="10" width="445" height="250" rx="8" fill="#0a1628" stroke="#1a3050" strokeWidth="1.5"/>
          {(floorRooms[floor] ?? []).map(room => {
            const tc = typeColors[room.type] ?? { bg: t.bgElevated, border: t.border, text: t.textSub }
            return (
              <g key={room.id}>
                <rect x={room.x} y={room.y} width={room.w} height={room.h} rx="4" fill={tc.bg} stroke={tc.border} strokeWidth="1.2"/>
                <text x={room.x+room.w/2} y={room.y+room.h/2+4} textAnchor="middle" fontSize="7" fontWeight="600" fontFamily="Inter,sans-serif" fill={tc.text}>{room.label}</text>
              </g>
            )
          })}
          <circle cx="130" cy="195" r="7" fill="#22d3ee" opacity="0.25"/>
          <circle cx="130" cy="195" r="4" fill="#22d3ee"/>
          <text x="130" y="184" textAnchor="middle" fontSize="7" fill="#22d3ee" fontWeight="600">You</text>
        </svg>
      </div>
    </div>
  )
}

function SavedScreen({ onSelectLoc, t }: { onSelectLoc: (l: Location) => void; t: ThemeColors }) {
  const [saved, setSaved] = useState(['library', 'canteen-loc', 'den-loc', 'it-dept'])
  const locs = saved.map(id => LOCATIONS.find(l => l.id === id)).filter(Boolean) as Location[]
  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: t.bgBase }}>
      <h2 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1.25rem', fontWeight: 800, color: t.text, margin: '0 0 4px' }}>Saved Places</h2>
      <p style={{ color: t.textSub, fontSize: '0.8rem', marginBottom: '22px' }}>Your bookmarked campus locations</p>
      <div className="flex flex-col gap-3">
        {locs.map(loc => (
          <div key={loc.id} className="flex items-center gap-4 p-4 rounded-xl" style={{ background: t.bgCard, border: `1px solid ${t.border}` }}>
            <div style={{ width: 44, height: 44, borderRadius: '10px', background: t.bgElevated, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>
              {loc.category === 'food' ? '🍽️' : loc.category === 'academic' ? '📚' : loc.category === 'student' ? '🎭' : loc.category === 'lab' ? '💻' : '📍'}
            </div>
            <div className="flex-1">
              <div style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 700, color: t.text, fontSize: '0.9rem' }}>{loc.name}</div>
              <div style={{ color: t.textSub, fontSize: '0.73rem' }}>{loc.building} · {loc.floor} · {loc.distance}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => onSelectLoc(loc)} style={{ padding: '7px 12px', borderRadius: '8px', background: `${t.accent}15`, border: `1px solid ${t.accent}30`, color: t.accent, fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer' }}>Navigate</button>
              <button onClick={() => setSaved(saved.filter(s => s !== loc.id))} style={{ padding: '7px 10px', borderRadius: '8px', background: t.bgElevated, border: `1px solid ${t.border}`, color: t.textSub, fontSize: '0.8rem', cursor: 'pointer' }}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmergencyScreen({ onClose, t }: { onClose: () => void; t: ThemeColors }) {
  const emergencyLocs = [
    { icon: '🔒', label: 'Security Gate', detail: 'Main Entrance · 24/7', distance: '45 m', color: '#f87171' },
    { icon: '🏥', label: 'First Aid Room', detail: 'Block E · Ground Floor', distance: '120 m', color: '#fb923c' },
    { icon: '🚪', label: 'Emergency Exit', detail: 'Block A · Ground Floor', distance: '60 m', color: '#fbbf24' },
    { icon: '🏃', label: 'Assembly Point', detail: 'Main Ground · Open Area', distance: '90 m', color: '#34d399' },
    { icon: '🔥', label: 'Fire Extinguisher', detail: 'Block C · Each Floor', distance: '30 m', color: '#f87171' },
    { icon: '📞', label: 'Emergency Phone', detail: 'Block B Corridor', distance: '80 m', color: '#3b82f6' },
  ]
  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#0d0608' }}>
      <div className="p-5" style={{ background: 'rgba(239,68,68,0.12)', borderBottom: '2px solid rgba(239,68,68,0.35)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(239,68,68,0.2)', border: '2px solid #ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>🚨</div>
            <div>
              <h2 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1.15rem', fontWeight: 800, color: '#f87171', margin: 0 }}>Emergency Mode</h2>
              <p style={{ color: '#f8717180', fontSize: '0.76rem', margin: '2px 0 0' }}>Nearest emergency facilities on campus</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: '#0d1e38', border: '1px solid #1a3050', borderRadius: '8px', padding: '7px 14px', color: '#7fa8d4', cursor: 'pointer', fontSize: '0.78rem' }}>✕ Close</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        <div className="mb-5 p-5 rounded-2xl text-center" style={{ background: 'rgba(239,68,68,0.1)', border: '2px solid rgba(239,68,68,0.3)' }}>
          <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.95rem', fontWeight: 700, color: '#f87171', marginBottom: '12px' }}>In case of emergency</div>
          <div className="flex gap-3 justify-center flex-wrap">
            {[['📞 Police', '100', '#ef4444'], ['🔥 Fire', '101', '#dc2626'], ['🏥 Ambulance', '108', '#b91c1c']].map(([l, n, bg]) => (
              <a key={n} href={`tel:${n}`} style={{ padding: '11px 22px', borderRadius: '10px', background: bg, color: 'white', fontWeight: 800, fontSize: '0.88rem', textDecoration: 'none', fontFamily: 'Manrope,sans-serif' }}>{l} – {n}</a>
            ))}
          </div>
          <div style={{ color: '#f8717166', fontSize: '0.7rem', marginTop: '10px' }}>Campus Security hotline — contact Administration (details to be verified)</div>
        </div>
        <h3 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.82rem', fontWeight: 700, color: '#7fa8d4', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>Nearest Facilities</h3>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
          {emergencyLocs.map(loc => (
            <button key={loc.label} className="text-left p-4 rounded-xl flex items-center gap-4"
              style={{ background: `${loc.color}0a`, border: `1.5px solid ${loc.color}28`, cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.background = `${loc.color}18`)} onMouseLeave={e => (e.currentTarget.style.background = `${loc.color}0a`)}>
              <div style={{ width: 42, height: 42, borderRadius: '12px', background: `${loc.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>{loc.icon}</div>
              <div className="flex-1">
                <div style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 700, color: '#e2ecff', fontSize: '0.87rem' }}>{loc.label}</div>
                <div style={{ color: '#7fa8d4', fontSize: '0.7rem' }}>{loc.detail}</div>
                <div style={{ color: loc.color, fontSize: '0.73rem', fontWeight: 600, marginTop: '2px' }}>{loc.distance} away</div>
              </div>
              <div style={{ padding: '6px 10px', borderRadius: '8px', background: `${loc.color}20`, color: loc.color, fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>Go</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── THEME TOGGLE ─────────────────────────────────────────────────────────────

function ThemeToggle({ isDark, onToggle, t }: { isDark: boolean; onToggle: () => void; t: ThemeColors }) {
  return (
    <button onClick={onToggle}
      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '999px', background: t.switchBg, border: `1.5px solid ${t.border}`, cursor: 'pointer', transition: 'all 0.25s', userSelect: 'none' }}>
      <span style={{ fontSize: '0.85rem' }}>{isDark ? '🌙' : '☀️'}</span>
      <div style={{ width: 32, height: 18, borderRadius: '9px', background: isDark ? t.accent : '#d1d5db', position: 'relative', transition: 'background 0.25s', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: '2px', left: isDark ? '16px' : '2px', width: 14, height: 14, borderRadius: '50%', background: 'white', transition: 'left 0.25s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}/>
      </div>
      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: t.textSub, fontFamily: 'Inter,sans-serif' }}>{isDark ? 'Dark' : 'Light'}</span>
    </button>
  )
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [isDark, setIsDark] = useState(true)
  const t = makeTheme(isDark)

  const [screen, setScreen] = useState<Screen>('home')
  const [selectedLoc, setSelectedLoc] = useState<Location | null>(null)
  const [selectedBuilding, setSelectedBuilding] = useState<CampusBuilding | null>(null)
  const [mapMode, setMapMode] = useState<'2d' | '3d'>('2d')
  const [filterCategory, setFilterCategory] = useState('all')
  const [routeFrom, setRouteFrom] = useState('entrance')
  const [routeTo, setRouteTo] = useState('library')
  const [routePref, setRoutePref] = useState<RoutePreference>('shortest')
  const [routePath, setRoutePath] = useState<string[]>([])
  const [showNearMe, setShowNearMe] = useState(false)
  const [showEmergency, setShowEmergency] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>(['Central Library', 'Student Canteen', 'IT Department'])

  function addRecent(name: string) {
    setRecentSearches(prev => [name, ...prev.filter(n => n !== name)].slice(0, 8))
  }

  function handleStartRoute(from: string, to: string, pref: RoutePreference) {
    setRouteFrom(from); setRouteTo(to); setRoutePref(pref)
    const steps = runAStar(from, to)
    const finalStep = steps.find(s => s.path.length > 0)
    const path = finalStep?.path ?? []
    const algoToBuilding: Record<string, string> = { blockA: 'block-a', blockB: 'block-b', blockC: 'block-c', blockD: 'block-d', blockE: 'block-e', blockF: 'block-f', canteen: 'canteen', den: 'den' }
    setRoutePath(path.map(id => algoToBuilding[id] ?? '').filter(Boolean))
    setScreen('route')
  }

  const mapFilters = [
    { id: 'all', label: 'All' }, { id: 'academic', label: 'Academic' }, { id: 'admin', label: 'Admin' },
    { id: 'food', label: 'Food' }, { id: 'facility', label: 'Facilities' }, { id: 'student', label: 'Student Life' },
  ]

  const navItems = [
    { id: 'home', icon: '⊙', label: 'Home' }, { id: 'map', icon: '🗺', label: 'Campus Map' },
    { id: 'navigate', icon: '🧭', label: 'Navigate' }, { id: 'departments', icon: '🎓', label: 'Departments' },
    { id: 'facilities', icon: '⚡', label: 'Facilities' }, { id: 'directory', icon: '🏛', label: 'Directory' },
    { id: 'algorithm', icon: '⚙', label: 'Algorithm Lab' }, { id: 'saved', icon: '♥', label: 'Saved Places' },
  ] as const

  const nearbyFacilities = [{ icon: '🍽️', name: 'Canteen', dist: '80 m' }, { icon: '🚻', name: 'Washroom', dist: '45 m' }, { icon: '📚', name: 'Library', dist: '180 m' }, { icon: '💧', name: 'Drinking Water', dist: '30 m' }, { icon: '🛗', name: 'Lift', dist: '50 m' }, { icon: '🏥', name: 'First Aid', dist: '120 m' }]

  if (screen === 'home') {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: t.bgBase, overflow: 'hidden' }}>
        <header style={{ height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', borderBottom: `1px solid ${t.border}`, flexShrink: 0, background: t.header }}>
          <div className="flex items-center gap-2.5">
            <div style={{ width: 30, height: 30, borderRadius: '7px', background: 'linear-gradient(135deg, #1d4ed8, #22d3ee)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}>🎓</div>
            <span style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 800, color: t.text, fontSize: '0.95rem' }}>VIT Smart Campus</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle isDark={isDark} onToggle={() => setIsDark(d => !d)} t={t} />
            <button onClick={() => setScreen('map')} style={{ padding: '7px 15px', borderRadius: '8px', background: `${t.accent}15`, border: `1px solid ${t.accent}30`, color: t.accent, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
              Open Map →
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-hidden">
          <HomeScreen onNavigate={s => setScreen(s)} onSelectLoc={l => { setSelectedLoc(l); setScreen('map') }} t={t} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: t.bgBase, overflow: 'hidden', position: 'relative' }}>
      {/* Header */}
      <header style={{ height: 56, display: 'flex', alignItems: 'center', gap: '14px', padding: '0 18px', borderBottom: `1px solid ${t.border}`, flexShrink: 0, background: t.header, zIndex: 10 }}>
        <button onClick={() => setScreen('home')} className="flex items-center gap-2.5" style={{ background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
          <div style={{ width: 28, height: 28, borderRadius: '6px', background: 'linear-gradient(135deg, #1d4ed8, #22d3ee)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>🎓</div>
          <span style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 800, color: t.text, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>VIT Smart Campus</span>
        </button>
        <div className="flex-1 flex justify-center">
          <SearchBar onSelectLoc={l => { addRecent(l.name); setSelectedLoc(l); setScreen('map') }} t={t} recentSearches={recentSearches} onAddRecent={addRecent} />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ThemeToggle isDark={isDark} onToggle={() => setIsDark(d => !d)} t={t} />
          <button onClick={() => setShowEmergency(true)} style={{ padding: '6px 11px', borderRadius: '8px', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.28)', color: '#f87171', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer' }}>
            🚨 SOS
          </button>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #1d4ed8, #22d3ee)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.82rem', cursor: 'pointer' }}>👤</div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav style={{ width: 214, flexShrink: 0, background: t.sidebar, borderRight: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', padding: '14px 8px', overflow: 'hidden' }}>
          <div className="flex-1 overflow-y-auto">
            {navItems.map(item => {
              const active = screen === item.id
              return (
                <button key={item.id} onClick={() => setScreen(item.id as Screen)}
                  className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1"
                  style={{ background: active ? t.navActive : 'transparent', border: `1.5px solid ${active ? t.navActiveBorder : 'transparent'}`, cursor: 'pointer', transition: 'all 0.18s' }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = t.cardHover }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                  <span style={{ fontSize: '0.95rem', width: 20, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ fontFamily: 'Inter,sans-serif', fontWeight: active ? 600 : 400, color: active ? t.navActiveText : t.navText, fontSize: '0.8rem' }}>{item.label}</span>
                  {active && <div style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: t.accent, boxShadow: `0 0 8px ${t.accent}` }}/>}
                </button>
              )
            })}
          </div>
          <div style={{ paddingTop: '10px', borderTop: `1px solid ${t.border}` }}>
            <button onClick={() => setShowEmergency(true)} className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1" style={{ background: 'rgba(248,113,113,0.07)', border: '1.5px solid rgba(248,113,113,0.2)', cursor: 'pointer' }}>
              <span style={{ fontSize: '0.95rem', width: 20, textAlign: 'center' }}>🚨</span>
              <span style={{ fontWeight: 600, color: '#f87171', fontSize: '0.8rem', fontFamily: 'Inter,sans-serif' }}>Emergency</span>
            </button>
            <button className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'transparent', border: '1.5px solid transparent', cursor: 'pointer' }}>
              <span style={{ fontSize: '0.95rem', width: 20, textAlign: 'center' }}>❓</span>
              <span style={{ fontWeight: 400, color: t.navText, fontSize: '0.8rem', fontFamily: 'Inter,sans-serif' }}>Help & Feedback</span>
            </button>
          </div>
        </nav>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden relative">
          {screen === 'map' && (
            <div className="flex flex-1 overflow-hidden relative">
              <div className="flex flex-col flex-1 overflow-hidden">
                {/* Map filter bar */}
                <div className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0" style={{ background: t.bgSurface, borderBottom: `1px solid ${t.border}` }}>
                  <span style={{ color: t.textMuted, fontSize: '0.68rem', fontWeight: 600, marginRight: '2px', whiteSpace: 'nowrap' }}>Filter:</span>
                  {mapFilters.map(f => (
                    <button key={f.id} onClick={() => setFilterCategory(f.id)}
                      style={{ padding: '4px 11px', borderRadius: '999px', border: '1.5px solid', cursor: 'pointer', fontSize: '0.71rem', fontWeight: 600, transition: 'all 0.18s', whiteSpace: 'nowrap', background: filterCategory === f.id ? t.accent : t.bgCard, borderColor: filterCategory === f.id ? t.accent : t.border, color: filterCategory === f.id ? '#000' : t.navText }}>
                      {f.label}
                    </button>
                  ))}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <button onClick={() => setScreen('indoor')}
                      style={{ padding: '4px 10px', borderRadius: '8px', background: t.bgCard, color: t.navText, fontWeight: 600, fontSize: '0.68rem', border: `1px solid ${t.border}`, cursor: 'pointer' }}>
                      Indoor
                    </button>
                    <button onClick={() => setMapMode(m => m === '2d' ? '3d' : '2d')}
                      style={{ padding: '4px 10px', borderRadius: '8px', background: mapMode === '3d' ? `${t.accent}18` : t.bgCard, border: `1px solid ${mapMode === '3d' ? t.accent : t.border}`, color: mapMode === '3d' ? t.accent : t.navText, fontWeight: 700, fontSize: '0.68rem', cursor: 'pointer' }}>
                      3D {mapMode === '3d' ? '✓' : ''}
                    </button>
                  </div>
                </div>
                {/* Map canvas */}
                <div className="flex-1 relative overflow-hidden" style={{ background: '#060c18' }}>
                  <IsometricMap selectedId={selectedBuilding?.id ?? null} routePath={routePath} onSelect={b => { setSelectedBuilding(b); setSelectedLoc(null) }} mode={mapMode} filterCategory={filterCategory} />
                  <div className="absolute right-4 top-4 flex flex-col gap-2">
                    {['+', '−'].map((c, i) => <button key={i} style={{ width: 34, height: 34, borderRadius: '8px', background: 'rgba(13,30,56,0.9)', border: '1px solid #1a3050', color: '#7fa8d4', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c}</button>)}
                  </div>
                  <button onClick={() => setShowNearMe(x => !x)} className="absolute"
                    style={{ bottom: '20px', left: '50%', transform: 'translateX(-50%)', padding: '9px 18px', borderRadius: '999px', background: 'rgba(13,30,56,0.95)', border: '1.5px solid #1a3050', color: '#e2ecff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22d3ee', display: 'inline-block', boxShadow: '0 0 8px #22d3ee' }}/>
                    Near Me
                  </button>
                  {showNearMe && (
                    <div className="absolute rounded-2xl p-4" style={{ bottom: '60px', left: '50%', transform: 'translateX(-50%)', minWidth: '270px', background: 'rgba(13,30,56,0.95)', border: '1px solid #1a3050', zIndex: 20, boxShadow: '0 16px 40px rgba(0,0,0,0.5)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <span style={{ color: '#e2ecff', fontFamily: 'Manrope,sans-serif', fontWeight: 700, fontSize: '0.88rem' }}>Nearby Facilities</span>
                        <button onClick={() => setShowNearMe(false)} style={{ background: 'none', border: 'none', color: '#3d5a80', cursor: 'pointer' }}>✕</button>
                      </div>
                      {nearbyFacilities.map(f => (
                        <div key={f.name} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #1a3050' }}>
                          <div className="flex items-center gap-2"><span>{f.icon}</span><span style={{ color: '#e2ecff', fontSize: '0.82rem' }}>{f.name}</span></div>
                          <span style={{ color: '#22d3ee', fontSize: '0.76rem', fontWeight: 600 }}>{f.dist}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="absolute rounded-xl p-3" style={{ bottom: '20px', right: '14px', background: 'rgba(13,30,56,0.9)', border: '1px solid #1a3050' }}>
                    <p style={{ color: '#7fa8d4', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '7px' }}>Legend</p>
                    {[['#1d4ed8','Block A – CE/IT'],['#4338ca','Block B – EXTC'],['#0891b2','Block C – Library'],['#1e40af','Block D – AI Labs'],['#6d28d9','Block E – Admin'],['#047857','Block F – Student'],['#b45309','Canteen'],['#fb923c','Main Gate']].map(([c,l]) => (
                      <div key={l} className="flex items-center gap-2 mb-1"><div style={{ width: 9, height: 9, borderRadius: '2px', background: c, flexShrink: 0 }}/><span style={{ color: '#7fa8d4', fontSize: '0.58rem' }}>{l}</span></div>
                    ))}
                  </div>
                </div>
              </div>

              {selectedBuilding && !selectedLoc && (
                <div className="slide-right flex-shrink-0 h-full overflow-y-auto p-5 flex flex-col gap-4" style={{ width: '290px', background: t.bgCard, borderLeft: `1px solid ${t.border}` }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1.05rem', fontWeight: 800, color: t.text }}>{selectedBuilding.name}</div>
                      <div style={{ color: t.textSub, fontSize: '0.76rem', marginTop: '2px' }}>{selectedBuilding.floors} Floors · {selectedBuilding.category}</div>
                    </div>
                    <button onClick={() => setSelectedBuilding(null)} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
                  </div>
                  <p style={{ color: t.textSub, fontSize: '0.78rem', lineHeight: 1.55 }}>{selectedBuilding.description}</p>
                  <div>
                    <div style={{ color: t.textMuted, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Departments</div>
                    <div className="flex flex-col gap-2">{selectedBuilding.departments.map(d => <div key={d} style={{ padding: '8px 12px', borderRadius: '8px', background: t.bgElevated, border: `1px solid ${t.border}`, color: t.text, fontSize: '0.8rem' }}>{d}</div>)}</div>
                  </div>
                  <div>
                    <div style={{ color: t.textMuted, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Facilities</div>
                    <div className="flex flex-wrap gap-2">{selectedBuilding.facilities.map(f => <span key={f} style={{ padding: '3px 9px', borderRadius: '999px', background: `${selectedBuilding.glowColor}12`, border: `1px solid ${selectedBuilding.glowColor}28`, color: selectedBuilding.glowColor, fontSize: '0.67rem' }}>{f}</span>)}</div>
                  </div>
                  <div className="flex flex-col gap-2 mt-auto pt-2">
                    <button onClick={() => setScreen('navigate')} style={{ padding: '11px', borderRadius: '10px', background: `linear-gradient(135deg, ${t.accent}, ${t.accentBlue})`, color: '#000', fontWeight: 700, fontSize: '0.85rem', border: 'none', cursor: 'pointer' }}>Navigate Here</button>
                    <button onClick={() => setScreen('indoor')} style={{ padding: '11px', borderRadius: '10px', background: t.bgElevated, color: t.textSub, fontWeight: 600, fontSize: '0.85rem', border: `1.5px solid ${t.border}`, cursor: 'pointer' }}>View Floor Plan</button>
                  </div>
                </div>
              )}

              {selectedLoc && <LocationPanel location={selectedLoc} onClose={() => setSelectedLoc(null)} onNavigate={() => setScreen('navigate')} t={t} />}
            </div>
          )}

          {screen !== 'map' && (
            <div className="flex-1 overflow-hidden">
              {screen === 'navigate' && <NavigateScreen onStartRoute={handleStartRoute} t={t} />}
              {screen === 'route' && <RouteScreen from={routeFrom} to={routeTo} pref={routePref} onBack={() => setScreen('navigate')} t={t} />}
              {screen === 'algorithm' && <AlgorithmVisualizer t={t} />}
              {screen === 'directory' && <DirectoryScreen onSelectBuilding={b => { setSelectedBuilding(b); setScreen('map') }} t={t} />}
              {screen === 'departments' && <DepartmentsScreen onSelectLoc={l => { addRecent(l.name); setSelectedLoc(l); setScreen('map') }} t={t} />}
              {screen === 'facilities' && <FacilitiesScreen onSelectLoc={l => { addRecent(l.name); setSelectedLoc(l); setScreen('map') }} t={t} />}
              {screen === 'indoor' && <IndoorScreen building={selectedBuilding} t={t} />}
              {screen === 'saved' && <SavedScreen onSelectLoc={l => { addRecent(l.name); setSelectedLoc(l); setScreen('map') }} t={t} />}
            </div>
          )}
        </div>
      </div>

      {showEmergency && (
        <div className="absolute inset-0 z-50" style={{ background: 'rgba(0,0,0,0.88)' }}>
          <div className="h-full" style={{ maxWidth: '900px', margin: '0 auto' }}>
            <EmergencyScreen onClose={() => setShowEmergency(false)} t={t} />
          </div>
        </div>
      )}
    </div>
  )
}
