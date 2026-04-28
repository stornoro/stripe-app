import {
  Box,
  ContextView,
  Inline,
  Badge,
  Divider,
  Button,
  Notice,
} from '@stripe/ui-extension-sdk/ui'
import type { ExtensionContextValue } from '@stripe/ui-extension-sdk/context'
import { useEffect, useState, useCallback } from 'react'
import Stripe from 'stripe'
import { createHttpClient, STRIPE_API_KEY } from '@stripe/ui-extension-sdk/http_client'
import { fetchSubscriptionInvoices, createSubscriptionInvoice } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { useT } from '../i18n'
import { StatusBadge } from '../components/StatusBadge'
import { LoadingView, ErrorView, NotConnectedView } from '../components/ViewStates'
import type { SubscriptionCycle } from '../types'

function formatPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return '—'
  if (start && end) return `${start} – ${end}`
  return start || end || '—'
}

function CycleRow({
  cycle,
  onCreateInvoice,
  creatingId,
  successId,
}: {
  cycle: SubscriptionCycle
  onCreateInvoice: (stripeInvoiceId: string) => void
  creatingId: string | null
  successId: string | null
}) {
  const t = useT()
  const busy = creatingId === cycle.stripeInvoiceId
  const created = successId === cycle.stripeInvoiceId

  const stornoValue = cycle.stornoInvoice ? (
    <StatusBadge status={cycle.stornoInvoice.status} />
  ) : (
    <Badge type="neutral">{t('subscription.notInvoiced')}</Badge>
  )

  return (
    <Box css={{ paddingY: 'small' }}>
      {/* @ts-expect-error justifyContent is a valid CSS prop, SDK token type is overly narrow */}
      <Inline css={{ gap: 'small', alignY: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Box css={{ fontWeight: 'bold' }}>
            {formatPeriod(cycle.stripePeriodStart, cycle.stripePeriodEnd)}
          </Box>
          <Inline css={{ gap: 'xsmall' }}>
            <Box css={{ color: 'secondary' }}>
              {cycle.stripeAmount.toFixed(2)} {cycle.stripeCurrency}
            </Box>
            <Badge type={cycle.stripeStatus === 'paid' ? 'positive' : 'neutral'}>
              {cycle.stripeStatus}
            </Badge>
          </Inline>
        </Box>
        <Box>{stornoValue}</Box>
      </Inline>

      {cycle.stornoInvoice ? (
        <Box css={{ color: 'secondary' }}>
          {cycle.stornoInvoice.invoiceNumber || ('#' + cycle.stornoInvoice.id.slice(-6))}
        </Box>
      ) : !busy && !created ? (
        <Box css={{ marginTop: 'xsmall' }}>
          <Button
            type="primary"
            size="small"
            onPress={() => onCreateInvoice(cycle.stripeInvoiceId)}
            disabled={!!creatingId}
          >
            {t('subscription.createInvoice')}
          </Button>
        </Box>
      ) : busy ? (
        <Box css={{ color: 'secondary' }}>{t('subscription.creating')}</Box>
      ) : null}
    </Box>
  )
}

const SubscriptionDetailView = ({ userContext, environment }: ExtensionContextValue) => {
  const t = useT()
  const { loading: authLoading, authenticated, error: authError } = useAuth({ userContext })
  const [subscriptionInfo, setSubscriptionInfo] = useState<{
    id: string
    status: string
    customerName: string | null
    planName: string | null
    amount: number
    currency: string
    interval: string
  } | null>(null)
  const [cycles, setCycles] = useState<SubscriptionCycle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creatingId, setCreatingId] = useState<string | null>(null)
  const [successId, setSuccessId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null)

  const stripeSubscriptionId = environment?.objectContext?.id as string | undefined

  useEffect(() => {
    if (authLoading) return
    if (!authenticated) {
      setLoading(false)
      return
    }
    if (!stripeSubscriptionId) {
      setError(t('subscription.notIdentified'))
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

        const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId!, {
          expand: ['customer'],
        })

        const customer = sub.customer as Stripe.Customer | null
        const firstItem = sub.items.data[0]
        // We don't expand items.data.price.product — that requires the
        // product_read permission. Fall back to price.nickname for plan name.
        setSubscriptionInfo({
          id: sub.id,
          status: sub.status,
          customerName: customer?.name ?? null,
          planName: firstItem?.price?.nickname ?? null,
          amount: (firstItem?.price?.unit_amount ?? 0) / 100,
          currency: (firstItem?.price?.currency ?? 'RON').toUpperCase(),
          interval: firstItem?.price?.recurring?.interval ?? '',
        })

        const cyclesData = await fetchSubscriptionInvoices(stripeSubscriptionId!)
        setCycles(cyclesData)
      } catch (e: any) {
        setError(e.message || t('common.dataLoadFailed'))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [stripeSubscriptionId, authLoading, authenticated, t])

  const handleCreateInvoice = useCallback(async (stripeInvoiceId: string) => {
    if (!stripeSubscriptionId) return

    setCreatingId(stripeInvoiceId)
    setActionMessage(null)

    try {
      const result = await createSubscriptionInvoice(stripeSubscriptionId, stripeInvoiceId)
      setActionMessage({
        type: 'positive',
        text: t('subscription.createSuccess', { number: result.invoiceNumber ?? '' }),
      })
      setSuccessId(stripeInvoiceId)
      // Refresh cycles
      const updated = await fetchSubscriptionInvoices(stripeSubscriptionId)
      setCycles(updated)
    } catch (e: any) {
      setActionMessage({ type: 'negative', text: e.message })
    } finally {
      setCreatingId(null)
    }
  }, [stripeSubscriptionId, t])

  if (authLoading || loading) {
    return <LoadingView title={t('subscription.title')} />
  }

  if (!authenticated) {
    return <NotConnectedView title={t('subscription.title')} />
  }

  if (error || authError) {
    return <ErrorView title={t('subscription.title')} message={error || authError || ''} />
  }

  const descriptionParts: string[] = []
  if (subscriptionInfo?.customerName) descriptionParts.push(subscriptionInfo.customerName)
  if (subscriptionInfo?.planName) descriptionParts.push(subscriptionInfo.planName)

  return (
    <ContextView
      title={t('subscription.title')}
      description={descriptionParts.join(' · ') || undefined}
    >
      {subscriptionInfo && (
        <Box css={{ marginBottom: 'small' }}>
          <Inline css={{ gap: 'small' }}>
            <Box css={{ fontWeight: 'bold' }}>
              {subscriptionInfo.amount.toFixed(2)} {subscriptionInfo.currency}
              {subscriptionInfo.interval ? ` / ${subscriptionInfo.interval}` : ''}
            </Box>
            <Badge type={subscriptionInfo.status === 'active' ? 'positive' : 'neutral'}>
              {subscriptionInfo.status}
            </Badge>
          </Inline>
        </Box>
      )}

      {actionMessage && (
        <Box css={{ marginBottom: 'small' }}>
          <Notice type={actionMessage.type}>{actionMessage.text}</Notice>
        </Box>
      )}

      <Divider />

      <Box css={{ fontWeight: 'bold', marginBottom: 'xsmall' }}>
        {t('subscription.cyclesHeading')}
      </Box>

      {cycles.length === 0 ? (
        <Box css={{ color: 'secondary' }}>{t('subscription.noCycles')}</Box>
      ) : (
        <Box>
          {cycles.map((cycle, idx) => (
            <Box key={cycle.stripeInvoiceId}>
              {idx > 0 && <Divider />}
              <CycleRow
                cycle={cycle}
                onCreateInvoice={handleCreateInvoice}
                creatingId={creatingId}
                successId={successId}
              />
            </Box>
          ))}
        </Box>
      )}
    </ContextView>
  )
}

export default SubscriptionDetailView
