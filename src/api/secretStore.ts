import Stripe from 'stripe'
import { createHttpClient, STRIPE_API_KEY } from '@stripe/ui-extension-sdk/http_client'
import type { AuthTokens } from '../types'

const TOKEN_KEY = 'storno_tokens'

function secretScope(userId: string) {
  return { scope: { type: 'user' as const, user: userId } }
}

function getStripeClient(): Stripe {
  const httpClient = createHttpClient()
  return new Stripe(STRIPE_API_KEY, {
    httpClient,
    apiVersion: '2023-10-16' as any,
  })
}

export async function saveTokens(userId: string, tokens: AuthTokens): Promise<void> {
  const stripe = getStripeClient()
  const payload = JSON.stringify(tokens)

  // "Create or replace" — single upsert call, no need to find+delete first
  await stripe.apps.secrets.create({
    name: TOKEN_KEY,
    payload,
    ...secretScope(userId),
  })
}

export async function loadTokens(userId: string): Promise<AuthTokens | null> {
  const stripe = getStripeClient()

  try {
    // expand=payload is required — `find` returns metadata only by default
    const secret = await stripe.apps.secrets.find({
      name: TOKEN_KEY,
      ...secretScope(userId),
      expand: ['payload'],
    })

    if (secret?.payload) {
      return JSON.parse(secret.payload) as AuthTokens
    }
  } catch {
    // Secret not found or API error
  }

  return null
}

export async function deleteTokens(userId: string): Promise<void> {
  const stripe = getStripeClient()

  try {
    await stripe.apps.secrets.deleteWhere({
      name: TOKEN_KEY,
      ...secretScope(userId),
    })
  } catch {
    // Already deleted or doesn't exist
  }
}
