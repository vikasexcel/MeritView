import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { Scale, FileText, Brain, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const PRICING_TIERS = [
  {
    name: 'Standard',
    price: 99,
    description: 'Perfect for straightforward disputes',
    features: ['3 AI evaluators', 'Detailed opinion report', 'PDF download', '5-7 day turnaround'],
  },
  {
    name: 'Expedited',
    price: 199,
    description: 'Fast-track resolution',
    features: ['3 AI evaluators', 'Detailed opinion report', 'PDF download', '48-hour turnaround'],
    highlighted: true,
  },
  {
    name: 'Extended',
    price: 299,
    description: 'Comprehensive analysis for complex cases',
    features: ['5 AI evaluators', 'Extended opinion report', 'PDF download', '48-hour turnaround', 'Re-analysis option'],
  },
]

const FAQS = [
  {
    q: 'What is MeritView?',
    a: 'MeritView is an AI-powered dispute resolution platform. Each party submits a written brief, and a panel of AI evaluators independently analyzes both sides to produce an impartial opinion.',
  },
  {
    q: 'Is the AI opinion legally binding?',
    a: 'No. MeritView provides argument analysis, not legal advice. The opinion is designed to help parties understand the relative strength of their positions and potentially reach a settlement. Always consult a qualified attorney for legal matters.',
  },
  {
    q: 'How are the AI judges chosen?',
    a: 'We use multiple leading language models (including Claude, GPT-4, and Gemini) as independent evaluators. Each evaluator reads both briefs and delivers a structured verdict. Results are aggregated to reduce single-model bias.',
  },
  {
    q: 'What happens if the counterparty declines?',
    a: 'If the invited counterparty declines to participate, you receive a full refund. No analysis is performed.',
  },
  {
    q: 'Can I choose which AI wrote my brief assistant?',
    a: 'Yes. During the brief-writing phase you can select which AI model helps you structure and refine your brief — Claude, GPT-4, or Gemini.',
  },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-border last:border-0">
      <button
        className="flex w-full items-center justify-between py-4 text-left text-sm font-medium text-foreground hover:text-primary transition-colors"
        onClick={() => setOpen(!open)}
      >
        {q}
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <p className="pb-4 text-sm text-muted-foreground leading-relaxed">{a}</p>
      )}
    </div>
  )
}

export function Landing() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-4 py-24 text-center gap-6 bg-gradient-to-b from-muted/30 to-background">
        <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
          <Scale className="h-3 w-3" />
          AI-Powered Dispute Resolution
        </div>
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          Let AI settle it — <span className="text-primary">fairly</span>
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Present your side. Your counterparty presents theirs. A panel of independent AI judges
          delivers an impartial opinion on who has the stronger case.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button size="lg" onClick={() => navigate('/register')}>
            Start a Dispute
          </Button>
          <Button variant="outline" size="lg" render={<a href="#how-it-works" />}>
            See how it works
          </Button>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="px-4 py-20 bg-background">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground">How it works</h2>
            <p className="mt-2 text-muted-foreground">Three steps to an impartial opinion</p>
          </div>
          <div className="grid gap-8 sm:grid-cols-3">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg">
                1
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">Create a Dispute</h3>
                <p className="text-sm text-muted-foreground">
                  Describe the dispute, invite the other party, and choose a pricing tier. Both parties pay nothing until the counterparty accepts.
                </p>
              </div>
            </div>
            <div className="flex flex-col items-center text-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg">
                2
              </div>
              <div className="flex flex-col items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-semibold text-foreground mb-1">Write Your Brief</h3>
                <p className="text-sm text-muted-foreground">
                  Each party writes a structured brief with help from an AI assistant of their choice. Briefs are sealed until both are submitted.
                </p>
              </div>
            </div>
            <div className="flex flex-col items-center text-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg">
                3
              </div>
              <div className="flex flex-col items-center gap-2">
                <Brain className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-semibold text-foreground mb-1">Get the Analysis</h3>
                <p className="text-sm text-muted-foreground">
                  A panel of AI evaluators independently reviews both briefs and delivers a detailed opinion with scores, reasoning, and suggestions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-4 py-20 bg-muted/30">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground">Simple pricing</h2>
            <p className="mt-2 text-muted-foreground">One flat fee. No hidden costs. Full refund if the other party declines.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {PRICING_TIERS.map((tier) => (
              <Card
                key={tier.name}
                className={cn(
                  'relative flex flex-col',
                  tier.highlighted && 'border-primary shadow-lg'
                )}
              >
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                    Most popular
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-lg">{tier.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{tier.description}</p>
                  <div className="mt-2">
                    <span className="text-4xl font-bold">${tier.price}</span>
                    <span className="text-muted-foreground text-sm"> / dispute</span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col flex-1 gap-4">
                  <ul className="space-y-2 text-sm text-muted-foreground flex-1">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <span className="text-primary">✓</span> {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant={tier.highlighted ? 'default' : 'outline'}
                    className="w-full"
                    onClick={() => navigate('/register')}
                  >
                    Get started
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="px-4 py-20 bg-background">
        <div className="container mx-auto max-w-2xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground">Frequently asked questions</h2>
          </div>
          <div className="rounded-lg border border-border px-6">
            {FAQS.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background px-4 py-10">
        <div className="container mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Scale className="h-4 w-4" />
            MeritView
          </div>
          <nav className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
            <Link to="/legal/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <Link to="/legal/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link to="/legal/disclaimer" className="hover:text-foreground transition-colors">Disclaimer</Link>
          </nav>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} MeritView. Not legal advice.</p>
        </div>
      </footer>
    </div>
  )
}
