import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import * as disputeController from '../controllers/disputes'

const router = Router()

router.use(requireAuth)

router.post('/', disputeController.createDispute)
router.get('/', disputeController.listDisputes)
router.get('/:id', disputeController.getDispute)

export default router
