import {
  Box,
  ContextView,
  Inline,
  List,
  ListItem,
  Badge,
  Notice,
  Tab,
  TabPanel,
} from '@stripe/ui-extension-sdk/ui'
import type { ExtensionContextValue } from '@stripe/ui-extension-sdk/context'
import { useEffect, useState } from 'react'
import { fetchDashboard } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import type { DashboardStats, DashboardInvoice } from '../types'

const STATUS_BADGE: Record<string, { type: 'positive' | 'warning' | 'negative' | 'info' | 'neutral'; label: string }> = {
  draft: { type: 'neutral', label: 'Ciorna' },
  issued: { type: 'info', label: 'Emisa' },
  sent_to_anaf: { type: 'warning', label: 'Trimisa ANAF' },
  validated: { type: 'positive', label: 'Validata' },
  rejected: { type: 'negative', label: 'Respinsa' },
  cancelled: { type: 'neutral', label: 'Anulata' },
  paid: { type: 'positive', label: 'Platita' },
  partially_paid: { type: 'warning', label: 'Partial platita' },
}

function getStatusBadge(status: string) {
  return STATUS_BADGE[status] ?? { type: 'neutral' as const, label: status }
}

function filterInvoices(invoices: DashboardInvoice[], tab: string): DashboardInvoice[] {
  if (tab === 'pending') {
    return invoices.filter((i) =>
      ['draft', 'issued', 'sent_to_anaf'].includes(i.status),
    )
  }
  if (tab === 'errors') {
    return invoices.filter((i) => i.status === 'rejected')
  }
  return invoices
}

const InvoiceListView = ({ userContext }: ExtensionContextValue) => {
  const { loading: authLoading, authenticated, error: authError } = useAuth({ userContext })
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'errors'>('all')

  useEffect(() => {
    if (authLoading) return
    if (!authenticated) {
      setError('Nu esti conectat. Mergi la Setari pentru a conecta Storno.ro.')
      setLoading(false)
      return
    }

    async function load() {
      try {
        const data = await fetchDashboard()
        setStats(data)
      } catch (err: any) {
        setError(err.message || 'Eroare la incarcarea datelor')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [authLoading, authenticated])

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

  if (!stats) {
    return (
      <ContextView title="Storno.ro">
        <Box css={{ padding: 'large' }}>
          {/* @ts-expect-error title/description work at runtime but SDK types omit them */}
          <Notice type="attention" title="Eroare" description="Nu s-au putut incarca datele" />
        </Box>
      </ContextView>
    )
  }

  const { counts } = stats
  const filteredInvoices = filterInvoices(stats.recentInvoices, activeTab)
  const pendingCount = filterInvoices(stats.recentInvoices, 'pending').length
  const errorsCount = filterInvoices(stats.recentInvoices, 'errors').length

  return (
    <ContextView
      title="Storno.ro"
      description={stats.companyName ?? undefined}
    >
      <Box css={{ padding: 'small' }}>
        {/* Status count badges */}
        <Inline css={{ gap: 'small' }}>
          <Badge type="positive">Validate: {counts.validated}</Badge>
          <Badge type="warning">In curs: {counts.sent_to_anaf}</Badge>
          <Badge type="negative">Respinse: {counts.rejected}</Badge>
          <Badge type="info">Emise: {counts.issued}</Badge>
          <Badge type="neutral">Ciorne: {counts.draft}</Badge>
        </Inline>

        {/* Auto mode indicator */}
        <Box css={{ marginTop: 'small' }}>
          <Badge type={stats.autoMode ? 'positive' : 'neutral'}>
            {stats.autoMode ? 'Mod automat: ON' : 'Mod manual'}
          </Badge>
        </Box>

        {/* Tab filter buttons */}
        <Box css={{ marginTop: 'medium' }}>
          <Inline css={{ gap: 'small' }}>
            <Badge
              type={activeTab === 'all' ? 'info' : 'neutral'}
            >
              Toate ({stats.recentInvoices.length})
            </Badge>
            <Badge
              type={activeTab === 'pending' ? 'warning' : 'neutral'}
            >
              In curs ({pendingCount})
            </Badge>
            <Badge
              type={activeTab === 'errors' ? 'negative' : 'neutral'}
            >
              Erori ({errorsCount})
            </Badge>
          </Inline>
        </Box>

        {/* Invoice list */}
        <Box css={{ marginTop: 'small' }}>
          {filteredInvoices.length === 0 ? (
            <Box css={{ padding: 'medium' }}>
              <Badge type="info">Nicio factura gasita</Badge>
            </Box>
          ) : (
            <List onAction={(id) => {
              if (id === 'tab_all') setActiveTab('all')
              else if (id === 'tab_pending') setActiveTab('pending')
              else if (id === 'tab_errors') setActiveTab('errors')
            }}>
              {filteredInvoices.map((invoice) => {
                const badge = getStatusBadge(invoice.status)
                return (
                  <ListItem
                    key={invoice.id}
                    id={invoice.id}
                    value={
                      <Inline css={{ gap: 'small' }}>
                        <Box>{invoice.total} {invoice.currency}</Box>
                        <Badge type={badge.type}>{badge.label}</Badge>
                      </Inline>
                    }
                  >
                    <Box>
                      <Box css={{ fontWeight: 'bold' }}>{invoice.invoiceNumber}</Box>
                      <Box css={{ color: 'secondary' }}>
                        {invoice.receiverName ?? ''} {invoice.issueDate ? `• ${invoice.issueDate}` : ''}
                      </Box>
                    </Box>
                  </ListItem>
                )
              })}
            </List>
          )}
        </Box>
      </Box>
    </ContextView>
  )
}

export default InvoiceListView
