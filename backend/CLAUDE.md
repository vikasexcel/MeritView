# Backend Agent Guide

## Commands

- `npm run dev`: start Express with `nodemon` and `ts-node`.
- `npm run build`: compile TypeScript.
- `npm start`: run `dist/server.js`.
- `npm test`: run Vitest once with verbose output.
- `npm run test:watch`: watch tests.
- `npm run test:coverage`: coverage run.
- `npm run db:generate`, `npm run db:migrate`, `npm run db:push`, `npm run db:studio`: Prisma workflows.

## Architecture

- `src/server.ts`: connects Prisma and starts the HTTP server.
- `src/app.ts`: Express app composition.
- `src/lib/auth.ts`: Better Auth configuration.
- `src/middleware/auth.ts`: route guards using Better Auth sessions.
- `src/prisma/client.ts` and `src/lib/prisma.ts`: Prisma client setup with Neon adapter; prefer existing imports in nearby code.
- `prisma/schema.prisma`: domain and Better Auth persistence models.

## Important Patterns

- Keep `app.all('/api/auth/{*any}', toNodeHandler(auth))` before `express.json()`. Better Auth needs the raw request handling order.
- Use Better Auth APIs for authentication work; do not introduce NextAuth patterns.
- CORS credentials are enabled and default to `http://localhost:5173`.
- Tests intentionally use `@test.meritview` emails because setup/teardown deletes only those users.

## Environment

Required variables are documented in `.env.example`: `PORT`, `NODE_ENV`, `DATABASE_URL`, `CORS_ORIGIN`, `RATE_LIMIT_WINDOW_MS`, and `RATE_LIMIT_MAX`.
