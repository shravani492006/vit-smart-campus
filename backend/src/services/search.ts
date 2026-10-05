import type { LocationRecord } from '../types.js'
import type { Ctx } from './context.js'
import { findFilter } from './filters.js'
import { publicLocations, type Origin } from './presenter.js'

const STOP = new Set(['where', 'is', 'the', 'a', 'an', 'to', 'me', 'find', 'take', 'i', 'can', 'do', 'how', 'get', 'go', 'my', 'for', 'of', 'in', 'at', 'on', 'and', 'please', 'show', 'want', 'need', 'route', 'way', 'directions', 'direction', 'navigate', 'nearest', 'nearby', 'closest', 'near', 'from', 'there', 'are', 'what', 'which', 'looking', 'locate', 'an', 'accessible', 'step-free', 'wheelchair', 'reach', 'am', 'us', 'we', 'you', 'with', 'no', 'stairs', 'avoid', 'without'])
const SYN: Record<string, string[]> = {
  toilet: ['washroom'], restroom: ['washroom'], loo: ['washroom'], bathroom: ['washroom'], wc: ['washroom'],
  cafe: ['cafeteria', 'canteen'], mess: ['canteen'], food: ['canteen', 'cafeteria'], eat: ['canteen', 'cafeteria'], lunch: ['canteen'], hungry: ['canteen'],
  elevator: ['lift'], doc: ['doctor'], medical: ['first', 'doctor'], hospital: ['first', 'doctor'], print: ['v-print', 'printing'], printer: ['v-print', 'printing'], xerox: ['photocopy', 'v-print'],
  gym: ['gymnasium'], hod: ['department'], placement: ['tpc', 'placement'], placements: ['placement'], drink: ['water'], comps: ['computer'], labs: ['lab'], lab: ['laboratory', 'lab'],
}

const norm = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9\-\s.]/g, ' ').replace(/\s+/g, ' ').trim()
const words = (s: string) => norm(s).split(/[\s]+/).map((w) => w.replace(/^\.+|\.+$/g, '')).filter(Boolean)

function lev(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[a.length][b.length]
}
function tokMatch(t: string, s: string): number {
  if (t === s) return 1
  if (Math.min(t.length, s.length) >= 3 && (s.startsWith(t) || t.startsWith(s))) return 0.7
  if (t.length >= 5 && s.length >= 5 && lev(t, s) <= 1) return 0.55
  return 0
}
const best = (t: string, pool: string[]) => pool.reduce((m, s) => Math.max(m, tokMatch(t, s)), 0)

export interface Interpretation {
  intent: 'find' | 'route' | 'nearest'
  tokens: string[]
  routePreference?: 'accessible'
  avoidStairs?: boolean
}

export function interpret(q: string): Interpretation {
  const n = norm(q)
  const intent: Interpretation['intent'] = /\b(nearest|closest|near me|nearby)\b/.test(n) ? 'nearest' : /\b(route|take me|navigate|directions?|how (do i|to) (get|reach)|way to|go to)\b/.test(n) ? 'route' : 'find'
  let tokens = words(n).filter((w) => !STOP.has(w))
  if (!tokens.length) tokens = words(n)
  return { intent, tokens, routePreference: /\b(accessible|wheelchair|step-free)\b/.test(n) ? 'accessible' : undefined, avoidStairs: /\b(avoid stairs|no stairs|without stairs)\b/.test(n) || undefined }
}

export function scoreLocation(l: LocationRecord, tokens: string[], phrase: string): number {
  const nameW = words(l.name), tagW = l.tags.flatMap(words), descW = words(l.description), catW = words(l.category + ' ' + (l.subcategory ?? ''))
  let total = 0, matched = 0
  for (const tok of tokens) {
    const forms = [tok, ...(SYN[tok] ?? [])]
    let s = 0
    for (const f of forms) {
      s = Math.max(s, best(f, nameW) * 30, best(f, tagW) * 20, best(f, catW) * 8, best(f, descW) * 4)
    }
    if (s > 0) matched++
    total += s
  }
  if (!matched) return 0
  const coverage = matched / tokens.length
  if (tokens.length > 1 && coverage < 0.6) return 0
  const name = norm(l.name)
  if (name === phrase) total += 80
  else if (phrase.length > 2 && name.includes(phrase)) total += 45
  return total * coverage
}

export function search(ctx: Ctx, q: string, opts: { origin?: Origin; category?: string; limit?: number } = {}) {
  const info = interpret(q)
  const phrase = info.tokens.join(' ')
  const filter = opts.category ? findFilter(opts.category) : undefined
  let pool = publicLocations(ctx)
  if (filter) pool = pool.filter(filter.test)
  let scored = pool.map((l) => ({ l, score: scoreLocation(l, info.tokens, phrase) })).filter((x) => x.score > 0)
  scored.sort((a, b) => b.score - a.score || a.l.name.localeCompare(b.l.name))
  if (info.intent === 'nearest' && opts.origin && scored.length) {
    const top = scored[0].score
    const close = scored.filter((x) => x.score >= top * 0.5)
    const d = (l: LocationRecord) => (l.nodeId ? opts.origin!.distM.get(l.nodeId) ?? Infinity : Infinity)
    close.sort((a, b) => d(a.l) - d(b.l))
    scored = [...close, ...scored.filter((x) => !close.includes(x))]
  }
  return { info, results: scored.slice(0, opts.limit ?? 10).map((x) => x.l) }
}
