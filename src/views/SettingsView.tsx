import {
  Box,
  Button,
  SettingsView as SettingsViewContainer,
  Divider,
  Inline,
  Badge,
  TextField,
  Select,
  Switch,
  Notice,
  Link,
} from '@stripe/ui-extension-sdk/ui'
import type { ExtensionContextValue } from '@stripe/ui-extension-sdk/context'
import { useState, useCallback } from 'react'
import {
  exchangeLinkingCode,
  disconnect as apiDisconnect,
  clearTokens,
} from '../api/client'
import { saveTokens, deleteTokens } from '../api/secretStore'
import { useAuth } from '../hooks/useAuth'
import { useSettings } from '../hooks/useSettings'

// Toggle for dev vs production
const LINK_URL = 'https://localhost:3000/stripe-link'
// const LINK_URL = 'https://app.storno.ro/stripe-link'

const SettingsView = ({ userContext, environment }: ExtensionContextValue) => {
  const {
    loading: authLoading,
    authenticated,
    error: authError,
    userId,
    stripeAccountId,
  } = useAuth({ userContext })

  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [justConnected, setJustConnected] = useState(false)
  const [justDisconnected, setJustDisconnected] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined)

  const isConnected = (authenticated || justConnected) && !justDisconnected
  const {
    settings,
    loading: settingsLoading,
    error: settingsError,
    updateSettings,
  } = useSettings(isConnected)

  const handleConnect = useCallback(async () => {
    if (!code.trim() || code.trim().length !== 6) {
      setError('Introdu un cod valid de 6 caractere.')
      return
    }

    setBusy(true)
    setError(null)
    setSuccess(null)

    try {
      const tokens = await exchangeLinkingCode(code.trim(), stripeAccountId)
      await saveTokens(userId, tokens)
      setJustConnected(true)
      setJustDisconnected(false)
      setCode('')
      setSuccess('Conectat cu succes!')
    } catch (e: any) {
      setError(e.message || 'Conectarea a esuat. Verifica codul.')
    } finally {
      setBusy(false)
    }
  }, [code, stripeAccountId, userId])

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
    // Settings are auto-saved on change, so this is a no-op
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
        {/* Connection status */}
        <Inline css={{ gap: 'medium' }}>
          <Box css={{ fontWeight: 'bold' }}>Status conexiune</Box>
          <Badge type={isConnected ? 'positive' : 'neutral'}>
            {isConnected ? 'Conectat' : 'Neconectat'}
          </Badge>
        </Inline>

        <Divider />

        {/* Errors & Success */}
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

        {/* Not connected: Linking code flow */}
        {!isConnected && (
          <Box>
            <Box css={{ marginBottom: 'medium' }}>
              Conecteaza contul tau Storno.ro pentru a genera automat
              e-Facturi din facturile Stripe.
            </Box>

            <Box css={{ marginBottom: 'medium' }}>
              <Box css={{ fontWeight: 'bold' }}>Pas 1: Obtine codul</Box>
              <Box css={{ marginTop: 'xsmall' }}>
                Deschide link-ul de mai jos si logheaza-te in Storno.ro.
                Vei primi un cod de 6 caractere.
              </Box>
              <Box css={{ marginTop: 'xsmall' }}>
                <Link href={LINK_URL} target="_blank" type="primary">
                  Deschide Storno.ro
                </Link>
              </Box>
            </Box>

            <Box>
              <Box css={{ fontWeight: 'bold' }}>Pas 2: Introdu codul</Box>
              <Box css={{ marginTop: 'xsmall' }}>
                <TextField
                  label="Cod de conectare"
                  placeholder="ABC123"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
              </Box>
              <Box css={{ marginTop: 'xsmall' }}>
                <Button
                  type="primary"
                  onPress={handleConnect}
                  disabled={busy || code.trim().length !== 6}
                >
                  {busy ? 'Se conecteaza...' : 'Conecteaza'}
                </Button>
              </Box>
            </Box>
          </Box>
        )}

        {/* Connected: Settings */}
        {isConnected && (
          <Box>
            {/* Company selector */}
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

            {/* Auto mode toggle */}
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

            {/* Disconnect */}
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
