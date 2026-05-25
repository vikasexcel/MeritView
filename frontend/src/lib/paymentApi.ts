import { api } from './api'

export interface CheckoutSessionPayload {
  title: string
  category: string
  summary: string
  stakes?: number
  counterpartyEmail: string
  counterpartyName: string
}

export interface CheckoutSessionResponse {
  clientSecret: string
  paymentId: string
}

export interface SessionStatusResponse {
  status: 'pending' | 'succeeded' | 'failed' | 'refunded'
  disputeId: string | null
}

export interface PaymentRecord {
  id: string
  amountUsd: string
  status: 'pending' | 'succeeded' | 'failed' | 'refunded'
  createdAt: string
  dispute: { id: string; title: string } | null
}

export const paymentApi = {
  createCheckoutSession: (payload: CheckoutSessionPayload) =>
    api.post<CheckoutSessionResponse>('/v1/payments/checkout-session', payload),

  getSessionStatus: (sessionId: string) =>
    api.get<SessionStatusResponse>(`/v1/payments/session/${sessionId}/status`),

  listPayments: () => api.get<{ payments: PaymentRecord[] }>('/v1/payments'),
}
