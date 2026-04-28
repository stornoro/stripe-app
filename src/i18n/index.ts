import { useEffect, useState } from 'react'
import en, { type TranslationKey } from './en'
import ro from './ro'

export type Locale = 'en' | 'ro'

const DICTS: Record<Locale, Record<TranslationKey, string>> = { en, ro }

function detectInitialLocale(): Locale {
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ro')) {
    return 'ro'
  }
  return 'en'
}

let currentLocale: Locale = detectInitialLocale()
const listeners = new Set<(locale: Locale) => void>()

export function getLocale(): Locale {
  return currentLocale
}

export function setLocale(locale: Locale | string | null | undefined) {
  const next: Locale = locale === 'ro' || (typeof locale === 'string' && locale.toLowerCase().startsWith('ro'))
    ? 'ro'
    : 'en'
  if (next === currentLocale) return
  currentLocale = next
  listeners.forEach((cb) => cb(next))
}

function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`))
}

export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  const dict = DICTS[currentLocale] ?? DICTS.en
  const template = dict[key] ?? DICTS.en[key] ?? key
  return format(template, vars)
}

/** Hook that returns a t() bound to the live locale and re-renders on changes. */
export function useT(): (key: TranslationKey, vars?: Record<string, string | number>) => string {
  const [, force] = useState(currentLocale)
  useEffect(() => {
    const cb = (next: Locale) => force(next)
    listeners.add(cb)
    return () => { listeners.delete(cb) }
  }, [])
  return t
}
