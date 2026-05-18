import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from '@langchain/core/messages'

export type LlmProvider = 'claude' | 'gpt-4' | 'gemini'

const OPENROUTER_MODELS: Record<LlmProvider, string> = {
  claude: 'anthropic/claude-3.5-sonnet',
  'gpt-4': 'openai/gpt-4o',
  gemini: 'google/gemini-2.0-flash-001',
}

const SYSTEM_PROMPT = `You are an AI assistant helping a party prepare their brief for a dispute resolution process.

Your role is to help them clearly articulate their position across 5 sections:
1. **Facts** — The objective, verifiable facts of the situation
2. **Position** — Their stance and what they believe happened
3. **Arguments** — Supporting reasoning, logic, and evidence
4. **Acknowledgment** — What the other party's perspective might be (shows good faith)
5. **Desired Outcome** — What resolution they are seeking

Guidelines:
- Ask one focused question at a time to help them build each section
- Do not take sides or make legal judgments
- Encourage specificity: dates, amounts, communications, agreements
- Remind them that word limits apply: 500–2000 words recommended, 5000 max
- Be neutral, professional, and constructive
- After they provide information, suggest how it might fit into their brief sections`

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function buildLangChainMessages(history: ChatMessage[], userMessage: string): BaseMessage[] {
  const messages: BaseMessage[] = [new SystemMessage(SYSTEM_PROMPT)]

  for (const msg of history) {
    if (msg.role === 'user') {
      messages.push(new HumanMessage(msg.content))
    } else {
      messages.push(new AIMessage(msg.content))
    }
  }

  messages.push(new HumanMessage(userMessage))
  return messages
}

export function createLlm(provider: LlmProvider, streaming = false) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured')

  return new ChatOpenAI({
    modelName: OPENROUTER_MODELS[provider],
    streaming,
    openAIApiKey: apiKey,
    configuration: {
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': process.env.APP_URL ?? 'http://localhost:3000',
        'X-Title': 'MeritView',
      },
    },
  })
}
