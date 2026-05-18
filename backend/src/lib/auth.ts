import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from './prisma'
import { sendVerificationEmail, sendPasswordResetEmail } from './email'

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
      void sendPasswordResetEmail(user.email, url)
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }: { user: { email: string }, url: string }) => {
      void sendVerificationEmail(user.email, url)
    },
    sendOnSignIn: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  trustedOrigins: [process.env.FRONTEND_URL ?? 'http://localhost:5173'],
})

export type Auth = typeof auth
