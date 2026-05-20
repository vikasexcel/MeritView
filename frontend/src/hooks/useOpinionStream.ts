import { useEffect, useRef, useState } from 'react'
import { opinionApi } from '@/lib/disputeApi'
import type { OpinionStatus } from '@/lib/disputeApi'

export type StreamState =
  | { phase: 'connecting' }
  | { phase: 'evaluating'; completed: number; total: number }
  | { phase: 'aggregating' }
  | { phase: 'ready'; opinionId: string }
  | { phase: 'error'; message?: string }

export function useOpinionStream(disputeId: string, enabled: boolean) {
  const [state, setState] = useState<StreamState>({ phase: 'connecting' })
  const esRef = useRef<EventSource | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const readyRef = useRef(false)

  useEffect(() => {
    if (!enabled) return

    function stopPolling() {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }

    function markReady(opinionId: string) {
      readyRef.current = true
      stopPolling()
      esRef.current?.close()
      esRef.current = null
      setState({ phase: 'ready', opinionId })
    }

    // Poll /status as fallback if SSE drops mid-evaluation
    function startPolling() {
      if (pollRef.current || readyRef.current) return
      pollRef.current = setInterval(async () => {
        try {
          const res = await opinionApi.getStatus(disputeId)
          const data = res.data
          if (data.opinionReady && data.opinionId) {
            markReady(data.opinionId)
          } else if (data.state === 'under_analysis' || data.evaluatorsCompleted > 0) {
            setState({ phase: 'evaluating', completed: data.evaluatorsCompleted, total: data.evaluatorsTotal })
          }
        } catch {
          // ignore transient poll errors
        }
      }, 3000)
    }

    const url = opinionApi.streamUrl(disputeId)
    const es = new EventSource(url, { withCredentials: true })
    esRef.current = es

    es.addEventListener('status', (e) => {
      const data: OpinionStatus = JSON.parse((e as MessageEvent).data)
      if (data.opinionReady && data.opinionId) {
        markReady(data.opinionId)
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
      markReady(data.opinionId)
    })

    es.addEventListener('evaluation_error', (e) => {
      const data = JSON.parse((e as MessageEvent).data)
      stopPolling()
      es.close()
      setState({ phase: 'error', message: data.message })
    })

    // Server-sent error event (event: error from backend on internal failure)
    es.addEventListener('error', (e) => {
      if ((e as MessageEvent).data) {
        es.close()
        startPolling()
      }
    })

    es.onerror = () => {
      if (readyRef.current) return
      if (es.readyState === EventSource.CLOSED) {
        // Auth failure or permanent error — stop and show error
        stopPolling()
        setState({ phase: 'error' })
      } else {
        // Browser is auto-reconnecting — fall back to polling in the meantime
        startPolling()
      }
    }

    return () => {
      es.close()
      esRef.current = null
      stopPolling()
    }
  }, [disputeId, enabled])

  return state
}
