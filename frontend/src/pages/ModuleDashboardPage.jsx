import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  FiAlertTriangle,
  FiArrowLeft,
  FiBarChart2,
  FiBriefcase,
  FiCalendar,
  FiClock,
  FiCreditCard,
  FiDatabase,
  FiEdit2,
  FiEye,
  FiSearch,
  FiLayers,
  FiShield,
  FiTrendingDown,
  FiTrendingUp,
  FiUsers,
} from 'react-icons/fi'
import { MdOutlinePayments } from 'react-icons/md'
import { Link, Navigate, useParams } from 'react-router-dom'
import Modal from '../components/Modal'
import StatusBadge from '../components/customers/StatusBadge'
import useAuth from '../hooks/useAuth'
import useDebouncedValue from '../hooks/useDebouncedValue'
import collectionService from '../services/collectionService'
import { getOptimizedImageUrl } from '../services/cloudinaryService'
import customerService from '../services/customerService'
import { listenDashboardStats, syncFinanceState } from '../services/dashboardService'
import {
  addDaysKey,
  addMonthsKey,
  elapsedMonthlyInstallments,
  moneyValue,
  numberValue,
  todayKey,
  USER_ROLES,
} from '../services/firestoreService'
import { formatDate } from '../utils/date'
import { formatCurrency } from '../utils/format'

const moduleConfig = {
  bachat: {
    title: 'Bachat Dashboard',
    label: 'Bachat',
    icon: MdOutlinePayments,
    tone: 'from-cyan-500 to-emerald-500',
  },
  saving: {
    title: 'Saving Dashboard',
    label: 'Saving',
    icon: FiShield,
    tone: 'from-emerald-500 to-teal-500',
  },
  loan: {
    title: 'Loan Dashboard',
    label: 'Loan',
    icon: FiCreditCard,
    tone: 'from-sky-500 to-indigo-500',
  },
  fd: {
    title: 'FD Dashboard',
    label: 'FD',
    icon: FiClock,
    tone: 'from-amber-500 to-orange-500',
  },
  deposit: {
    title: 'Deposit Dashboard',
    label: 'Deposit',
    icon: FiDatabase,
    tone: 'from-blue-500 to-cyan-500',
  },
  expenses: {
    title: 'Expenses Dashboard',
    label: 'Expenses',
    icon: FiTrendingDown,
    tone: 'from-rose-500 to-red-500',
  },
  bishi: {
    title: 'Bishi Dashboard',
    label: 'Bishi',
    icon: FiLayers,
    tone: 'from-violet-500 to-fuchsia-500',
  },
  investments: {
    title: 'Investments Dashboard',
    label: 'Investments',
    icon: FiBriefcase,
    tone: 'from-slate-700 to-slate-950',
  },
}

const baseStats = {
  modules: [],
  collectionTrend: [],
  overdueCustomers: [],
  recentTransactions: [],
  recentLoanPayments: [],
  collectorPerformance: [],
  totalCustomers: 0,
  activeLoans: 0,
  totalLoans: 0,
  totalSavings: 0,
  totalLoanGiven: 0,
  totalInvestments: 0,
  totalDeposits: 0,
  totalFdAmount: 0,
  totalBishiCollections: 0,
  totalWithdrawals: 0,
  totalMaturedPayouts: 0,
  dailyPendingAmount: 0,
  penaltyAmount: 0,
  emiOverdueAmount: 0,
  emiOverdueCount: 0,
  todayCollection: 0,
  todayEmiCollection: 0,
  monthlyCollection: 0,
  monthlyExpenses: 0,
  todayExpenses: 0,
  profitLossMtd: 0,
  remainingLoanBalance: 0,
}

const clampPercent = (value) => Math.max(Math.min(Number(value || 0), 100), 0)

function MoneyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-soft">
      <p className="font-semibold text-slate-900">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} className="text-slate-600">
          {item.name || item.dataKey}: {formatCurrency(item.value)}
        </p>
      ))}
    </div>
  )
}

function MetricTile({ label, value, currency = false, icon: Icon = FiBarChart2 }) {
  return (
    <article className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 font-display text-2xl font-bold text-slate-950">
            {currency ? formatCurrency(value) : value}
          </p>
        </div>
        <span className="rounded-lg bg-slate-100 p-2.5 text-slate-700">
          <Icon />
        </span>
      </div>
    </article>
  )
}

function getModuleMetrics(moduleId, stats, moduleSummary) {
  const defaults = [
    { label: 'Total Amount', value: moduleSummary?.amount || 0, currency: true, icon: FiBarChart2 },
    { label: 'Accounts', value: moduleSummary?.accounts || 0, icon: FiUsers },
    { label: 'Active', value: moduleSummary?.active || 0, icon: FiTrendingUp },
    { label: 'Pending / Due', value: moduleSummary?.pending || 0, currency: true, icon: FiAlertTriangle },
  ]

  const map = {
    bachat: [
      { label: 'Active Accounts', value: stats.totalCustomers, icon: FiUsers },
      { label: 'Matured Payouts', value: stats.totalMaturedPayouts, currency: true, icon: FiClock },
      { label: 'Penalties', value: stats.penaltyAmount, currency: true, icon: FiAlertTriangle },
      { label: 'Missed Payments', value: stats.dailyPendingAmount, currency: true, icon: FiAlertTriangle },
      { label: 'Premature Closures', value: stats.totalWithdrawals, currency: true, icon: FiTrendingDown },
      { label: 'Collection Progress', value: `${Math.round(clampPercent(moduleSummary?.progress))}%`, icon: FiTrendingUp },
    ],
    saving: [
      { label: 'Deposits', value: stats.totalSavings, currency: true, icon: FiDatabase },
      { label: 'Withdrawals', value: stats.totalWithdrawals, currency: true, icon: FiTrendingDown },
      { label: 'Current Balances', value: stats.totalSavings - stats.totalWithdrawals, currency: true, icon: FiShield },
      { label: 'Active Accounts', value: stats.totalCustomers, icon: FiUsers },
    ],
    loan: [
      { label: 'Loans Given', value: stats.totalLoanGiven, currency: true, icon: FiCreditCard },
      { label: 'EMI Collection', value: stats.todayEmiCollection, currency: true, icon: MdOutlinePayments },
      { label: 'Overdue', value: stats.emiOverdueAmount, currency: true, icon: FiAlertTriangle },
      { label: 'Penalties', value: stats.penaltyAmount, currency: true, icon: FiAlertTriangle },
      { label: 'Collector Performance', value: stats.collectorPerformance.length, icon: FiUsers },
      { label: 'Active Loans', value: stats.activeLoans, icon: FiTrendingUp },
    ],
    fd: [
      { label: 'Active FDs', value: moduleSummary?.active || 0, icon: FiClock },
      { label: 'FD Amount', value: stats.totalFdAmount, currency: true, icon: FiDatabase },
      { label: 'Maturity Tracking', value: moduleSummary?.pending || 0, currency: true, icon: FiAlertTriangle },
      { label: 'Interest Tracking', value: moduleSummary?.amount || 0, currency: true, icon: FiTrendingUp },
    ],
    deposit: [
      { label: 'Deposits', value: stats.totalDeposits, currency: true, icon: FiDatabase },
      { label: 'Accounts', value: moduleSummary?.accounts || 0, icon: FiUsers },
      { label: 'Active Deposits', value: moduleSummary?.active || 0, icon: FiTrendingUp },
      { label: 'Current Balance', value: stats.totalDeposits, currency: true, icon: FiShield },
    ],
    expenses: [
      { label: 'Operational Expenses', value: stats.monthlyExpenses, currency: true, icon: FiTrendingDown },
      { label: 'Salaries / Withdrawals', value: stats.totalWithdrawals, currency: true, icon: FiUsers },
      { label: 'Monthly Reports', value: stats.profitLossMtd, currency: true, icon: FiBarChart2 },
      { label: 'Today Expenses', value: stats.todayExpenses, currency: true, icon: FiClock },
    ],
    bishi: [
      { label: 'Groups', value: moduleSummary?.accounts || 0, icon: FiLayers },
      { label: 'Payouts', value: moduleSummary?.pending || 0, currency: true, icon: FiTrendingDown },
      { label: 'Next Rotations', value: moduleSummary?.active || 0, icon: FiClock },
      { label: 'Member Tracking', value: moduleSummary?.accounts || 0, icon: FiUsers },
    ],
    investments: [
      { label: 'Land Investments', value: stats.totalInvestments, currency: true, icon: FiBriefcase },
      { label: 'Asset Value', value: moduleSummary?.amount || 0, currency: true, icon: FiDatabase },
      { label: 'Growth %', value: `${Math.round(clampPercent(moduleSummary?.progress))}%`, icon: FiTrendingUp },
      { label: 'ROI', value: stats.profitLossMtd, currency: true, icon: FiBarChart2 },
      { label: 'Categories', value: moduleSummary?.accounts || 0, icon: FiLayers },
    ],
  }

  return map[moduleId] || defaults
}

function ModuleDashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-52 animate-pulse rounded-lg bg-slate-200" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="card h-28 animate-pulse bg-slate-100" />
        ))}
      </div>
    </div>
  )
}

const BACHAT_DURATION_MONTHS = 60
const BACHAT_INTEREST_ELIGIBILITY_MONTHS = 24

const customerRouteId = (customer) => customer?.id || customer?.customerId

const customerLookupIds = (customer) =>
  [...new Set([customer?.id, customer?.customerId].filter(Boolean).map(String))]

function BachatStatCard({ label, value, currency = false, icon: Icon = FiDatabase }) {
  return (
    <article className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 font-display text-2xl font-bold text-slate-950">
            {currency ? formatCurrency(value) : value}
          </p>
        </div>
        <span className="rounded-lg bg-cyan-50 p-2.5 text-cyan-700">
          <Icon />
        </span>
      </div>
    </article>
  )
}

function DetailItem({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-900">{value || '-'}</dd>
    </div>
  )
}

function BachatSummaryTile({ label, value, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-50 text-slate-950',
    emerald: 'bg-emerald-50 text-emerald-900',
    amber: 'bg-amber-50 text-amber-900',
    rose: 'bg-rose-50 text-rose-900',
    cyan: 'bg-cyan-50 text-cyan-900',
  }

  return (
    <div className={`rounded-lg p-4 ${tones[tone] || tones.slate}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-2 font-display text-xl font-bold">{value}</p>
    </div>
  )
}

function calculateBachatDetails(customer) {
  const dailyAmount = moneyValue(customer, 'dailyAmount')
  const monthlyAmount = dailyAmount * 30
  const totalDeposited = moneyValue(customer, 'totalSavings')
  const pendingAmount = moneyValue(customer, 'pendingAmount')
  const penaltyAmount = moneyValue(customer, 'penaltyAmount')
  const pendingDays = numberValue(customer.pendingDays)
  const startDate = customer.joiningDate || customer.lastDailySyncDate || todayKey()
  const maturityDate = addMonthsKey(startDate, BACHAT_DURATION_MONTHS)
  const completedMonths = Math.min(elapsedMonthlyInstallments(startDate), BACHAT_DURATION_MONTHS)
  const remainingMonths = Math.max(BACHAT_DURATION_MONTHS - completedMonths, 0)
  const paidMonths = monthlyAmount ? Math.min(Math.floor(totalDeposited / monthlyAmount), BACHAT_DURATION_MONTHS) : 0
  const missedMonths = Math.ceil(pendingDays / 30)
  const nextDueDate =
    customer.lastCollectionDate && customer.lastCollectionDate < todayKey()
      ? addDaysKey(customer.lastCollectionDate, 1)
      : todayKey()
  const totalDepositTarget = monthlyAmount * BACHAT_DURATION_MONTHS
  const maturityReward = moneyValue(customer, 'maturityReward') || moneyValue(customer, 'maturityRewardAmount')
  const maturityAmount = totalDepositTarget + maturityReward
  const paymentPercentage = totalDepositTarget ? (totalDeposited / totalDepositTarget) * 100 : 0
  const prematureClosureEligibility =
    completedMonths >= BACHAT_INTEREST_ELIGIBILITY_MONTHS
      ? 'Interest eligibility after closure review'
      : 'Original deposited amount only'

  return {
    dailyAmount,
    monthlyAmount,
    totalDeposited,
    pendingAmount,
    penaltyAmount,
    pendingDays,
    startDate,
    maturityDate,
    completedMonths,
    remainingMonths,
    paidMonths,
    missedMonths,
    nextDueDate,
    totalDepositTarget,
    maturityReward,
    maturityAmount,
    paymentPercentage,
    prematureClosureEligibility,
  }
}

function BachatCustomerModal({ customer, collections, sectionStatus, user, onClose }) {
  if (!customer) return null

  const details = calculateBachatDetails(customer)
  const profilePhotoUrl = getOptimizedImageUrl(
    customer.profilePhotoUrl || customer.photoUrl || customer.photo,
    { width: 192, height: 192, crop: 'fill' },
  )
  const routeId = customerRouteId(customer)
  const isAdmin = user?.role === USER_ROLES.admin

  return (
    <Modal
      isOpen={Boolean(customer)}
      title="Bachat Account Workstation"
      onClose={onClose}
      sizeClass="max-w-6xl"
      panelClass="max-h-[90vh] overflow-y-auto"
    >
      <div className="space-y-5">
        <section className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <aside className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
                {profilePhotoUrl ? (
                  <img
                    src={profilePhotoUrl}
                    alt={customer.shopName || customer.ownerName}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <FiUsers className="text-3xl text-slate-400" />
                )}
              </div>
              <h3 className="mt-4 font-display text-xl font-bold text-slate-950">
                {customer.shopName || customer.ownerName}
              </h3>
              <p className="mt-1 text-sm text-slate-500">{customer.customerId || customer.id}</p>
              <div className="mt-3">
                <StatusBadge status={customer.status} />
              </div>
            </div>

            <dl className="mt-5 space-y-4">
              <DetailItem label="Customer Name" value={customer.ownerName} />
              <DetailItem label="Mobile Number" value={customer.mobile} />
              <DetailItem label="Address" value={customer.address || customer.area} />
              <DetailItem label="Joined / Start Date" value={formatDate(details.startDate)} />
            </dl>
          </aside>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <BachatSummaryTile label="Daily Amount" value={formatCurrency(details.dailyAmount)} />
              <BachatSummaryTile label="Monthly Amount" value={formatCurrency(details.monthlyAmount)} tone="cyan" />
              <BachatSummaryTile label="Maturity Amount" value={formatCurrency(details.maturityAmount)} tone="emerald" />
              <BachatSummaryTile label="Total Deposited" value={formatCurrency(details.totalDeposited)} tone="emerald" />
            </div>

            <section className="rounded-lg border border-slate-200 p-4">
              <h3 className="section-title mb-4">Account Details</h3>
              <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <DetailItem label="Start Date" value={formatDate(details.startDate)} />
                <DetailItem label="Maturity Date" value={formatDate(details.maturityDate)} />
                <DetailItem label="Total Duration" value={`${BACHAT_DURATION_MONTHS} months`} />
                <DetailItem label="Completed Months" value={details.completedMonths} />
                <DetailItem label="Remaining Months" value={details.remainingMonths} />
                <DetailItem label="Next Due Date" value={formatDate(details.nextDueDate)} />
              </dl>
            </section>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-lg border border-slate-200 p-4">
            <h3 className="section-title mb-4">Penalty / Payment</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <BachatSummaryTile label="Pending Amount" value={formatCurrency(details.pendingAmount)} tone="amber" />
              <BachatSummaryTile label="Penalty Amount" value={formatCurrency(details.penaltyAmount)} tone="rose" />
              <BachatSummaryTile label="Missed Months" value={details.missedMonths} tone="amber" />
              <BachatSummaryTile label="Paid Months" value={details.paidMonths} tone="emerald" />
              <BachatSummaryTile label="Payment Percentage" value={`${Math.round(details.paymentPercentage)}%`} tone="cyan" />
              <BachatSummaryTile label="Account Status" value={customer.status || 'active'} />
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 p-4">
            <h3 className="section-title mb-4">Maturity</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <BachatSummaryTile label="Deposit Target" value={formatCurrency(details.totalDepositTarget)} />
              <BachatSummaryTile label="Maturity Reward" value={formatCurrency(details.maturityReward)} tone="emerald" />
              <BachatSummaryTile label="Maturity Amount" value={formatCurrency(details.maturityAmount)} tone="emerald" />
              <BachatSummaryTile label="Premature Closure" value={details.prematureClosureEligibility} tone="amber" />
            </div>
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              No partial withdrawals are supported for Bachat accounts.
            </p>
          </article>
        </section>

        <section className="rounded-lg border border-slate-200">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="section-title">Recent Collections</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Collector</th>
                  <th className="px-4 py-3">Payment Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {sectionStatus.loading ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan="4">
                      Loading recent collections...
                    </td>
                  </tr>
                ) : collections.length ? (
                  collections.map((collection) => (
                    <tr key={collection.collectionId || collection.id}>
                      <td className="px-4 py-3 text-slate-700">{formatDate(collection.date)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-950">
                        {formatCurrency(moneyValue(collection, 'amount'))}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{collection.collectorName || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{collection.paymentMethod || '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan="4">
                      {sectionStatus.error || 'No collections recorded for this customer yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:flex-wrap sm:justify-end">
          <Link to={`/customers/${routeId}`} className="btn-secondary gap-2">
            <FiEye />
            View Payment History
          </Link>
          <Link to="/pending-customers" className="btn-secondary gap-2">
            <FiCalendar />
            View Missed Payments
          </Link>
          <Link to="/penalties" className="btn-secondary gap-2">
            <FiAlertTriangle />
            View Penalty Details
          </Link>
          {isAdmin ? (
            <Link to={`/customers/${routeId}/edit`} className="btn-secondary gap-2">
              <FiEdit2 />
              Edit Account
            </Link>
          ) : (
            <button type="button" className="btn-secondary gap-2 opacity-60" disabled>
              <FiEdit2 />
              Edit Account
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-primary">
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}

function BachatDashboardView({ stats, moduleSummary, user }) {
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [collections, setCollections] = useState([])
  const [collectionStatus, setCollectionStatus] = useState({ loading: false, error: '' })
  const debouncedSearch = useDebouncedValue(search, 250)

  useEffect(() => {
    const term = debouncedSearch.trim()
    if (!user || term.length < 2) {
      setSearchResults([])
      setSearchLoading(false)
      setSearchError('')
      return undefined
    }

    let isMounted = true
    setSearchLoading(true)
    setSearchError('')

    Promise.allSettled([
      customerService.searchCustomers({ term, currentUser: user, pageSize: 8 }),
      customerService.getById(term),
    ])
      .then(([searchResult, exactResult]) => {
        if (!isMounted) return
        const merged = new Map()
        if (searchResult.status === 'fulfilled') {
          ;(searchResult.value.results || []).forEach((customer) => {
            merged.set(customerRouteId(customer), customer)
          })
        }
        if (exactResult.status === 'fulfilled') {
          merged.set(customerRouteId(exactResult.value), exactResult.value)
        }
        setSearchResults([...merged.values()].slice(0, 8))
        if (searchResult.status === 'rejected' && exactResult.status === 'rejected') {
          setSearchError('No indexed customer match found.')
        }
      })
      .finally(() => {
        if (isMounted) setSearchLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [debouncedSearch, user])

  const openCustomer = (customer) => {
    setSelectedCustomer(customer)
    setSearch('')
    setSearchResults([])
    setCollections([])
    setCollectionStatus({ loading: true, error: '' })

    collectionService
      .getByCustomerIds({
        customerIds: customerLookupIds(customer),
        currentUser: user,
        pageSize: 12,
      })
      .then((result) => {
        setCollections(result.results || [])
        setCollectionStatus({ loading: false, error: '' })
      })
      .catch(() => {
        setCollections([])
        setCollectionStatus({
          loading: false,
          error: 'Recent collections could not be loaded right now.',
        })
      })
  }

  const operationalCards = [
    { label: 'Active Accounts', value: stats.totalCustomers, icon: FiUsers },
    { label: 'Matured Payouts', value: stats.totalMaturedPayouts, currency: true, icon: FiClock },
    { label: 'Penalties', value: stats.penaltyAmount, currency: true, icon: FiAlertTriangle },
    { label: 'Missed Payments', value: stats.dailyPendingAmount, currency: true, icon: FiCalendar },
    { label: 'Premature Closures', value: stats.totalWithdrawals, currency: true, icon: FiTrendingDown },
  ]

  return (
    <div className="space-y-6">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-700">
        <FiArrowLeft />
        Main Dashboard
      </Link>

      <section className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h2 className="page-title">Bachat Dashboard</h2>
          <p className="mt-1 text-sm text-slate-500">Fixed Deposit Collection Operations</p>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="overflow-hidden rounded-lg bg-slate-950 text-white shadow-soft">
          <div className="relative p-5 md:p-6">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.22),transparent_35%),linear-gradient(135deg,rgba(15,23,42,0),rgba(8,145,178,0.14))]" />
            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">
                Total Bachat Amount
              </p>
              <p className="mt-3 font-display text-4xl font-bold md:text-5xl">
                {formatCurrency(moduleSummary?.amount || stats.totalSavings)}
              </p>
              <p className="mt-3 text-sm font-medium text-cyan-100">
                Active customer Bachat deposits
              </p>
            </div>
          </div>
        </article>

        <article className="card p-5">
          <div className="mb-4">
            <h3 className="section-title">Search Customer</h3>
            <p className="text-sm text-slate-500">Search by customer ID, customer name, or mobile number.</p>
          </div>
          <div className="relative">
            <FiSearch className="pointer-events-none absolute left-4 top-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="input-field h-14 pl-11 text-base"
              placeholder="Search SBG0001, customer name, or mobile"
            />
          </div>
          <div className="mt-3 rounded-lg border border-slate-200 bg-white">
            {searchLoading && (
              <p className="px-4 py-4 text-sm text-slate-500">Searching customers...</p>
            )}
            {!searchLoading &&
              searchResults.map((customer) => (
                <button
                  key={customerRouteId(customer)}
                  type="button"
                  onClick={() => openCustomer(customer)}
                  className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-cyan-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-950">
                      {customer.shopName || customer.ownerName}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {customer.customerId || customer.id} | {customer.mobile || '-'}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-slate-800">
                    {formatCurrency(moneyValue(customer, 'dailyAmount'))}
                  </span>
                </button>
              ))}
            {!searchLoading && debouncedSearch.trim().length >= 2 && !searchResults.length && (
              <p className="px-4 py-4 text-sm text-slate-500">
                {searchError || 'No customers found.'}
              </p>
            )}
            {!searchLoading && debouncedSearch.trim().length < 2 && (
              <p className="px-4 py-4 text-sm text-slate-500">
                Enter at least 2 characters to search.
              </p>
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {operationalCards.map((card) => (
          <BachatStatCard key={card.label} {...card} />
        ))}
      </section>

      <BachatCustomerModal
        customer={selectedCustomer}
        collections={collections}
        sectionStatus={collectionStatus}
        user={user}
        onClose={() => setSelectedCustomer(null)}
      />
    </div>
  )
}

function ModuleDashboardPage() {
  const { moduleId } = useParams()
  const config = moduleConfig[moduleId]
  const { user } = useAuth()
  const [stats, setStats] = useState(baseStats)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !config) return undefined

    let isMounted = true
    syncFinanceState(user).catch((error) => {
      if (isMounted) toast.error(error.message || 'Unable to sync finance status.')
    })

    const unsubscribe = listenDashboardStats(
      user,
      (nextStats) => {
        setStats({ ...baseStats, ...nextStats })
        setLoading(false)
      },
      (error) => {
        toast.error(error.message)
        setLoading(false)
      },
    )

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [config, user])

  const moduleSummary = useMemo(
    () => stats.modules.find((item) => item.id === moduleId),
    [moduleId, stats.modules],
  )
  const metrics = useMemo(
    () => getModuleMetrics(moduleId, stats, moduleSummary),
    [moduleId, moduleSummary, stats],
  )
  const transactionRows = useMemo(() => {
    const keyword = config?.label?.toLowerCase()
    if (!keyword) return stats.recentTransactions
    return stats.recentTransactions.filter((item) =>
      `${item.type} ${item.title}`.toLowerCase().includes(keyword),
    )
  }, [config?.label, stats.recentTransactions])

  if (!config) return <Navigate to="/dashboard" replace />
  if (loading) return <ModuleDashboardSkeleton />
  if (moduleId === 'bachat') {
    return <BachatDashboardView stats={stats} moduleSummary={moduleSummary} user={user} />
  }

  const Icon = config.icon
  const progress = clampPercent(moduleSummary?.progress)

  return (
    <div className="space-y-5">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-700">
        <FiArrowLeft />
        Main Dashboard
      </Link>

      <section className="overflow-hidden rounded-lg bg-slate-950 text-white shadow-soft">
        <div className="grid gap-5 p-5 md:p-6 xl:grid-cols-[1fr_auto] xl:items-end">
          <div>
            <span className={`inline-flex rounded-lg bg-gradient-to-br p-3 text-white ${config.tone}`}>
              <Icon size={24} />
            </span>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">
              Module Sub-Dashboard
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold md:text-4xl">{config.title}</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Focused realtime view for accounts, collections, pending exposure, and operating
              status in this finance module.
            </p>
          </div>
          <div className="min-w-64 rounded-lg border border-white/10 bg-white/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Total Module Amount
            </p>
            <p className="mt-2 font-display text-3xl font-bold">
              {formatCurrency(moduleSummary?.amount || 0)}
            </p>
            <div className="mt-4 h-2 rounded-full bg-white/10">
              <div
                className={`h-2 rounded-full bg-gradient-to-r ${config.tone}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-300">{Math.round(progress)}% progress</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricTile key={metric.label} {...metric} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="card p-4">
          <div className="mb-4">
            <h3 className="section-title">Collection Progress</h3>
            <p className="text-sm text-slate-500">Realtime trend from the shared finance stream.</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.collectionTrend}>
                <defs>
                  <linearGradient id="moduleCollection" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0891b2" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#0891b2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `INR ${value}`} />
                <Tooltip content={<MoneyTooltip />} />
                <Area
                  type="monotone"
                  dataKey={moduleId === 'loan' ? 'emi' : 'daily'}
                  name={moduleId === 'loan' ? 'EMI' : 'Daily'}
                  stroke="#0891b2"
                  strokeWidth={2}
                  fill="url(#moduleCollection)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="card p-4">
          <div className="mb-4">
            <h3 className="section-title">Collector Performance</h3>
            <p className="text-sm text-slate-500">Collections and EMI contribution.</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.collectorPerformance} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="collectorName"
                  width={105}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<MoneyTooltip />} />
                <Bar dataKey="totalAmount" name="Total" fill="#0f766e" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="section-title">Module Transactions</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {(transactionRows.length ? transactionRows : stats.recentTransactions).map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-semibold text-slate-950">{item.title}</td>
                    <td className="px-4 py-3 text-slate-600">{item.type}</td>
                    <td className="px-4 py-3 text-slate-600">{item.date || '-'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      {formatCurrency(item.amount)}
                    </td>
                  </tr>
                ))}
                {stats.recentTransactions.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan="4">
                      No module transactions yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="section-title">Risk And Pending Queue</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Shop</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Days</th>
                  <th className="px-4 py-3">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {stats.overdueCustomers.map((customer) => (
                  <tr key={customer.customerId || customer.id}>
                    <td className="px-4 py-3 font-semibold text-slate-950">{customer.shopName}</td>
                    <td className="px-4 py-3 text-slate-600">{customer.ownerName}</td>
                    <td className="px-4 py-3 text-slate-900">{customer.pendingDays}</td>
                    <td className="px-4 py-3 font-semibold text-rose-700">
                      {formatCurrency(customer.pendingAmount)}
                    </td>
                  </tr>
                ))}
                {stats.overdueCustomers.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan="4">
                      No pending risk items
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  )
}

export default ModuleDashboardPage
