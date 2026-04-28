import {
  Box,
  ContextView,
  Inline,
  List,
  ListItem,
  Badge,
  Divider,
  Notice,
} from '@stripe/ui-extension-sdk/ui'
import type { ExtensionContextValue } from '@stripe/ui-extension-sdk/context'
import { useEffect, useState } from 'react'
import Stripe from 'stripe'
import { createHttpClient, STRIPE_API_KEY } from '@stripe/ui-extension-sdk/http_client'
import { fetchInvoices, fetchClients } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import type { Invoice, Client } from '../types'

const STATUS_BADGE: Record<string, { type: 'positive' | 'warning' | 'negative' | 'info' | 'neutral'; label: string }> = {
  draft: { type: 'neutral', label: 'Ciorna' },
  issued: { type: 'info', label: 'Emisa' },
  sent_to_anaf: { type: 'warning', label: 'Trimisa ANAF' },
  validated: { type: 'positive', label: 'Validata' },
  rejected: { type: 'negative', label: 'Respinsa' },
  paid: { type: 'positive', label: 'Platita' },
  partially_paid: { type: 'warning', label: 'Partial platita' },
}

function getStatusBadge(status: string) {
  return STATUS_BADGE[status] ?? { type: 'neutral' as const, label: status }
}

/** Returns a meaningful display title for an invoice row, falling back gracefully for drafts. */
function invoiceTitle(invoice: Invoice): string {
  if (invoice.invoiceNumber) return invoice.invoiceNumber
  if (invoice.receiverName) return invoice.receiverName
  return 'Ciorna #' + invoice.id.slice(-6)
}

/** Secondary subtitle line for an invoice row. */
function invoiceSubtitle(invoice: Invoice): string {
  const parts: string[] = []
  if (invoice.issueDate) parts.push(invoice.issueDate)
  if (invoice.invoiceNumber && invoice.receiverName) parts.push(invoice.receiverName)
  return parts.join(' • ')
}

const ClientDetailView = ({ userContext, environment }: ExtensionContextValue) => {
  const { loading: authLoading, authenticated, error: authError } = useAuth({ userContext })
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [matchedClient, setMatchedClient] = useState<Client | null>(null)
  const [customerInfo, setCustomerInfo] = useState<{
    name: string
    email: string
    taxId: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const customerId = environment?.objectContext?.id as string | undefined

  useEffect(() => {
    if (authLoading) return
    if (!authenticated) {
      setError('Nu esti conectat. Mergi la Setari pentru a conecta Storno.ro.')
      setLoading(false)
      return
    }
    if (!customerId) {
      setError('Nu s-a putut identifica clientul Stripe.')
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
        const customer = (await stripe.customers.retrieve(customerId!, {
          expand: ['tax_ids'],
        })) as Stripe.Customer

        const name = customer.name ?? ''
        const email = customer.email ?? ''

        // Extract Romanian tax ID (CIF) if available
        let taxId: string | null = null
        const taxIds = (customer as any).tax_ids?.data ?? []
        for (const tid of taxIds) {
          if (tid.type === 'eu_vat' && tid.value?.startsWith('RO')) {
            taxId = tid.value.substring(2)
            break
          }
          if (tid.type === 'ro_tin') {
            taxId = tid.value ?? null
            break
          }
        }

        setCustomerInfo({ name, email, taxId })

        // Try to match Storno.ro client by CIF first, then by email/name
        let matched: Client | null = null
        if (taxId) {
          const clientResult = await fetchClients({ search: taxId })
          if (clientResult.data.length > 0) {
            matched = clientResult.data[0]
          }
        }

        if (!matched && (email || name)) {
          const clientResult = await fetchClients({ search: email || name })
          if (clientResult.data.length > 0) {
            matched = clientResult.data[0]
          }
        }

        if (matched) {
          setMatchedClient(matched)
        }

        // Fetch invoices
        const searchTerm = taxId || name || email
        if (searchTerm) {
          const invoiceData = await fetchInvoices({ search: searchTerm })
          setInvoices(invoiceData.data ?? [])
        }
      } catch (e: any) {
        setError(e.message || 'Eroare la incarcarea datelor')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [customerId, authLoading, authenticated])

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

  return (
    <ContextView
      title="Storno.ro - Client"
      description={customerInfo ? `${customerInfo.name} (${customerInfo.email})` : undefined}
    >
      {/* Matched Storno.ro client info */}
      {matchedClient && (
        <Box css={{ marginBottom: 'small' }}>
          <Inline css={{ gap: 'small', marginBottom: 'xsmall' }}>
            <Box css={{ fontWeight: 'bold' }}>Client Storno.ro</Box>
            <Badge type="positive">Potrivit</Badge>
          </Inline>

          <Inline css={{ gap: 'small' }}>
            <Box css={{ color: 'secondary' }}>Nume:</Box>
            <Box>{matchedClient.name}</Box>
          </Inline>

          {matchedClient.cif && (
            <Inline css={{ gap: 'small' }}>
              <Box css={{ color: 'secondary' }}>CIF:</Box>
              <Box>{matchedClient.cif}</Box>
            </Inline>
          )}
          {matchedClient.email && (
            <Inline css={{ gap: 'small' }}>
              <Box css={{ color: 'secondary' }}>Email:</Box>
              <Box>{matchedClient.email}</Box>
            </Inline>
          )}
          {matchedClient.address && (
            <Inline css={{ gap: 'small' }}>
              <Box css={{ color: 'secondary' }}>Adresa:</Box>
              <Box>{matchedClient.address}</Box>
            </Inline>
          )}
        </Box>
      )}

      {!matchedClient && customerInfo?.taxId && (
        // @ts-expect-error title/description work at runtime but SDK types omit them
        <Notice type="neutral" title="Fara potrivire" description={`Niciun client Storno.ro gasit cu CIF ${customerInfo.taxId}`} />
      )}

      {!matchedClient && !customerInfo?.taxId && (
        // @ts-expect-error title/description work at runtime but SDK types omit them
        <Notice type="neutral" title="CIF lipsa" description="Clientul Stripe nu are un CIF/tax ID. Adauga un tax ID in Stripe pentru potrivire automata." />
      )}

      <Divider />

      {/* Invoice history */}
      <Box css={{ fontWeight: 'bold', marginBottom: 'xsmall' }}>
        Facturi ({invoices.length})
      </Box>

      {invoices.length === 0 ? (
        <Box css={{ color: 'secondary' }}>Nicio factura gasita pentru acest client.</Box>
      ) : (
        <List>
          {invoices.map((invoice) => {
            const badge = getStatusBadge(invoice.status)
            const title = invoiceTitle(invoice)
            const subtitle = invoiceSubtitle(invoice)
            return (
              <ListItem
                key={invoice.id}
                id={invoice.id}
                value={
                  <Inline css={{ gap: 'xsmall' }}>
                    <Box>{invoice.total} {invoice.currency}</Box>
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
          })}
        </List>
      )}
    </ContextView>
  )
}

export default ClientDetailView
