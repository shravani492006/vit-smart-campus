# VIT Smart Campus (frontend + backend)

vit-smart-campus/
  frontend/   React + Vite + Tailwind (Figma Make export)
  backend/    Node + Express + TypeScript API (routing, search, directories, admin)

## Run (2 terminals)

Terminal 1 - backend
    cd backend
    npm install
    npm run dev          # http://localhost:4000  (check: /health)

Terminal 2 - frontend
    cd frontend
    npm install          # or: pnpm install
    npm run dev          # Vite prints the URL (usually http://localhost:5173)

Backend tests:  cd backend && npm test

## Status
- Backend: complete, 58 tests passing.
- Frontend: UI is unchanged and still uses its built-in demo data.
  frontend/src/api/client.ts is ready (import { api } from './api/client'),
  e.g. api.findRoute({ from:'entrance', to:'library', routePreference:'accessible' }).
  See backend/README.md for the screen-by-screen mapping.
