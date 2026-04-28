// Smoke tests for status-badge mapping logic extracted from StatusBadge.tsx.
// We test the mapping config directly rather than mounting the component,
// since mounting requires the full remote-ui renderer.

import { setLocale, t } from '../i18n'

const STATUS_CONFIG: Record<string, { labelKey: string }> = {
  draft: { labelKey: 'status.draft' },
  issued: { labelKey: 'status.issued' },
  sent_to_anaf: { labelKey: 'status.sent_to_anaf' },
  sent_to_provider: { labelKey: 'status.sent_to_anaf' },
  validated: { labelKey: 'status.validated' },
  rejected: { labelKey: 'status.rejected' },
  cancelled: { labelKey: 'status.cancelled' },
  paid: { labelKey: 'status.paid' },
  partially_paid: { labelKey: 'status.partially_paid' },
}

describe('status label mapping', () => {
  beforeEach(() => setLocale('en'))

  it('maps all expected statuses to non-empty labels', () => {
    for (const [status, { labelKey }] of Object.entries(STATUS_CONFIG)) {
      const label = t(labelKey as any)
      expect(label).toBeTruthy()
      expect(label).not.toBe(labelKey)
    }
  })

  it('sent_to_provider and sent_to_anaf both map to the same display label', () => {
    const a = t(STATUS_CONFIG['sent_to_provider'].labelKey as any)
    const b = t(STATUS_CONFIG['sent_to_anaf'].labelKey as any)
    expect(a).toBe(b)
  })

  it('rejected label differs from validated label', () => {
    const rej = t(STATUS_CONFIG['rejected'].labelKey as any)
    const val = t(STATUS_CONFIG['validated'].labelKey as any)
    expect(rej).not.toBe(val)
  })
})
