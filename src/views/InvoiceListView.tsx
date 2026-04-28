import {
  Box,
  ContextView,
  Inline,
  List,
  ListItem,
  Badge,
  Divider,
  Notice,
  Tab,
  TabPanel,
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
  if (invoice.issueDate) parts.push(invoice.issueDate)
  if (invoice.invoiceNumber && invoice.receiverName) parts.push(invoice.receiverName)
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
    <ListItem
      id={invoice.id}
      value={
        <Inline css={{ gap: 'xsmall' }}>
          <Box>{invoice.total} {invoice.currency}</Box>
          <StatusBadge status={invoice.status} />
        </Inline>
      }
    >
      <Box>
        <Box css={{ fontWeight: 'bold' }}>{title}</Box>
        {subtitle ? <Box css={{ color: 'secondary' }}>{subtitle}</Box> : null}
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
    </ListItem>
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
      <Box css={{ paddingY: 'small' }}>
        <Box css={{ color: 'secondary' }}>{t(emptyKey)}</Box>
      </Box>
    )
  }
  return (
    <List>
      {invoices.map((invoice) => (
        <InvoiceRow
          key={invoice.id}
          invoice={invoice}
          onRetry={onRetry}
          retryingId={retryingId}
        />
      ))}
    </List>
  )
}

const InvoiceListView = ({ userContext }: ExtensionContextValue) => {
  const t = useT()
  const { loading: authLoading, authenticated, error: authError } = useAuth({ userContext })
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [retryMessage, setRetryMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null)

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

  const descriptionParts: string[] = []
  if (stats.companyName) descriptionParts.push(stats.companyName)

  return (
    <ContextView
      title={t('overview.title')}
      description={descriptionParts.join(' — ') || undefined}
    >
      {retryMessage && (
        <Box css={{ marginBottom: 'small' }}>
          <Notice type={retryMessage.type}>{retryMessage.text}</Notice>
        </Box>
      )}

      {/* Auto-mode indicator + status counts */}
      <Inline css={{ gap: 'xsmall', marginBottom: 'small' }}>
        <Badge type={autoModeBadge.type}>{autoModeBadge.label}</Badge>
      </Inline>

      <Inline css={{ gap: 'medium', marginBottom: 'small' }}>
        <Box>
          <Box css={{ fontWeight: 'bold' }}>{counts.validated}</Box>
          <Box css={{ color: 'secondary' }}>{t('overview.countsValidated')}</Box>
        </Box>
        <Divider />
        <Box>
          <Box css={{ fontWeight: 'bold' }}>{counts.sent_to_anaf}</Box>
          <Box css={{ color: 'secondary' }}>{t('overview.countsPending')}</Box>
        </Box>
        <Divider />
        <Box>
          <Box css={{ fontWeight: 'bold' }}>{counts.rejected}</Box>
          <Box css={{ color: 'secondary' }}>{t('overview.countsRejected')}</Box>
        </Box>
        <Divider />
        <Box>
          <Box css={{ fontWeight: 'bold' }}>{counts.issued}</Box>
          <Box css={{ color: 'secondary' }}>{t('overview.countsIssued')}</Box>
        </Box>
        <Divider />
        <Box>
          <Box css={{ fontWeight: 'bold' }}>{counts.draft}</Box>
          <Box css={{ color: 'secondary' }}>{t('overview.countsDraft')}</Box>
        </Box>
      </Inline>

      <Tab key="all">{t('overview.tabAll')} ({allInvoices.length})</Tab>
      <Tab key="pending">{t('overview.tabPending')} ({pendingInvoices.length})</Tab>
      <Tab key="errors">{t('overview.tabErrors')} ({errorInvoices.length})</Tab>

      <TabPanel key="all">
        <InvoiceList
          invoices={allInvoices}
          emptyKey="overview.empty"
          onRetry={handleRetry}
          retryingId={retryingId}
        />
      </TabPanel>
      <TabPanel key="pending">
        <InvoiceList
          invoices={pendingInvoices}
          emptyKey="overview.pendingEmpty"
          onRetry={handleRetry}
          retryingId={retryingId}
        />
      </TabPanel>
      <TabPanel key="errors">
        <InvoiceList
          invoices={errorInvoices}
          emptyKey="overview.errorsEmpty"
          onRetry={handleRetry}
          retryingId={retryingId}
        />
      </TabPanel>
    </ContextView>
  )
}

export default InvoiceListView
