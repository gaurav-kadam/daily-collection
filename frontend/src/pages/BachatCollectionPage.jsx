import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { FiCheckCircle, FiPlus } from 'react-icons/fi'
import Loader from '../components/Loader'
import useAuth from '../hooks/useAuth'
import {
  createBachatCollection,
  getActiveBachatAccounts,
  getBachatCollectionsByDate,
} from '../services/bachatService'
import customerService from '../services/customerService'
import { moneyValue, numberValue, todayKey } from '../services/firestoreService'
import { formatCurrency } from '../utils/format'

const emptyForm = {
  customerId: '',
  amount: '',
  penaltyRecovered: '',
  paymentMethod: 'cash',
  notes: '',
  date: todayKey(),
}

function BachatCollectionPage() {
  const { user } = useAuth()
  const [customers, setCustomers] = useState([])
  const [accounts, setAccounts] = useState([])
  const [collections, setCollections] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return undefined

    let isMounted = true

    const loadPage = async () => {
      setLoading(true)
      try {
        const [customerData, accountData, todayCollectionData] = await Promise.all([
          customerService.getAll({ currentUser: user, status: 'active', pageSize: 300 }),
          getActiveBachatAccounts({ currentUser: user, pageSize: 500 }),
          getBachatCollectionsByDate({
            date: form.date,
            currentUser: user,
            pageSize: 1000,
          }),
        ])

        if (!isMounted) return
        setCustomers(customerData.results || [])
        setAccounts(accountData.results || [])
        setCollections(todayCollectionData.results || [])
      } catch (error) {
        if (isMounted) toast.error(error.message || 'Unable to load Bachat collections.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadPage()

    return () => {
      isMounted = false
    }
  }, [form.date, user])

  const customerMap = useMemo(
    () => new Map(customers.map((customer) => [customer.customerId || customer.id, customer])),
    [customers],
  )

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.customerId === form.customerId),
    [accounts, form.customerId],
  )

  const selectedCustomer = useMemo(() => {
    if (!selectedAccount) return null
    const profile = customerMap.get(selectedAccount.customerId) || {}
    return {
      ...profile,
      ...selectedAccount,
      customerId: selectedAccount.customerId,
    }
  }, [customerMap, selectedAccount])
  const selectedDailyAmount = useMemo(
    () => numberValue(moneyValue(selectedCustomer, 'dailyAmount')),
    [selectedCustomer],
  )
  const selectedPendingAmount = useMemo(
    () => numberValue(moneyValue(selectedCustomer, 'pendingAmount')),
    [selectedCustomer],
  )
  const selectedPenaltyAmount = useMemo(
    () => numberValue(moneyValue(selectedCustomer, 'penaltyAmount')),
    [selectedCustomer],
  )

  const collectedCustomerIds = useMemo(
    () => new Set(collections.map((item) => item.customerId)),
    [collections],
  )

  const pendingCustomers = useMemo(
    () =>
      accounts
        .filter((account) => !collectedCustomerIds.has(account.customerId))
        .map((account) => {
          const profile = customerMap.get(account.customerId) || {}
          return {
            ...profile,
            ...account,
            customerId: account.customerId,
          }
        }),
    [accounts, collectedCustomerIds, customerMap],
  )

  const updateForm = (event) => {
    const { name, value } = event.target
    setForm((previous) => ({ ...previous, [name]: value }))
  }

  const handleCustomerChange = (event) => {
    const account = accounts.find((item) => item.customerId === event.target.value)
    const dailyAmount = numberValue(moneyValue(account, 'dailyAmount'))
    setForm((previous) => ({
      ...previous,
      customerId: event.target.value,
      amount: dailyAmount || '',
      penaltyRecovered: '',
    }))
  }

  const fillAmountWithPending = () => {
    if (!selectedCustomer) return
    setForm((previous) => ({
      ...previous,
      amount: selectedDailyAmount + selectedPendingAmount,
    }))
  }

  const resetAmountToDaily = () => {
    if (!selectedCustomer) return
    setForm((previous) => ({
      ...previous,
      amount: selectedDailyAmount || '',
    }))
  }

  const fillPenaltyRecovery = () => {
    if (!selectedCustomer) return
    setForm((previous) => ({
      ...previous,
      penaltyRecovered: selectedPenaltyAmount || '',
    }))
  }

  const clearPenaltyRecovery = () => {
    setForm((previous) => ({
      ...previous,
      penaltyRecovered: '',
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
      await createBachatCollection({
        customerId: selectedCustomer.customerId,
        payload: form,
        currentUser: user,
      })

      const refreshed = await getBachatCollectionsByDate({
        date: form.date,
        currentUser: user,
        pageSize: 1000,
      })
      setCollections(refreshed.results || [])
      setForm({ ...emptyForm, date: form.date })
      toast.success('Bachat collection saved')
    } catch (error) {
      toast.error(error.message || 'Unable to save Bachat collection.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <Loader text="Loading Bachat collections..." />
  }

  const totalCollected = collections.reduce(
    (sum, item) =>
      sum +
      moneyValue(item, 'amountCollected') +
      moneyValue(item, 'pendingRecovered') +
      moneyValue(item, 'penaltyRecovered'),
    0,
  )

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="card p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="page-title">Bachat Daily Collections</h2>
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
                    {customer.fullName || customer.ownerName || customer.shopName} - {customer.customerId || customer.id}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1 block text-sm font-medium text-slate-700">Amount</span>
              <input
                className="input-field"
                name="amount"
                type="number"
                min="0"
                value={form.amount}
                onChange={updateForm}
                required
              />
              {selectedCustomer && (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-slate-500">
                    Pending available: <strong>{formatCurrency(selectedPendingAmount)}</strong> (optional)
                  </p>
                  {selectedPendingAmount > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-secondary !py-1.5" onClick={fillAmountWithPending}>
                        Include Pending
                      </button>
                      <button type="button" className="btn-secondary !py-1.5" onClick={resetAmountToDaily}>
                        Daily Only
                      </button>
                    </div>
                  )}
                </div>
              )}
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
              <span className="mb-1 block text-sm font-medium text-slate-700">Penalty Recovery</span>
              <input
                className="input-field"
                name="penaltyRecovered"
                type="number"
                min="0"
                value={form.penaltyRecovered}
                onChange={updateForm}
              />
              {selectedCustomer && (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-slate-500">
                    Penalty due: <strong>{formatCurrency(selectedPenaltyAmount)}</strong> (optional)
                  </p>
                  {selectedPenaltyAmount > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-secondary !py-1.5" onClick={fillPenaltyRecovery}>
                        Fill Penalty
                      </button>
                      <button type="button" className="btn-secondary !py-1.5" onClick={clearPenaltyRecovery}>
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              )}
            </label>

            <label className="md:col-span-2">
              <span className="mb-1 block text-sm font-medium text-slate-700">Notes</span>
              <input
                className="input-field"
                name="notes"
                value={form.notes}
                onChange={updateForm}
              />
            </label>

            {selectedCustomer && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm md:col-span-2">
                <div className="grid gap-2 sm:grid-cols-4">
                  <p>
                    <span className="text-slate-500">Daily:</span>{' '}
                    <strong>{formatCurrency(moneyValue(selectedCustomer, 'dailyAmount'))}</strong>
                  </p>
                  <p>
                    <span className="text-slate-500">Collected:</span>{' '}
                    <strong>{formatCurrency(moneyValue(selectedCustomer, 'totalCollected'))}</strong>
                  </p>
                  <p>
                    <span className="text-slate-500">Pending:</span>{' '}
                    <strong>{formatCurrency(moneyValue(selectedCustomer, 'pendingAmount'))}</strong>
                  </p>
                  <p>
                    <span className="text-slate-500">Penalty:</span>{' '}
                    <strong>{formatCurrency(moneyValue(selectedCustomer, 'penaltyAmount'))}</strong>
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
                <p className="font-semibold text-slate-900">
                  {customer.fullName || customer.ownerName || customer.shopName}
                </p>
                <p className="text-sm text-slate-500">{customer.customerId || customer.id}</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {formatCurrency(moneyValue(customer, 'dailyAmount'))}
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
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Recovered</th>
                <th className="px-4 py-3">Penalty</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {collections.map((item) => (
                <tr key={item.txId || item.id}>
                  <td className="px-4 py-3 font-semibold text-slate-950">{item.customerId}</td>
                  <td className="px-4 py-3">{formatCurrency(moneyValue(item, 'amountCollected'))}</td>
                  <td className="px-4 py-3">{formatCurrency(moneyValue(item, 'pendingRecovered'))}</td>
                  <td className="px-4 py-3">{formatCurrency(moneyValue(item, 'penaltyRecovered'))}</td>
                  <td className="px-4 py-3 capitalize text-slate-600">{item.paymentMethod}</td>
                  <td className="px-4 py-3">
                    <span className="badge bg-slate-100 text-slate-700">{item.status}</span>
                  </td>
                </tr>
              ))}
              {collections.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan="6">
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

export default BachatCollectionPage
