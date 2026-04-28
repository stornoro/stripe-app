// Stripe Apps inject NODE_ENV: "development" for `stripe apps start`,
// "production" for `stripe apps build` / `stripe apps upload`.
const PROD_API = 'https://api.storno.ro/api/v1'
const DEV_API = process.env.STORNO_DEV_API ?? PROD_API

export const API_BASE = process.env.NODE_ENV === 'production' ? PROD_API : DEV_API
