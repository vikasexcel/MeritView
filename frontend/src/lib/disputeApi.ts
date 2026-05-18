import { api } from './api'

export type DisputeCategory = 'contract' | 'small_claims' | 'partnership'
export type DisputeState =
  | 'draft'
  | 'awaiting_counterparty'
  | 'in_progress'
  | 'under_analysis'
  | 'completed'
  | 'cancelled'
  | 'refunded'

export interface DisputeParty {
  id: string
  role: 'initiator' | 'respondent'
  userId: string | null
  invitationStatus: 'pending' | 'accepted' | 'declined'
  briefStatus: 'not_started' | 'in_progress' | 'submitted'
}

export interface Dispute {
  id: string
  title: string
  category: DisputeCategory
  summary: string
  state: DisputeState
  stakes: string | null
  initiatorId: string
  createdAt: string
  parties: DisputeParty[]
}

export interface CreateDisputePayload {
  title: string
  category: DisputeCategory
  summary: string
  stakes?: number
  counterpartyEmail: string
  counterpartyName: string
}

export interface InvitationSummary {
  disputeTitle: string
  disputeCategory: DisputeCategory
  disputeSummary: string
  invitationStatus: 'pending' | 'accepted' | 'declined'
  disputeState: DisputeState
}

export const disputeApi = {
  create: (payload: CreateDisputePayload) =>
    api.post<{ dispute: Dispute; invitationToken: string; inviteUrl: string }>('/v1/disputes', payload),

  list: () => api.get<{ disputes: Dispute[] }>('/v1/disputes'),

  get: (id: string) => api.get<{ dispute: Dispute }>(`/v1/disputes/${id}`),

  getInvitation: (token: string) => api.get<InvitationSummary>(`/v1/invitations/${token}`),

  acceptInvitation: (token: string) => api.post(`/v1/invitations/${token}/accept`),

  declineInvitation: (token: string) => api.post(`/v1/invitations/${token}/decline`),
}
