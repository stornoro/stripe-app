import { Badge } from '@stripe/ui-extension-sdk/ui'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'

type BadgeType = 'positive' | 'warning' | 'negative' | 'info' | 'neutral'

const STATUS_CONFIG: Record<string, { type: BadgeType; labelKey: TranslationKey }> = {
  draft: { type: 'neutral', labelKey: 'status.draft' },
  issued: { type: 'info', labelKey: 'status.issued' },
  sent_to_anaf: { type: 'warning', labelKey: 'status.sent_to_anaf' },
  sent_to_provider: { type: 'warning', labelKey: 'status.sent_to_anaf' },
  validated: { type: 'positive', labelKey: 'status.validated' },
  rejected: { type: 'negative', labelKey: 'status.rejected' },
  cancelled: { type: 'neutral', labelKey: 'status.cancelled' },
  paid: { type: 'positive', labelKey: 'status.paid' },
  partially_paid: { type: 'warning', labelKey: 'status.partially_paid' },
}

interface StatusBadgeProps {
  status: string
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const t = useT()
  const config = STATUS_CONFIG[status]
  if (!config) {
    return <Badge type="neutral">{status}</Badge>
  }
  return <Badge type={config.type}>{t(config.labelKey)}</Badge>
}
