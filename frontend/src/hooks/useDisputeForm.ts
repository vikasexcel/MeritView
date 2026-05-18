import { useState } from 'react'
import type { DisputeCategory, CreateDisputePayload } from '@/lib/disputeApi'

export interface DisputeFormValues {
  title: string
  category: DisputeCategory | ''
  summary: string
  stakes: string
  counterpartyEmail: string
  counterpartyName: string
}

const INITIAL_VALUES: DisputeFormValues = {
  title: '',
  category: '',
  summary: '',
  stakes: '',
  counterpartyEmail: '',
  counterpartyName: '',
}

export function useDisputeForm() {
  const [step, setStep] = useState(1)
  const [values, setValues] = useState<DisputeFormValues>(INITIAL_VALUES)

  function updateValues(partial: Partial<DisputeFormValues>) {
    setValues((prev) => ({ ...prev, ...partial }))
  }

  function nextStep() {
    setStep((s) => Math.min(s + 1, 4))
  }

  function prevStep() {
    setStep((s) => Math.max(s - 1, 1))
  }

  function toPayload(): CreateDisputePayload {
    return {
      title: values.title,
      category: values.category as DisputeCategory,
      summary: values.summary,
      stakes: values.stakes ? parseFloat(values.stakes) : undefined,
      counterpartyEmail: values.counterpartyEmail,
      counterpartyName: values.counterpartyName,
    }
  }

  return { step, values, updateValues, nextStep, prevStep, toPayload }
}
