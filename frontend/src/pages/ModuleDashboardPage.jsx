import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  FiActivity,
  FiAlertTriangle,
  FiArrowLeft,
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
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import Modal from '../components/Modal'
import useAuth from '../hooks/useAuth'
import useDebouncedValue from '../hooks/useDebouncedValue'
import {
  BACHAT_RULES,
  calculateBachatPendingAmount,
  calculateBachatLiveMetrics,
  enrollCustomerToBachat,
  getActiveBachatAccounts,
  getBachatCollectionsByDate,
  getBachatEnrollmentStatus,
  listenActiveBachatAccounts,
  listenBachatClosures,
  listenBachatCollections,
  listenBachatPenalties,
  listenBachatSummary,
} from '../services/bachatService'
import customerService from '../services/customerService'
import { listenDashboardStats, syncFinanceState } from '../services/dashboardService'
import {
  moneyValue,
  numberValue,
  todayKey,
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

function FinanceRow({ label, value, currency = true }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="font-semibold text-slate-950">
        {currency ? formatCurrency(value) : value}
      </span>
    </div>
  )
}

function MetricTile({ label, value, currency = false, icon: Icon = FiActivity }) {
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
    { label: 'Total Amount', value: moduleSummary?.amount || 0, currency: true, icon: FiActivity },
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
      { label: 'Active Collectors', value: stats.collectorPerformance.length, icon: FiUsers },
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
      { label: 'Monthly Reports', value: stats.profitLossMtd, currency: true, icon: FiActivity },
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
      { label: 'ROI', value: stats.profitLossMtd, currency: true, icon: FiActivity },
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

const getTodayPaidAmount = (collectionRecord = {}) => {
  const totalAmount = moneyValue(collectionRecord, 'amount')
  if (totalAmount > 0) return totalAmount

  return (
    moneyValue(collectionRecord, 'amountCollected') +
    moneyValue(collectionRecord, 'pendingRecovered') +
    moneyValue(collectionRecord, 'penaltyRecovered')
  )
}

const buildBachatTargetRows = (accounts = [], todayCollections = []) => {
  const collectionsByCustomer = new Map()
  todayCollections.forEach((collectionRecord) => {
    const customerId = collectionRecord.customerId || collectionRecord.id
    if (!customerId) return
    const currentPaid = collectionsByCustomer.get(customerId) || 0
    collectionsByCustomer.set(customerId, currentPaid + getTodayPaidAmount(collectionRecord))
  })

  return accounts
    .filter((account) => (account.status || 'active') === 'active')
    .map((account) => {
      const customerId = account.customerId || account.id
      const dailyAmount = moneyValue(account, 'dailyAmount')
      const paidToday = collectionsByCustomer.get(customerId) || 0

      return {
        customerId,
        customerName: customerLabel(account),
        dailyAmount,
        paidToday,
      }
    })
    .filter((row) => row.customerId && row.paidToday === 0)
    .sort((first, second) => second.dailyAmount - first.dailyAmount)
}

const buildBachatPendingRows = (accounts = []) => {
  const rowsByCustomer = new Map()

  accounts.forEach((account) => {
    const customerId = account.customerId || account.id
    const pendingSummary = calculateBachatPendingAmount(account)
    const totalPending = pendingSummary.pendingAmount
    if (!customerId || totalPending <= 0) return

    const existing = rowsByCustomer.get(customerId)
    if (existing && existing.totalPending >= totalPending) return

    rowsByCustomer.set(customerId, {
      customerId,
      customerName: customerLabel(account),
      totalPending,
      activeDaysTillYesterday: pendingSummary.activeDaysTillYesterday,
      expectedAmountTillYesterday: pendingSummary.expectedAmountTillYesterday,
      totalCollectedAmount: pendingSummary.totalCollectedAmount,
    })
  })

  return [...rowsByCustomer.values()].sort(
    (first, second) => second.totalPending - first.totalPending,
  )
}

function BachatStatCard({ label, value, currency = false, icon: Icon = FiDatabase, onClick }) {
  return (
    <button
      type="button"
      className="card w-full p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
      onClick={onClick}
    >
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
    </button>
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
  isRejoinBlocked: false,
  statusMessage: '',
  error: '',
  ...overrides,
})

const createInsightModalState = (overrides = {}) => ({
  open: false,
  key: '',
  title: '',
  loading: false,
  rows: [],
  ...overrides,
})

function BachatDashboardView({ user, openEnroll = false }) {
  const navigate = useNavigate()
  const { search: routeSearch } = useLocation()
  const [summary, setSummary] = useState({
    activeAccounts: 0,
    totalBachatAmount: 0,
    monthlyCollection: 0,
    monthlyTarget: 0,
    todayCollection: 0,
    todayTarget: 0,
    todayPendingAmount: 0,
    penalties: 0,
    missedPayments: 0,
    maturedAccounts: 0,
    permanentClosures: 0,
  })
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [activeCustomers, setActiveCustomers] = useState([])
  const [activeBachatAccounts, setActiveBachatAccounts] = useState([])
  const [bachatCollections, setBachatCollections] = useState([])
  const [bachatPenalties, setBachatPenalties] = useState([])
  const [bachatClosures, setBachatClosures] = useState([])
  const [activeBachatCustomerIds, setActiveBachatCustomerIds] = useState(new Set())
  const [activeBachatLoading, setActiveBachatLoading] = useState(true)
  const [insightModal, setInsightModal] = useState(createInsightModalState())
  const [enrollModal, setEnrollModal] = useState(createEnrollmentModalState())
  const [enrollSearch, setEnrollSearch] = useState('')
  const [enrollResults, setEnrollResults] = useState([])
  const [enrollLoading, setEnrollLoading] = useState(false)
  const debouncedSearch = useDebouncedValue(search, 250)
  const debouncedEnrollSearch = useDebouncedValue(enrollSearch, 250)

  useEffect(() => {
    if (!user) return undefined
    setSummaryLoading(true)
    return listenBachatSummary(
      (nextSummary) => {
        setSummary({
          activeAccounts: numberValue(nextSummary.activeAccounts),
          totalBachatAmount: moneyValue(nextSummary, 'totalBachatAmount'),
          monthlyCollection: moneyValue(nextSummary, 'monthlyCollection'),
          monthlyTarget: moneyValue(nextSummary, 'monthlyTarget'),
          todayCollection: moneyValue(nextSummary, 'todayCollection'),
          todayTarget: moneyValue(nextSummary, 'todayTarget') || moneyValue(nextSummary, 'activeDailyExpected'),
          todayPendingAmount: moneyValue(nextSummary, 'todayPendingAmount'),
          penalties: 0,
          missedPayments: 0,
          maturedAccounts: numberValue(nextSummary.maturedAccounts),
          permanentClosures: numberValue(nextSummary.permanentClosures),
        })
        setSummaryLoading(false)
      },
      (error) => {
        toast.error(error?.message || 'Unable to load Bachat summary.')
        setSummaryLoading(false)
      },
    )
  }, [user])

  useEffect(() => {
    if (!user) return undefined
    setActiveBachatLoading(true)

    const unsubscribeAccounts = listenActiveBachatAccounts(
      { currentUser: user, pageSize: 1000 },
      (activeAccounts) => {
        setActiveBachatAccounts(activeAccounts)
        const ids = new Set(
          activeAccounts
            .map((account) => account.customerId || account.id)
            .filter(Boolean),
        )
        setActiveBachatCustomerIds(ids)
        setActiveBachatLoading(false)
      },
      (error) => {
        toast.error(error?.message || 'Unable to load active Bachat accounts.')
        setActiveBachatAccounts([])
        setActiveBachatCustomerIds(new Set())
        setActiveBachatLoading(false)
      },
    )
    const unsubscribeCollections = listenBachatCollections(
      { currentUser: user, pageSize: 1000 },
      (collections) => setBachatCollections(collections),
      (error) => {
        toast.error(error?.message || 'Unable to load Bachat collections.')
        setBachatCollections([])
      },
    )
    const unsubscribePenalties = listenBachatPenalties(
      { currentUser: user, pageSize: 1000 },
      (penalties) => setBachatPenalties(penalties),
      (error) => {
        toast.error(error?.message || 'Unable to load Bachat penalties.')
        setBachatPenalties([])
      },
    )
    const unsubscribeClosures = listenBachatClosures(
      { currentUser: user, pageSize: 1000 },
      (closures) => setBachatClosures(closures),
      (error) => {
        toast.error(error?.message || 'Unable to load Bachat closures.')
        setBachatClosures([])
      },
    )
    const unsubscribeCustomers = customerService.listenCustomers(
      user,
      (customers) => setActiveCustomers(customers.filter((customer) => customer.status !== 'inactive')),
      (error) => {
        toast.error(error?.message || 'Unable to load active customers.')
        setActiveCustomers([])
      },
    )

    return () => {
      unsubscribeAccounts()
      unsubscribeCollections()
      unsubscribePenalties()
      unsubscribeClosures()
      unsubscribeCustomers()
    }
  }, [user])

  const liveBachatMetrics = useMemo(
    () => calculateBachatLiveMetrics({
      accounts: activeBachatAccounts,
      collections: bachatCollections,
      customers: activeCustomers,
    }),
    [activeBachatAccounts, activeCustomers, bachatCollections],
  )
  const todayBachatCollections = useMemo(
    () =>
      liveBachatMetrics.activeCollections.filter(
        (collectionRecord) => collectionRecord.paymentDate === todayKey(),
      ),
    [liveBachatMetrics.activeCollections],
  )
  const monthlyBachatCollection = useMemo(() => {
    const currentMonth = todayKey().slice(0, 7)
    return liveBachatMetrics.activeCollections.reduce((sum, collectionRecord) => {
      if (String(collectionRecord.paymentDate || '').slice(0, 7) !== currentMonth) return sum
      return sum + getTodayPaidAmount(collectionRecord)
    }, 0)
  }, [liveBachatMetrics.activeCollections])

  const bachatPendingRows = useMemo(
    () => buildBachatPendingRows(liveBachatMetrics.activeAccounts),
    [liveBachatMetrics.activeAccounts],
  )
  const bachatTargetRows = useMemo(
    () => buildBachatTargetRows(liveBachatMetrics.activeAccounts, todayBachatCollections),
    [liveBachatMetrics.activeAccounts, todayBachatCollections],
  )
  const todayTargetAmount = useMemo(
    () => bachatTargetRows.reduce((sum, row) => sum + row.dailyAmount, 0),
    [bachatTargetRows],
  )
  const combinedPendingAmount = useMemo(
    () => bachatPendingRows.reduce((sum, row) => sum + row.totalPending, 0),
    [bachatPendingRows],
  )
  const activePenaltyTotal = useMemo(
    () => bachatPenalties.reduce((sum, penalty) => sum + moneyValue(penalty, 'penaltyAmount'), 0),
    [bachatPenalties],
  )
  const missedPaymentRows = useMemo(
    () =>
      liveBachatMetrics.activeAccounts
        .map((account) => ({
          customerId: account.customerId || account.id,
          customerName: customerLabel(account),
          missedMonths: numberValue(account.missedMonths),
          penaltyAmount: moneyValue(account, 'penaltyAmount'),
          pendingAmount: calculateBachatPendingAmount(account).pendingAmount,
        }))
        .filter((row) => row.customerId && row.missedMonths > 0)
        .sort((first, second) => second.missedMonths - first.missedMonths),
    [liveBachatMetrics.activeAccounts],
  )
  const missedPaymentTotal = useMemo(
    () => missedPaymentRows.reduce((sum, row) => sum + row.missedMonths, 0),
    [missedPaymentRows],
  )
  const displaySummary = useMemo(() => {
    if (activeBachatLoading) return summary

    return {
      ...summary,
      activeAccounts: liveBachatMetrics.activeAccounts.length,
      totalBachatAmount: liveBachatMetrics.totalBachatAmount,
      todayCollection: todayBachatCollections.reduce(
        (sum, collectionRecord) => sum + getTodayPaidAmount(collectionRecord),
        0,
      ),
      monthlyCollection: monthlyBachatCollection,
      todayPendingAmount: combinedPendingAmount,
      penalties: activePenaltyTotal,
      missedPayments: missedPaymentTotal,
      permanentClosures: bachatClosures.length,
    }
  }, [
    activeBachatLoading,
    activePenaltyTotal,
    bachatClosures.length,
    combinedPendingAmount,
    liveBachatMetrics.activeAccounts.length,
    liveBachatMetrics.totalBachatAmount,
    missedPaymentTotal,
    monthlyBachatCollection,
    summary,
    todayBachatCollections,
  ])

  useEffect(() => {
    const term = debouncedSearch.trim()
    if (!user || activeBachatLoading || term.length < 2) {
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
        const filteredResults = [...merged.values()].filter((customer) => {
          const routeId = customerRouteId(customer)
          return routeId && activeBachatCustomerIds.has(routeId)
        })
        setSearchResults(filteredResults.slice(0, 8))
        if (searchResult.status === 'rejected' && exactResult.status === 'rejected') {
          setSearchError('No indexed customer match found.')
        } else if (!filteredResults.length) {
          setSearchError('No active Bachat account found for this search.')
        }
      })
      .finally(() => {
        if (isMounted) setSearchLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [activeBachatCustomerIds, activeBachatLoading, debouncedSearch, user])

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

  useEffect(() => {
    if (!openEnroll) return
    setEnrollSearch('')
    setEnrollModal(
      createEnrollmentModalState({
        open: true,
        form: {
          ...enrollmentDefaults,
          startDate: todayKey(),
        },
      }),
    )
  }, [openEnroll, routeSearch])

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
        isRejoinBlocked: Boolean(status.isRejoinBlocked),
        statusMessage: status.isRejoinBlocked
          ? `Customer cannot enroll in Bachat until original maturity date.`
          : status.isEnrolled
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
          isRejoinBlocked: false,
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

  const closeInsightModal = () => {
    setInsightModal(createInsightModalState())
  }

  const buildAccountRows = (accounts = []) =>
    accounts.map((account) => ({
      customerId: account.customerId || account.id,
      customerName: account.fullName || account.ownerName || account.shopName || account.customerId,
      dailyAmount: moneyValue(account, 'dailyAmount'),
      pendingAmount: calculateBachatPendingAmount(account).pendingAmount,
      penaltyAmount: moneyValue(account, 'penaltyAmount'),
      status: account.status || 'active',
      lastCollectionDate: account.lastCollectionDate || '-',
    }))

  const buildPenaltyRows = (penalties = []) => {
    const accountsByCustomerId = new Map(
      liveBachatMetrics.activeAccounts.map((account) => [account.customerId || account.id, account]),
    )
    const displayDate = (value) => {
      if (!value) return '-'
      if (typeof value === 'string') return value
      if (value?.toDate) return value.toDate().toISOString().slice(0, 10)
      return '-'
    }

    return penalties.map((penalty) => {
      const customerId = penalty.customerId || penalty.id
      const account = accountsByCustomerId.get(customerId) || {}
      return {
        customerId,
        customerName:
          penalty.customerName ||
          account.fullName ||
          account.ownerName ||
          account.shopName ||
          customerId,
        dailyAmount: moneyValue(account, 'dailyAmount'),
        pendingAmount: calculateBachatPendingAmount(account).pendingAmount,
        penaltyAmount: moneyValue(penalty, 'penaltyAmount'),
        status: penalty.penaltyStatus || penalty.recoveryStatus || 'active',
        lastCollectionDate: displayDate(
          penalty.lastPenaltyAppliedDate || penalty.lastPaymentDate || penalty.updatedAt,
        ),
      }
    })
  }

  const buildClosureRows = (closures = []) =>
    closures.map((closure) => ({
      customerId: closure.customerId || closure.id,
      customerName: closure.customerName || closure.fullName || closure.customerId || 'Customer',
      closureDate: closure.closureDate || closure.closedOn || '',
      finalSettlementAmount: moneyValue(closure, 'finalSettlementAmount') || moneyValue(closure, 'settlementAmount'),
    }))

  const handleCardClick = async (cardKey) => {
    if (!user) return

    const staticListFromAccounts = (title, filterFn) => {
      const rows = buildAccountRows(liveBachatMetrics.activeAccounts.filter(filterFn))
      setInsightModal({
        open: true,
        key: cardKey,
        title,
        loading: false,
        rows,
      })
    }

    if (cardKey === 'activeAccounts') {
      staticListFromAccounts('Active Accounts', () => true)
      return
    }
    if (cardKey === 'todayPendingAmount') {
      setInsightModal({
        open: true,
        key: cardKey,
        title: "Total Pending Amounts",
        loading: true,
        rows: [],
      })
      try {
        const accountResponse = await getActiveBachatAccounts({ currentUser: user, pageSize: 1000 })
        const activeAccounts = accountResponse?.results || []
        const liveMetrics = calculateBachatLiveMetrics({
          accounts: activeAccounts,
          collections: bachatCollections,
          customers: activeCustomers,
        })
        const rows = buildBachatPendingRows(liveMetrics.activeAccounts)
        setActiveBachatAccounts(activeAccounts)
        setInsightModal({
          open: true,
          key: cardKey,
          title: "Total Pending Amount of All Customers",
          loading: false,
          rows,
        })
      } catch (error) {
        setInsightModal((previous) => ({ ...previous, loading: false, rows: [] }))
        toast.error(error?.message || 'Unable to load pending Bachat accounts.')
      }
      return
    }
    if (cardKey === 'todayTarget') {
      setInsightModal({
        open: true,
        key: cardKey,
        title: "Today's Unpaid Customer List",
        loading: true,
        rows: [],
      })
      try {
        const [accountResponse, collectionResponse] = await Promise.all([
          getActiveBachatAccounts({ currentUser: user, pageSize: 1000 }),
          getBachatCollectionsByDate({
            date: todayKey(),
            currentUser: user,
            pageSize: 1000,
          }),
        ])
        const activeAccounts = accountResponse?.results || []
        const todayCollections = collectionResponse?.results || []
        const liveMetrics = calculateBachatLiveMetrics({
          accounts: activeAccounts,
          collections: todayCollections,
          customers: activeCustomers,
        })
        const rows = buildBachatTargetRows(liveMetrics.activeAccounts, liveMetrics.activeCollections)
        setActiveBachatAccounts(activeAccounts)
        setInsightModal({
          open: true,
          key: cardKey,
          title: "Today's Unpaid Customer List",
          loading: false,
          rows,
        })
      } catch (error) {
        setInsightModal((previous) => ({ ...previous, loading: false, rows: [] }))
        toast.error(error?.message || "Unable to load today's target accounts.")
      }
      return
    }
    if (cardKey === 'penalties') {
      setInsightModal({
        open: true,
        key: cardKey,
        title: 'Penalty Accounts',
        loading: false,
        rows: buildPenaltyRows(bachatPenalties),
      })
      return
    }
    if (cardKey === 'missedPayments') {
      setInsightModal({
        open: true,
        key: cardKey,
        title: 'Missed Payment Accounts',
        loading: false,
        rows: missedPaymentRows,
      })
      return
    }
    if (cardKey === 'maturedAccounts') {
      staticListFromAccounts('Maturity Eligible Accounts', (account) => Boolean(account.closureEligibility))
      return
    }

    if (cardKey === 'todayCollection') {
      setInsightModal({
        open: true,
        key: cardKey,
        title: "Today's Collection Entries",
        loading: true,
        rows: [],
      })
      try {
        const response = await getBachatCollectionsByDate({
          date: todayKey(),
          currentUser: user,
          pageSize: 1000,
        })
        const rows = (response?.results || []).map((entry) => ({
          customerId: entry.customerId,
          customerName: entry.customerId,
          dailyAmount: moneyValue(entry, 'amountCollected'),
          pendingAmount: moneyValue(entry, 'pendingRecovered'),
          penaltyAmount: moneyValue(entry, 'penaltyRecovered'),
          status: entry.status || '-',
          lastCollectionDate: entry.paymentDate || '-',
        }))
        setInsightModal({
          open: true,
          key: cardKey,
          title: "Today's Collection Entries",
          loading: false,
          rows,
        })
      } catch (error) {
        setInsightModal((previous) => ({ ...previous, loading: false, rows: [] }))
        toast.error(error?.message || 'Unable to load collection entries.')
      }
      return
    }

    if (cardKey === 'permanentClosures') {
      setInsightModal({
        open: true,
        key: cardKey,
        title: 'Permanent Closures',
        loading: false,
        rows: buildClosureRows(bachatClosures),
      })
      return
    }
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
      if (latestStatus.isRejoinBlocked) {
        setEnrollModal((previous) => ({
          ...previous,
          saving: false,
          customer: latestStatus.customer || previous.customer,
          account: latestStatus.account || previous.account,
          isRejoinBlocked: true,
          statusMessage: 'Customer cannot enroll in Bachat until original maturity date.',
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
      { key: 'activeAccounts', label: 'Active Accounts', value: displaySummary.activeAccounts, icon: FiUsers },
      {
        key: 'todayTarget',
        label: "Today's Pending Customer",
        value: todayTargetAmount,
        currency: true,
        icon: FiCalendar,
      },
      { key: 'todayCollection', label: "Today's Collection", value: displaySummary.todayCollection, currency: true, icon: MdOutlinePayments },
      {
        key: 'todayPendingAmount',
        label: "Total Pending Amounts",
        value: displaySummary.todayPendingAmount,
        currency: true,
        icon: FiAlertTriangle,
      },
      { key: 'penalties', label: 'Penalties', value: displaySummary.penalties, currency: true, icon: FiAlertTriangle },
      { key: 'missedPayments', label: 'Missed Payments', value: displaySummary.missedPayments, icon: FiCalendar },
      { key: 'maturedAccounts', label: 'Matured Accounts', value: displaySummary.maturedAccounts, icon: FiClock },
      { key: 'permanentClosures', label: 'Permanent Closures', value: displaySummary.permanentClosures, icon: FiTrendingDown },
    ],
    [displaySummary, todayTargetAmount],
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
          <Link to="/bachat/collections" className="btn-secondary gap-2">
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
                {activeBachatLoading
                  ? 'Loading...'
                  : formatCurrency(displaySummary.totalBachatAmount)}
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
            {activeBachatLoading && (
              <p className="px-4 py-4 text-sm text-slate-500">Loading active Bachat customers...</p>
            )}
            {searchLoading && (
              <p className="px-4 py-4 text-sm text-slate-500">Searching customers...</p>
            )}
            {!activeBachatLoading && !searchLoading &&
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
            {!activeBachatLoading && !searchLoading && debouncedSearch.trim().length >= 2 && !searchResults.length && (
              <p className="px-4 py-4 text-sm text-slate-500">
                {searchError || 'No customers found.'}
              </p>
            )}
            {!activeBachatLoading && !searchLoading && debouncedSearch.trim().length < 2 && (
              <p className="px-4 py-4 text-sm text-slate-500">
                Enter at least 2 characters to search.
              </p>
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {summaryLoading || activeBachatLoading
          ? Array.from({ length: 8 }).map((_, index) => (
              <article key={index} className="card h-28 animate-pulse bg-slate-100" />
            ))
          : operationalCards.map((card) => (
              <BachatStatCard key={card.key} {...card} onClick={() => handleCardClick(card.key)} />
            ))}
      </section>

      <Modal
        isOpen={insightModal.open}
        title={insightModal.title || 'Card Details'}
        onClose={closeInsightModal}
        sizeClass={['todayPendingAmount', 'todayTarget'].includes(insightModal.key) ? 'max-w-6xl' : 'max-w-4xl'}
      >
        <div className="space-y-3">
          {insightModal.loading && (
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
              Loading details...
            </p>
          )}
          {!insightModal.loading && insightModal.rows.length > 0 && insightModal.key === 'permanentClosures' && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Customer ID</th>
                    <th className="px-3 py-2">Closure Date</th>
                    <th className="px-3 py-2">Final Settlement</th>
                    <th className="px-3 py-2">View Profile</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {insightModal.rows.map((row) => (
                    <tr key={`${row.customerId}_${row.closureDate}`}>
                      <td className="px-3 py-2 font-semibold text-slate-900">{row.customerName}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{row.customerId}</td>
                      <td className="px-3 py-2 text-slate-700">{formatDate(row.closureDate)}</td>
                      <td className="px-3 py-2 font-semibold text-slate-950">
                        {formatCurrency(row.finalSettlementAmount)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="btn-secondary !py-1.5"
                          onClick={() => openBachatProfile({ customerId: row.customerId })}
                        >
                          View Profile
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!insightModal.loading && insightModal.rows.length > 0 && insightModal.key === 'todayPendingAmount' && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Customer Name</th>
                    <th className="px-3 py-2">Customer ID</th>
                    <th className="px-3 py-2">Active Days Till Yesterday</th>
                    <th className="px-3 py-2">Expected Till Yesterday</th>
                    <th className="px-3 py-2">Total Collected</th>
                    <th className="px-3 py-2">Total Pending Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {insightModal.rows.map((row) => (
                    <tr key={row.customerId}>
                      <td className="px-3 py-2 font-semibold text-slate-900">{row.customerName}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{row.customerId}</td>
                      <td className="px-3 py-2 text-slate-900">{row.activeDaysTillYesterday}</td>
                      <td className="px-3 py-2 text-slate-900">{formatCurrency(row.expectedAmountTillYesterday)}</td>
                      <td className="px-3 py-2 text-slate-900">{formatCurrency(row.totalCollectedAmount)}</td>
                      <td className="px-3 py-2 font-semibold text-slate-950">{formatCurrency(row.totalPending)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!insightModal.loading && insightModal.rows.length > 0 && insightModal.key === 'todayTarget' && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Customer Name</th>
                    <th className="px-3 py-2">Customer ID</th>
                    <th className="px-3 py-2">Daily Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {insightModal.rows.map((row) => (
                    <tr key={row.customerId}>
                      <td className="px-3 py-2 font-semibold text-slate-900">{row.customerName}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{row.customerId}</td>
                      <td className="px-3 py-2 text-slate-900">{formatCurrency(row.dailyAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!insightModal.loading && insightModal.rows.length > 0 && insightModal.key === 'missedPayments' && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Customer Name</th>
                    <th className="px-3 py-2">Customer ID</th>
                    <th className="px-3 py-2">Missed Months</th>
                    <th className="px-3 py-2">Current Penalty</th>
                    <th className="px-3 py-2">Pending Amount</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {insightModal.rows.map((row) => (
                    <tr key={row.customerId}>
                      <td className="px-3 py-2 font-semibold text-slate-900">{row.customerName}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{row.customerId}</td>
                      <td className="px-3 py-2 text-slate-900">{row.missedMonths}</td>
                      <td className="px-3 py-2 text-slate-900">{formatCurrency(row.penaltyAmount)}</td>
                      <td className="px-3 py-2 text-slate-900">{formatCurrency(row.pendingAmount)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="btn-secondary !py-1.5"
                          onClick={() => openBachatProfile({ customerId: row.customerId })}
                        >
                          Open Profile
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!insightModal.loading &&
            insightModal.rows.length > 0 &&
            !['todayPendingAmount', 'todayTarget', 'missedPayments', 'permanentClosures'].includes(insightModal.key) && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Daily</th>
                    <th className="px-3 py-2">Pending</th>
                    <th className="px-3 py-2">Penalty</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {insightModal.rows.map((row) => (
                    <tr key={`${row.customerId}_${row.lastCollectionDate}`}>
                      <td className="px-3 py-2">
                        <p className="font-semibold text-slate-900">{row.customerName}</p>
                        <p className="text-xs text-slate-500">{row.customerId}</p>
                      </td>
                      <td className="px-3 py-2 text-slate-900">{formatCurrency(row.dailyAmount)}</td>
                      <td className="px-3 py-2 text-slate-900">{formatCurrency(row.pendingAmount)}</td>
                      <td className="px-3 py-2 text-slate-900">{formatCurrency(row.penaltyAmount)}</td>
                      <td className="px-3 py-2 text-slate-600">{row.status}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="btn-secondary !py-1.5"
                          onClick={() => openBachatProfile({ customerId: row.customerId })}
                        >
                          Open Profile
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!insightModal.loading && !insightModal.rows.length && (
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
              {insightModal.key === 'todayPendingAmount'
                ? 'No pending accounts found.'
                : insightModal.key === 'todayTarget'
                  ? "No customers pending for today's collection."
                  : insightModal.key === 'permanentClosures'
                    ? 'No permanent closures recorded yet.'
                : 'No records available for this card right now.'}
            </p>
          )}
        </div>
      </Modal>

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
          {!enrollModal.isEnrolled && !enrollModal.isRejoinBlocked && !enrollModal.checkingStatus && (
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
                disabled={
                  enrollModal.saving ||
                  enrollModal.checkingStatus ||
                  enrollModal.isRejoinBlocked ||
                  !enrollModal.customer
                }
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

function ModuleDashboardPage({ moduleOverride, openEnroll = false }) {
  const { moduleId: routeModuleId } = useParams()
  const moduleId = moduleOverride || routeModuleId
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
    return <BachatDashboardView moduleSummary={moduleSummary} user={user} openEnroll={openEnroll} />
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

      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <article className="card p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="section-title">Finance Snapshot</h3>
              <p className="text-sm text-slate-500">Current operating totals for this module.</p>
            </div>
            <span className="rounded-lg bg-slate-100 p-2.5 text-slate-700">
              <FiActivity />
            </span>
          </div>
          <div className="space-y-3">
            <FinanceRow label="Module amount" value={moduleSummary?.amount || 0} />
            <FinanceRow label="Pending / due" value={moduleSummary?.pending || 0} />
            <FinanceRow label="Monthly collection" value={stats.monthlyCollection} />
            <FinanceRow label="Monthly expenses" value={stats.monthlyExpenses} />
            <FinanceRow label="Profit / loss" value={stats.profitLossMtd} />
          </div>
        </article>

        <article className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="section-title">Recent Collection Days</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Daily</th>
                  <th className="px-4 py-3">EMI</th>
                  <th className="px-4 py-3">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {stats.collectionTrend.slice(-6).map((item) => (
                  <tr key={item.date || item.label}>
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      {item.date || item.label}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatCurrency(item.daily)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatCurrency(item.emi)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      {formatCurrency(item.amount)}
                    </td>
                  </tr>
                ))}
                {stats.collectionTrend.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan="4">
                      No collection activity yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
