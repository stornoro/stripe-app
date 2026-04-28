export interface Invoice {
  id: string
  invoiceNumber: string
  issueDate: string
  dueDate: string | null
  total: string
  currency: string
  senderName: string
  senderCif: string
  receiverName: string
  receiverCif: string
  direction: 'sent' | 'received'
  status: string
  paymentStatus: string | null
  amountPaid: string
  anafStatus: string | null
}

export interface Client {
  id: string
  name: string
  cif: string
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  country: string | null
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface Company {
  id: string
  name: string
  cif: string
}

export interface AppSettings {
  autoMode: boolean
  company: Company
  locale: string | null
}

export interface DashboardStats {
  counts: {
    draft: number
    issued: number
    sent_to_anaf: number
    validated: number
    rejected: number
    total: number
  }
  recentInvoices: DashboardInvoice[]
  autoMode: boolean
  companyName: string | null
}

export interface DashboardInvoice {
  id: string
  invoiceNumber: string
  issueDate: string | null
  total: string
  currency: string
  receiverName: string
  status: string
  anafStatus: string | null
}
