import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import * as paymentsController from '../controllers/payments'

const router = Router()

router.post('/checkout-session', requireAuth, paymentsController.createCheckoutSession)
router.get('/session/:sessionId/status', requireAuth, paymentsController.getSessionStatus)
router.get('/', requireAuth, paymentsController.listPayments)

export default router
