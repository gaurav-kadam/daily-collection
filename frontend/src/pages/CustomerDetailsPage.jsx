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
    const fetchDetails = async () => {
      setLoading(true)
      setError('')
      try {
        const [customerData, collectionData, loanData] = await Promise.all([
          customerService.getById(customerId),
          collectionService.getAll({ customer_id: customerId, currentUser: user }),
          user?.role === 'admin' ? loanService.getAll({ customer_id: customerId }) : Promise.resolve([]),
        ])
        setCustomer(customerData)
        setCollections(Array.isArray(collectionData) ? collectionData : collectionData.results || [])
        setLoans(Array.isArray(loanData) ? loanData : loanData.results || [])
      } catch {
        setError('Unable to load customer details.')
      } finally {
        setLoading(false)
      }
    }

    fetchDetails()
  }, [customerId, user])

  if (loading) return <Loader text="Loading customer details..." />

  if (!customer) {
    return (
      <div className="card p-6">
        <p className="text-slate-700">Customer not found.</p>
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
            <Link to={`/customers/${customerId}/edit`} className="btn-primary inline-flex items-center gap-2">
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
