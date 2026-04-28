import {
  setTokens,
  getTokens,
  clearTokens,
  isAuthenticated,
  fetchSettings,
  fetchDashboard,
  fetchInvoiceByStripeId,
  fetchRefundCreditNote,
  fetchSubscriptionInvoices,
  createCreditNoteFromRefund,
  retryInvoice,
} from '../api/client'
import type { AuthTokens } from '../types'

const MOCK_TOKENS: AuthTokens = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  token_type: 'Bearer',
  expires_in: 3600,
}

// Capture fetch calls
let fetchMock: jest.Mock

beforeEach(() => {
  clearTokens()
  fetchMock = jest.fn()
  ;(global as any).fetch = fetchMock
})

afterEach(() => {
  clearTokens()
})

function makeOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response
}

function makeErrorResponse(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    json: async () => body,
  } as unknown as Response
}

// ── token helpers ────────────────────────────────────────────────────────────

describe('token helpers', () => {
  it('starts unauthenticated', () => {
    expect(isAuthenticated()).toBe(false)
    expect(getTokens()).toBeNull()
  })

  it('setTokens / getTokens / clearTokens round-trip', () => {
    setTokens(MOCK_TOKENS)
    expect(isAuthenticated()).toBe(true)
    expect(getTokens()).toEqual(MOCK_TOKENS)
    clearTokens()
    expect(isAuthenticated()).toBe(false)
  })
})

// ── fetchSettings ────────────────────────────────────────────────────────────

describe('fetchSettings', () => {
  it('sends X-Stripe-App-Token header and returns parsed body', async () => {
    setTokens(MOCK_TOKENS)

    const mockSettings = {
      autoMode: false,
      company: { id: 'cmp-1', name: 'Acme SRL', cif: '12345678' },
      locale: 'ro',
      connectedUser: { email: 'user@example.com', name: 'Test User', connectedAt: '2024-01-01T00:00:00Z' },
    }

    fetchMock.mockResolvedValueOnce(makeOkResponse(mockSettings))

    const result = await fetchSettings()

    expect(result).toEqual(mockSettings)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toContain('/stripe-app/settings')
    expect((opts as RequestInit).headers).toMatchObject({
      'X-Stripe-App-Token': 'test-access-token',
    })
  })

  it('throws when not authenticated', async () => {
    await expect(fetchSettings()).rejects.toThrow()
  })

  it('throws on 401 when refresh also fails', async () => {
    setTokens(MOCK_TOKENS)

    // First call → 401, then refresh → fail
    fetchMock
      .mockResolvedValueOnce(makeErrorResponse(401, { error: 'unauthorized' }))
      .mockResolvedValueOnce(makeErrorResponse(401, { error: 'invalid_grant' }))

    await expect(fetchSettings()).rejects.toThrow()
  })
})

// ── fetchDashboard ────────────────────────────────────────────────────────────

describe('fetchDashboard', () => {
  it('returns dashboard stats', async () => {
    setTokens(MOCK_TOKENS)

    const mockStats = {
      counts: { draft: 1, issued: 2, sent_to_anaf: 3, validated: 4, rejected: 0, total: 10 },
      recentInvoices: [],
      autoMode: true,
      companyName: 'Acme SRL',
    }

    fetchMock.mockResolvedValueOnce(makeOkResponse(mockStats))

    const result = await fetchDashboard()
    expect(result.counts.sent_to_anaf).toBe(3)
    expect(result.autoMode).toBe(true)
  })
})

// ── fetchInvoiceByStripeId ───────────────────────────────────────────────────

describe('fetchInvoiceByStripeId', () => {
  it('returns invoice when linked', async () => {
    setTokens(MOCK_TOKENS)

    const mockInvoice = {
      id: 'inv-uuid',
      invoiceNumber: 'FACT-001',
      issueDate: '2024-01-15',
      total: '1190.00',
      currency: 'RON',
      receiverName: 'Client SRL',
      status: 'validated',
      anafStatus: null,
      anafErrorMessage: null,
    }

    fetchMock.mockResolvedValueOnce(makeOkResponse({ invoice: mockInvoice }))

    const result = await fetchInvoiceByStripeId('in_stripe123')
    expect(result).toEqual(mockInvoice)
    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('/stripe-app/invoices-by-stripe/in_stripe123')
  })

  it('returns null when no linked invoice', async () => {
    setTokens(MOCK_TOKENS)
    fetchMock.mockResolvedValueOnce(makeOkResponse({ invoice: null }))
    const result = await fetchInvoiceByStripeId('in_stripe_none')
    expect(result).toBeNull()
  })
})

// ── fetchRefundCreditNote ────────────────────────────────────────────────────

describe('fetchRefundCreditNote', () => {
  it('returns null when no credit note exists', async () => {
    setTokens(MOCK_TOKENS)
    fetchMock.mockResolvedValueOnce(makeOkResponse({ creditNote: null }))
    const result = await fetchRefundCreditNote('re_abc')
    expect(result).toBeNull()
  })

  it('calls correct endpoint', async () => {
    setTokens(MOCK_TOKENS)
    fetchMock.mockResolvedValueOnce(makeOkResponse({ creditNote: null }))
    await fetchRefundCreditNote('re_abc123')
    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('/stripe-app/refunds/re_abc123')
  })
})

// ── createCreditNoteFromRefund ───────────────────────────────────────────────

describe('createCreditNoteFromRefund', () => {
  it('posts to credit-note endpoint', async () => {
    setTokens(MOCK_TOKENS)

    const mockCreditNote = {
      id: 'cn-uuid',
      invoiceNumber: 'STORNO-001',
      issueDate: '2024-01-20',
      total: '-1190.00',
      currency: 'RON',
      receiverName: 'Client SRL',
      status: 'draft',
      anafStatus: null,
    }

    fetchMock.mockResolvedValueOnce({ ...makeOkResponse(mockCreditNote), status: 201 })

    const result = await createCreditNoteFromRefund('re_xyz')
    expect(result.invoiceNumber).toBe('STORNO-001')
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toContain('/stripe-app/refunds/re_xyz/create-credit-note')
    expect((opts as RequestInit).method).toBe('POST')
  })
})

// ── fetchSubscriptionInvoices ────────────────────────────────────────────────

describe('fetchSubscriptionInvoices', () => {
  it('returns subscription cycles', async () => {
    setTokens(MOCK_TOKENS)

    const mockCycles = [
      {
        stripeInvoiceId: 'in_sub_1',
        stripePeriodStart: '2024-01-01',
        stripePeriodEnd: '2024-01-31',
        stripeAmount: 100,
        stripeCurrency: 'RON',
        stripeStatus: 'paid',
        stornoInvoice: null,
      },
    ]

    fetchMock.mockResolvedValueOnce(makeOkResponse({ invoices: mockCycles }))

    const result = await fetchSubscriptionInvoices('sub_abc')
    expect(result).toHaveLength(1)
    expect(result[0].stripeInvoiceId).toBe('in_sub_1')
    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('/stripe-app/subscriptions/sub_abc/invoices')
  })
})

// ── retryInvoice ─────────────────────────────────────────────────────────────

describe('retryInvoice', () => {
  it('posts to retry endpoint', async () => {
    setTokens(MOCK_TOKENS)
    fetchMock.mockResolvedValueOnce(makeOkResponse({ id: 'inv-uuid', status: 'sent_to_anaf' }))
    const result = await retryInvoice('inv-uuid')
    expect(result.status).toBe('sent_to_anaf')
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toContain('/stripe-app/invoices/inv-uuid/retry')
    expect((opts as RequestInit).method).toBe('POST')
  })
})
