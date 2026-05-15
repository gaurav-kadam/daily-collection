import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import CustomerForm from '../components/customers/CustomerForm'
import Loader from '../components/Loader'
import useAuth from '../hooks/useAuth'
import customerService from '../services/customerService'

function AddCustomerPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [meta, setMeta] = useState({ collectors: [] })
  const [existingCustomers, setExistingCustomers] = useState([])

  useEffect(() => {
    const loadData = async () => {
      try {
        const [metaData, customerData] = await Promise.all([
          customerService.getMeta(),
          customerService.getAll({ pageSize: 100 }),
        ])
        setMeta(metaData)
        setExistingCustomers(customerData.results || [])
      } catch {
        setError('Unable to prepare customer form.')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const handleSubmit = async (payload) => {
    setSaving(true)
    setError('')
    try {
      const created = await customerService.create(payload, user)
      navigate(`/customers/${created.id}`)
    } catch (exception) {
      setError(exception.response?.data?.mobile || 'Unable to save customer. Check required fields.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loader text="Preparing customer form..." />

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="page-title">Add Customer</h2>
          <p className="mt-1 text-sm text-slate-600">Create a shop profile for daily collection tracking.</p>
        </div>
        <Link to="/customers" className="btn-secondary">
          Back to Customers
        </Link>
      </section>
      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      <section className="card p-5">
        <CustomerForm
          collectors={meta.collectors || []}
          existingCustomers={existingCustomers}
          saving={saving}
          submitLabel="Create Customer"
          onSubmit={handleSubmit}
        />
      </section>
    </div>
  )
}

export default AddCustomerPage
