import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { FiCheckCircle, FiPlus } from 'react-icons/fi'
import Loader from '../components/Loader'
import useAuth from '../hooks/useAuth'
import {
  createDailyCollection,
  listenDailyCollections,
} from '../services/collectionService'
import customerService from '../services/customerService'
import { todayKey } from '../services/firestoreService'
import { formatCurrency } from '../utils/format'

const emptyForm = {
  customerId: '',
  amountCollected: '',
  pendingRecovered: '',
  paymentMethod: 'cash',
  remarks: '',
  date: todayKey(),
}

function DailyCollectionPage() {
  const { user } = useAuth()
  const [customers, setCustomers] = useState([])
  const [collections, setCollections] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return undefined

    let isMounted = true
    customerService
      .getAll({ currentUser: user, status: 'active', pageSize: 200 })
      .then((data) => {
        if (isMounted) setCustomers(data.results || [])
      })
      .catch((error) => toast.error(error.message))

    const unsubscribeCollections = listenDailyCollections(
      user,
      form.date,
      (items) => {
        setCollections(items)
        setLoading(false)
      },
      (error) => toast.error(error.message),
    )

    return () => {
      isMounted = false
      unsubscribeCollections()
    }
  }, [form.date, user])

  const selectedCustomer = useMemo(
    () => customers.find((customer) => (customer.customerId || customer.id) === form.customerId),
    [customers, form.customerId],
  )

  const collectedCustomerIds = useMemo(
    () => new Set(collections.map((item) => item.customerId)),
    [collections],
  )

  const pendingCustomers = customers.filter(
    (customer) => !collectedCustomerIds.has(customer.customerId || customer.id),
  )

  const updateForm = (event) => {
    const { name, value } = event.target
    setForm((previous) => ({ ...previous, [name]: value }))
  }

  const handleCustomerChange = (event) => {
    const customer = customers.find(
      (item) => (item.customerId || item.id) === event.target.value,
    )
    setForm((previous) => ({
      ...previous,
      customerId: event.target.value,
      amountCollected: customer?.dailyAmount || '',
    }))
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!selectedCustomer) {
      toast.error('Select a customer')
      return
    }

    setSaving(true)
    try {
      await createDailyCollection({
        customer: selectedCustomer,
        payload: form,
        currentUser: user,
      })
      setForm({ ...emptyForm, date: form.date })
      toast.success('Collection saved')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <Loader text="Loading daily collections..." />
  }

  const totalCollected = collections.reduce(
    (sum, item) => sum + Number(item.amountCollected || 0) + Number(item.pendingRecovered || 0),
    0,
  )

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="card p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="page-title">Daily Collections</h2>
              <p className="mt-1 text-sm text-slate-500">
                {collections.length} entries, {pendingCustomers.length} pending
              </p>
            </div>
            <span className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
              {formatCurrency(totalCollected)}
            </span>
          </div>

          <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreate}>
            <label className="md:col-span-2">
              <span className="mb-1 block text-sm font-medium text-slate-700">Date</span>
              <input
                className="input-field"
                name="date"
                type="date"
                value={form.date}
                onChange={updateForm}
              />
            </label>

            <label className="md:col-span-2">
              <span className="mb-1 block text-sm font-medium text-slate-700">Customer</span>
              <select
                className="input-field"
                name="customerId"
                value={form.customerId}
                onChange={handleCustomerChange}
                required
              >
                <option value="">Select customer</option>
                {pendingCustomers.map((customer) => (
                  <option key={customer.customerId || customer.id} value={customer.customerId || customer.id}>
                    {customer.shopName} - {customer.ownerName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1 block text-sm font-medium text-slate-700">Amount</span>
              <input
                className="input-field"
                name="amountCollected"
                type="number"
                min="0"
                value={form.amountCollected}
                onChange={updateForm}
                required
              />
            </label>

            <label>
              <span className="mb-1 block text-sm font-medium text-slate-700">Pending Recovery</span>
              <input
                className="input-field"
                name="pendingRecovered"
                type="number"
                min="0"
                value={form.pendingRecovered}
                onChange={updateForm}
              />
            </label>

            <label>
              <span className="mb-1 block text-sm font-medium text-slate-700">Payment Method</span>
              <select
                className="input-field"
                name="paymentMethod"
                value={form.paymentMethod}
                onChange={updateForm}
              >
                <option value="cash">Cash</option>
                <option value="online">Online</option>
              </select>
            </label>

            <label>
              <span className="mb-1 block text-sm font-medium text-slate-700">Remarks</span>
              <input
                className="input-field"
                name="remarks"
                value={form.remarks}
                onChange={updateForm}
              />
            </label>

            {selectedCustomer && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm md:col-span-2">
                <div className="grid gap-2 sm:grid-cols-3">
                  <p>
                    <span className="text-slate-500">Daily:</span>{' '}
                    <strong>{formatCurrency(selectedCustomer.dailyAmount)}</strong>
                  </p>
                  <p>
                    <span className="text-slate-500">Savings:</span>{' '}
                    <strong>{formatCurrency(selectedCustomer.totalSavings)}</strong>
                  </p>
                  <p>
                    <span className="text-slate-500">Pending:</span>{' '}
                    <strong>{formatCurrency(selectedCustomer.pendingAmount)}</strong>
                  </p>
                </div>
              </div>
            )}

            <button type="submit" className="btn-primary gap-2 md:col-span-2" disabled={saving}>
              <FiPlus />
              {saving ? 'Saving...' : 'Save Collection'}
            </button>
          </form>
        </section>

        <section className="card p-4">
          <h3 className="section-title">Pending Today</h3>
          <div className="mt-4 max-h-[31rem] space-y-3 overflow-y-auto pr-1">
            {pendingCustomers.map((customer) => (
              <div
                key={customer.customerId || customer.id}
                className="rounded-lg border border-slate-200 p-3"
              >
                <p className="font-semibold text-slate-900">{customer.shopName}</p>
                <p className="text-sm text-slate-500">{customer.ownerName}</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {formatCurrency(customer.dailyAmount)}
                </p>
              </div>
            ))}
            {pendingCustomers.length === 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
                <FiCheckCircle />
                All customers are covered
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="section-title">Collection Entries</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Shop</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Recovered</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {collections.map((item) => (
                <tr key={item.collectionId || item.id}>
                  <td className="px-4 py-3 font-semibold text-slate-950">{item.shopName}</td>
                  <td className="px-4 py-3">{formatCurrency(item.amountCollected)}</td>
                  <td className="px-4 py-3">{formatCurrency(item.pendingRecovered)}</td>
                  <td className="px-4 py-3 capitalize text-slate-600">{item.paymentMethod}</td>
                  <td className="px-4 py-3">
                    <span className="badge bg-slate-100 text-slate-700">{item.status}</span>
                  </td>
                </tr>
              ))}
              {collections.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan="5">
                    No entries for selected date
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default DailyCollectionPage
