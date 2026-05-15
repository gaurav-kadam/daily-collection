import { useCallback, useEffect, useState } from 'react'
import PendingCustomerCard from '../components/collections/PendingCustomerCard'
import QuickCollectionModal from '../components/collections/QuickCollectionModal'
import Loader from '../components/Loader'
import useAuth from '../hooks/useAuth'
import collectionService from '../services/collectionService'
import customerService from '../services/customerService'
import { USER_ROLES } from '../services/firestoreService'
import { todayISO } from '../utils/date'

function PendingCustomersPage({ title = 'Pending Customers' }) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [customers, setCustomers] = useState([])
  const [pendingCustomers, setPendingCustomers] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [pendingData, customerData] = await Promise.all([
        collectionService.getPending({ pageSize: 100, currentUser: user }),
        customerService.getAll({
          pageSize: 100,
          assignedCollectorId: user?.role === USER_ROLES.collector ? user.userId : undefined,
        }),
      ])
      setPendingCustomers(pendingData.results || [])
      setCustomers(customerData.results || [])
    } catch {
      setError('Unable to load pending customers.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadData()
  }, [loadData])

  const collectPayment = async (payload) => {
    setSaving(true)
    setError('')
    try {
      await collectionService.create({ ...payload, date: todayISO(), status: 'paid' }, user)
      setSelectedCustomer(null)
      setNotice('Pending payment collected successfully.')
      await loadData()
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Unable to collect pending payment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">Recover missed payments and reduce customer pending balances.</p>
      </div>
      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {notice && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
      {loading ? (
        <Loader text="Loading pending customers..." />
      ) : (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {!pendingCustomers.length && (
            <p className="card p-6 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">
              No pending customers found.
            </p>
          )}
          {pendingCustomers.map((customer) => (
            <PendingCustomerCard
              key={customer.customerId}
              customer={customer}
              onCollect={(item) => setSelectedCustomer(item)}
            />
          ))}
        </section>
      )}

      <QuickCollectionModal
        isOpen={Boolean(selectedCustomer)}
        customerId={selectedCustomer?.customerId}
        customers={customers}
        saving={saving}
        onClose={() => setSelectedCustomer(null)}
        onSubmit={collectPayment}
      />
    </div>
  )
}

export default PendingCustomersPage
