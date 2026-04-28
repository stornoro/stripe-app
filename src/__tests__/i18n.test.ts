import { t, setLocale, getLocale } from '../i18n'

describe('i18n', () => {
  afterEach(() => {
    // Reset to detected locale between tests
    setLocale('en')
  })

  it('defaults to en when navigator.language is undefined', () => {
    expect(getLocale()).toBe('en')
  })

  it('setLocale switches dictionary', () => {
    setLocale('ro')
    expect(getLocale()).toBe('ro')
    expect(t('common.loading')).toBe('Se incarca...')
    setLocale('en')
    expect(t('common.loading')).toBe('Loading...')
  })

  it('t() interpolates variables', () => {
    setLocale('en')
    expect(t('error.serverGeneric', { status: 500 })).toBe('Server error (500)')
  })

  it('t() falls back to key when neither dict has it', () => {
    // This would only happen if a key is missing — the TS type system prevents it,
    // but the runtime guard should still work.
    const result = (t as any)('nonexistent.key')
    expect(result).toBe('nonexistent.key')
  })

  it('status keys are defined in both locales', () => {
    const statusKeys = [
      'status.draft',
      'status.issued',
      'status.sent_to_anaf',
      'status.validated',
      'status.rejected',
      'status.cancelled',
    ] as const

    for (const key of statusKeys) {
      setLocale('en')
      const en = t(key)
      expect(en).not.toBe(key)

      setLocale('ro')
      const ro = t(key)
      expect(ro).not.toBe(key)
      expect(ro).not.toBe(en)
    }
  })

  it('overview keys exist in both locales', () => {
    const keys = [
      'overview.autoModeOn',
      'overview.autoModeOff',
      'overview.tabAll',
      'overview.tabErrors',
      'overview.tabPending',
      'overview.countsValidated',
      'overview.countsRejected',
    ] as const

    for (const key of keys) {
      setLocale('en')
      expect(t(key)).not.toBe('')

      setLocale('ro')
      expect(t(key)).not.toBe('')
    }
  })

  it('refund and subscription keys exist in both locales', () => {
    const keys = [
      'refund.linkedCreditNote',
      'refund.noCreditNote',
      'refund.createCreditNote',
      'subscription.cyclesHeading',
      'subscription.notInvoiced',
      'subscription.createInvoice',
    ] as const

    for (const key of keys) {
      setLocale('en')
      expect(t(key)).not.toBe(key)

      setLocale('ro')
      expect(t(key)).not.toBe(key)
    }
  })

  it('setLocale is idempotent when same locale is set twice', () => {
    setLocale('ro')
    const first = getLocale()
    setLocale('ro')
    expect(getLocale()).toBe(first)
  })

  it('setLocale accepts ro- locale codes (e.g. ro-RO)', () => {
    setLocale('ro-RO')
    expect(getLocale()).toBe('ro')
  })
})
