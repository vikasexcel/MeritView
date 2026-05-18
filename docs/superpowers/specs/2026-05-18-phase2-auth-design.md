# Phase 2: Authentication — Design Spec

**Date:** 2026-05-18
**Status:** Approved

---

## Goal

Implement full email + password authentication for MeritView using Better Auth, covering backend auth setup (with JWT tokens, email verification, and protected middleware) and frontend auth pages (login, register, verify email, forgot/reset password) with Zustand state and auto token refresh.

---

## Scope

### In Scope
- Email + password sign up, sign in, sign out
- Email verification flow (required before login)
- Forgot password / reset password via email link
- JWT access tokens (15 min) + refresh tokens (7 days)
- Auth middleware: `requireAuth`, `requireRole`
- Frontend auth pages: Login, Register, VerifyEmail, ForgotPassword, ResetPassword
- `ProtectedRoute` component (redirects unauthenticated users)
- Zustand auth store (user, token, isAuthenticated)
- Auto token refresh via Axios interceptor
- Logout
- Backend unit + integration tests (Vitest + Supertest)

### Out of Scope
- Google OAuth / social login
- 2FA / TOTP
- Admin role enforcement (no admin routes yet)
- Invitation/guest token flow (Phase 4)

---

## Architecture

### Backend (2.1)

Better Auth is mounted as a catch-all handler on Express v5 at `/api/auth/{*any}`. It manages all auth logic internally — session storage, token issuance, email verification tokens, password reset tokens.

**Auth instance** lives at `backend/src/lib/auth.ts`:
- `prismaAdapter` with `postgresql` provider
- `emailAndPassword` enabled, `requireEmailVerification: true`
- `emailVerification` plugin with `sendVerificationEmail` callback (logs to console in dev; real email in prod)
- `jwtTokens` plugin: accessTokenExpiresIn 15 min, refreshTokenExpiresIn 7 days

**Schema** — Better Auth generates its own tables alongside the existing `User`. Run `npx @better-auth/cli generate` to produce the migration SQL for: `session`, `account`, `verification` tables. The existing `User` model is extended by Better Auth (adds `emailVerified`, `image`, `updatedAt` fields).

**Auth Middleware** at `backend/src/middleware/auth.ts`:
- `requireAuth(req, res, next)` — calls `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })`, attaches result to `req.user` and `req.session`, returns 401 JSON if missing
- `requireRole(role)(req, res, next)` — wraps requireAuth, returns 403 if `req.user.role !== role`

**Types** — extend Express `Request` in `backend/src/types/express.d.ts` to add `user` and `session` fields.

**Tests** at `backend/src/tests/auth.test.ts` using Vitest + Supertest:
- Sign up: happy path, duplicate email, missing fields, short password
- Sign in: happy path, wrong password, unverified email, non-existent user
- Sign out: valid session, missing session
- Get session: authenticated, unauthenticated
- Auth middleware: missing token, invalid token, valid token
- Email verification: valid token, expired token, already verified
- Forgot password: existing email, non-existent email
- Reset password: valid token, expired token, mismatched passwords

---

### Frontend (2.2)

Better Auth React client at `frontend/src/lib/authClient.ts` using `createAuthClient` from `better-auth/react`.

**Pages** under `frontend/src/pages/auth/`:
- `Login.tsx` — email + password form. On success: populate Zustand store, redirect `/dashboard`
- `Register.tsx` — name + email + password. On success: redirect `/auth/verify-email`
- `VerifyEmail.tsx` — static instructions + resend verification email button
- `ForgotPassword.tsx` — email input, calls `authClient.forgetPassword()`
- `ResetPassword.tsx` — new password + confirm, reads `token` + `callbackURL` from URL query params

**Auth Layout** at `frontend/src/components/layout/AuthLayout.tsx` — centered card wrapper used by all auth pages.

**Protected Route** at `frontend/src/components/auth/ProtectedRoute.tsx` — reads `isAuthenticated` from Zustand, redirects to `/login` if false.

**Zustand store** — extend existing `authStore.ts` with `refreshToken: string | null` and `setRefreshToken` action.

**API client** at `frontend/src/lib/api.ts` — Axios instance with base URL from env, Authorization header injection, and a response interceptor that on 401: calls refresh, retries once, on second failure calls `clearAuth()` and redirects to `/login`.

**Router** — update `App.tsx` to add auth routes and wrap dashboard with `ProtectedRoute`.

---

## Environment Variables

### Backend `.env`
```
BETTER_AUTH_SECRET=<32+ char secret>
BETTER_AUTH_URL=http://localhost:4000
DATABASE_URL=postgresql://...
```

### Frontend `.env`
```
VITE_API_URL=http://localhost:4000
VITE_BETTER_AUTH_URL=http://localhost:4000
```

---

## Key Decisions

1. **Better Auth over hand-rolled JWT** — handles token rotation, session storage, email verification tokens, password reset all in one library. Less code, more coverage.
2. **Email verification required** — `requireEmailVerification: true` on sign-in; unverified users get a 403 with `EMAIL_NOT_VERIFIED` error code from Better Auth.
3. **Zustand persisted to localStorage** — existing `persist` middleware already in place; only store user + token (not raw session object).
4. **Axios interceptor for refresh** — single retry on 401, falls back to logout. Avoids race conditions by checking `_retry` flag on the request config.
