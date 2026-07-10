# MeritView Frontend

Vite + React 19 + TypeScript SPA for MeritView. See the [root README](../README.md) for what the project does, full setup instructions, and environment variables.

## Quick start

```bash
npm install
cp .env.example .env   # fill in VITE_API_BASE_URL, VITE_BETTER_AUTH_URL, VITE_STRIPE_PUBLISHABLE_KEY
npm run dev
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check (`tsc -b`) and build for production |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the production build locally |
