import { useState, useEffect, useCallback } from 'react'
import type { AppSettings } from '../types'
import { fetchSettings, updateSettings as apiUpdateSettings } from '../api/client'
import { setLocale, t } from '../i18n'

interface UseSettingsResult {
  settings: AppSettings | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  updateSettings: (data: { autoMode?: boolean }) => Promise<void>
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
      if (data?.locale) setLocale(data.locale)
    } catch (e: any) {
      setError(e.message || t('common.dataLoadFailed'))
    } finally {
      setLoading(false)
    }
  }, [authenticated])

  useEffect(() => {
    load()
  }, [load])

  const update = useCallback(async (data: { autoMode?: boolean }) => {
    setError(null)

    try {
      const result = await apiUpdateSettings(data)
      setSettings((prev) =>
        prev ? { ...prev, autoMode: result.autoMode } : prev,
      )
    } catch (e: any) {
      setError(e.message || t('common.dataLoadFailed'))
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
