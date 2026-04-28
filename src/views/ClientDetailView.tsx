import {
  Box,
  ContextView,
  Inline,
  Badge,
  Divider,
  Notice,
  Link,
  Button,
} from '@stripe/ui-extension-sdk/ui'
import type { ExtensionContextValue } from '@stripe/ui-extension-sdk/context'
import { useEffect, useState } from 'react'
import Stripe from 'stripe'
import { createHttpClient, STRIPE_API_KEY } from '@stripe/ui-extension-sdk/http_client'
import { fetchInvoices, fetchClients } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { useT } from '../i18n'
import { StatusBadge } from '../components/StatusBadge'
import { LoadingView, ErrorView, NotConnectedView } from '../components/ViewStates'
import type { Invoice, Client } from '../types'

function invoiceTitle(invoice: Invoice): string {
  if (invoice.invoiceNumber) return invoice.invoiceNumber
  if (invoice.receiverName) return invoice.receiverName
  return '#' + invoice.id.slice(-6)
}

function invoiceSubtitle(invoice: Invoice): string {
  const parts: string[] = []
  if (invoice.issueDate) parts.push(invoice.issueDate)
  if (invoice.invoiceNumber && invoice.receiverName) parts.push(invoice.receiverName)
  return parts.join(' · ')
}

const ClientDetailView = ({ userContext, environment }: ExtensionContextValue) => {
  const t = useT()
  const { loading: authLoading, authenticated, error: authError } = useAuth({ userContext })
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [matchedClient, setMatchedClient] = useState<Client | null>(null)
  const [matchedBy, setMatchedBy] = useState<'cif' | 'email' | null>(null)
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
      setLoading(false)
      return
    }
    if (!customerId) {
      setError(t('client.notIdentified'))
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

        let matched: Client | null = null
        let by: 'cif' | 'email' | null = null

        if (taxId) {
          const clientResult = await fetchClients({ search: taxId })
          if (clientResult.data.length > 0) {
            matched = clientResult.data[0]
            by = 'cif'
          }
        }

        if (!matched && email) {
          const clientResult = await fetchClients({ search: email })
          if (clientResult.data.length > 0) {
            matched = clientResult.data[0]
            by = 'email'
          }
        }

        setMatchedClient(matched)
        setMatchedBy(by)

        // Fetch invoices by CIF or email
        const searchTerm = taxId || email || name
        if (searchTerm) {
          const invoiceData = await fetchInvoices({ search: searchTerm })
          setInvoices(invoiceData.data ?? [])
        }
      } catch (e: any) {
        setError(e.message || t('common.dataLoadFailed'))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [customerId, authLoading, authenticated, t])

  if (authLoading || loading) {
    return <LoadingView title={t('client.title')} />
  }

  if (!authenticated) {
    return <NotConnectedView title={t('client.title')} />
  }

  if (error || authError) {
    return <ErrorView title={t('client.title')} message={error || authError || ''} />
  }

  const stornoAppUrl = `https://app.storno.ro/clients/${matchedClient?.id}`

  return (
    <ContextView
      title={t('client.title')}
      description={
        customerInfo
          ? [customerInfo.name, customerInfo.email].filter(Boolean).join(' · ')
          : undefined
      }
    >
      {matchedClient ? (
        <Box css={{ marginBottom: 'small' }}>
          <Inline css={{ gap: 'small', marginBottom: 'xsmall' }}>
            <Box css={{ fontWeight: 'bold' }}>{t('client.matchedHeading')}</Box>
            <Badge type="positive">{t('client.matchedBadge')}</Badge>
          </Inline>

          <Inline css={{ gap: 'small' }}>
            <Box css={{ color: 'secondary' }}>{t('client.fieldName')}:</Box>
            <Box>{matchedClient.name}</Box>
          </Inline>

          {matchedClient.cif && (
            <Inline css={{ gap: 'small' }}>
              <Box css={{ color: 'secondary' }}>{t('client.fieldCif')}:</Box>
              <Box>{matchedClient.cif}</Box>
            </Inline>
          )}

          {matchedClient.email && (
            <Inline css={{ gap: 'small' }}>
              <Box css={{ color: 'secondary' }}>{t('client.fieldEmail')}:</Box>
              <Box>{matchedClient.email}</Box>
            </Inline>
          )}

          {matchedClient.address && (
            <Inline css={{ gap: 'small' }}>
              <Box css={{ color: 'secondary' }}>{t('client.fieldAddress')}:</Box>
              <Box>{matchedClient.address}</Box>
            </Inline>
          )}

          <Box css={{ marginTop: 'xsmall' }}>
            <Link href={stornoAppUrl} target="_blank" type="primary">
              {t('common.viewInStorno')}
            </Link>
          </Box>
        </Box>
      ) : customerInfo?.taxId ? (
        <Box css={{ marginBottom: 'small' }}>
          <Notice type="neutral">
            {t('client.noMatchByCif', { cif: customerInfo.taxId })}
          </Notice>
          <Box css={{ marginTop: 'xsmall' }}>
            <Link href="https://app.storno.ro/clients/new" target="_blank" type="primary">
              {t('client.createClient')}
            </Link>
          </Box>
        </Box>
      ) : customerInfo ? (
        <Box css={{ marginBottom: 'small' }}>
          <Notice type="neutral">{t('client.missingCifHint')}</Notice>
          <Box css={{ marginTop: 'xsmall' }}>
            <Link href="https://app.storno.ro/clients/new" target="_blank" type="primary">
              {t('client.createClient')}
            </Link>
          </Box>
        </Box>
      ) : null}

      <Divider />

      <Box css={{ fontWeight: 'bold', marginBottom: 'xsmall' }}>
        {t('client.invoicesHeading', { count: invoices.length })}
      </Box>

      {invoices.length === 0 ? (
        <Box css={{ color: 'secondary' }}>{t('client.noInvoices')}</Box>
      ) : (
        <Box>
          {invoices.map((invoice, idx) => {
            const title = invoiceTitle(invoice)
            const subtitle = invoiceSubtitle(invoice)
            return (
              <Box key={invoice.id}>
                {idx > 0 && <Divider />}
                <Box css={{ paddingY: 'small' }}>
                  {/* @ts-expect-error justifyContent is a valid CSS prop, SDK token type is overly narrow */}
                  <Inline css={{ gap: 'small', alignY: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Box css={{ fontWeight: 'bold' }}>{title}</Box>
                      {subtitle ? <Box css={{ color: 'secondary' }}>{subtitle}</Box> : null}
                    </Box>
                    <Inline css={{ gap: 'xsmall', alignY: 'center' }}>
                      <Box>{invoice.total} {invoice.currency}</Box>
                      <StatusBadge status={invoice.status} />
                    </Inline>
                  </Inline>
                </Box>
              </Box>
            )
          })}
        </Box>
      )}
    </ContextView>
  )
}

export default ClientDetailView
