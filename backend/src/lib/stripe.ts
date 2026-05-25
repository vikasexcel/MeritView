import Stripe from 'stripe'
import type { Stripe as StripeType } from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set')
}

if (!process.env.STRIPE_WEBHOOK_SECRET) {
  throw new Error('STRIPE_WEBHOOK_SECRET is not set')
}

export const stripe: StripeType = new Stripe(process.env.STRIPE_SECRET_KEY, {
  // dahlia preview version required for ui_mode: 'custom' Checkout Sessions
  apiVersion: '2026-04-22.dahlia' as any,
})
