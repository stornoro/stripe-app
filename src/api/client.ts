import type { AuthTokens, Invoice, Client, AppSettings, DashboardStats } from '../types'
import { API_BASE } from '../config'
import { t } from '../i18n'
import type { TranslationKey } from '../i18n/en'

let currentTokens: AuthTokens | null = null

export function setTokens(tokens: AuthTokens) {
  currentTokens = tokens
}

export function getTokens(): AuthTokens | null {
  return currentTokens
}

export function clearTokens() {
  currentTokens = null
}

export function isAuthenticated(): boolean {
  return currentTokens !== null
}

// --- Error handling ---

const ERROR_KEYS = new Set<TranslationKey>([
  'error.unauthorized',
  'error.invalid_request',
  'error.invalid_grant',
  'error.unsupported_grant_type',
  'error.not_found',
  'error.forbidden',
  'error.no_company',
  'error.creation_failed',
  'error.retry_failed',
  'error.authorization_pending',
  'error.slow_down',
  'error.expired_token',
  'error.access_denied',
])

function extractError(body: Record<string, any>, status: number): string {
  // Prefer a localized message from a known error code over the backend's
  // free-text message (which is currently always Romanian).
  if (body.error) {
    const key = `error.${body.error}` as TranslationKey
    if (ERROR_KEYS.has(key)) return t(key)
  }
  if (body.message) return body.message
  if (body.error) return body.error
  return t('error.serverGeneric', { status })
}

async function safeFetch(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options)
  } catch {
    throw new Error(t('error.network'))
  }
}

async function throwApiError(response: Response): Promise<never> {
  const body = await response.json().catch(() => ({}))
  throw new Error(extractError(body, response.status))
}

// --- Core fetch ---

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!currentTokens) {
    throw new Error(t('error.unauthorized'))
  }

  const response = await safeFetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Stripe-App-Token': currentTokens.access_token,
      ...options.headers,
    },
  })

  if (response.status === 401) {
    const refreshed = await refreshToken()
    if (refreshed) {
      return apiFetch(path, options)
    }
    throw new Error(t('error.unauthorized'))
  }

  if (!response.ok) {
    await throwApiError(response)
  }

  return response.json()
}

async function refreshToken(): Promise<boolean> {
  if (!currentTokens?.refresh_token) return false

  try {
    const response = await safeFetch(`${API_BASE}/stripe-app/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: currentTokens.refresh_token,
      }),
    })

    if (!response.ok) return false

    const tokens: AuthTokens = await response.json()
    currentTokens = tokens
    return true
  } catch {
    return false
  }
}

// --- Auth ---

export async function exchangeJwtForTokens(
  jwt: string,
  stripeAccountId: string,
): Promise<AuthTokens> {
  const response = await safeFetch(`${API_BASE}/stripe-app/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: jwt,
      stripe_account_id: stripeAccountId,
    }),
  })

  if (!response.ok) {
    await throwApiError(response)
  }

  const tokens: AuthTokens = await response.json()
  currentTokens = tokens
  return tokens
}

export interface DeviceAuthorization {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete: string
  expires_in: number
  interval: number
}

export async function startDeviceAuthorization(
  stripeAccountId: string,
): Promise<DeviceAuthorization> {
  const response = await safeFetch(`${API_BASE}/stripe-app/oauth/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stripe_account_id: stripeAccountId }),
  })

  if (!response.ok) {
    await throwApiError(response)
  }

  return response.json()
}

export type DevicePollResult =
  | { kind: 'pending' }
  | { kind: 'slow_down' }
  | { kind: 'denied' }
  | { kind: 'expired' }
  | { kind: 'tokens'; tokens: AuthTokens }
  | { kind: 'error'; message: string }

export async function pollDeviceCode(
  deviceCode: string,
  stripeAccountId: string,
): Promise<DevicePollResult> {
  const response = await safeFetch(`${API_BASE}/stripe-app/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'device_code',
      device_code: deviceCode,
      stripe_account_id: stripeAccountId,
    }),
  })

  if (response.ok) {
    const tokens: AuthTokens = await response.json()
    currentTokens = tokens
    return { kind: 'tokens', tokens }
  }

  const body = await response.json().catch(() => ({}))
  switch (body?.error) {
    case 'authorization_pending': return { kind: 'pending' }
    case 'slow_down': return { kind: 'slow_down' }
    case 'access_denied': return { kind: 'denied' }
    case 'expired_token': return { kind: 'expired' }
    default: return { kind: 'error', message: extractError(body, response.status) }
  }
}

export async function disconnect(stripeAccountId: string): Promise<void> {
  const response = await safeFetch(`${API_BASE}/stripe-app/disconnect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(currentTokens ? { 'X-Stripe-App-Token': currentTokens.access_token } : {}),
    },
    body: JSON.stringify({ stripe_account_id: stripeAccountId }),
  })

  if (!response.ok) {
    await throwApiError(response)
  }

  clearTokens()
}

// --- Settings ---

export async function fetchSettings(): Promise<AppSettings> {
  return apiFetch('/stripe-app/settings')
}

export async function updateSettings(settings: {
  autoMode?: boolean
}): Promise<{ autoMode: boolean }> {
  return apiFetch('/stripe-app/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
}

// --- Dashboard ---

export async function fetchDashboard(): Promise<DashboardStats> {
  return apiFetch('/stripe-app/dashboard')
}

// --- Invoices ---

export async function fetchInvoices(params?: {
  page?: number
  search?: string
  companyId?: string
}): Promise<{ data: Invoice[]; total: number }> {
  const query = new URLSearchParams()
  if (params?.page) query.set('page', String(params.page))
  if (params?.search) query.set('search', params.search)

  const headers: Record<string, string> = {}
  if (params?.companyId) {
    headers['X-Company'] = params.companyId
  }

  return apiFetch(`/invoices?${query}`, { headers })
}

export async function fetchInvoice(
  id: string,
  companyId?: string,
): Promise<Invoice> {
  const headers: Record<string, string> = {}
  if (companyId) {
    headers['X-Company'] = companyId
  }

  return apiFetch(`/invoices/${id}`, { headers })
}

export async function createFromStripeInvoice(stripeInvoiceId: string): Promise<{
  id: string
  invoiceNumber: string
  status: string
}> {
  return apiFetch('/stripe-app/invoices/create-from-stripe', {
    method: 'POST',
    body: JSON.stringify({ stripeInvoiceId }),
  })
}

export async function retryInvoice(uuid: string): Promise<{
  id: string
  status: string
}> {
  return apiFetch(`/stripe-app/invoices/${uuid}/retry`, {
    method: 'POST',
  })
}

// --- Clients ---

export async function fetchClients(params?: {
  page?: number
  search?: string
  companyId?: string
}): Promise<{ data: Client[]; total: number }> {
  const query = new URLSearchParams()
  if (params?.page) query.set('page', String(params.page))
  if (params?.search) query.set('search', params.search)

  const headers: Record<string, string> = {}
  if (params?.companyId) {
    headers['X-Company'] = params.companyId
  }

  return apiFetch(`/clients?${query}`, { headers })
}
