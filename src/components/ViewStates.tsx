import { Box, ContextView, Notice } from '@stripe/ui-extension-sdk/ui'
import { useT } from '../i18n'

interface LoadingViewProps {
  title?: string
}

export function LoadingView({ title = 'Storno.ro' }: LoadingViewProps) {
  const t = useT()
  return (
    <ContextView title={title}>
      <Box css={{ paddingY: 'medium' }}>
        <Box css={{ color: 'secondary' }}>{t('common.loading')}</Box>
      </Box>
    </ContextView>
  )
}

interface ErrorViewProps {
  title?: string
  message: string
}

export function ErrorView({ title = 'Storno.ro', message }: ErrorViewProps) {
  const t = useT()
  return (
    <ContextView title={title}>
      <Box css={{ paddingY: 'medium' }}>
        <Notice type="attention">{t('common.error')}: {message}</Notice>
      </Box>
    </ContextView>
  )
}

interface NotConnectedViewProps {
  title?: string
}

export function NotConnectedView({ title = 'Storno.ro' }: NotConnectedViewProps) {
  const t = useT()
  return (
    <ContextView title={title}>
      <Box css={{ paddingY: 'medium' }}>
        <Notice type="attention">{t('common.notConnected')}</Notice>
      </Box>
    </ContextView>
  )
}
