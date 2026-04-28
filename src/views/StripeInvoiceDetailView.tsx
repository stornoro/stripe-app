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
import { fetchInvoiceByStripeId, createFromStripeInvoice, retryInvoice } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { useT } from '../i18n'
import { StatusBadge } from '../components/StatusBadge'
import { LoadingView, ErrorView, NotConnectedView } from '../components/ViewStates'
import type { Invoice } from '../types'

const STATUS_PIPELINE = ['draft', 'issued', 'sent_to_anaf', 'validated']

function getStepIndex(status: string): number {
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
        if (isRejected && i === STEP_LABELS.length - 1) {
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

const StripeInvoiceDetailView = ({ userContext, environment }: ExtensionContextValue) => {
  const t = useT()
  const { loading: authLoading, authenticated, error: authError } = useAuth({ userContext })
  const [stripeInvoiceInfo, setStripeInvoiceInfo] = useState<{
    id: string
    number: string | null
    amount: string
    currency: string
    status: string
    customerName: string | null
  } | null>(null)
  const [linkedInvoice, setLinkedInvoice] = useState<Invoice | null>(null)
  const [invoiceChecked, setInvoiceChecked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null)

  const stripeInvoiceId = environment?.objectContext?.id as string | undefined

  useEffect(() => {
    if (authLoading) return
    if (!authenticated) {
      setLoading(false)
      return
    }
    if (!stripeInvoiceId) {
      setError(t('stripeInvoice.notIdentified'))
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

        const inv = await stripe.invoices.retrieve(stripeInvoiceId!, {
          expand: ['customer'],
        })

        const customer = inv.customer as Stripe.Customer | null

        setStripeInvoiceInfo({
          id: inv.id,
          number: inv.number ?? null,
          amount: (inv.amount_due / 100).toFixed(2),
          currency: inv.currency.toUpperCase(),
          status: inv.status ?? 'unknown',
          customerName: customer?.name ?? null,
        })

        const linked = await fetchInvoiceByStripeId(stripeInvoiceId!)
        setLinkedInvoice(linked)
        setInvoiceChecked(true)
      } catch (e: any) {
        setError(e.message || t('common.dataLoadFailed'))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [stripeInvoiceId, authLoading, authenticated, t])

  const handleCreateInvoice = useCallback(async () => {
    if (!stripeInvoiceId) return

    setActionBusy(true)
    setActionMessage(null)

    try {
      const result = await createFromStripeInvoice(stripeInvoiceId)
      setActionMessage({
        type: 'positive',
        text: t('stripeInvoice.createSuccess', { number: result.invoiceNumber ?? '' }),
      })
      const linked = await fetchInvoiceByStripeId(stripeInvoiceId)
      setLinkedInvoice(linked)
    } catch (e: any) {
      setActionMessage({ type: 'negative', text: e.message })
    } finally {
      setActionBusy(false)
    }
  }, [stripeInvoiceId, t])

  const handleRetry = useCallback(async (invoiceId: string) => {
    setActionBusy(true)
    setActionMessage(null)

    try {
      await retryInvoice(invoiceId)
      setActionMessage({ type: 'positive', text: t('payment.retrySuccess') })
      if (stripeInvoiceId) {
        const linked = await fetchInvoiceByStripeId(stripeInvoiceId)
        setLinkedInvoice(linked)
      }
    } catch (e: any) {
      setActionMessage({ type: 'negative', text: e.message })
    } finally {
      setActionBusy(false)
    }
  }, [stripeInvoiceId, t])

  if (authLoading || loading) {
    return <LoadingView title={t('stripeInvoice.title')} />
  }

  if (!authenticated) {
    return <NotConnectedView title={t('stripeInvoice.title')} />
  }

  if (error || authError) {
    return <ErrorView title={t('stripeInvoice.title')} message={error || authError || ''} />
  }

  const stripeStatusLabel = (status: string) => {
    switch (status) {
      case 'paid': return t('stripe.invoice.status.paid')
      case 'open': return t('stripe.invoice.status.open')
      case 'void': return t('stripe.invoice.status.void')
      case 'draft': return t('stripe.invoice.status.draft')
      default: return status
    }
  }

  return (
    <ContextView title={t('stripeInvoice.title')}>
      {stripeInvoiceInfo && (
        <Box css={{ marginBottom: 'small' }}>
          <Inline css={{ gap: 'small' }}>
            <Box css={{ fontWeight: 'bold' }}>
              {stripeInvoiceInfo.amount} {stripeInvoiceInfo.currency}
            </Box>
            <Badge type={stripeInvoiceInfo.status === 'paid' ? 'positive' : 'neutral'}>
              {stripeStatusLabel(stripeInvoiceInfo.status)}
            </Badge>
          </Inline>
          {stripeInvoiceInfo.customerName && (
            <Box css={{ color: 'secondary' }}>{stripeInvoiceInfo.customerName}</Box>
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
        {t('stripeInvoice.linkedInvoice')}
      </Box>

      {linkedInvoice ? (
        <Box>
          <Inline css={{ gap: 'small' }}>
            <Box css={{ fontWeight: 'bold' }}>
              {linkedInvoice.invoiceNumber || ('#' + linkedInvoice.id.slice(-6))}
            </Box>
            <Box css={{ color: 'secondary' }}>
              {linkedInvoice.total} {linkedInvoice.currency}
            </Box>
          </Inline>

          <PipelineSteps status={linkedInvoice.status} />

          {linkedInvoice.status === 'rejected' && (
            <Box css={{ marginTop: 'xsmall' }}>
              {(linkedInvoice.anafErrorMessage || linkedInvoice.anafStatus) && (
                <Notice type="attention">
                  {t('payment.anafError')}: {linkedInvoice.anafErrorMessage || linkedInvoice.anafStatus}
                </Notice>
              )}
              <Box css={{ marginTop: 'xsmall' }}>
                <Button
                  type="primary"
                  size="small"
                  onPress={() => handleRetry(linkedInvoice.id)}
                  disabled={actionBusy}
                >
                  {actionBusy ? t('payment.retrying') : t('payment.retryAnaf')}
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      ) : invoiceChecked ? (
        <Box>
          <Box css={{ color: 'secondary', marginBottom: 'small' }}>
            {t('stripeInvoice.noInvoice')}
          </Box>
          <Button
            type="primary"
            onPress={handleCreateInvoice}
            disabled={actionBusy}
          >
            {actionBusy ? t('stripeInvoice.creating') : t('stripeInvoice.createInvoice')}
          </Button>
        </Box>
      ) : null}
    </ContextView>
  )
}

export default StripeInvoiceDetailView
