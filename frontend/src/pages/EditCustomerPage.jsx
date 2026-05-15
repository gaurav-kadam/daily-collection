import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import CustomerForm from '../components/customers/CustomerForm'
import Loader from '../components/Loader'
import useAuth from '../hooks/useAuth'
import customerService from '../services/customerService'

function EditCustomerPage() {
  const { customerId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [customer, setCustomer] = useState(null)
  const [meta, setMeta] = useState({ collectors: [] })
  const [existingCustomers, setExistingCustomers] = useState([])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError('')
      try {
        const [customerData, metaData, customerList] = await Promise.all([
          customerService.getById(customerId),
          customerService.getMeta(),
          customerService.getAll({ pageSize: 100 }),
        ])
        setCustomer(customerData)
        setMeta(metaData)
        setExistingCustomers(customerList.results || [])
      } catch {
        setError('Unable to load customer.')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [customerId])

  const handleSubmit = async (payload) => {
    setSaving(true)
    setError('')
    try {
      await customerService.update(customerId, payload, user)
      navigate(`/customers/${customerId}`)
    } catch (exception) {
      setError(exception.response?.data?.mobile || 'Unable to update customer.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loader text="Loading customer form..." />

  if (!customer) {
    return <div className="card p-6 text-sm text-slate-700">Customer not found.</div>
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="page-title">Edit Customer</h2>
          <p className="mt-1 text-sm text-slate-600">{customer.shopName}</p>
        </div>
        <Link to={`/customers/${customerId}`} className="btn-secondary">
          View Profile
        </Link>
      </section>
      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      <section className="card p-5">
        <CustomerForm
          initialValues={customer}
          collectors={meta.collectors || []}
          existingCustomers={existingCustomers}
          currentCustomerId={customerId}
          saving={saving}
          submitLabel="Update Customer"
          onSubmit={handleSubmit}
        />
      </section>
    </div>
  )
}

export default EditCustomerPage
