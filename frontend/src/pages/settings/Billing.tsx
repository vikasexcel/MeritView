import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { paymentApi, type PaymentRecord } from '@/lib/paymentApi'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const STATUS_VARIANT: Record<PaymentRecord['status'], 'secondary' | 'default' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  succeeded: 'default',
  failed: 'destructive',
  refunded: 'outline',
}

export function Billing() {
  const { data, isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: () => paymentApi.listPayments(),
  })

  const payments = data?.data.payments ?? []

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Billing History</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

          {!isLoading && payments.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No payments yet.</p>
          )}

          {payments.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Date</th>
                  <th className="pb-2 text-left font-medium">Dispute</th>
                  <th className="pb-2 text-left font-medium">Amount</th>
                  <th className="pb-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-3 text-muted-foreground">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3">
                      {p.dispute ? (
                        <Link to={`/disputes/${p.dispute.id}`} className="hover:underline">
                          {p.dispute.title}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3">${Number(p.amountUsd).toFixed(2)}</td>
                    <td className="py-3">
                      <Badge variant={STATUS_VARIANT[p.status]}>
                        {p.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
