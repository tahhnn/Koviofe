'use server'

import { apiRequest, apiRequestText } from '@/services/api/client'
import { revalidatePath } from 'next/cache'

export type PaymentProduct = {
  id: string
  plan_id: string
  name: string
  duration_days: number
  amount_vnd: number
  is_active: boolean
  sort_order: number
}

export type PaymentCatalog = {
  /** Self-service QR checkout is open (switch on and server configured). */
  payment_enabled: boolean
  products: PaymentProduct[]
  contact: { zalo_url?: string }
}

export type OrderStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'needs_review'

export type PaymentOrder = {
  id: number
  order_code: string
  user_id: number
  product_id: string
  product_name: string
  plan_id: string
  duration_days: number
  amount_vnd: number
  status: OrderStatus
  review_reason?: string
  expires_at: string
  paid_at?: string | null
  paid_amount_vnd: number
  external_ref?: string
  confirmed_by?: number | null
  note?: string
  created_at: string
}

export type CheckoutInfo = {
  bank_name: string
  bank_account: string
  bank_holder?: string
  transfer_content: string
  qr_url: string
}

/** checkout is present only while the order is pending. */
export type OrderView = { order: PaymentOrder; checkout?: CheckoutInfo }

export type AdminOrderRow = PaymentOrder & { email: string }

export type CheckoutState = { enabled: boolean; configured: boolean; effective: boolean }

/**
 * Every action that can fail with a message the reader must see returns a
 * result instead of throwing: a thrown server-action error reaches the client
 * as a generic boundary error in production, losing the backend's (already
 * localized) explanation — the same reason redeemLicenseCode does this.
 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Request failed' }
  }
}

const emptyCatalog: PaymentCatalog = { payment_enabled: false, products: [], contact: {} }

export async function listPaymentProducts(): Promise<PaymentCatalog> {
  try {
    const data = await apiRequest('/payments/products')
    return {
      payment_enabled: !!data?.payment_enabled,
      products: Array.isArray(data?.products) ? data.products : [],
      contact: data?.contact ?? {},
    }
  } catch {
    return emptyCatalog
  }
}

export async function createPaymentOrder(productId: string): Promise<Result<OrderView>> {
  return attempt(() => apiRequest('/payments/orders', 'POST', { product_id: productId }))
}

export async function getPaymentOrder(code: string): Promise<Result<OrderView>> {
  return attempt(() => apiRequest(`/payments/orders/${encodeURIComponent(code)}`))
}

export async function listMyPaymentOrders(): Promise<PaymentOrder[]> {
  try {
    const data = await apiRequest('/payments/orders')
    return Array.isArray(data?.orders) ? data.orders : []
  } catch {
    return []
  }
}

export async function cancelPaymentOrder(code: string): Promise<Result<OrderView>> {
  return attempt(() => apiRequest(`/payments/orders/${encodeURIComponent(code)}/cancel`, 'POST'))
}

export async function adminListPaymentProducts(): Promise<Result<PaymentProduct[]>> {
  return attempt(async () => {
    const data = await apiRequest('/admin/payments/products')
    return Array.isArray(data) ? data : []
  })
}

export async function adminUpdatePaymentProduct(
  id: string,
  patch: Partial<Pick<PaymentProduct, 'name' | 'duration_days' | 'amount_vnd' | 'is_active' | 'sort_order'>>,
): Promise<Result<PaymentProduct>> {
  return attempt(async () => {
    const data = await apiRequest(`/admin/payments/products/${encodeURIComponent(id)}`, 'PUT', patch)
    revalidatePath('/pricing')
    return data
  })
}

export async function adminListPaymentOrders(f?: {
  status?: string
  q?: string
  from?: string
  to?: string
}): Promise<Result<AdminOrderRow[]>> {
  const params = new URLSearchParams()
  if (f?.status) params.set('status', f.status)
  if (f?.q?.trim()) params.set('q', f.q.trim())
  if (f?.from) params.set('from', f.from)
  if (f?.to) params.set('to', f.to)
  const qs = params.toString()
  return attempt(async () => {
    const data = await apiRequest(`/admin/payments/orders${qs ? `?${qs}` : ''}`)
    return Array.isArray(data?.orders) ? data.orders : []
  })
}

export async function adminConfirmPaymentOrder(
  code: string,
  input: { amountVnd: number; externalRef: string; note: string },
): Promise<Result<PaymentOrder>> {
  return attempt(async () => {
    const data = await apiRequest(`/admin/payments/orders/${encodeURIComponent(code)}/confirm`, 'POST', {
      amount_vnd: input.amountVnd,
      external_ref: input.externalRef.trim(),
      note: input.note.trim(),
    })
    revalidatePath('/admin/license')
    return data?.order
  })
}

export async function adminCancelPaymentOrder(code: string, note: string): Promise<Result<PaymentOrder>> {
  return attempt(async () => {
    const data = await apiRequest(`/admin/payments/orders/${encodeURIComponent(code)}/cancel`, 'POST', {
      note: note.trim(),
    })
    return data?.order
  })
}

export async function adminGetCheckout(): Promise<CheckoutState | null> {
  try {
    return await apiRequest('/admin/payments/checkout')
  } catch {
    return null
  }
}

export async function adminSetCheckout(enabled: boolean): Promise<Result<CheckoutState>> {
  return attempt(async () => {
    const data = await apiRequest('/admin/payments/checkout', 'PUT', { enabled })
    revalidatePath('/pricing')
    return data
  })
}

export type BankTransaction = {
  id: number
  provider: string
  provider_txn_id: string
  gateway: string
  account_number: string
  transfer_type: string
  detected_code?: string
  amount_vnd: number
  content: string
  description?: string
  reference_code: string
  transaction_date: string
  order_code?: string
  order_id?: number | null
  match_status: string
  note?: string
  created_at: string
}

/** status: 'open' (needs a human), a match_status, or '' for everything. */
export async function adminListBankTransactions(status: string, q?: string): Promise<Result<BankTransaction[]>> {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (q?.trim()) params.set('q', q.trim())
  const qs = params.toString()
  return attempt(async () => {
    const data = await apiRequest(`/admin/payments/bank-transactions${qs ? `?${qs}` : ''}`)
    return Array.isArray(data?.transactions) ? data.transactions : []
  })
}

export async function adminAttachBankTransaction(
  id: number,
  orderCode: string,
  note: string,
): Promise<Result<{ status: string; paid: boolean }>> {
  return attempt(async () => {
    const data = await apiRequest(`/admin/payments/bank-transactions/${id}/attach`, 'POST', {
      order_code: orderCode.trim().toUpperCase(),
      note: note.trim(),
    })
    revalidatePath('/admin/license')
    return { status: String(data?.status ?? ''), paid: !!data?.paid }
  })
}

export async function adminDismissBankTransaction(id: number, note: string): Promise<Result<true>> {
  return attempt(async () => {
    await apiRequest(`/admin/payments/bank-transactions/${id}/dismiss`, 'POST', { note: note.trim() })
    return true as const
  })
}

export async function adminExportPaymentOrdersCsv(f?: { status?: string; q?: string }): Promise<Result<string>> {
  const params = new URLSearchParams()
  if (f?.status) params.set('status', f.status)
  if (f?.q?.trim()) params.set('q', f.q.trim())
  const qs = params.toString()
  return attempt(() => apiRequestText(`/admin/payments/orders.csv${qs ? `?${qs}` : ''}`))
}

export type ReconcileResult = {
  fetched: number
  /** Recorded now — their webhook never arrived. */
  new: number
  paid: number
  need_human: number
  skipped: number
}

/** Pull SePay's transaction list for the last `days` and record what the webhook missed. */
export async function adminReconcilePayments(days = 2): Promise<Result<ReconcileResult>> {
  return attempt(async () => {
    const data = await apiRequest('/admin/payments/reconcile', 'POST', { days })
    return data?.result as ReconcileResult
  })
}
