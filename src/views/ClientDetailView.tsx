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
    <ContextView
      title="Storno.ro - Client"
      description={customerInfo ? `${customerInfo.name} (${customerInfo.email})` : undefined}
    >
      <Box css={{ padding: 'medium' }}>
        {/* Matched Storno.ro client info */}
        {matchedClient && (
          <Box>
            <Box css={{ fontWeight: 'bold' }}>Client Storno.ro</Box>
            <Inline css={{ gap: 'medium', marginTop: 'xsmall' }}>
              <Box>Nume:</Box>
              <Box>{matchedClient.name}</Box>
            </Inline>
            {matchedClient.cif && (
              <Inline css={{ gap: 'medium', marginTop: 'xsmall' }}>
                <Box>CIF:</Box>
                <Box>{matchedClient.cif}</Box>
              </Inline>
            )}
            {matchedClient.email && (
              <Inline css={{ gap: 'medium', marginTop: 'xsmall' }}>
                <Box>Email:</Box>
                <Box>{matchedClient.email}</Box>
              </Inline>
            )}
            {matchedClient.address && (
              <Inline css={{ gap: 'medium', marginTop: 'xsmall' }}>
                <Box>Adresa:</Box>
                <Box>{matchedClient.address}</Box>
              </Inline>
            )}
            <Box css={{ marginTop: 'xsmall' }}>
              <Badge type="positive">Potrivit</Badge>
            </Box>
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
        <Box css={{ fontWeight: 'bold', marginBottom: 'small' }}>
          Facturi ({invoices.length})
        </Box>

        {invoices.length === 0 ? (
          <Badge type="info">Nicio factura gasita pentru acest client</Badge>
        ) : (
          <List>
            {invoices.map((invoice) => {
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
                    <Box css={{ color: 'secondary' }}>{invoice.issueDate}</Box>
                  </Box>
                </ListItem>
              )
            })}
          </List>
        )}
      </Box>
    </ContextView>
  )
}

export default ClientDetailView
