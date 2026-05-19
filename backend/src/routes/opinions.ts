// backend/src/routes/opinions.ts
import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import * as opinionsController from '../controllers/opinions'

const router = Router({ mergeParams: true })

router.use(requireAuth)

router.get('/', opinionsController.getOpinion)
router.get('/pdf', opinionsController.getOpinionPdf)
router.get('/status', opinionsController.getOpinionStatus)
router.get('/stream', opinionsController.streamOpinionProgress)

export default router
