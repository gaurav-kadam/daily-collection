import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FiEdit2 } from 'react-icons/fi'
import CustomerProfile from '../components/customers/CustomerProfile'
import Loader from '../components/Loader'
import collectionService from '../services/collectionService'
import customerService from '../services/customerService'
import loanService from '../services/loanService'
import useAuth from '../hooks/useAuth'

function CustomerDetailsPage() {
  const { customerId } = useParams()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [customer, setCustomer] = useState(null)
  const [collections, setCollections] = useState([])
  const [loans, setLoans] = useState([])

  useEffect(() => {
    let isMounted = true

    const fetchDetails = async () => {
      setLoading(true)
      setError('')
      try {
        const customerData = await customerService.getById(customerId)
        if (!isMounted) return

        setCustomer(customerData)
        const resolvedCustomerId = customerData.id || customerData.customerId || customerId
        try {
          const [collectionData, loanData] = await Promise.all([
            collectionService.getAll({ customer_id: resolvedCustomerId, currentUser: user, pageSize: 25 }),
            user?.role === 'admin'
              ? loanService.getAll({ customer_id: resolvedCustomerId, pageSize: 25 })
              : Promise.resolve([]),
          ])
          if (!isMounted) return
          setCollections(Array.isArray(collectionData) ? collectionData : collectionData.results || [])
          setLoans(Array.isArray(loanData) ? loanData : loanData.results || [])
        } catch {
          if (!isMounted) return
          setCollections([])
          setLoans([])
          setError('Customer loaded, but recent history could not be loaded.')
        }
      } catch (exception) {
        if (!isMounted) return
        setCustomer(null)
        setCollections([])
        setLoans([])
        setError(exception.message || 'Unable to load customer details.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchDetails()

    return () => {
      isMounted = false
    }
  }, [customerId, user])

  if (loading) return <Loader text="Loading customer details..." />

  if (!customer) {
    return (
      <div className="card p-6">
        <p className="text-slate-700">
          {error === 'Customer not found.' ? 'Customer not found.' : 'Unable to load customer details.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="page-title">Customer Profile</h2>
          <p className="mt-1 text-sm text-slate-600">Savings, pending balance, loans, and collection history.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/customers" className="btn-secondary">
            Back
          </Link>
          {user?.role === 'admin' && (
            <Link to={`/customers/${customer.id || customerId}/edit`} className="btn-primary inline-flex items-center gap-2">
              <FiEdit2 /> Edit
            </Link>
          )}
        </div>
      </section>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      <CustomerProfile customer={customer} collections={collections} loans={loans} />
    </div>
  )
}

export default CustomerDetailsPage
