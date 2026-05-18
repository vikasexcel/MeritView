# Frontend Agent Guide

## Commands

- `npm run dev`: start Vite.
- `npm run build`: run `tsc -b` and build with Vite.
- `npm run lint`: run ESLint.
- `npm run preview`: preview production build.

## Architecture

- `src/App.tsx`: route tree and protected dashboard route.
- `src/pages/`: route-level pages.
- `src/components/layout/`: shared app layouts.
- `src/components/ui/`: shadcn-style primitives.
- `src/lib/api.ts`: Axios instance with credentials and 401 handling.
- `src/lib/authClient.ts`: Better Auth React client exports.
- `src/store/authStore.ts`: client auth state.

## Conventions

- Use the `@` alias for imports from `src`.
- Keep shadcn components in `src/components/ui`.
- Tailwind v4 theme tokens live in `src/index.css` with `@theme inline`.
- API calls should preserve `withCredentials: true` unless auth behavior intentionally changes.
- Better Auth client base URL uses `VITE_BETTER_AUTH_URL`; API base URL uses `VITE_API_BASE_URL`.
