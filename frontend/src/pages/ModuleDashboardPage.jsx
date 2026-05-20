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
  FiSearch,
  FiLayers,
  FiShield,
  FiTrendingDown,
  FiTrendingUp,
  FiUsers,
} from 'react-icons/fi'
import { MdOutlinePayments } from 'react-icons/md'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import Modal from '../components/Modal'
import useAuth from '../hooks/useAuth'
import useDebouncedValue from '../hooks/useDebouncedValue'
import {
  BACHAT_RULES,
  enrollCustomerToBachat,
  getBachatEnrollmentStatus,
  listenBachatSummary,
} from '../services/bachatService'
import customerService from '../services/customerService'
import { listenDashboardStats, syncFinanceState } from '../services/dashboardService'
import {
  moneyValue,
  numberValue,
  todayKey,
} from '../services/firestoreService'
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

const BACHAT_DURATION_MONTHS = BACHAT_RULES.defaultDurationMonths

const customerRouteId = (customer) => customer?.id || customer?.customerId

const customerLabel = (customer) => customer?.fullName || customer?.ownerName || customer?.shopName || 'Customer'

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

const enrollmentDefaults = {
  dailyAmount: 100,
  durationMonths: BACHAT_DURATION_MONTHS,
  maturityReward: 0,
  startDate: todayKey(),
}

const createEnrollmentModalState = (overrides = {}) => ({
  open: false,
  customer: null,
  account: null,
  form: enrollmentDefaults,
  saving: false,
  checkingStatus: false,
  isEnrolled: false,
  statusMessage: '',
  error: '',
  ...overrides,
})

function BachatDashboardView({ user }) {
  const navigate = useNavigate()
  const [summary, setSummary] = useState({
    activeAccounts: 0,
    activeDailyExpected: 0,
    totalCollected: 0,
    penalties: 0,
    todayCollection: 0,
    todayPendingAmount: 0,
    monthlyCollection: 0,
    missedPayments: 0,
    maturedAccounts: 0,
    prematureClosures: 0,
  })
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [enrollModal, setEnrollModal] = useState(createEnrollmentModalState())
  const [enrollSearch, setEnrollSearch] = useState('')
  const [enrollResults, setEnrollResults] = useState([])
  const [enrollLoading, setEnrollLoading] = useState(false)
  const debouncedSearch = useDebouncedValue(search, 250)
  const debouncedEnrollSearch = useDebouncedValue(enrollSearch, 250)

  useEffect(() => {
    if (!user) return undefined
    return listenBachatSummary(
      (nextSummary) =>
        setSummary({
          activeAccounts: numberValue(nextSummary.activeAccounts),
          activeDailyExpected: moneyValue(nextSummary, 'activeDailyExpected'),
          totalCollected: moneyValue(nextSummary, 'totalCollected'),
          penalties: moneyValue(nextSummary, 'penalties'),
          todayCollection: moneyValue(nextSummary, 'todayCollection'),
          todayPendingAmount: moneyValue(nextSummary, 'todayPendingAmount'),
          monthlyCollection: moneyValue(nextSummary, 'monthlyCollection'),
          missedPayments: numberValue(nextSummary.missedPayments),
          maturedAccounts: numberValue(nextSummary.maturedAccounts),
          prematureClosures: numberValue(nextSummary.prematureClosures),
        }),
      () => {},
    )
  }, [user])

  const todayCollectionProgress = useMemo(() => {
    if (summary.activeDailyExpected <= 0) return 0
    return clampPercent((summary.todayCollection / summary.activeDailyExpected) * 100)
  }, [summary.activeDailyExpected, summary.todayCollection])

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

  useEffect(() => {
    const term = debouncedEnrollSearch.trim()
    if (!enrollModal.open || !user || term.length < 2) {
      setEnrollResults([])
      setEnrollLoading(false)
      return undefined
    }

    let isMounted = true
    setEnrollLoading(true)
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
        setEnrollResults([...merged.values()].slice(0, 8))
      })
      .finally(() => {
        if (isMounted) setEnrollLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [debouncedEnrollSearch, enrollModal.open, user])

  const openEnrollmentModal = (customer = null) => {
    setEnrollSearch(customer ? customer.customerId || '' : '')
    setEnrollModal(
      createEnrollmentModalState({
        open: true,
        customer,
        form: {
          ...enrollmentDefaults,
          dailyAmount: numberValue(customer?.dailyAmount, enrollmentDefaults.dailyAmount),
          startDate: todayKey(),
        },
      }),
    )
    if (customer) {
      resolveEnrollmentCandidate(customer)
    }
  }

  const resolveEnrollmentCandidate = async (customer) => {
    if (!user || !customer) return

    setEnrollModal((previous) => ({
      ...previous,
      customer,
      account: null,
      checkingStatus: true,
      isEnrolled: false,
      statusMessage: '',
      error: '',
      form: {
        ...previous.form,
        dailyAmount: numberValue(customer?.dailyAmount, previous.form.dailyAmount),
      },
    }))

    try {
      const status = await getBachatEnrollmentStatus({
        customerId: customer.customerId || customer.id,
        currentUser: user,
      })
      setEnrollModal((previous) => ({
        ...previous,
        customer: status.customer || customer,
        account: status.account || null,
        checkingStatus: false,
        isEnrolled: Boolean(status.isEnrolled),
        statusMessage: status.isEnrolled
          ? 'Customer already enrolled in Bachat.'
          : 'Customer not enrolled in Bachat. Complete enrollment details.',
        error: '',
        form: {
          ...previous.form,
          dailyAmount: numberValue(
            status.customer?.dailyAmount,
            numberValue(customer?.dailyAmount, previous.form.dailyAmount),
          ),
        },
      }))
    } catch (error) {
      setEnrollModal((previous) => ({
        ...previous,
        checkingStatus: false,
        account: null,
        isEnrolled: false,
        statusMessage: '',
        error: error.message || 'Unable to verify enrollment status.',
      }))
    }
  }

  const closeEnrollmentModal = () => {
    setEnrollModal(createEnrollmentModalState())
    setEnrollSearch('')
    setEnrollResults([])
  }

  const viewEnrolledAccountFromModal = async () => {
    if (!enrollModal.customer) return
    const routeId = customerRouteId(enrollModal.customer)
    closeEnrollmentModal()
    if (routeId) {
      navigate(`/bachat/profile/${routeId}`)
    }
  }

  const openBachatProfile = (customer) => {
    const routeId = customerRouteId(customer)
    if (!routeId) return
    setSearch('')
    setSearchResults([])
    navigate(`/bachat/profile/${routeId}`)
  }

  const updateEnrollForm = (field, value) => {
    setEnrollModal((previous) => ({
      ...previous,
      form: { ...previous.form, [field]: value },
    }))
  }

  const handleEnroll = async () => {
    if (!enrollModal.customer) {
      setEnrollModal((previous) => ({ ...previous, error: 'Select customer to enroll.' }))
      return
    }
    if (enrollModal.isEnrolled) {
      setEnrollModal((previous) => ({
        ...previous,
        error: 'Customer already enrolled in Bachat.',
      }))
      return
    }

    setEnrollModal((previous) => ({ ...previous, saving: true, error: '' }))
    try {
      const latestStatus = await getBachatEnrollmentStatus({
        customerId: enrollModal.customer.customerId || enrollModal.customer.id,
        currentUser: user,
      })
      if (latestStatus.isEnrolled) {
        setEnrollModal((previous) => ({
          ...previous,
          saving: false,
          customer: latestStatus.customer || previous.customer,
          account: latestStatus.account || previous.account,
          isEnrolled: true,
          statusMessage: 'Customer already enrolled in Bachat.',
          error: '',
        }))
        return
      }

      await enrollCustomerToBachat({
        customer: enrollModal.customer,
        payload: {
          ...enrollModal.form,
          dailyAmount: Number(enrollModal.form.dailyAmount || 0),
          durationMonths: Number(enrollModal.form.durationMonths || BACHAT_DURATION_MONTHS),
          maturityReward: Number(enrollModal.form.maturityReward || 0),
        },
        currentUser: user,
      })
      toast.success('Customer enrolled in Bachat module.')
      const routeId = customerRouteId(enrollModal.customer)
      closeEnrollmentModal()
      if (routeId) {
        navigate(`/bachat/profile/${routeId}`)
      }
    } catch (error) {
      setEnrollModal((previous) => ({
        ...previous,
        saving: false,
        error: error.message || 'Unable to enroll customer.',
      }))
    }
  }

  const operationalCards = useMemo(
    () => [
      { label: 'Active Accounts', value: summary.activeAccounts, icon: FiUsers },
      { label: "Today's Target", value: summary.activeDailyExpected, currency: true, icon: FiCalendar },
      { label: "Today's Collection", value: summary.todayCollection, currency: true, icon: MdOutlinePayments },
      { label: 'Collection Progress', value: `${Math.round(todayCollectionProgress)}%`, icon: FiTrendingUp },
      { label: "Today's Pending Amount", value: summary.todayPendingAmount, currency: true, icon: FiAlertTriangle },
      { label: 'Penalties', value: summary.penalties, currency: true, icon: FiAlertTriangle },
      { label: 'Missed Payments', value: summary.missedPayments, icon: FiCalendar },
      { label: 'Matured Accounts', value: summary.maturedAccounts, icon: FiClock },
      { label: 'Premature Closures', value: summary.prematureClosures, icon: FiTrendingDown },
    ],
    [summary, todayCollectionProgress],
  )

  return (
    <div className="space-y-6">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-700">
        <FiArrowLeft />
        Main Dashboard
      </Link>

      <section className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h2 className="page-title">Bachat Dashboard</h2>
          <p className="mt-1 text-sm text-slate-500">Module enrollment and account operations.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/bachat/collect" className="btn-secondary gap-2">
            Open Bachat Daily Collection
          </Link>
          <button type="button" className="btn-primary gap-2" onClick={() => openEnrollmentModal()}>
            Add Customer To Bachat
          </button>
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
                {formatCurrency(summary.totalCollected)}
              </p>
              <p className="mt-3 text-sm font-medium text-cyan-100">
                Monthly collection {formatCurrency(summary.monthlyCollection)} | Target {formatCurrency(summary.activeDailyExpected)}
              </p>
              <div className="mt-4 h-2 rounded-full bg-white/20">
                <div
                  className="h-2 rounded-full bg-cyan-300 transition-all"
                  style={{ width: `${Math.round(todayCollectionProgress)}%` }}
                />
              </div>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-cyan-100">
                Today progress: {Math.round(todayCollectionProgress)}% ({formatCurrency(summary.todayCollection)} / {formatCurrency(summary.activeDailyExpected)})
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
                  onClick={() => openBachatProfile(customer)}
                  className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-cyan-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-950">{customerLabel(customer)}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {customer.customerId || customer.id} | {customer.mobile || '-'}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-slate-800">{formatCurrency(moneyValue(customer, 'dailyAmount'))}</span>
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {operationalCards.map((card) => (
          <BachatStatCard key={card.label} {...card} />
        ))}
      </section>

      <Modal
        isOpen={enrollModal.open}
        title="Add Customer To Bachat"
        onClose={closeEnrollmentModal}
        sizeClass="max-w-2xl"
      >
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Search Existing Customer</h4>
            <div className="relative mt-2">
              <FiSearch className="pointer-events-none absolute left-3 top-3.5 text-slate-400" />
              <input
                type="search"
                value={enrollSearch}
                onChange={(event) => setEnrollSearch(event.target.value)}
                placeholder="Search SBG0001, name, or mobile"
                className="input-field pl-10"
              />
            </div>
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white">
              {enrollLoading && <p className="px-3 py-2 text-sm text-slate-500">Searching...</p>}
              {!enrollLoading &&
                enrollResults.map((customer) => (
                  <button
                    key={customerRouteId(customer)}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-cyan-50"
                    onClick={() => resolveEnrollmentCandidate(customer)}
                  >
                    <span className="text-sm font-semibold text-slate-900">{customerLabel(customer)}</span>
                    <span className="text-xs text-slate-500">{customer.customerId || customer.id}</span>
                  </button>
                ))}
              {!enrollLoading && debouncedEnrollSearch.trim().length >= 2 && !enrollResults.length && (
                <p className="px-3 py-2 text-sm text-slate-500">No customers found.</p>
              )}
            </div>
          </div>
          {!enrollModal.customer ? (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Select customer and enrollment status will be checked immediately.
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-900">{customerLabel(enrollModal.customer)}</p>
              <p className="text-slate-600">{enrollModal.customer.customerId || enrollModal.customer.id}</p>
            </div>
          )}
          {enrollModal.checkingStatus && (
            <div className="rounded-lg bg-cyan-50 px-3 py-2 text-sm text-cyan-800">
              Checking Bachat enrollment status...
            </div>
          )}
          {!enrollModal.checkingStatus && enrollModal.statusMessage && (
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
              {enrollModal.statusMessage}
            </div>
          )}
          {!enrollModal.isEnrolled && !enrollModal.checkingStatus && (
            <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Daily Amount</span>
              <input
                type="number"
                min="1"
                className="input-field"
                value={enrollModal.form.dailyAmount}
                onChange={(event) => updateEnrollForm('dailyAmount', event.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Duration (Months)</span>
              <input
                type="number"
                min="1"
                className="input-field"
                value={enrollModal.form.durationMonths}
                onChange={(event) => updateEnrollForm('durationMonths', event.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Maturity Reward</span>
              <input
                type="number"
                min="0"
                className="input-field"
                value={enrollModal.form.maturityReward}
                onChange={(event) => updateEnrollForm('maturityReward', event.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Start Date</span>
              <input
                type="date"
                className="input-field"
                value={enrollModal.form.startDate}
                onChange={(event) => updateEnrollForm('startDate', event.target.value)}
              />
            </label>
            </div>
          )}
          {enrollModal.error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{enrollModal.error}</p>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              className="btn-secondary"
              onClick={closeEnrollmentModal}
            >
              Cancel
            </button>
            {enrollModal.isEnrolled ? (
              <button type="button" className="btn-primary" onClick={viewEnrolledAccountFromModal}>
                View Profile
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary"
                onClick={handleEnroll}
                disabled={enrollModal.saving || enrollModal.checkingStatus || !enrollModal.customer}
              >
                {enrollModal.saving ? 'Enrolling...' : 'Enroll Customer'}
              </button>
            )}
          </div>
        </div>
      </Modal>
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
    if (moduleId === 'bachat') {
      setLoading(false)
      return undefined
    }

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
  }, [config, moduleId, user])

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
    return <BachatDashboardView moduleSummary={moduleSummary} user={user} />
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
