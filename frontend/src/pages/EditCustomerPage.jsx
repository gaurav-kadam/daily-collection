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
  const [uploadProgress, setUploadProgress] = useState(null)
  const [error, setError] = useState('')
  const [customer, setCustomer] = useState(null)
  const [meta, setMeta] = useState({ collectors: [] })
  const [areaOptions, setAreaOptions] = useState([])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError('')
      try {
        const [customerData, metaData, customerList] = await Promise.all([
          customerService.getById(customerId),
          customerService.getMeta(),
          customerService.getAll({ currentUser: user, pageSize: 200 }),
        ])
        setCustomer(customerData)
        setMeta(metaData)
        setAreaOptions(
          [...new Set((customerList.results || []).map((record) => record.area).filter(Boolean))],
        )
      } catch {
        setError('Unable to load customer.')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [customerId, user])

  const handleSubmit = async (payload) => {
    setSaving(true)
    setUploadProgress(
      payload.profilePhotoFile || payload.documentPhotoFile
        ? {
            profilePhoto: payload.profilePhotoFile ? 0 : null,
            documentPhoto: payload.documentPhotoFile ? 0 : null,
          }
        : null,
    )
    setError('')
    try {
      await customerService.update(customerId, payload, user, {
        onUploadProgress: ({ field, progress }) => {
          setUploadProgress((previous) => ({ ...(previous || {}), [field]: progress }))
        },
      })
      navigate(`/customers/${customerId}`)
    } catch (exception) {
      setError(exception.message || 'Unable to update customer.')
    } finally {
      setSaving(false)
      setUploadProgress(null)
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
          areaOptions={areaOptions}
          saving={saving}
          uploadProgress={uploadProgress}
          submitLabel="Update Customer"
          onSubmit={handleSubmit}
        />
      </section>
    </div>
  )
}

export default EditCustomerPage
