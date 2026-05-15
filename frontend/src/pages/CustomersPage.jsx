import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { FiPlus, FiSearch } from 'react-icons/fi'
import Loader from '../components/Loader'
import useAuth from '../hooks/useAuth'
import useDebouncedValue from '../hooks/useDebouncedValue'
import {
  createCustomer,
  getAll,
  getMeta,
} from '../services/customerService'
import { USER_ROLES } from '../services/firestoreService'
import { formatCurrency } from '../utils/format'

const emptyForm = {
  shopName: '',
  ownerName: '',
  mobile: '',
  area: '',
  dailyAmount: '',
  assignedCollectorId: '',
}

function CustomersPage() {
  const { user } = useAuth()
  const [customers, setCustomers] = useState([])
  const [collectors, setCollectors] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const isAdmin = user?.role === USER_ROLES.admin
  const debouncedSearch = useDebouncedValue(search, 250)

  useEffect(() => {
    if (!user) return
    let isMounted = true
    setLoading(true)

    Promise.all([
      getAll({ currentUser: user, pageSize: 100 }),
      isAdmin ? getMeta() : Promise.resolve({ collectors: [] }),
    ])
      .then(([customerData, metaData]) => {
        if (!isMounted) return
        setCustomers(customerData.results || [])
        setCollectors(metaData.collectors || [])
      })
      .catch((error) => toast.error(error.message))
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [isAdmin, user])

  const filteredCustomers = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase()
    if (!query) return customers
    return customers.filter((customer) =>
      [customer.shopName, customer.ownerName, customer.mobile, customer.area]
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  }, [customers, debouncedSearch])

  const updateForm = (event) => {
    const { name, value } = event.target
    setForm((previous) => ({ ...previous, [name]: value }))
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    const selectedCollector = collectors.find(
      (collector) => collector.userId === form.assignedCollectorId || collector.id === form.assignedCollectorId,
    )

    setSaving(true)
    try {
      const created = await createCustomer(
        {
          ...form,
          assignedCollectorName: selectedCollector?.fullName || '',
        },
        user,
      )
      setCustomers((previous) =>
        [created, ...previous].sort((first, second) =>
          String(first.shopName || '').localeCompare(String(second.shopName || '')),
        ),
      )
      setForm(emptyForm)
      toast.success('Customer created')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <Loader text="Loading customers..." />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h2 className="page-title">{isAdmin ? 'Customers' : 'My Customers'}</h2>
          <p className="mt-1 text-sm text-slate-500">{filteredCustomers.length} records</p>
        </div>
        <label className="relative block w-full md:w-80">
          <FiSearch className="pointer-events-none absolute left-3 top-3 text-slate-400" />
          <input
            className="input-field pl-10"
            placeholder="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>

      {isAdmin && (
        <form className="card grid gap-3 p-4 md:grid-cols-6" onSubmit={handleCreate}>
          <input
            className="input-field md:col-span-2"
            name="shopName"
            placeholder="Shop name"
            value={form.shopName}
            onChange={updateForm}
            required
          />
          <input
            className="input-field md:col-span-2"
            name="ownerName"
            placeholder="Owner name"
            value={form.ownerName}
            onChange={updateForm}
            required
          />
          <input
            className="input-field"
            name="mobile"
            placeholder="Mobile"
            value={form.mobile}
            onChange={updateForm}
            required
          />
          <input
            className="input-field"
            name="dailyAmount"
            placeholder="Daily amount"
            type="number"
            min="1"
            value={form.dailyAmount}
            onChange={updateForm}
            required
          />
          <input
            className="input-field md:col-span-2"
            name="area"
            placeholder="Area"
            value={form.area}
            onChange={updateForm}
          />
          <select
            className="input-field md:col-span-3"
            name="assignedCollectorId"
            value={form.assignedCollectorId}
            onChange={updateForm}
          >
            <option value="">Assign collector</option>
            {collectors.map((collector) => (
              <option key={collector.userId || collector.id} value={collector.userId || collector.id}>
                {collector.fullName}
              </option>
            ))}
          </select>
          <button className="btn-primary gap-2" type="submit" disabled={saving}>
            <FiPlus />
            {saving ? 'Saving...' : 'Add'}
          </button>
        </form>
      )}

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Shop</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Mobile</th>
                <th className="px-4 py-3">Daily</th>
                <th className="px-4 py-3">Savings</th>
                <th className="px-4 py-3">Pending</th>
                <th className="px-4 py-3">Collector</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredCustomers.map((customer) => (
                <tr key={customer.customerId || customer.id}>
                  <td className="px-4 py-3 font-semibold text-slate-950">{customer.shopName}</td>
                  <td className="px-4 py-3 text-slate-600">{customer.ownerName}</td>
                  <td className="px-4 py-3 text-slate-600">{customer.mobile}</td>
                  <td className="px-4 py-3 text-slate-900">{formatCurrency(customer.dailyAmount)}</td>
                  <td className="px-4 py-3 text-emerald-700">
                    {formatCurrency(customer.totalSavings)}
                  </td>
                  <td className="px-4 py-3 text-rose-700">
                    {formatCurrency(customer.pendingAmount)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {customer.assignedCollectorName || '-'}
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan="7">
                    No customers found
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

export default CustomersPage
