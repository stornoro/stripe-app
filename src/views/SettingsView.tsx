import {
  Box,
  Button,
  SettingsView as SettingsViewContainer,
  Divider,
  Inline,
  Badge,
  Select,
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

const SettingsView = ({ userContext }: ExtensionContextValue) => {
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
    // Open the popup *synchronously* on the click so browsers don't block it
    // for missing user gesture; navigate it once we have the verification URL.
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
      setError(e.message || 'Nu s-a putut initia autentificarea.')
      setBusy(false)
      return
    }

    setUserCode(auth.user_code)
    setVerificationUri(auth.verification_uri_complete)

    if (popup) {
      try { popup.location.href = auth.verification_uri_complete } catch { /* fall back to manual Link */ }
    }

    let interval = Math.max(2, auth.interval) * 1000
    const deadline = Date.now() + auth.expires_in * 1000

    const tick = async () => {
      if (cancelledRef.current) return

      if (Date.now() > deadline) {
        setError('Codul a expirat. Reincearca.')
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
          setSuccess('Conectat cu succes!')
          setUserCode(null)
          setVerificationUri(null)
          setBusy(false)
          return
        case 'denied':
          setError('Autorizarea a fost refuzata.')
          setBusy(false)
          setUserCode(null)
          setVerificationUri(null)
          return
        case 'expired':
          setError('Codul a expirat. Reincearca.')
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
  }, [stripeAccountId, userId])

  const handleCancelConnect = useCallback(() => {
    stopPolling()
    setBusy(false)
    setUserCode(null)
    setVerificationUri(null)
    setError(null)
  }, [stopPolling])

  const handleDisconnect = useCallback(async () => {
    setBusy(true)
    setError(null)
    setSuccess(null)

    try {
      await apiDisconnect(stripeAccountId)
      await deleteTokens(userId)
      clearTokens()
      setJustDisconnected(true)
      setJustConnected(false)
      setSuccess(null)
    } catch (e: any) {
      setError(e.message || 'Deconectarea a esuat.')
    } finally {
      setBusy(false)
    }
  }, [stripeAccountId, userId])

  const handleCompanyChange = useCallback(
    async (e: { target: { value: string } }) => {
      try {
        await updateSettings({ defaultCompanyId: e.target.value })
        setStatusMessage('Salvat')
        setTimeout(() => setStatusMessage(undefined), 2000)
      } catch {
        // Error handled in hook
      }
    },
    [updateSettings],
  )

  const handleAutoModeChange = useCallback(
    async (e: { target: { checked: boolean } }) => {
      try {
        await updateSettings({ autoMode: e.target.checked })
        setStatusMessage('Salvat')
        setTimeout(() => setStatusMessage(undefined), 2000)
      } catch {
        // Error handled in hook
      }
    },
    [updateSettings],
  )

  const handleSave = useCallback(() => {
    setStatusMessage('Salvat')
    setTimeout(() => setStatusMessage(undefined), 2000)
  }, [])

  if (authLoading) {
    return (
      <SettingsViewContainer onSave={handleSave}>
        <Box css={{ padding: 'large' }}>
          <Box>Se incarca...</Box>
        </Box>
      </SettingsViewContainer>
    )
  }

  return (
    <SettingsViewContainer onSave={handleSave} statusMessage={statusMessage}>
      <Box css={{ padding: 'medium' }}>
        <Inline css={{ gap: 'medium' }}>
          <Box css={{ fontWeight: 'bold' }}>Status conexiune</Box>
          <Badge type={isConnected ? 'positive' : 'neutral'}>
            {isConnected ? 'Conectat' : 'Neconectat'}
          </Badge>
        </Inline>

        <Divider />

        {(error || authError || settingsError) && (
          <Box css={{ marginBottom: 'small' }}>
            {/* @ts-expect-error title/description work at runtime but SDK types omit them */}
            <Notice type="negative" title="Eroare" description={error || authError || settingsError} />
          </Box>
        )}
        {success && (
          <Box css={{ marginBottom: 'small' }}>
            {/* @ts-expect-error title/description work at runtime but SDK types omit them */}
            <Notice type="positive" title="Succes" description={success} />
          </Box>
        )}

        {!isConnected && !userCode && (
          <Box>
            <Box css={{ marginBottom: 'medium' }}>
              Conecteaza contul tau Storno.ro pentru a genera automat
              e-Facturi din facturile Stripe.
            </Box>
            <Button
              type="primary"
              onPress={handleConnect}
              disabled={busy}
            >
              {busy ? 'Se initiaza...' : 'Conecteaza Storno.ro'}
            </Button>
          </Box>
        )}

        {!isConnected && userCode && verificationUri && (
          <Box>
            <Box css={{ marginBottom: 'small' }}>
              Codul tau de autorizare:
            </Box>
            <Box css={{
              fontFamily: 'monospace',
              fontWeight: 'bold',
              marginBottom: 'medium',
            }}>
              {userCode}
            </Box>
            <Box css={{ marginBottom: 'small' }}>
              Daca fereastra Storno.ro nu s-a deschis automat:
            </Box>
            <Box css={{ marginBottom: 'medium' }}>
              <Link href={verificationUri} target="_blank" type="primary">
                Deschide Storno.ro pentru autorizare
              </Link>
            </Box>
            <Box css={{ marginBottom: 'small' }}>
              Asteptam confirmarea ta in fereastra Storno.ro...
            </Box>
            <Button onPress={handleCancelConnect}>
              Anuleaza
            </Button>
          </Box>
        )}

        {isConnected && (
          <Box>
            {settings && settings.companies.length > 0 && (
              <Box css={{ marginBottom: 'medium' }}>
                <Select
                  label="Companie implicita"
                  value={settings.defaultCompanyId ?? ''}
                  onChange={handleCompanyChange}
                >
                  <option value="">Selecteaza compania</option>
                  {settings.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.cif})
                    </option>
                  ))}
                </Select>
              </Box>
            )}

            {settingsLoading && (
              <Box css={{ padding: 'small' }}>Se incarca setarile...</Box>
            )}

            {settings && (
              <Box css={{ marginBottom: 'medium' }}>
                <Inline css={{ gap: 'medium' }}>
                  <Box>
                    <Box css={{ fontWeight: 'bold' }}>Mod automat</Box>
                    <Box css={{ color: 'secondary' }}>
                      Creeaza si trimite automat e-Factura la ANAF
                    </Box>
                  </Box>
                  <Switch
                    checked={settings.autoMode}
                    onChange={handleAutoModeChange}
                  />
                </Inline>
              </Box>
            )}

            <Divider />

            <Box css={{ marginTop: 'medium' }}>
              <Button
                type="destructive"
                onPress={handleDisconnect}
                disabled={busy}
              >
                {busy ? 'Se deconecteaza...' : 'Deconecteaza'}
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    </SettingsViewContainer>
  )
}

export default SettingsView
