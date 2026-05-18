import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import * as briefController from '../controllers/briefs'

// Mounted at /v1/disputes/:id/parties/:partyId/brief
const router = Router({ mergeParams: true })

router.use(requireAuth)

router.post('/session', briefController.startSession)
router.put('/draft', briefController.saveDraft)
router.post('/submit', briefController.submitBrief)
router.get('/', briefController.getBrief)

export default router
