import { useState, useEffect } from 'react'
import type { ExtensionContextValue } from '@stripe/ui-extension-sdk/context'
import { setTokens, getTokens, clearTokens, isAuthenticated, fetchSettings } from '../api/client'
import { loadTokens, saveTokens, deleteTokens } from '../api/secretStore'

interface UseAuthResult {
  loading: boolean
  authenticated: boolean
  error: string | null
  userId: string
  stripeAccountId: string
}

export function useAuth({ userContext }: Pick<ExtensionContextValue, 'userContext'>): UseAuthResult {
  const [loading, setLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const userId = userContext?.id ?? ''
  const stripeAccountId = userContext?.account?.id ?? ''

  useEffect(() => {
    // Don't run until the Stripe SDK provides the user context
    if (!userId) return

    let cancelled = false
    let done = false

    async function init() {
      // Already have tokens in memory — verify they still work
      if (isAuthenticated()) {
        try {
          await fetchSettings()
          // fetchSettings may have triggered a token refresh internally;
          // persist the (possibly refreshed) tokens back to Secret Store
          const fresh = getTokens()
          if (fresh) await saveTokens(userId, fresh).catch(() => {})
          if (!cancelled) {
            setAuthenticated(true)
            setLoading(false)
          }
          done = true
          return
        } catch {
          // Tokens in memory are stale, clear and try Secret Store
          clearTokens()
        }
      }

      // Try to load from Secret Store
      try {
        const tokens = await loadTokens(userId)
        if (tokens && !cancelled) {
          setTokens(tokens)

          // Validate tokens against backend
          try {
            await fetchSettings()
            // Re-save in case a token refresh happened during the fetch
            const fresh = getTokens()
            if (fresh) await saveTokens(userId, fresh).catch(() => {})
            if (!cancelled) {
              setAuthenticated(true)
            }
          } catch {
            // Tokens expired and refresh failed — clean up
            clearTokens()
            await deleteTokens(userId).catch(() => {})
          }
        }
      } catch {
        // No stored tokens or Secret Store error
      }

      if (!cancelled) {
        setLoading(false)
      }
      done = true
    }

    // Timeout safety net — only fires if init hasn't completed
    const timeout = setTimeout(() => {
      if (!cancelled && !done) {
        setLoading(false)
      }
    }, 10000)

    init()

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [userId])

  return {
    loading,
    authenticated: authenticated || isAuthenticated(),
    error,
    userId,
    stripeAccountId,
  }
}
