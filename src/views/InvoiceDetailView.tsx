import {
  Box,
  ContextView,
  Divider,
  Inline,
  Badge,
  Button,
  Notice,
} from '@stripe/ui-extension-sdk/ui'
import type { ExtensionContextValue } from '@stripe/ui-extension-sdk/context'
import { useEffect, useState, useCallback } from 'react'
import Stripe from 'stripe'
import { createHttpClient, STRIPE_API_KEY } from '@stripe/ui-extension-sdk/http_client'
import {
  fetchInvoices,
  createFromStripeInvoice,
  retryInvoice,
} from '../api/client'
import { useAuth } from '../hooks/useAuth'
import type { Invoice } from '../types'

interface PaymentInfo {
  amount: string
  currency: string
  status: string
  customerName: string | null
  customerEmail: string | null
  description: string | null
  stripeInvoiceId: string | null
}

const STATUS_PIPELINE = [
  { key: 'draft', label: 'Ciorna' },
  { key: 'issued', label: 'Emisa' },
  { key: 'sent_to_anaf', label: 'Trimisa ANAF' },
  { key: 'validated', label: 'Validata' },
]

function getStatusIndex(status: string): number {
  const idx = STATUS_PIPELINE.findIndex((s) => s.key === status)
  return idx >= 0 ? idx : -1
}

const InvoiceDetailView = ({ userContext, environment }: ExtensionContextValue) => {
  const { loading: authLoading, authenticated, error: authError } = useAuth({ userContext })
  const [payment, setPayment] = useState<PaymentInfo | null>(null)
  const [matchedInvoices, setMatchedInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null)

  const objectId = environment?.objectContext?.id as string | undefined

  useEffect(() => {
    if (authLoading) return
    if (!authenticated) {
      setError('Nu esti conectat. Mergi la Setari pentru a conecta Storno.ro.')
      setLoading(false)
      return
    }
    if (!objectId) {
      setError('Nu s-a putut identifica plata.')
      setLoading(false)
      return
    }

    async function load() {
      try {
        const httpClient = createHttpClient()
        const stripe = new Stripe(STRIPE_API_KEY, {
          httpClient,
          apiVersion: '2023-10-16' as any,
        })

        const pi = await stripe.paymentIntents.retrieve(objectId!, {
          expand: ['customer', 'invoice'],
        })

        const customer = pi.customer as Stripe.Customer | null
        const invoice = pi.invoice as Stripe.Invoice | null
        const amountStr = (pi.amount / 100).toFixed(2)

        setPayment({
          amount: amountStr,
          currency: pi.currency.toUpperCase(),
          status: pi.status,
          customerName: customer?.name ?? null,
          customerEmail: customer?.email ?? null,
          description: pi.description ?? null,
          stripeInvoiceId: invoice?.id ?? null,
        })

        const searchTerm = customer?.name || customer?.email
        if (searchTerm) {
          const data = await fetchInvoices({ search: searchTerm })
          setMatchedInvoices(data.data ?? [])
        }
      } catch (e: any) {
        setError(e.message || 'Eroare la incarcarea datelor platii')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [objectId, authLoading, authenticated])

  const handleCreateInvoice = useCallback(async () => {
    if (!payment?.stripeInvoiceId) return

    setActionBusy(true)
    setActionMessage(null)

    try {
      const result = await createFromStripeInvoice(payment.stripeInvoiceId)
      setActionMessage({ type: 'positive', text: `e-Factura creata: ${result.invoiceNumber}` })

      const searchTerm = payment.customerName || payment.customerEmail
      if (searchTerm) {
        const data = await fetchInvoices({ search: searchTerm })
        setMatchedInvoices(data.data ?? [])
      }
    } catch (e: any) {
      setActionMessage({ type: 'negative', text: e.message })
    } finally {
      setActionBusy(false)
    }
  }, [payment])

  const handleRetry = useCallback(async (invoiceId: string) => {
    setActionBusy(true)
    setActionMessage(null)

    try {
      await retryInvoice(invoiceId)
      setActionMessage({ type: 'positive', text: 'Factura retrimisa la ANAF' })
    } catch (e: any) {
      setActionMessage({ type: 'negative', text: e.message })
    } finally {
      setActionBusy(false)
    }
  }, [])

  if (authLoading || loading) {
    return (
      <ContextView title="Storno.ro">
        <Box css={{ padding: 'large' }}>
          <Box>Se incarca...</Box>
        </Box>
      </ContextView>
    )
  }

  if (error || authError) {
    return (
      <ContextView title="Storno.ro">
        <Box css={{ padding: 'large' }}>
          {/* @ts-expect-error title/description work at runtime but SDK types omit them */}
          <Notice type="attention" title="Eroare" description={error || authError} />
        </Box>
      </ContextView>
    )
  }

  return (
    <ContextView title="Storno.ro - Detalii plata">
      <Box css={{ padding: 'medium' }}>
        {/* Payment info */}
        {payment && (
          <Box>
            <Inline css={{ gap: 'medium' }}>
              <Box>Suma:</Box>
              <Box css={{ fontWeight: 'bold' }}>
                {payment.amount} {payment.currency}
              </Box>
            </Inline>

            <Inline css={{ gap: 'medium', marginTop: 'xsmall' }}>
              <Box>Status:</Box>
              <Badge type={payment.status === 'succeeded' ? 'positive' : 'warning'}>
                {payment.status}
              </Badge>
            </Inline>

            {payment.customerName && (
              <Inline css={{ gap: 'medium', marginTop: 'xsmall' }}>
                <Box>Client:</Box>
                <Box>{payment.customerName}</Box>
              </Inline>
            )}

            {payment.customerEmail && (
              <Inline css={{ gap: 'medium', marginTop: 'xsmall' }}>
                <Box>Email:</Box>
                <Box>{payment.customerEmail}</Box>
              </Inline>
            )}
          </Box>
        )}

        {/* Action messages */}
        {actionMessage && (
          <Box css={{ marginTop: 'small' }}>
            {/* @ts-expect-error title/description work at runtime but SDK types omit them */}
            <Notice type={actionMessage.type} title={actionMessage.type === 'positive' ? 'Succes' : 'Eroare'} description={actionMessage.text} />
          </Box>
        )}

        <Divider />

        {/* Matched e-Facturi */}
        {matchedInvoices.length > 0 ? (
          <Box>
            <Box css={{ fontWeight: 'bold', marginBottom: 'small' }}>e-Facturi asociate</Box>
            {matchedInvoices.map((invoice) => {
              const statusIdx = getStatusIndex(invoice.status)
              const isRejected = invoice.status === 'rejected'

              return (
                <Box key={invoice.id} css={{ marginBottom: 'medium' }}>
                  <Inline css={{ gap: 'medium' }}>
                    <Box css={{ fontWeight: 'bold' }}>{invoice.invoiceNumber}</Box>
                    <Box>{invoice.total} {invoice.currency}</Box>
                  </Inline>

                  {/* Status pipeline */}
                  <Inline css={{ gap: 'xsmall', marginTop: 'xsmall' }}>
                    {STATUS_PIPELINE.map((step, i) => (
                      <Badge
                        key={step.key}
                        type={
                          isRejected && i === STATUS_PIPELINE.length - 1
                            ? 'negative'
                            : i <= statusIdx
                              ? 'positive'
                              : 'neutral'
                        }
                      >
                        {isRejected && step.key === 'validated' ? 'Respinsa' : step.label}
                      </Badge>
                    ))}
                  </Inline>

                  {/* ANAF error + retry */}
                  {isRejected && (
                    <Box css={{ marginTop: 'small' }}>
                      {invoice.anafStatus && (
                        // @ts-expect-error title/description work at runtime but SDK types omit them
                        <Notice type="negative" title="Eroare ANAF" description={invoice.anafStatus} />
                      )}
                      <Box css={{ marginTop: 'xsmall' }}>
                        <Button
                          type="primary"
                          size="small"
                          onPress={() => handleRetry(invoice.id)}
                          disabled={actionBusy}
                        >
                          {actionBusy ? 'Se retrimite...' : 'Retrimite la ANAF'}
                        </Button>
                      </Box>
                    </Box>
                  )}
                </Box>
              )
            })}
          </Box>
        ) : (
          <Box>
            <Badge type="info">
              Nicio e-Factura gasita pentru aceasta plata
            </Badge>

            {/* Manual create button */}
            {payment?.stripeInvoiceId && (
              <Box css={{ marginTop: 'small' }}>
                <Button
                  type="primary"
                  onPress={handleCreateInvoice}
                  disabled={actionBusy}
                >
                  {actionBusy ? 'Se creeaza...' : 'Creeaza e-Factura'}
                </Button>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </ContextView>
  )
}

export default InvoiceDetailView
