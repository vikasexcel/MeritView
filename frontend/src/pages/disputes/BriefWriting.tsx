import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Send, Save, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { briefApi, type BriefContent, type LlmProvider } from '@/lib/disputeApi'
import { useAuthStore } from '@/store/authStore'

const SECTIONS: Array<{ key: keyof BriefContent; label: string; hint: string }> = [
  { key: 'facts', label: 'Facts', hint: 'Objective, verifiable facts about the situation' },
  { key: 'position', label: 'Position', hint: 'Your stance and what you believe happened' },
  { key: 'arguments', label: 'Arguments', hint: 'Supporting reasoning, evidence, and logic' },
  { key: 'acknowledgment', label: 'Acknowledgment', hint: "The other party's possible perspective (good faith)" },
  { key: 'desiredOutcome', label: 'Desired Outcome', hint: 'What resolution you are seeking' },
]

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  'claude': 'Claude (Anthropic)',
  'gpt-4': 'GPT-4 (OpenAI)',
  'gemini': 'Gemini (Google)',
}

function countWords(content: BriefContent): number {
  const text = Object.values(content).filter(Boolean).join(' ')
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function BriefWriting() {
  const { id: disputeId, partyId } = useParams<{ id: string; partyId: string }>()
  const navigate = useNavigate()

  const [content, setContent] = useState<BriefContent>({
    facts: '', position: '', arguments: '', acknowledgment: '', desiredOutcome: '',
  })
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: "Hello! I'm here to help you prepare your brief. Let's start with the basics — can you briefly describe the dispute and what happened from your perspective?" },
  ])
  const [chatInput, setChatInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [llmProvider, setLlmProvider] = useState<LlmProvider>('claude')
  const [isSaving, setIsSaving] = useState(false)
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<keyof BriefContent>>(
    new Set(['facts'])
  )

  const chatEndRef = useRef<HTMLDivElement>(null)
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load existing brief on mount
  const { data: briefData } = useQuery({
    queryKey: ['brief', disputeId, partyId],
    queryFn: () => briefApi.getBrief(disputeId!, partyId!).then((r) => r.data.brief),
    enabled: !!disputeId && !!partyId,
    retry: false,
  })

  useEffect(() => {
    if (briefData) {
      setContent(briefData.content)
      if (briefData.status === 'submitted') setSubmitted(true)
    }
  }, [briefData])

  // Start session on mount
  useEffect(() => {
    if (!disputeId || !partyId) return
    briefApi.startSession(disputeId, partyId, llmProvider)
      .then((r) => setSessionId(r.data.session.id))
      .catch(() => {})
  }, [disputeId, partyId, llmProvider])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const wordCount = countWords(content)

  const autoSave = useCallback(() => {
    if (!disputeId || !partyId || submitted) return
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
    autoSaveRef.current = setTimeout(async () => {
      try {
        await briefApi.saveDraft(disputeId, partyId, content)
      } catch {
        // silent auto-save failure
      }
    }, 60_000)
  }, [disputeId, partyId, content, submitted])

  useEffect(() => {
    autoSave()
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current) }
  }, [content, autoSave])

  const handleSaveDraft = async () => {
    if (!disputeId || !partyId) return
    setIsSaving(true)
    try {
      await briefApi.saveDraft(disputeId, partyId, content)
      toast.success('Draft saved')
    } catch {
      toast.error('Failed to save draft')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isStreaming || !disputeId || !partyId) return

    const userMsg = chatInput.trim()
    setChatInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }])
    setIsStreaming(true)

    let assistantContent = ''
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    try {
      const token = useAuthStore.getState().token
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}/v1/disputes/${disputeId}/parties/${partyId}/brief/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({ message: userMsg, sessionId }),
        }
      )

      if (!response.ok || !response.body) {
        throw new Error('Stream failed')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.text) {
              assistantContent += data.text
              setMessages((prev) => {
                const updated = [...prev]
                updated[updated.length - 1] = { role: 'assistant', content: assistantContent }
                return updated
              })
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: '(Error: could not get response)' }
        return updated
      })
      toast.error('AI assistant unavailable')
    } finally {
      setIsStreaming(false)
    }
  }

  const handleSubmit = async () => {
    if (!disputeId || !partyId) return
    try {
      const result = await briefApi.submitBrief(disputeId, partyId, content)
      setSubmitted(true)
      setShowSubmitModal(false)
      toast.success(result.data.bothSubmitted ? 'Brief submitted! Analysis is starting.' : 'Brief submitted! Waiting for the other party.')
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Submission failed')
    }
  }

  const toggleSection = (key: keyof BriefContent) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const wordCountColor = wordCount < 500 ? 'text-destructive' : wordCount > 4500 ? 'text-orange-500' : 'text-muted-foreground'

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6">
        <CheckCircle className="text-green-500 w-12 h-12" />
        <h2 className="text-xl font-semibold">Brief Submitted</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Your brief has been locked. Waiting for the other party to submit theirs before analysis begins.
        </p>
        <Button variant="outline" onClick={() => navigate(`/disputes/${disputeId}`)}>
          Back to Dispute
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Left: AI Chat */}
      <div className="w-2/5 flex flex-col border-r bg-muted/20">
        <div className="p-4 border-b flex items-center justify-between gap-2">
          <h2 className="font-semibold text-sm">AI Brief Assistant</h2>
          <Select value={llmProvider} onValueChange={(v) => setLlmProvider(v as LlmProvider)}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PROVIDER_LABELS) as LlmProvider[]).map((p) => (
                <SelectItem key={p} value={p} className="text-xs">
                  {PROVIDER_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background border'
                }`}
              >
                {msg.content}
                {msg.role === 'assistant' && msg.content === '' && isStreaming && (
                  <span className="inline-block w-1.5 h-4 bg-foreground/60 animate-pulse" />
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Chat Input */}
        <div className="p-3 border-t flex gap-2">
          <Textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask the AI for help..."
            className="min-h-[60px] max-h-[120px] text-sm resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSendMessage()
              }
            }}
            disabled={isStreaming}
          />
          <Button size="icon" onClick={handleSendMessage} disabled={isStreaming || !chatInput.trim()}>
            {isStreaming ? <Spinner className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Right: Brief Editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-sm">Your Brief</h2>
            <span className={`text-xs ${wordCountColor}`}>
              {wordCount} words
              {wordCount < 500 && ' (min 500)'}
              {wordCount > 5000 && ' (over limit!)'}
            </span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleSaveDraft} disabled={isSaving}>
              {isSaving ? <Spinner className="w-3 h-3 mr-1" /> : <Save className="w-3 h-3 mr-1" />}
              Save Draft
            </Button>
            <Button
              size="sm"
              onClick={() => setShowSubmitModal(true)}
              disabled={wordCount < 500 || wordCount > 5000}
            >
              Submit Brief
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {SECTIONS.map(({ key, label, hint }) => {
            const text = content[key] ?? ''
            const sectionWords = text.trim() ? text.trim().split(/\s+/).length : 0
            const isOpen = expandedSections.has(key)

            return (
              <Card key={key} className="overflow-hidden">
                <button
                  className="w-full text-left"
                  onClick={() => toggleSection(key)}
                >
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm">{label}</CardTitle>
                        <Badge variant="secondary" className="text-xs font-normal">
                          {sectionWords} words
                        </Badge>
                        {text.trim() && (
                          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                        )}
                      </div>
                      {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </CardHeader>
                </button>
                {isOpen && (
                  <CardContent className="pt-0 px-4 pb-4">
                    <p className="text-xs text-muted-foreground mb-2">{hint}</p>
                    <Textarea
                      value={text}
                      onChange={(e) =>
                        setContent((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      placeholder={`Write your ${label.toLowerCase()} here...`}
                      className="min-h-[120px] text-sm resize-none"
                    />
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      </div>

      {/* Submit Confirmation Modal */}
      <Dialog open={showSubmitModal} onOpenChange={setShowSubmitModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-500" />
              Submit Your Brief?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Once submitted, your brief is locked and cannot be edited. Make sure you have reviewed all sections.
          </p>
          <div className="text-sm">
            <span className="font-medium">{wordCount} words</span>
            <span className="text-muted-foreground"> across {SECTIONS.filter((s) => content[s.key]?.trim()).length} of {SECTIONS.length} sections</span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitModal(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>Yes, Submit Final Brief</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
