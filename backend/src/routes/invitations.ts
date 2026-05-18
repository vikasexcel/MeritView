import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import * as invitationController from '../controllers/invitations'

const router = Router()

// Public: anyone with the token can view dispute summary
router.get('/:token', invitationController.getInvitation)

// Protected: must be logged in to accept
router.post('/:token/accept', requireAuth, invitationController.acceptInvitation)

// Public: no auth required to decline
router.post('/:token/decline', invitationController.declineInvitation)

export default router
