import { useEffect, useRef, useState } from 'react'
import { opinionApi } from '@/lib/disputeApi'
import type { OpinionStatus } from '@/lib/disputeApi'

export type StreamState =
  | { phase: 'connecting' }
  | { phase: 'evaluating'; completed: number; total: number }
  | { phase: 'aggregating' }
  | { phase: 'ready'; opinionId: string }
  | { phase: 'error' }

export function useOpinionStream(disputeId: string, enabled: boolean) {
  const [state, setState] = useState<StreamState>({ phase: 'connecting' })
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!enabled) return

    const url = opinionApi.streamUrl(disputeId)
    const es = new EventSource(url, { withCredentials: true })
    esRef.current = es

    es.addEventListener('status', (e) => {
      const data: OpinionStatus = JSON.parse((e as MessageEvent).data)
      if (data.opinionReady && data.opinionId) {
        setState({ phase: 'ready', opinionId: data.opinionId })
      } else {
        setState({ phase: 'evaluating', completed: data.evaluatorsCompleted, total: data.evaluatorsTotal })
      }
    })

    es.addEventListener('evaluator_complete', (e) => {
      const data = JSON.parse((e as MessageEvent).data)
      setState({ phase: 'evaluating', completed: data.index, total: data.total })
    })

    es.addEventListener('aggregation_started', () => {
      setState({ phase: 'aggregating' })
    })

    es.addEventListener('opinion_ready', (e) => {
      const data = JSON.parse((e as MessageEvent).data)
      setState({ phase: 'ready', opinionId: data.opinionId })
    })

    es.addEventListener('error', () => {
      setState({ phase: 'error' })
      es.close()
    })

    es.onerror = () => {
      setState({ phase: 'error' })
      es.close()
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [disputeId, enabled])

  return state
}
