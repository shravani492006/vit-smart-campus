import { Router } from 'express'
import { z } from 'zod'
import { AppError } from '../errors.js'
import { resolvePlace } from '../services/context.js'
import type { Ctx } from '../services/context.js'

/**
 * Thin proxy in front of the standalone Python AI Navigation service
 * (../python-ai). This does NOT replace the existing Node routing engine
 * (`graph/routing.ts`, mounted at POST /api/v1/routes) — it is an additive
 * endpoint for the college AI practical, so the real, existing navigation
 * feature keeps working exactly as before regardless of whether the Python
 * service is running.
 *
 * The Python service's URL is configurable via PYTHON_AI_URL (see
 * backend/.env.example) so it can be pointed anywhere without code changes.
 */

const PYTHON_AI_URL = (process.env.PYTHON_AI_URL ?? 'http://localhost:8000').replace(/\/$/, '')

const aiRouteBody = z.object({
  from: z.string().min(1).max(100).optional(),
  to: z.string().min(1).max(100),
})

export function aiRoutes(ctx: Ctx) {
  const r = Router()

  /** Proxies GET <PYTHON_AI_URL>/health so the frontend can show "AI service offline" without CORS/browser access to Python directly. */
  r.get('/health', async (_req, res) => {
    try {
      const upstream = await fetchWithTimeout(`${PYTHON_AI_URL}/health`)
      const body = await upstream.json().catch(() => ({}))
      res.status(upstream.ok ? 200 : 502).json({ reachable: upstream.ok, upstream: body })
    } catch {
      res.status(502).json({ reachable: false, message: 'Python AI service is not reachable.' })
    }
  })

  /**
   * POST /api/v1/ai/route  { from?, to }
   * Resolves place names the same way the existing /routes endpoint does
   * (location id / building id / raw node id / "current_location"), then
   * asks the Python service to run A* over the SAME real campus graph.
   */
  r.post('/route', async (req, res, next) => {
    try {
      const body = aiRouteBody.parse(req.body)
      const from = resolvePlace(ctx, body.from, 'from')
      const to = resolvePlace(ctx, body.to, 'to')

      let upstream: Response
      try {
        upstream = await fetchWithTimeout(`${PYTHON_AI_URL}/api/route`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ start: from.nodeId, destination: to.nodeId }),
        })
      } catch {
        throw new AppError(502, 'AI_SERVICE_UNAVAILABLE', 'The Python AI navigation service is not reachable. Is it running (uvicorn app.main:app --port 8000)?')
      }

      const upstreamBody = await upstream.json().catch(() => null)
      if (!upstream.ok || !upstreamBody) {
        throw new AppError(502, 'AI_SERVICE_ERROR', (upstreamBody && upstreamBody.detail) || 'The Python AI navigation service returned an unexpected response.')
      }

      res.json({
        from: { label: from.label, nodeId: from.nodeId },
        to: { label: to.label, nodeId: to.nodeId },
        ...upstreamBody,
      })
    } catch (err) {
      next(err)
    }
  })

  return r
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
