import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from './prisma'

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }: { user: { email: string }, url: string }) => {
      // In production: send via email service
      console.log(`[DEV] Password reset link for ${user.email}: ${url}`)
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }: { user: { email: string }, url: string }) => {
      // In production: send via email service
      console.log(`[DEV] Verification link for ${user.email}: ${url}`)
    },
    sendOnSignIn: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,     // update session if older than 1 day
  },
  trustedOrigins: [process.env.FRONTEND_URL ?? 'http://localhost:5173'],
})

export type Auth = typeof auth
