import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FiEdit2 } from 'react-icons/fi'
import CustomerProfile from '../components/customers/CustomerProfile'
import Loader from '../components/Loader'
import collectionService from '../services/collectionService'
import customerService from '../services/customerService'
import paymentService from '../services/paymentService'
import loanService from '../services/loanService'
import useAuth from '../hooks/useAuth'

const emptyProfileData = {
  collections: [],
  loans: [],
  emiPayments: [],
}

const emptySectionStatus = {
  collections: { loading: false, error: '' },
  loans: { loading: false, error: '' },
  emiPayments: { loading: false, error: '' },
}

const sectionMessages = {
  collections: 'Collection history is unavailable right now. Check Firestore indexes or collection permissions.',
  loans: 'Loan history is unavailable right now. Check Firestore indexes or loan permissions.',
  emiPayments: 'EMI payment history is unavailable right now. Check Firestore indexes or EMI permissions.',
}

const customerLookupIds = (customer, routeCustomerId) =>
  [...new Set([customer?.id, customer?.customerId, routeCustomerId].filter(Boolean).map(String))]

function CustomerDetailsPage() {
  const { customerId } = useParams()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [customer, setCustomer] = useState(null)
  const [profileData, setProfileData] = useState(emptyProfileData)
  const [sectionStatus, setSectionStatus] = useState(emptySectionStatus)

  useEffect(() => {
    let isMounted = true

    const fetchDetails = async () => {
      setLoading(true)
      setError('')
      setCustomer(null)
      setProfileData(emptyProfileData)
      setSectionStatus(emptySectionStatus)
      try {
        const customerData = await customerService.getById(customerId)
        if (!isMounted) return

        setCustomer(customerData)
        setLoading(false)

        const customerIds = customerLookupIds(customerData, customerId)
        setSectionStatus({
          collections: { loading: true, error: '' },
          loans: { loading: true, error: '' },
          emiPayments: { loading: true, error: '' },
        })

        const [collectionResult, loanResult, emiPaymentResult] = await Promise.allSettled([
          collectionService.getByCustomerIds({ customerIds, currentUser: user, pageSize: 25 }),
          loanService.getByCustomerIds({ customerIds, pageSize: 25 }),
          paymentService.getCustomerEmiPayments({ customerIds, currentUser: user, pageSize: 25 }),
        ])
        if (!isMounted) return

        setProfileData({
          collections:
            collectionResult.status === 'fulfilled' ? collectionResult.value.results || [] : [],
          loans: loanResult.status === 'fulfilled' ? loanResult.value.results || [] : [],
          emiPayments:
            emiPaymentResult.status === 'fulfilled' ? emiPaymentResult.value.results || [] : [],
        })
        setSectionStatus({
          collections: {
            loading: false,
            error: collectionResult.status === 'rejected' ? sectionMessages.collections : '',
          },
          loans: {
            loading: false,
            error: loanResult.status === 'rejected' ? sectionMessages.loans : '',
          },
          emiPayments: {
            loading: false,
            error: emiPaymentResult.status === 'rejected' ? sectionMessages.emiPayments : '',
          },
        })
      } catch (exception) {
        if (!isMounted) return
        setCustomer(null)
        setProfileData(emptyProfileData)
        setSectionStatus(emptySectionStatus)
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
      <CustomerProfile
        customer={customer}
        collections={profileData.collections}
        loans={profileData.loans}
        emiPayments={profileData.emiPayments}
        sectionStatus={sectionStatus}
      />
    </div>
  )
}

export default CustomerDetailsPage
