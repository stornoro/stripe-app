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

/** Returns a meaningful display title for an invoice row, falling back gracefully for drafts. */
function invoiceTitle(invoice: DashboardInvoice): string {
  if (invoice.invoiceNumber) return invoice.invoiceNumber
  if (invoice.receiverName) return invoice.receiverName
  return 'Ciorna #' + invoice.id.slice(-6)
}

/** Secondary line for an invoice row (date + name when name was used as title). */
function invoiceSubtitle(invoice: DashboardInvoice): string {
  const parts: string[] = []
  if (invoice.issueDate) parts.push(invoice.issueDate)
  // Show name only when it was NOT already used as the title
  if (invoice.invoiceNumber && invoice.receiverName) parts.push(invoice.receiverName)
  return parts.join(' • ')
}

function InvoiceRow({ invoice }: { invoice: DashboardInvoice }) {
  const badge = getStatusBadge(invoice.status)
  const title = invoiceTitle(invoice)
  const subtitle = invoiceSubtitle(invoice)
  const amountLabel = `${invoice.total} ${invoice.currency}`

  return (
    <ListItem
      key={invoice.id}
      id={invoice.id}
      value={
        <Inline css={{ gap: 'xsmall' }}>
          <Box>{amountLabel}</Box>
          <Badge type={badge.type}>{badge.label}</Badge>
        </Inline>
      }
    >
      <Box>
        <Box css={{ fontWeight: 'bold' }}>{title}</Box>
        {subtitle ? (
          <Box css={{ color: 'secondary' }}>{subtitle}</Box>
        ) : null}
      </Box>
    </ListItem>
  )
}

function InvoiceList({ invoices }: { invoices: DashboardInvoice[] }) {
  if (invoices.length === 0) {
    return (
      <Box css={{ paddingY: 'small' }}>
        <Box css={{ color: 'secondary' }}>Nicio factura gasita.</Box>
      </Box>
    )
  }
  return (
    <List>
      {invoices.map((invoice) => (
        <InvoiceRow key={invoice.id} invoice={invoice} />
      ))}
    </List>
  )
}

const InvoiceListView = ({ userContext }: ExtensionContextValue) => {
  const { loading: authLoading, authenticated, error: authError } = useAuth({ userContext })
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        <Box css={{ paddingY: 'medium' }}>
          <Box css={{ color: 'secondary' }}>Se incarca...</Box>
        </Box>
      </ContextView>
    )
  }

  if (error || authError) {
    return (
      <ContextView title="Storno.ro">
        <Box css={{ paddingY: 'medium' }}>
          {/* @ts-expect-error title/description work at runtime but SDK types omit them */}
          <Notice type="attention" title="Eroare" description={error || authError} />
        </Box>
      </ContextView>
    )
  }

  if (!stats) {
    return (
      <ContextView title="Storno.ro">
        <Box css={{ paddingY: 'medium' }}>
          {/* @ts-expect-error title/description work at runtime but SDK types omit them */}
          <Notice type="attention" title="Eroare" description="Nu s-au putut incarca datele" />
        </Box>
      </ContextView>
    )
  }

  const { counts } = stats
  const allInvoices = stats.recentInvoices
  const pendingInvoices = filterInvoices(allInvoices, 'pending')
  const errorInvoices = filterInvoices(allInvoices, 'errors')

  const modeLabel = stats.autoMode ? 'Mod automat' : 'Mod manual'
  const descriptionText = [stats.companyName, modeLabel].filter(Boolean).join(' — ')

  return (
    <ContextView
      title="Storno.ro"
      description={descriptionText || undefined}
    >
      {/* Status summary row */}
      <Inline css={{ gap: 'medium', marginBottom: 'small' }}>
        <Box>
          <Box css={{ fontWeight: 'bold' }}>{counts.validated}</Box>
          <Box css={{ color: 'secondary' }}>Validate</Box>
        </Box>
        <Divider />
        <Box>
          <Box css={{ fontWeight: 'bold' }}>{counts.sent_to_anaf}</Box>
          <Box css={{ color: 'secondary' }}>In curs</Box>
        </Box>
        <Divider />
        <Box>
          <Box css={{ fontWeight: 'bold' }}>{counts.rejected}</Box>
          <Box css={{ color: 'secondary' }}>Respinse</Box>
        </Box>
        <Divider />
        <Box>
          <Box css={{ fontWeight: 'bold' }}>{counts.issued}</Box>
          <Box css={{ color: 'secondary' }}>Emise</Box>
        </Box>
        <Divider />
        <Box>
          <Box css={{ fontWeight: 'bold' }}>{counts.draft}</Box>
          <Box css={{ color: 'secondary' }}>Ciorne</Box>
        </Box>
      </Inline>

      {/* Tabs — runtime pairs Tab[key] with TabPanel[key] and handles selection */}
      <Tab key="all">Toate ({allInvoices.length})</Tab>
      <Tab key="pending">In curs ({pendingInvoices.length})</Tab>
      <Tab key="errors">Erori ({errorInvoices.length})</Tab>

      <TabPanel key="all">
        <InvoiceList invoices={allInvoices} />
      </TabPanel>
      <TabPanel key="pending">
        <InvoiceList invoices={pendingInvoices} />
      </TabPanel>
      <TabPanel key="errors">
        <InvoiceList invoices={errorInvoices} />
      </TabPanel>
    </ContextView>
  )
}

export default InvoiceListView
