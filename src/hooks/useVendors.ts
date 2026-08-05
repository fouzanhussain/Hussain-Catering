import { useCallback, useEffect, useState } from 'react'

import { listPayments, listVendors, type PaymentFilter } from '../lib/vendorApi'
import type { Vendor, VendorPayment } from '../lib/types'

export function useVendors(includeInactive = true) {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setVendors(await listVendors(includeInactive))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [includeInactive])

  useEffect(() => {
    void reload()
  }, [reload])

  return { vendors, loading, error, reload }
}

export function useVendorPayments(filter: PaymentFilter) {
  const [payments, setPayments] = useState<VendorPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const key = JSON.stringify(filter)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setPayments(await listPayments(JSON.parse(key) as PaymentFilter))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [key])

  useEffect(() => {
    void reload()
  }, [reload])

  return { payments, loading, error, reload }
}
