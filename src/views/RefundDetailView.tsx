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
import { fetchRefundCreditNote, createCreditNoteFromRefund, retryInvoice } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { useT } from '../i18n'
import { StatusBadge } from '../components/StatusBadge'
import { LoadingView, ErrorView, NotConnectedView } from '../components/ViewStates'
import type { Invoice } from '../types'

const RefundDetailView = ({ userContext, environment }: ExtensionContextValue) => {
  const t = useT()
  const { loading: authLoading, authenticated, error: authError } = useAuth({ userContext })
  const [refundInfo, setRefundInfo] = useState<{
    id: string
    amount: string
    currency: string
    status: string
    reason: string | null
  } | null>(null)
  const [creditNote, setCreditNote] = useState<Invoice | null>(null)
  const [creditNoteChecked, setCreditNoteChecked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null)

  const stripeRefundId = environment?.objectContext?.id as string | undefined

  useEffect(() => {
    if (authLoading) return
    if (!authenticated) {
      setLoading(false)
      return
    }
    if (!stripeRefundId) {
      setError(t('refund.notIdentified'))
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

        const refund = await stripe.refunds.retrieve(stripeRefundId!)

        setRefundInfo({
          id: refund.id,
          amount: (refund.amount / 100).toFixed(2),
          currency: refund.currency.toUpperCase(),
          status: refund.status ?? 'unknown',
          reason: refund.reason ?? null,
        })

        const linked = await fetchRefundCreditNote(stripeRefundId!)
        setCreditNote(linked)
        setCreditNoteChecked(true)
      } catch (e: any) {
        setError(e.message || t('common.dataLoadFailed'))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [stripeRefundId, authLoading, authenticated, t])

  const handleCreateCreditNote = useCallback(async () => {
    if (!stripeRefundId) return

    setActionBusy(true)
    setActionMessage(null)

    try {
      const result = await createCreditNoteFromRefund(stripeRefundId)
      setActionMessage({
        type: 'positive',
        text: t('refund.createSuccess', { number: result.invoiceNumber ?? '' }),
      })
      setCreditNote(result)
    } catch (e: any) {
      // Check if this is a "no parent invoice" error
      const msg: string = e.message ?? ''
      if (msg.toLowerCase().includes('no storno') || msg.toLowerCase().includes('not found')) {
        setActionMessage({ type: 'negative', text: t('refund.noParentInvoice') })
      } else {
        setActionMessage({ type: 'negative', text: msg })
      }
    } finally {
      setActionBusy(false)
    }
  }, [stripeRefundId, t])

  const handleRetry = useCallback(async (invoiceId: string) => {
    setActionBusy(true)
    setActionMessage(null)

    try {
      await retryInvoice(invoiceId)
      setActionMessage({ type: 'positive', text: t('payment.retrySuccess') })
      if (stripeRefundId) {
        const linked = await fetchRefundCreditNote(stripeRefundId)
        setCreditNote(linked)
      }
    } catch (e: any) {
      setActionMessage({ type: 'negative', text: e.message })
    } finally {
      setActionBusy(false)
    }
  }, [stripeRefundId, t])

  if (authLoading || loading) {
    return <LoadingView title={t('refund.title')} />
  }

  if (!authenticated) {
    return <NotConnectedView title={t('refund.title')} />
  }

  if (error || authError) {
    return <ErrorView title={t('refund.title')} message={error || authError || ''} />
  }

  return (
    <ContextView title={t('refund.title')}>
      {refundInfo && (
        <Box css={{ marginBottom: 'small' }}>
          <Inline css={{ gap: 'small' }}>
            <Box css={{ fontWeight: 'bold' }}>
              -{refundInfo.amount} {refundInfo.currency}
            </Box>
            <Badge type={refundInfo.status === 'succeeded' ? 'positive' : 'neutral'}>
              {refundInfo.status}
            </Badge>
          </Inline>
          {refundInfo.reason && (
            <Box css={{ color: 'secondary' }}>{refundInfo.reason}</Box>
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
        {t('refund.linkedCreditNote')}
      </Box>

      {creditNote ? (
        <Box>
          <Inline css={{ gap: 'small' }}>
            <Box css={{ fontWeight: 'bold' }}>
              {creditNote.invoiceNumber || ('#' + creditNote.id.slice(-6))}
            </Box>
            <Box css={{ color: 'secondary' }}>
              {creditNote.total} {creditNote.currency}
            </Box>
          </Inline>

          <Box css={{ marginTop: 'xsmall' }}>
            <StatusBadge status={creditNote.status} />
          </Box>

          {creditNote.status === 'rejected' && (
            <Box css={{ marginTop: 'xsmall' }}>
              {(creditNote.anafErrorMessage || creditNote.anafStatus) && (
                <Notice type="attention">
                  {t('payment.anafError')}: {creditNote.anafErrorMessage || creditNote.anafStatus}
                </Notice>
              )}
              <Box css={{ marginTop: 'xsmall' }}>
                <Button
                  type="primary"
                  size="small"
                  onPress={() => handleRetry(creditNote.id)}
                  disabled={actionBusy}
                >
                  {actionBusy ? t('payment.retrying') : t('payment.retryAnaf')}
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      ) : creditNoteChecked ? (
        <Box>
          <Box css={{ color: 'secondary', marginBottom: 'small' }}>
            {t('refund.noCreditNote')}
          </Box>
          <Button
            type="primary"
            onPress={handleCreateCreditNote}
            disabled={actionBusy}
          >
            {actionBusy ? t('refund.creating') : t('refund.createCreditNote')}
          </Button>
        </Box>
      ) : null}
    </ContextView>
  )
}

export default RefundDetailView
