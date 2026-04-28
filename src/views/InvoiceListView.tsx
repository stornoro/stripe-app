import {
  Box,
  ContextView,
  Inline,
  Badge,
  Divider,
  Notice,
  Button,
} from '@stripe/ui-extension-sdk/ui'
import type { ExtensionContextValue } from '@stripe/ui-extension-sdk/context'
import { useEffect, useState, useCallback } from 'react'
import { fetchDashboard, retryInvoice } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { useT } from '../i18n'
import { StatusBadge } from '../components/StatusBadge'
import { LoadingView, ErrorView, NotConnectedView } from '../components/ViewStates'
import type { DashboardStats, DashboardInvoice } from '../types'

function filterInvoices(invoices: DashboardInvoice[], tab: string): DashboardInvoice[] {
  if (tab === 'pending') {
    return invoices.filter((i) =>
      ['draft', 'issued', 'sent_to_anaf', 'sent_to_provider'].includes(i.status),
    )
  }
  if (tab === 'errors') {
    return invoices.filter((i) => i.status === 'rejected')
  }
  return invoices
}

function invoiceTitle(invoice: DashboardInvoice): string {
  if (invoice.invoiceNumber) return invoice.invoiceNumber
  if (invoice.receiverName) return invoice.receiverName
  return '#' + invoice.id.slice(-6)
}

function invoiceSubtitle(invoice: DashboardInvoice): string {
  const parts: string[] = []
  if (invoice.invoiceNumber && invoice.receiverName) parts.push(invoice.receiverName)
  if (invoice.issueDate) parts.push(invoice.issueDate)
  return parts.join(' · ')
}

function InvoiceRow({
  invoice,
  onRetry,
  retryingId,
}: {
  invoice: DashboardInvoice
  onRetry: (id: string) => void
  retryingId: string | null
}) {
  const t = useT()
  const title = invoiceTitle(invoice)
  const subtitle = invoiceSubtitle(invoice)
  const isRejected = invoice.status === 'rejected'
  const busy = retryingId === invoice.id

  return (
    <Box css={{ paddingY: 'small' }}>
      {/* @ts-expect-error justifyContent is a valid CSS prop, SDK token type is overly narrow */}
      <Inline css={{ gap: 'small', alignY: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Box css={{ fontWeight: 'bold' }}>{title}</Box>
          {subtitle && <Box css={{ color: 'secondary' }}>{subtitle}</Box>}
        </Box>
        <Inline css={{ gap: 'xsmall', alignY: 'center' }}>
          <Box>{invoice.total} {invoice.currency}</Box>
          <StatusBadge status={invoice.status} />
        </Inline>
      </Inline>
      {isRejected && (
        <Box css={{ marginTop: 'xsmall' }}>
          {invoice.anafErrorMessage && (
            <Box css={{ color: 'secondary' }}>{invoice.anafErrorMessage}</Box>
          )}
          <Box css={{ marginTop: 'xsmall' }}>
            <Button
              type="primary"
              size="small"
              onPress={() => onRetry(invoice.id)}
              disabled={busy}
            >
              {busy ? t('overview.retrying') : t('overview.retry')}
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  )
}

function InvoiceList({
  invoices,
  emptyKey,
  onRetry,
  retryingId,
}: {
  invoices: DashboardInvoice[]
  emptyKey: 'overview.empty' | 'overview.errorsEmpty' | 'overview.pendingEmpty'
  onRetry: (id: string) => void
  retryingId: string | null
}) {
  const t = useT()
  if (invoices.length === 0) {
    return (
      <Box css={{ paddingY: 'medium' }}>
        <Box css={{ color: 'secondary' }}>{t(emptyKey)}</Box>
      </Box>
    )
  }
  return (
    <Box>
      {invoices.map((invoice, idx) => (
        <Box key={invoice.id}>
          {idx > 0 && <Divider />}
          <InvoiceRow
            invoice={invoice}
            onRetry={onRetry}
            retryingId={retryingId}
          />
        </Box>
      ))}
    </Box>
  )
}

function CountCell({ value, label }: { value: number; label: string }) {
  return (
    <Box>
      <Box css={{ fontWeight: 'bold' }}>{value}</Box>
      <Box css={{ color: 'secondary' }}>{label}</Box>
    </Box>
  )
}

type TabKey = 'all' | 'pending' | 'errors'

const InvoiceListView = ({ userContext }: ExtensionContextValue) => {
  const t = useT()
  const { loading: authLoading, authenticated, error: authError } = useAuth({ userContext })
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [retryMessage, setRetryMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchDashboard()
      setStats(data)
    } catch (err: any) {
      setError(err.message || t('common.dataLoadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (authLoading) return
    if (!authenticated) {
      setLoading(false)
      return
    }
    load()
  }, [authLoading, authenticated, load])

  const handleRetry = useCallback(async (invoiceId: string) => {
    setRetryingId(invoiceId)
    setRetryMessage(null)
    try {
      await retryInvoice(invoiceId)
      setRetryMessage({ type: 'positive', text: t('payment.retrySuccess') })
      await load()
    } catch (e: any) {
      setRetryMessage({ type: 'negative', text: e.message })
    } finally {
      setRetryingId(null)
    }
  }, [load, t])

  if (authLoading || loading) {
    return <LoadingView title={t('overview.title')} />
  }

  if (!authenticated) {
    return <NotConnectedView title={t('overview.title')} />
  }

  if (error || authError) {
    return <ErrorView title={t('overview.title')} message={error || authError || ''} />
  }

  if (!stats) {
    return <ErrorView title={t('overview.title')} message={t('common.dataLoadFailed')} />
  }

  const { counts } = stats
  const allInvoices = stats.recentInvoices
  const pendingInvoices = filterInvoices(allInvoices, 'pending')
  const errorInvoices = filterInvoices(allInvoices, 'errors')

  const autoModeBadge = stats.autoMode
    ? { type: 'positive' as const, label: t('overview.autoModeOn') }
    : { type: 'neutral' as const, label: t('overview.autoModeOff') }

  return (
    <ContextView
      title={t('overview.title')}
      description={stats.companyName ?? undefined}
    >
      {retryMessage && (
        <Box css={{ marginBottom: 'small' }}>
          {/* @ts-expect-error description prop works at runtime */}
          <Notice type={retryMessage.type} description={retryMessage.text} />
        </Box>
      )}

      <Inline css={{ gap: 'small', marginBottom: 'medium' }}>
        <Badge type={autoModeBadge.type}>{autoModeBadge.label}</Badge>
      </Inline>

      <Inline css={{ gap: 'large', marginBottom: 'medium' }}>
        <CountCell value={counts.validated} label={t('overview.countsValidated')} />
        <CountCell value={counts.sent_to_anaf} label={t('overview.countsPending')} />
        <CountCell value={counts.rejected} label={t('overview.countsRejected')} />
        <CountCell value={counts.issued} label={t('overview.countsIssued')} />
        <CountCell value={counts.draft} label={t('overview.countsDraft')} />
      </Inline>

      <Divider />

      <Inline css={{ gap: 'xsmall', marginY: 'small' }}>
        <Button
          type={activeTab === 'all' ? 'primary' : 'secondary'}
          size="small"
          onPress={() => setActiveTab('all')}
        >
          {t('overview.tabAll')} ({allInvoices.length})
        </Button>
        <Button
          type={activeTab === 'pending' ? 'primary' : 'secondary'}
          size="small"
          onPress={() => setActiveTab('pending')}
        >
          {t('overview.tabPending')} ({pendingInvoices.length})
        </Button>
        <Button
          type={activeTab === 'errors' ? 'primary' : 'secondary'}
          size="small"
          onPress={() => setActiveTab('errors')}
        >
          {t('overview.tabErrors')} ({errorInvoices.length})
        </Button>
      </Inline>

      <Divider />

      {activeTab === 'all' && (
        <InvoiceList
          invoices={allInvoices}
          emptyKey="overview.empty"
          onRetry={handleRetry}
          retryingId={retryingId}
        />
      )}
      {activeTab === 'pending' && (
        <InvoiceList
          invoices={pendingInvoices}
          emptyKey="overview.pendingEmpty"
          onRetry={handleRetry}
          retryingId={retryingId}
        />
      )}
      {activeTab === 'errors' && (
        <InvoiceList
          invoices={errorInvoices}
          emptyKey="overview.errorsEmpty"
          onRetry={handleRetry}
          retryingId={retryingId}
        />
      )}
    </ContextView>
  )
}

export default InvoiceListView
