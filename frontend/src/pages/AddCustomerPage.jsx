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
  const [uploadProgress, setUploadProgress] = useState(null)
  const [error, setError] = useState('')
  const [meta, setMeta] = useState({ collectors: [] })
  const [areaOptions, setAreaOptions] = useState([])

  useEffect(() => {
    const loadData = async () => {
      try {
        const [metaData, customerData] = await Promise.all([
          customerService.getMeta(),
          customerService.getAll({ currentUser: user, pageSize: 200 }),
        ])
        setMeta(metaData)
        setAreaOptions(
          [...new Set((customerData.results || []).map((customer) => customer.area).filter(Boolean))],
        )
      } catch {
        setError('Unable to prepare customer form.')
      } finally {
        setLoading(false)
      }
    }
    if (user) loadData()
  }, [user])

  const handleSubmit = async (payload) => {
    setSaving(true)
    setUploadProgress(payload.photoFile ? 0 : null)
    setError('')
    try {
      const created = await customerService.create(payload, user, {
        onUploadProgress: setUploadProgress,
      })
      navigate(`/customers/${created.customerId || created.id}`)
    } catch (exception) {
      setError(exception.message || 'Unable to save customer. Check required fields.')
    } finally {
      setSaving(false)
      setUploadProgress(null)
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
          areaOptions={areaOptions}
          saving={saving}
          uploadProgress={uploadProgress}
          submitLabel="Create Customer"
          onSubmit={handleSubmit}
        />
      </section>
    </div>
  )
}

export default AddCustomerPage
