import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FiEdit2 } from 'react-icons/fi'
import CustomerProfile from '../components/customers/CustomerProfile'
import Loader from '../components/Loader'
import Modal from '../components/Modal'
import bachatService from '../services/bachatService'
import collectionService from '../services/collectionService'
import customerService from '../services/customerService'
import fdService from '../services/fdService'
import loanService from '../services/loanService'
import paymentService from '../services/paymentService'
import useAuth from '../hooks/useAuth'

const moduleIds = ['bachat', 'dailyCollection', 'loan', 'fd']

const emptyModuleData = moduleIds.reduce((state, moduleId) => ({ ...state, [moduleId]: null }), {})
const emptyModuleStatus = moduleIds.reduce(
  (state, moduleId) => ({ ...state, [moduleId]: { loading: false, error: '' } }),
  {},
)

const moduleFlags = {
  bachat: 'bachat',
  dailyCollection: 'dailyCollection',
  loan: 'loan',
  fd: 'fd',
}

const moduleErrorMessages = {
  bachat: 'Bachat records are unavailable right now. Check Bachat indexes or permissions.',
  dailyCollection: 'Daily Collection records are unavailable right now. Check indexes or permissions.',
  loan: 'Loan records are unavailable right now. Check loan account or EMI permissions.',
  fd: 'FD records are unavailable right now. Check FD account permissions.',
}

const customerLookupIds = (customer, routeCustomerId) =>
  [...new Set([customer?.id, customer?.customerId, routeCustomerId].filter(Boolean).map(String))]

const canonicalCustomerId = (customer, routeCustomerId) =>
  customer?.customerId || customer?.id || routeCustomerId

function CustomerDetailsPage() {
  const { customerId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [customer, setCustomer] = useState(null)
  const [activeModule, setActiveModule] = useState('bachat')
  const [moduleData, setModuleData] = useState(emptyModuleData)
  const [moduleStatus, setModuleStatus] = useState(emptyModuleStatus)
  const [dailyEnrollOpen, setDailyEnrollOpen] = useState(false)
  const [dailyEnrollAmount, setDailyEnrollAmount] = useState('')
  const [dailyEnrollSaving, setDailyEnrollSaving] = useState(false)

  useEffect(() => {
    let isMounted = true

    const fetchCustomer = async () => {
      setLoading(true)
      setError('')
      setCustomer(null)
      setModuleData(emptyModuleData)
      setModuleStatus(emptyModuleStatus)
      try {
        const customerData = await customerService.getById(customerId)
        if (!isMounted) return
        setCustomer(customerData)
      } catch (exception) {
        if (!isMounted) return
        setCustomer(null)
        setError(exception.message || 'Unable to load customer details.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchCustomer()

    return () => {
      isMounted = false
    }
  }, [customerId])

  useEffect(() => {
    if (!customer) return undefined

    const flag = moduleFlags[activeModule]
    const isEnrolled =
      Boolean(customer.moduleFlags?.[flag]) ||
      (activeModule === 'bachat' && Boolean(customer.bachatRejoinBlockedUntil))

    if (!isEnrolled) {
      setModuleStatus((previous) => ({
        ...previous,
        [activeModule]: { loading: false, error: '' },
      }))
      return undefined
    }

    let isMounted = true
    const lookupIds = customerLookupIds(customer, customerId)
    const accountId = canonicalCustomerId(customer, customerId)

    const loadModuleData = async () => {
      setModuleStatus((previous) => ({
        ...previous,
        [activeModule]: { loading: true, error: '' },
      }))

      try {
        let nextData = null

        if (activeModule === 'bachat') {
          const [account, collectionsResponse, penaltiesByCustomer, closure] = await Promise.all([
            bachatService.getBachatAccount(accountId),
            bachatService.getBachatCollectionsByCustomer({
              customerId: accountId,
              currentUser: user,
              pageSize: 25,
            }),
            bachatService.getLatestBachatPenaltiesForCustomers({
              customerIds: [accountId],
              currentUser: user,
            }),
            bachatService.getLatestBachatClosureByCustomer({
              customerId: accountId,
              currentUser: user,
            }),
          ])
          nextData = {
            account,
            collections: collectionsResponse.results || [],
            penalty: penaltiesByCustomer[accountId] || null,
            closure,
          }
        }

        if (activeModule === 'dailyCollection') {
          const [account, collectionsResponse] = await Promise.all([
            collectionService.getDailyCollectionAccount(accountId),
            collectionService.getByCustomerIds({
              customerIds: lookupIds,
              currentUser: user,
              pageSize: 25,
            }),
          ])
          nextData = {
            account,
            collections: collectionsResponse.results || [],
          }
        }

        if (activeModule === 'loan') {
          const [account, paymentsResponse] = await Promise.all([
            loanService.getLoanAccount(accountId),
            paymentService.getCustomerEmiPayments({
              customerIds: lookupIds,
              currentUser: user,
              pageSize: 25,
            }),
          ])
          nextData = {
            account,
            payments: paymentsResponse.results || [],
          }
        }

        if (activeModule === 'fd') {
          const account = await fdService.getFdAccount(accountId)
          nextData = { account }
        }

        if (!isMounted) return
        setModuleData((previous) => ({ ...previous, [activeModule]: nextData }))
        setModuleStatus((previous) => ({
          ...previous,
          [activeModule]: { loading: false, error: '' },
        }))
      } catch {
        if (!isMounted) return
        setModuleData((previous) => ({ ...previous, [activeModule]: null }))
        setModuleStatus((previous) => ({
          ...previous,
          [activeModule]: { loading: false, error: moduleErrorMessages[activeModule] },
        }))
      }
    }

    loadModuleData()

    return () => {
      isMounted = false
    }
  }, [activeModule, customer, customerId, user])

  const enrollDailyCollection = async (event) => {
    event.preventDefault()
    if (!customer) return

    setDailyEnrollSaving(true)
    setError('')
    try {
      await collectionService.enrollDailyCollectionAccount({
        customer,
        payload: { dailyAmount: dailyEnrollAmount },
        currentUser: user,
      })
      const refreshedCustomer = await customerService.getById(customerId)
      setCustomer(refreshedCustomer)
      setModuleData((previous) => ({ ...previous, dailyCollection: null }))
      setDailyEnrollOpen(false)
      setDailyEnrollAmount('')
      setActiveModule('dailyCollection')
    } catch (exception) {
      setError(exception.message || 'Unable to enroll customer in Daily Collection.')
    } finally {
      setDailyEnrollSaving(false)
    }
  }

  const handleEnrollModule = (moduleId) => {
    if (moduleId === 'dailyCollection' && user?.role === 'admin') {
      setDailyEnrollOpen(true)
      return
    }

    if (moduleId === 'bachat') {
      navigate('/dashboard/bachat')
      return
    }

    if (moduleId === 'loan') {
      navigate('/loans')
      return
    }

    if (moduleId === 'fd') {
      navigate('/dashboard/fd')
    }
  }

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
          <h2 className="page-title">Customer Hub</h2>
          <p className="mt-1 text-sm text-slate-600">Central identity profile with isolated module records.</p>
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
        activeModule={activeModule}
        onModuleChange={setActiveModule}
        moduleData={moduleData}
        moduleStatus={moduleStatus}
        onEnrollModule={handleEnrollModule}
      />

      <Modal
        isOpen={dailyEnrollOpen}
        title="Enroll Daily Collection"
        onClose={() => setDailyEnrollOpen(false)}
      >
        <form className="space-y-4" onSubmit={enrollDailyCollection}>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Daily Collection Amount</span>
            <input
              type="number"
              min="1"
              className="input-field"
              value={dailyEnrollAmount}
              onChange={(event) => setDailyEnrollAmount(event.target.value)}
              required
            />
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setDailyEnrollOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={dailyEnrollSaving}>
              {dailyEnrollSaving ? 'Enrolling...' : 'Enroll'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default CustomerDetailsPage
