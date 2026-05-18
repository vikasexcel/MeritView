import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_BETTER_AUTH_URL as string,
})

export const { signIn, signUp, signOut, useSession } = authClient

// Stubs — these features are deferred to a later phase
export const forgetPassword = async (_opts: { email: string; redirectTo: string }): Promise<{ error: { message?: string } | null }> => ({ error: null })
export const resetPassword = async (_opts: { newPassword: string; token: string }): Promise<{ error: { message?: string } | null }> => ({ error: null })
export const sendVerificationEmail = async (_opts: { email: string; callbackURL: string }): Promise<{ error: { message?: string } | null }> => ({ error: null })
