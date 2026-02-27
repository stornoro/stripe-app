import { useState, useEffect, useCallback } from 'react'
import type { AppSettings } from '../types'
import { fetchSettings, updateSettings as apiUpdateSettings } from '../api/client'

interface UseSettingsResult {
  settings: AppSettings | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  updateSettings: (data: { defaultCompanyId?: string; autoMode?: boolean }) => Promise<void>
}

export function useSettings(authenticated: boolean): UseSettingsResult {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!authenticated) return

    setLoading(true)
    setError(null)

    try {
      const data = await fetchSettings()
      setSettings(data)
    } catch (e: any) {
      setError(e.message || 'Eroare la incarcarea setarilor')
    } finally {
      setLoading(false)
    }
  }, [authenticated])

  useEffect(() => {
    load()
  }, [load])

  const update = useCallback(async (data: { defaultCompanyId?: string; autoMode?: boolean }) => {
    setError(null)

    try {
      const result = await apiUpdateSettings(data)
      // Merge with existing settings
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              autoMode: result.autoMode,
              defaultCompanyId: result.defaultCompanyId,
            }
          : prev,
      )
    } catch (e: any) {
      setError(e.message || 'Eroare la salvarea setarilor')
      throw e
    }
  }, [])

  return {
    settings,
    loading,
    error,
    refresh: load,
    updateSettings: update,
  }
}
