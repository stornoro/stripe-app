import {
  Box,
  Button,
  SettingsView as SettingsViewContainer,
  Divider,
  Inline,
  Badge,
  Switch,
  Notice,
  Link,
} from '@stripe/ui-extension-sdk/ui'
import type { ExtensionContextValue } from '@stripe/ui-extension-sdk/context'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  startDeviceAuthorization,
  pollDeviceCode,
  disconnect as apiDisconnect,
  clearTokens,
} from '../api/client'
import { saveTokens, deleteTokens } from '../api/secretStore'
import { useAuth } from '../hooks/useAuth'
import { useSettings } from '../hooks/useSettings'
import { useT } from '../i18n'

const SettingsView = ({ userContext }: ExtensionContextValue) => {
  const t = useT()
  const {
    loading: authLoading,
    authenticated,
    error: authError,
    userId,
    stripeAccountId,
  } = useAuth({ userContext })

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [justConnected, setJustConnected] = useState(false)
  const [justDisconnected, setJustDisconnected] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined)
  const [userCode, setUserCode] = useState<string | null>(null)
  const [verificationUri, setVerificationUri] = useState<string | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelledRef = useRef(false)

  const isConnected = (authenticated || justConnected) && !justDisconnected
  const {
    settings,
    loading: settingsLoading,
    error: settingsError,
    updateSettings,
  } = useSettings(isConnected)

  const stopPolling = useCallback(() => {
    cancelledRef.current = true
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  const handleConnect = useCallback(async () => {
    const popup = window.open('', '_blank')

    setBusy(true)
    setError(null)
    setSuccess(null)
    setUserCode(null)
    setVerificationUri(null)
    cancelledRef.current = false

    let auth
    try {
      auth = await startDeviceAuthorization(stripeAccountId)
    } catch (e: any) {
      if (popup) popup.close()
      setError(e.message || t('settings.startFailed'))
      setBusy(false)
      return
    }

    setUserCode(auth.user_code)
    setVerificationUri(auth.verification_uri_complete)

    if (popup) {
      try { popup.location.href = auth.verification_uri_complete } catch { /* fall back to Link */ }
    }

    let interval = Math.max(2, auth.interval) * 1000
    const deadline = Date.now() + auth.expires_in * 1000

    const tick = async () => {
      if (cancelledRef.current) return

      if (Date.now() > deadline) {
        setError(t('settings.codeExpired'))
        setBusy(false)
        setUserCode(null)
        setVerificationUri(null)
        return
      }

      const result = await pollDeviceCode(auth.device_code, stripeAccountId)
      if (cancelledRef.current) return

      switch (result.kind) {
        case 'tokens':
          await saveTokens(userId, result.tokens).catch(() => {})
          setJustConnected(true)
          setJustDisconnected(false)
          setSuccess(t('settings.connectSuccess'))
          setUserCode(null)
          setVerificationUri(null)
          setBusy(false)
          return
        case 'denied':
          setError(t('error.access_denied'))
          setBusy(false)
          setUserCode(null)
          setVerificationUri(null)
          return
        case 'expired':
          setError(t('settings.codeExpired'))
          setBusy(false)
          setUserCode(null)
          setVerificationUri(null)
          return
        case 'slow_down':
          interval += 1000
          break
        case 'error':
          setError(result.message)
          setBusy(false)
          setUserCode(null)
          setVerificationUri(null)
          return
        case 'pending':
        default:
          break
      }

      pollTimerRef.current = setTimeout(tick, interval)
    }

    pollTimerRef.current = setTimeout(tick, interval)
  }, [stripeAccountId, userId, t])

  const handleCancelConnect = useCallback(() => {
    stopPolling()
    setBusy(false)
    setUserCode(null)
    setVerificationUri(null)
    setError(null)
  }, [stopPolling])

  const handleDisconnectConfirm = useCallback(() => {
    setConfirmDisconnect(true)
  }, [])

  const handleDisconnectCancel = useCallback(() => {
    setConfirmDisconnect(false)
  }, [])

  const handleDisconnect = useCallback(async () => {
    setBusy(true)
    setError(null)
    setSuccess(null)
    setConfirmDisconnect(false)

    try {
      await apiDisconnect(stripeAccountId)
      await deleteTokens(userId)
      clearTokens()
      setJustDisconnected(true)
      setJustConnected(false)
      setSuccess(null)
    } catch (e: any) {
      setError(e.message || t('settings.disconnectFailed'))
    } finally {
      setBusy(false)
    }
  }, [stripeAccountId, userId, t])

  const handleAutoModeChange = useCallback(
    async (e: { target: { checked: boolean } }) => {
      try {
        await updateSettings({ autoMode: e.target.checked })
        setStatusMessage(t('common.saved'))
        setTimeout(() => setStatusMessage(undefined), 2000)
      } catch {
        // Error is held by the hook in settingsError
      }
    },
    [updateSettings, t],
  )

  const handleSave = useCallback(() => {
    setStatusMessage(t('common.saved'))
    setTimeout(() => setStatusMessage(undefined), 2000)
  }, [t])

  if (authLoading) {
    return (
      <SettingsViewContainer onSave={handleSave}>
        <Box css={{ paddingY: 'medium' }}>
          <Box css={{ color: 'secondary' }}>{t('common.loading')}</Box>
        </Box>
      </SettingsViewContainer>
    )
  }

  return (
    <SettingsViewContainer onSave={handleSave} statusMessage={statusMessage}>
      <Box css={{ paddingY: 'small' }}>
        <Inline css={{ gap: 'small', marginBottom: 'small' }}>
          <Box css={{ fontWeight: 'bold' }}>{t('settings.connectionStatus')}</Box>
          <Badge type={isConnected ? 'positive' : 'neutral'}>
            {isConnected ? t('settings.connected') : t('settings.disconnected')}
          </Badge>
        </Inline>

        <Divider />

        {(error || authError || settingsError) && (
          <Box css={{ marginBottom: 'small' }}>
            <Notice type="attention">{error || authError || settingsError}</Notice>
          </Box>
        )}

        {success && (
          <Box css={{ marginBottom: 'small' }}>
            <Notice type="positive">{success}</Notice>
          </Box>
        )}

        {/* Disconnect confirm prompt */}
        {confirmDisconnect && (
          <Box css={{ marginBottom: 'small' }}>
            <Notice type="attention">{t('settings.disconnectConfirmBody')}</Notice>
            <Inline css={{ gap: 'small', marginTop: 'small' }}>
              <Button type="destructive" onPress={handleDisconnect} disabled={busy}>
                {busy ? t('settings.disconnecting') : t('settings.disconnect')}
              </Button>
              <Button onPress={handleDisconnectCancel}>
                {t('settings.cancel')}
              </Button>
            </Inline>
          </Box>
        )}

        {/* Connection flow: not connected, no active code */}
        {!isConnected && !userCode && !confirmDisconnect && (
          <Box>
            <Box css={{ marginBottom: 'small' }}>
              {t('settings.connectIntro')}
            </Box>
            <Button
              type="primary"
              onPress={handleConnect}
              disabled={busy}
            >
              {busy ? t('settings.starting') : t('settings.connectButton')}
            </Button>
          </Box>
        )}

        {/* Connection flow: showing user code */}
        {!isConnected && userCode && verificationUri && (
          <Box>
            <Box css={{ marginBottom: 'xsmall' }}>
              {t('settings.codeLabel')}
            </Box>
            <Box css={{ fontWeight: 'bold', marginBottom: 'small' }}>
              {userCode}
            </Box>
            <Box css={{ marginBottom: 'xsmall' }}>
              {t('settings.fallbackPrompt')}
            </Box>
            <Box css={{ marginBottom: 'small' }}>
              <Link href={verificationUri} target="_blank" type="primary">
                {t('settings.openStorno')}
              </Link>
            </Box>
            <Box css={{ marginBottom: 'small', color: 'secondary' }}>
              {t('settings.waitingApproval')}
            </Box>
            <Button onPress={handleCancelConnect}>
              {t('settings.cancel')}
            </Button>
          </Box>
        )}

        {/* Connected state */}
        {isConnected && !confirmDisconnect && (
          <Box>
            {settingsLoading && (
              <Box css={{ color: 'secondary', marginBottom: 'small' }}>
                {t('settings.loadingSettings')}
              </Box>
            )}

            {settings && (
              <Box>
                {/* Company */}
                <Box css={{ marginBottom: 'small' }}>
                  <Box css={{ color: 'secondary' }}>{t('settings.companyLabel')}</Box>
                  <Box css={{ fontWeight: 'bold' }}>
                    {settings.company.name}
                  </Box>
                  {settings.company.cif && (
                    <Box css={{ color: 'secondary' }}>CIF: {settings.company.cif}</Box>
                  )}
                </Box>

                {/* Who authorized + when */}
                {settings.connectedUser && (
                  <Box css={{ marginBottom: 'small' }}>
                    <Box css={{ color: 'secondary' }}>{t('settings.authorizedBy')}</Box>
                    <Box>{settings.connectedUser.name || settings.connectedUser.email}</Box>
                    {settings.connectedUser.connectedAt && (
                      <Box css={{ color: 'secondary' }}>
                        {t('settings.connectedOn')}: {new Date(settings.connectedUser.connectedAt).toLocaleDateString()}
                      </Box>
                    )}
                  </Box>
                )}

                <Divider />

                {/* Auto mode */}
                <Box css={{ marginTop: 'small', marginBottom: 'small' }}>
                  <Inline css={{ gap: 'medium' }}>
                    <Box>
                      <Box css={{ fontWeight: 'bold' }}>{t('settings.autoModeTitle')}</Box>
                      <Box css={{ color: 'secondary' }}>
                        {t('settings.autoModeDescription')}
                      </Box>
                    </Box>
                    <Switch
                      checked={settings.autoMode}
                      onChange={handleAutoModeChange}
                    />
                  </Inline>
                </Box>

                <Divider />

                <Box css={{ marginTop: 'small' }}>
                  <Button
                    type="destructive"
                    onPress={handleDisconnectConfirm}
                    disabled={busy}
                  >
                    {t('settings.disconnect')}
                  </Button>
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </SettingsViewContainer>
  )
}

export default SettingsView
