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
  fetchInvoiceByStripeId,
  createFromStripeInvoice,
  retryInvoice,
} from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { useT } from '../i18n'
import { StatusBadge } from '../components/StatusBadge'
import { LoadingView, ErrorView, NotConnectedView } from '../components/ViewStates'
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

const STATUS_PIPELINE = ['draft', 'issued', 'sent_to_anaf', 'validated']

function getStepIndex(status: string): number {
  // sent_to_provider is the internal value; treat as sent_to_anaf for pipeline display
  const normalized = status === 'sent_to_provider' ? 'sent_to_anaf' : status
  return STATUS_PIPELINE.indexOf(normalized)
}

function PipelineSteps({ status }: { status: string }) {
  const t = useT()
  const isRejected = status === 'rejected'
  const stepIdx = getStepIndex(status)

  const STEP_LABELS = [
    t('status.draft'),
    t('status.issued'),
    t('status.sent_to_anaf'),
    t('status.validated'),
  ]

  return (
    <Inline css={{ gap: 'xsmall', marginTop: 'xsmall' }}>
      {STEP_LABELS.map((label, i) => {
        const isLast = i === STEP_LABELS.length - 1
        if (isRejected && isLast) {
          return <Badge key={i} type="negative">{t('status.rejected')}</Badge>
        }
        return (
          <Badge key={i} type={i <= stepIdx ? 'positive' : 'neutral'}>
            {label}
          </Badge>
        )
      })}
    </Inline>
  )
}

function InvoiceCard({
  invoice,
  onRetry,
  busy,
}: {
  invoice: Invoice
  onRetry: (id: string) => void
  busy: boolean
}) {
  const t = useT()
  const isRejected = invoice.status === 'rejected'
  const displayTitle = invoice.invoiceNumber || ('#' + invoice.id.slice(-6))

  return (
    <Box css={{ marginBottom: 'small' }}>
      <Inline css={{ gap: 'small' }}>
        <Box css={{ fontWeight: 'bold' }}>{displayTitle}</Box>
        <Box css={{ color: 'secondary' }}>{invoice.total} {invoice.currency}</Box>
      </Inline>

      <PipelineSteps status={invoice.status} />

      {isRejected && (
        <Box css={{ marginTop: 'xsmall' }}>
          {(invoice.anafErrorMessage || invoice.anafStatus) && (
            <Notice type="attention">
              {t('payment.anafError')}: {invoice.anafErrorMessage || invoice.anafStatus}
            </Notice>
          )}
          <Box css={{ marginTop: 'xsmall' }}>
            <Button
              type="primary"
              size="small"
              onPress={() => onRetry(invoice.id)}
              disabled={busy}
            >
              {busy ? t('payment.retrying') : t('payment.retryAnaf')}
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  )
}

const InvoiceDetailView = ({ userContext, environment }: ExtensionContextValue) => {
  const t = useT()
  const { loading: authLoading, authenticated, error: authError } = useAuth({ userContext })
  const [payment, setPayment] = useState<PaymentInfo | null>(null)
  const [linkedInvoice, setLinkedInvoice] = useState<Invoice | null>(null)
  const [invoiceChecked, setInvoiceChecked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null)

  const objectId = environment?.objectContext?.id as string | undefined

  useEffect(() => {
    if (authLoading) return
    if (!authenticated) {
      setLoading(false)
      return
    }
    if (!objectId) {
      setError(t('payment.notIdentified'))
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

        setPayment({
          amount: (pi.amount / 100).toFixed(2),
          currency: pi.currency.toUpperCase(),
          status: pi.status,
          customerName: customer?.name ?? null,
          customerEmail: customer?.email ?? null,
          description: pi.description ?? null,
          stripeInvoiceId: invoice?.id ?? null,
        })

        if (invoice?.id) {
          const linked = await fetchInvoiceByStripeId(invoice.id)
          setLinkedInvoice(linked)
        }
        setInvoiceChecked(true)
      } catch (e: any) {
        setError(e.message || t('payment.loadFailed'))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [objectId, authLoading, authenticated, t])

  const handleCreateInvoice = useCallback(async () => {
    if (!payment?.stripeInvoiceId) return

    setActionBusy(true)
    setActionMessage(null)

    try {
      const result = await createFromStripeInvoice(payment.stripeInvoiceId)
      setActionMessage({
        type: 'positive',
        text: t('payment.createSuccess', { number: result.invoiceNumber ?? '' }),
      })
      // Refresh the linked invoice
      const linked = await fetchInvoiceByStripeId(payment.stripeInvoiceId)
      setLinkedInvoice(linked)
    } catch (e: any) {
      setActionMessage({ type: 'negative', text: e.message })
    } finally {
      setActionBusy(false)
    }
  }, [payment, t])

  const handleRetry = useCallback(async (invoiceId: string) => {
    setActionBusy(true)
    setActionMessage(null)

    try {
      await retryInvoice(invoiceId)
      setActionMessage({ type: 'positive', text: t('payment.retrySuccess') })
      // Refresh
      if (payment?.stripeInvoiceId) {
        const linked = await fetchInvoiceByStripeId(payment.stripeInvoiceId)
        setLinkedInvoice(linked)
      }
    } catch (e: any) {
      setActionMessage({ type: 'negative', text: e.message })
    } finally {
      setActionBusy(false)
    }
  }, [payment, t])

  if (authLoading || loading) {
    return <LoadingView title={t('payment.title')} />
  }

  if (!authenticated) {
    return <NotConnectedView title={t('payment.title')} />
  }

  if (error || authError) {
    return <ErrorView title={t('payment.title')} message={error || authError || ''} />
  }

  const stripeStatusLabel =
    payment?.status === 'succeeded'
      ? t('stripe.status.succeeded')
      : payment?.status === 'processing'
        ? t('stripe.status.processing')
        : payment?.status ?? ''

  return (
    <ContextView title={t('payment.title')}>
      {payment && (
        <Box css={{ marginBottom: 'small' }}>
          <Inline css={{ gap: 'small' }}>
            <Box css={{ fontWeight: 'bold' }}>
              {payment.amount} {payment.currency}
            </Box>
            <Badge type={payment.status === 'succeeded' ? 'positive' : 'warning'}>
              {stripeStatusLabel}
            </Badge>
          </Inline>

          {payment.customerName && (
            <Inline css={{ gap: 'xsmall' }}>
              <Box css={{ color: 'secondary' }}>{t('payment.client')}:</Box>
              <Box>{payment.customerName}</Box>
            </Inline>
          )}

          {payment.customerEmail && (
            <Inline css={{ gap: 'xsmall' }}>
              <Box css={{ color: 'secondary' }}>{t('payment.email')}:</Box>
              <Box>{payment.customerEmail}</Box>
            </Inline>
          )}
        </Box>
      )}

      {actionMessage && (
        <Box css={{ marginBottom: 'small' }}>
          <Notice type={actionMessage.type}>{actionMessage.text}</Notice>
        </Box>
      )}

      <Divider />

      <Box css={{ fontWeight: 'bold', marginBottom: 'xsmall' }}>
        {t('payment.relatedInvoices')}
      </Box>

      {linkedInvoice ? (
        <InvoiceCard invoice={linkedInvoice} onRetry={handleRetry} busy={actionBusy} />
      ) : invoiceChecked ? (
        <Box>
          {!payment?.stripeInvoiceId ? (
            <Box css={{ color: 'secondary' }}>{t('payment.noStripeInvoice')}</Box>
          ) : (
            <>
              <Box css={{ color: 'secondary', marginBottom: 'small' }}>
                {t('payment.noInvoices')}
              </Box>
              <Button
                type="primary"
                onPress={handleCreateInvoice}
                disabled={actionBusy}
              >
                {actionBusy ? t('payment.creating') : t('payment.createInvoice')}
              </Button>
            </>
          )}
        </Box>
      ) : null}
    </ContextView>
  )
}

export default InvoiceDetailView
