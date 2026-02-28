# Storno — Stripe App

A [Stripe Dashboard extension](https://docs.stripe.com/stripe-apps) that connects Stripe payments with [Storno.ro](https://storno.ro) e-invoicing.

## Views

| View | Stripe Location | Description |
|------|----------------|-------------|
| **Invoice List** | Dashboard Home | Overview of recent Storno invoices |
| **Client Detail** | Customer Detail | Link Stripe customers to Storno clients |
| **Invoice Detail** | Payment Detail | View linked e-Factura for a payment |
| **Settings** | App Settings | Configure API connection and authentication |

## Permissions

- `customer_read` — Match Stripe customers with Storno clients
- `charge_read` — View charges to link with e-Factura invoices
- `payment_intent_read` — View payments to display invoice status
- `invoice_read` — Read Stripe invoices to create e-Factura
- `secret_write` — Store authentication tokens securely

## Development

### Prerequisites

- [Stripe CLI](https://docs.stripe.com/stripe-cli) with apps plugin
- Node.js 20+

### Setup

```bash
npm install
npm start
```

This starts the local dev server and opens the Stripe Dashboard with the app loaded.

### Build & Upload

```bash
npm run build
npm run upload
```

## Tech Stack

- Stripe UI Extension SDK 2.0
- React 17
- TypeScript 5

## License

[Elastic License 2.0 (ELv2)](LICENSE)
