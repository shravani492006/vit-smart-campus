import crypto from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { config } from '../config/index.js'
import { AppError } from '../errors.js'

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!config.adminKey) return next(new AppError(503, 'ADMIN_DISABLED', 'Admin API is disabled: set ADMIN_API_KEY.'))
  const given = String(req.header('x-admin-key') ?? '')
  const a = Buffer.from(given), b = Buffer.from(config.adminKey)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return next(new AppError(401, 'UNAUTHORIZED', 'Missing or invalid admin key.'))
  next()
}

/** Anonymous per-device id so Saved Places / Recent work without login. */
export function clientId(req: Request): string {
  const v = String(req.header('x-client-id') ?? '')
  return /^[A-Za-z0-9_-]{6,64}$/.test(v) ? v : 'anonymous'
}

export function notFound(_req: Request, _res: Response, next: NextFunction) { next(new AppError(404, 'NOT_FOUND', 'Route not found.')) }

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request.', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } })
  if (err instanceof AppError) return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } })
  if ((err as any)?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed JSON body.' } })
  console.error(err)
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } })
}
