import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/firebase'
import { listenFinanceSummary, syncLoanPenalties as syncLoanPenaltiesServer } from './erpService'
import {
  COLLECTIONS,
  USER_ROLES,
  docsWithIds,
  moneyValue,
  monthEndKey,
  monthStartKey,
  numberValue,
  pageLimit,
  paiseToMoney,
  todayKey,
} from './firestoreService'
import { calculateLoanMetrics } from './loanService'

const buildScopedQuery = (collectionName, currentUser, collectorField = 'collectorId') => {
  const ref = collection(db, collectionName)
  if (currentUser?.role === USER_ROLES.collector) {
    return query(ref, where(collectorField, '==', currentUser.userId))
  }
  return query(ref)
}

const scopedCustomerConstraints = (currentUser) =>
  currentUser?.role === USER_ROLES.collector
    ? [where('assignedCollectorId', '==', currentUser.userId), orderBy('shopName')]
    : [orderBy('shopName')]

const scopedDateConstraints = (currentUser, field, date) =>
  currentUser?.role === USER_ROLES.collector
    ? [where('collectorId', '==', currentUser.userId), where(field, '==', date)]
    : [where(field, '==', date)]

const scopedRangeConstraints = (currentUser, field, fromDate, toDate) =>
  currentUser?.role === USER_ROLES.collector
    ? [
        where('collectorId', '==', currentUser.userId),
        where(field, '>=', fromDate),
        where(field, '<=', toDate),
        orderBy(field, 'desc'),
      ]
    : [where(field, '>=', fromDate), where(field, '<=', toDate), orderBy(field, 'desc')]

const getCollectionTotal = (records) =>
  records.reduce((sum, item) => sum + moneyValue(item, 'amount'), 0)

const getPaymentTotal = (records) =>
  records.reduce(
    (sum, item) => sum + (moneyValue(item, 'principalPaid') || moneyValue(item, 'amountPaid')),
    0,
  )

const getSyncCacheKey = (currentUser, today) =>
  `finance-sync:${currentUser?.userId || 'anonymous'}:${currentUser?.role || 'user'}:${today}`

const hasSyncedToday = (currentUser, today) => {
  if (typeof window === 'undefined') return false
  return window.sessionStorage.getItem(getSyncCacheKey(currentUser, today)) === 'complete'
}

const markSyncedToday = (currentUser, today) => {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(getSyncCacheKey(currentUser, today), 'complete')
}

const getActivePenaltyTotal = (records) =>
  records
    .filter((item) => item.status === 'active')
    .reduce((sum, item) => sum + moneyValue(item, 'penaltyAmount'), 0)

const timestampSortValue = (value) => {
  if (!value) return 0
  if (value?.toMillis) return value.toMillis()
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

const dateKeyForRecord = (record) =>
  String(record.date || record.paymentDate || record.createdDate || record.transactionDate || '')

const getFinanceText = (entry) =>
  [
    entry.module,
    entry.type,
    entry.category,
    entry.kind,
    entry.name,
    entry.status,
    entry.entryType,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

const financeAmount = (entry) =>
  moneyValue(entry, 'amount') ||
  moneyValue(entry, 'value') ||
  moneyValue(entry, 'principalAmount') ||
  moneyValue(entry, 'investmentAmount') ||
  moneyValue(entry, 'expenseAmount') ||
  moneyValue(entry, 'balance')

const includesAny = (text, keywords) => keywords.some((keyword) => text.includes(keyword))

const sumFinanceEntries = (entries, keywords, { fromDate, toDate } = {}) =>
  entries.reduce((sum, entry) => {
    const date = dateKeyForRecord(entry)
    if (fromDate && date && date < fromDate) return sum
    if (toDate && date && date > toDate) return sum
    return includesAny(getFinanceText(entry), keywords) ? sum + financeAmount(entry) : sum
  }, 0)

const countFinanceEntries = (entries, keywords) =>
  entries.filter((entry) => includesAny(getFinanceText(entry), keywords)).length

const getActiveFinanceEntries = (entries, keywords) =>
  entries.filter((entry) => {
    const text = getFinanceText(entry)
    return (
      includesAny(text, keywords) &&
      !['closed', 'completed', 'inactive', 'paid'].some((status) => text.includes(status))
    )
  })

const moduleRoute = (id) => `/dashboard/${id}`

const makeModuleSummary = ({
  id,
  label,
  amount,
  accounts,
  active,
  pending,
  indicator,
  progress,
}) => ({
  id,
  label,
  amount: Math.max(numberValue(amount), 0),
  accounts: Math.max(numberValue(accounts), 0),
  active: Math.max(numberValue(active), 0),
  pending: Math.max(numberValue(pending), 0),
  indicator,
  progress: Math.max(Math.min(numberValue(progress), 100), 0),
  route: moduleRoute(id),
})

const getRecentFinanceEntries = (entries) =>
  [...entries]
    .sort(
      (first, second) =>
        String(dateKeyForRecord(second)).localeCompare(String(dateKeyForRecord(first))) ||
        timestampSortValue(second.createdAt) - timestampSortValue(first.createdAt),
    )
    .slice(0, 6)

const makeRecentTransactions = ({ collections, payments, financeEntries }) =>
  [
    ...collections.slice(0, 4).map((item) => ({
      id: item.collectionId || item.id,
      title: item.shopName || item.customerName || 'Daily collection',
      type: 'Bachat collection',
      amount: moneyValue(item, 'amount'),
      date: item.date,
      status: item.status || 'received',
    })),
    ...payments.slice(0, 4).map((item) => ({
      id: item.paymentId || item.id,
      title: item.customerName || item.shopName || 'EMI payment',
      type: 'EMI collection',
      amount: moneyValue(item, 'principalPaid') || moneyValue(item, 'amountPaid'),
      date: item.paymentDate,
      status: 'received',
    })),
    ...getRecentFinanceEntries(financeEntries).map((item) => ({
      id: item.entryId || item.id,
      title: item.name || item.category || item.module || 'Finance entry',
      type: item.type || item.module || 'Finance',
      amount: financeAmount(item),
      date: dateKeyForRecord(item),
      status: item.status || 'posted',
    })),
  ]
    .filter((item) => item.id)
    .sort((first, second) => String(second.date || '').localeCompare(String(first.date || '')))
    .slice(0, 8)

const makeCollectionTrend = (collections, payments, monthStart, monthEnd) => {
  const groups = new Map()
  const ensureDate = (date) => {
    if (!groups.has(date)) {
      groups.set(date, {
        label: date.slice(5),
        date,
        daily: 0,
        emi: 0,
        amount: 0,
      })
    }
    return groups.get(date)
  }

  collections.forEach((item) => {
    const date = item.date
    if (!date || date < monthStart || date > monthEnd) return
    const group = ensureDate(date)
    group.daily += moneyValue(item, 'amount')
    group.amount += moneyValue(item, 'amount')
  })

  payments.forEach((item) => {
    const date = item.paymentDate
    if (!date || date < monthStart || date > monthEnd) return
    const amount = moneyValue(item, 'principalPaid') || moneyValue(item, 'amountPaid')
    const group = ensureDate(date)
    group.emi += amount
    group.amount += amount
  })

  return [...groups.values()].sort((first, second) => first.date.localeCompare(second.date))
}

const getPendingCustomerRows = (customers, todayCollections) => {
  const collectedIds = new Set(todayCollections.map((item) => item.customerId))

  return customers
    .filter((customer) => customer.status !== 'inactive')
    .map((customer) => {
      const customerId = customer.customerId || customer.id
      const missedToday = !collectedIds.has(customerId)
      const basePendingAmount = moneyValue(customer, 'pendingAmount')
      const pendingAmount =
        basePendingAmount + (missedToday ? moneyValue(customer, 'dailyAmount') : 0)
      const pendingDays = numberValue(customer.pendingDays) + (missedToday ? 1 : 0)

      return {
        ...customer,
        customerName: customer.ownerName,
        collectorName: customer.assignedCollectorName,
        pendingAmount,
        pendingDays,
        missedToday,
      }
    })
    .filter((customer) => customer.pendingAmount > 0 || customer.missedToday)
    .sort((first, second) => second.pendingDays - first.pendingDays)
}

const getCollectorPerformance = (collections, payments) => {
  const groups = new Map()
  const ensureGroup = (collectorId, collectorName) => {
    const key = collectorId || 'unassigned'
    if (!groups.has(key)) {
      groups.set(key, {
        collectorId: key,
        collectorName: collectorName || 'Unassigned',
        collectionAmount: 0,
        emiAmount: 0,
        entries: 0,
      })
    }
    return groups.get(key)
  }

  collections.forEach((item) => {
    const group = ensureGroup(item.collectorId, item.collectorName)
    group.collectionAmount += moneyValue(item, 'amount')
    group.entries += 1
  })

  payments.forEach((item) => {
    const group = ensureGroup(item.collectorId, item.collectorName || item.collectedByName)
    group.emiAmount += moneyValue(item, 'principalPaid') || moneyValue(item, 'amountPaid')
  })

  return [...groups.values()]
    .map((group) => ({
      ...group,
      totalAmount: group.collectionAmount + group.emiAmount,
    }))
    .sort((first, second) => second.totalAmount - first.totalAmount)
    .slice(0, 6)
}

const getCollectorCollectionPerformance = (collections, payments) => {
  const groups = new Map()
  const ensureGroup = (collectorId, collectorName) => {
    const key = collectorId || 'unassigned'
    if (!groups.has(key)) {
      groups.set(key, {
        collectorId: key,
        collectorName: collectorName || 'Unassigned',
        collectionAmount: 0,
        emiAmount: 0,
        entries: 0,
      })
    }
    return groups.get(key)
  }

  collections.forEach((item) => {
    const group = ensureGroup(item.collectorId, item.collectorName)
    group.collectionAmount += moneyValue(item, 'amount')
    group.entries += 1
  })

  payments.forEach((item) => {
    const group = ensureGroup(item.collectorId, item.collectorName || item.collectedByName)
    group.emiAmount += moneyValue(item, 'principalPaid') || moneyValue(item, 'amountPaid')
  })

  return [...groups.values()]
    .map((group) => ({
      ...group,
      totalAmount: group.collectionAmount + group.emiAmount,
    }))
    .sort((first, second) => second.totalAmount - first.totalAmount)
    .slice(0, 6)
}

const makeEmptyStats = () => ({
  totalCustomers: 0,
  totalSavings: 0,
  pendingAmount: 0,
  totalAvailableBankBalance: 0,
  totalLoanGiven: 0,
  totalInvestments: 0,
  totalAccounts: 0,
  totalDeposits: 0,
  totalFdAmount: 0,
  totalBishiCollections: 0,
  totalWithdrawals: 0,
  totalMaturedPayouts: 0,
  monthlyExpenses: 0,
  profitLossMtd: 0,
  todayPayouts: 0,
  todayExpenses: 0,
  todayCollection: 0,
  todayEmiCollection: 0,
  monthlyCollection: 0,
  monthlyDailyCollection: 0,
  monthlyEmiCollection: 0,
  paidToday: 0,
  pendingToday: 0,
  totalLoans: 0,
  activeLoans: 0,
  remainingLoanBalance: 0,
  emiOverdueCount: 0,
  emiOverdueAmount: 0,
  penaltyAmount: 0,
  dailyPendingAmount: 0,
  recentCollections: [],
  recentLoanPayments: [],
  overdueCustomers: [],
  collectorPerformance: [],
  modules: [],
  recentTransactions: [],
  collectionTrend: [],
  collectionProgress: 0,
  lastUpdatedAt: null,
  monthlySummary: {
    dailyCollection: 0,
    emiCollection: 0,
    totalCollection: 0,
    pendingAmount: 0,
  },
})

const scheduleFrame = (callback) => {
  if (typeof window === 'undefined' || !window.requestAnimationFrame) {
    return globalThis.setTimeout(callback, 0)
  }
  return window.requestAnimationFrame(callback)
}

const cancelFrame = (handle) => {
  if (typeof window === 'undefined' || !window.cancelAnimationFrame) {
    globalThis.clearTimeout(handle)
    return
  }
  window.cancelAnimationFrame(handle)
}

const listenLegacyDashboardStats = (currentUser, callback, onError) => {
  const today = todayKey()
  const monthStart = monthStartKey(today)
  const monthEnd = monthEndKey(today)
  const dayOfMonth = Math.max(numberValue(today.slice(8), 1), 1)
  const state = {
    customers: [],
    todayCollections: [],
    monthCollections: [],
    loans: [],
    todayPayments: [],
    monthPayments: [],
    recentPayments: [],
    penalties: [],
    financeEntries: [],
  }
  let recomputeHandle = null

  const recompute = () => {
    recomputeHandle = null

    const activeCustomers = state.customers.filter((item) => item.status !== 'inactive')
    const pendingCustomers = getPendingCustomerRows(activeCustomers, state.todayCollections)
    const activeLoans = state.loans.filter((item) => item.loanStatus === 'active')
    const overdueLoans = activeLoans
      .map((loan) => ({ ...loan, ...calculateLoanMetrics(loan) }))
      .filter((loan) => loan.overdueDays > 0)
    const monthlyDailyCollection = getCollectionTotal(state.monthCollections)
    const monthlyEmiCollection = getPaymentTotal(state.monthPayments)
    const totalSavings = activeCustomers.reduce(
      (sum, item) => sum + moneyValue(item, 'totalSavings'),
      0,
    )
    const totalLoanGiven = state.loans.reduce(
      (sum, item) =>
        sum + (moneyValue(item, 'finalDisbursedAmount') || moneyValue(item, 'loanAmount')),
      0,
    )
    const totalLoanRepaid = state.loans.reduce(
      (sum, item) => sum + moneyValue(item, 'totalPaid'),
      0,
    )
    const recentLoanPayments = state.recentPayments.slice(0, 6)
    const totalPenaltyAmount =
      getActivePenaltyTotal(state.penalties) ||
      overdueLoans.reduce((sum, loan) => sum + moneyValue(loan, 'penaltyAmount'), 0) +
        activeCustomers.reduce((sum, customer) => sum + moneyValue(customer, 'penaltyAmount'), 0)
    const ledger = state.financeEntries
    const ledgerCollections = sumFinanceEntries(ledger, ['collection', 'received', 'income'])
    const totalDeposits = sumFinanceEntries(ledger, ['deposit'])
    const totalFdAmount = sumFinanceEntries(ledger, ['fd', 'fixed deposit'])
    const totalBishiCollections = sumFinanceEntries(ledger, ['bishi'])
    const totalInvestments = sumFinanceEntries(ledger, [
      'investment',
      'land',
      'asset',
      'gold',
      'business',
    ])
    const totalExpenses = sumFinanceEntries(ledger, ['expense', 'salary', 'rent', 'utility'])
    const totalWithdrawals = sumFinanceEntries(ledger, ['withdrawal', 'withdraw'])
    const totalMaturedPayouts = sumFinanceEntries(ledger, ['maturity', 'matured', 'payout'])
    const monthlyExpenses = sumFinanceEntries(ledger, ['expense', 'salary', 'rent', 'utility'], {
      fromDate: monthStart,
      toDate: monthEnd,
    })
    const todayExpenses = sumFinanceEntries(ledger, ['expense', 'salary', 'rent', 'utility'], {
      fromDate: today,
      toDate: today,
    })
    const todayPayouts = sumFinanceEntries(ledger, ['withdrawal', 'withdraw', 'payout'], {
      fromDate: today,
      toDate: today,
    })
    const activeFdEntries = getActiveFinanceEntries(ledger, ['fd', 'fixed deposit'])
    const activeDepositEntries = getActiveFinanceEntries(ledger, ['deposit'])
    const activeBishiEntries = getActiveFinanceEntries(ledger, ['bishi'])
    const activeInvestmentEntries = getActiveFinanceEntries(ledger, [
      'investment',
      'land',
      'asset',
      'gold',
      'business',
    ])
    const monthlyCollection = monthlyDailyCollection + monthlyEmiCollection
    const monthlyExpectedDaily = activeCustomers.reduce(
      (sum, customer) => sum + moneyValue(customer, 'dailyAmount') * dayOfMonth,
      0,
    )
    const monthlyExpectedEmi = activeLoans.reduce(
      (sum, loan) => sum + moneyValue(loan, 'monthlyEMI'),
      0,
    )
    const monthlyTarget = monthlyExpectedDaily + monthlyExpectedEmi
    const dailyPendingAmount = pendingCustomers.reduce(
      (sum, customer) => sum + numberValue(customer.pendingAmount),
      0,
    )
    const totalAvailableBankBalance =
      totalSavings +
      totalLoanRepaid +
      totalDeposits +
      totalFdAmount +
      totalBishiCollections +
      ledgerCollections -
      totalLoanGiven -
      totalExpenses -
      totalWithdrawals -
      totalMaturedPayouts -
      totalInvestments
    const modules = [
      makeModuleSummary({
        id: 'bachat',
        label: 'Bachat',
        amount: totalSavings,
        accounts: activeCustomers.length,
        active: activeCustomers.length,
        pending: dailyPendingAmount,
        indicator: `${pendingCustomers.length} pending`,
        progress: activeCustomers.length ? (state.todayCollections.length / activeCustomers.length) * 100 : 0,
      }),
      makeModuleSummary({
        id: 'saving',
        label: 'Saving',
        amount: totalSavings,
        accounts: activeCustomers.length,
        active: activeCustomers.length,
        pending: totalWithdrawals,
        indicator: 'Current balances',
        progress: totalSavings ? Math.min((monthlyDailyCollection / totalSavings) * 100, 100) : 0,
      }),
      makeModuleSummary({
        id: 'loan',
        label: 'Loan',
        amount: totalLoanGiven,
        accounts: state.loans.length,
        active: activeLoans.length,
        pending: overdueLoans.reduce((sum, loan) => sum + loan.emiDueAmount, 0),
        indicator: `${overdueLoans.length} overdue`,
        progress: totalLoanGiven ? (totalLoanRepaid / totalLoanGiven) * 100 : 0,
      }),
      makeModuleSummary({
        id: 'fd',
        label: 'FD',
        amount: totalFdAmount,
        accounts: countFinanceEntries(ledger, ['fd', 'fixed deposit']),
        active: activeFdEntries.length,
        pending: sumFinanceEntries(ledger, ['maturity', 'matured'], {
          fromDate: today,
          toDate: monthEnd,
        }),
        indicator: 'Maturity tracking',
        progress: totalFdAmount ? 68 : 0,
      }),
      makeModuleSummary({
        id: 'deposit',
        label: 'Deposit',
        amount: totalDeposits,
        accounts: countFinanceEntries(ledger, ['deposit']),
        active: activeDepositEntries.length,
        pending: 0,
        indicator: 'Deposit ledger',
        progress: totalDeposits ? 74 : 0,
      }),
      makeModuleSummary({
        id: 'expenses',
        label: 'Expenses',
        amount: monthlyExpenses,
        accounts: countFinanceEntries(ledger, ['expense', 'salary', 'rent', 'utility']),
        active: countFinanceEntries(ledger, ['expense', 'salary', 'rent', 'utility']),
        pending: todayExpenses,
        indicator: 'MTD operating cost',
        progress: monthlyCollection ? (monthlyExpenses / monthlyCollection) * 100 : 0,
      }),
      makeModuleSummary({
        id: 'bishi',
        label: 'Bishi',
        amount: totalBishiCollections,
        accounts: countFinanceEntries(ledger, ['bishi']),
        active: activeBishiEntries.length,
        pending: sumFinanceEntries(ledger, ['bishi payout', 'rotation']),
        indicator: 'Groups and payouts',
        progress: totalBishiCollections ? 58 : 0,
      }),
      makeModuleSummary({
        id: 'investments',
        label: 'Investments',
        amount: totalInvestments,
        accounts: countFinanceEntries(ledger, ['investment', 'land', 'asset', 'gold', 'business']),
        active: activeInvestmentEntries.length,
        pending: 0,
        indicator: 'Company assets',
        progress: totalInvestments ? 81 : 0,
      }),
    ]

    callback({
      totalCustomers: activeCustomers.length,
      totalSavings,
      pendingAmount: activeCustomers.reduce(
        (sum, item) => sum + moneyValue(item, 'pendingAmount'),
        0,
      ),
      totalAvailableBankBalance,
      totalLoanGiven,
      totalInvestments,
      totalAccounts:
        activeCustomers.length +
        activeLoans.length +
        activeFdEntries.length +
        activeDepositEntries.length +
        activeBishiEntries.length,
      totalDeposits,
      totalFdAmount,
      totalBishiCollections,
      totalWithdrawals,
      totalMaturedPayouts,
      monthlyExpenses,
      profitLossMtd: monthlyCollection - monthlyExpenses,
      todayPayouts,
      todayExpenses,
      todayCollection: getCollectionTotal(state.todayCollections),
      todayEmiCollection: getPaymentTotal(state.todayPayments),
      monthlyCollection,
      monthlyDailyCollection,
      monthlyEmiCollection,
      paidToday: state.todayCollections.filter((item) => item.status === 'paid').length,
      pendingToday: pendingCustomers.filter((item) => item.missedToday).length,
      totalLoans: state.loans.length,
      activeLoans: activeLoans.length,
      totalLoanRepaid,
      remainingLoanBalance: activeLoans.reduce(
        (sum, item) => sum + moneyValue(item, 'remainingBalance'),
        0,
      ),
      emiOverdueCount: overdueLoans.length,
      emiOverdueAmount: overdueLoans.reduce((sum, loan) => sum + loan.emiDueAmount, 0),
      penaltyAmount: totalPenaltyAmount,
      dailyPendingAmount,
      recentCollections: state.todayCollections.slice(0, 6),
      recentLoanPayments,
      overdueCustomers: pendingCustomers.slice(0, 6),
      collectorPerformance: state.monthCollections.length
        ? getCollectorCollectionPerformance(state.monthCollections, state.monthPayments)
        : getCollectorPerformance(state.todayCollections, state.monthPayments),
      modules,
      recentTransactions: makeRecentTransactions({
        collections: state.todayCollections,
        payments: recentLoanPayments,
        financeEntries: ledger,
      }),
      collectionTrend: makeCollectionTrend(state.monthCollections, state.monthPayments, monthStart, monthEnd),
      collectionProgress: monthlyTarget ? (monthlyCollection / monthlyTarget) * 100 : 0,
      lastUpdatedAt: Date.now(),
      monthlySummary: {
        dailyCollection: monthlyDailyCollection,
        emiCollection: monthlyEmiCollection,
        totalCollection: monthlyCollection,
        pendingAmount: dailyPendingAmount,
      },
    })
  }

  const updateState = (key, snapshot) => {
    state[key] = docsWithIds(snapshot)
    if (recomputeHandle) cancelFrame(recomputeHandle)
    recomputeHandle = scheduleFrame(recompute)
  }

  const subscriptions = [
    onSnapshot(
      query(collection(db, COLLECTIONS.customers), ...scopedCustomerConstraints(currentUser)),
      (snapshot) => updateState('customers', snapshot),
      onError,
    ),
    onSnapshot(
      query(
        collection(db, COLLECTIONS.dailyCollections),
        ...scopedDateConstraints(currentUser, 'date', today),
        orderBy('createdAt', 'desc'),
        limit(1000),
      ),
      (snapshot) => updateState('todayCollections', snapshot),
      onError,
    ),
    onSnapshot(
      query(
        collection(db, COLLECTIONS.dailyCollections),
        ...scopedRangeConstraints(currentUser, 'date', monthStart, monthEnd),
        limit(1000),
      ),
      (snapshot) => updateState('monthCollections', snapshot),
      onError,
    ),
    onSnapshot(
      query(
        buildScopedQuery(COLLECTIONS.loans, currentUser),
        orderBy('createdAt', 'desc'),
        limit(300),
      ),
      (snapshot) => updateState('loans', snapshot),
      onError,
    ),
    onSnapshot(
      query(
        collection(db, COLLECTIONS.emiPayments),
        ...scopedDateConstraints(currentUser, 'paymentDate', today),
        orderBy('createdAt', 'desc'),
        limit(100),
      ),
      (snapshot) => updateState('todayPayments', snapshot),
      onError,
    ),
    onSnapshot(
      query(
        collection(db, COLLECTIONS.emiPayments),
        ...scopedRangeConstraints(currentUser, 'paymentDate', monthStart, monthEnd),
        limit(500),
      ),
      (snapshot) => updateState('monthPayments', snapshot),
      onError,
    ),
    onSnapshot(
      query(
        buildScopedQuery(COLLECTIONS.emiPayments, currentUser),
        orderBy('paymentDate', 'desc'),
        limit(6),
      ),
      (snapshot) => updateState('recentPayments', snapshot),
      onError,
    ),
    onSnapshot(
      query(
        buildScopedQuery(COLLECTIONS.penalties, currentUser),
        where('status', '==', 'active'),
        orderBy('updatedAt', 'desc'),
        limit(100),
      ),
      (snapshot) => updateState('penalties', snapshot),
      onError,
    ),
  ]

  if (currentUser?.role === USER_ROLES.admin) {
    subscriptions.push(
      onSnapshot(
        query(collection(db, COLLECTIONS.financeEntries), orderBy('date', 'desc'), limit(500)),
        (snapshot) => updateState('financeEntries', snapshot),
        () => updateState('financeEntries', { docs: [] }),
      ),
    )
  }

  return () => {
    if (recomputeHandle) cancelFrame(recomputeHandle)
    subscriptions.forEach((unsubscribe) => unsubscribe())
  }
}

const paiseField = (record, field) => paiseToMoney(record?.[field] || 0)

const moduleFromSummary = (id, label, source = {}, amountField, pendingField = 'pendingAmountPaise') =>
  makeModuleSummary({
    id,
    label,
    amount: paiseField(source, amountField),
    accounts: numberValue(source.totalAccounts || source.accounts || source.groups),
    active: numberValue(source.activeAccounts || source.activeGroups || source.activeInvestments),
    pending: paiseField(source, pendingField),
    indicator: source.indicator || '',
    progress: numberValue(source.progress),
  })

const statsFromFinanceSummary = (summary) => {
  const base = makeEmptyStats()
  const modules = summary.modules || {}
  const bachat = modules.bachat || {}
  const saving = modules.saving || {}
  const loan = modules.loan || {}
  const fd = modules.fd || {}
  const deposit = modules.deposit || {}
  const expenses = modules.expenses || {}
  const bishi = modules.bishi || {}
  const investments = modules.investments || {}
  const todayCollection = paiseField(summary, 'todayCollectionPaise') || paiseField(bachat, 'todayCollectionPaise')
  const todayEmiCollection =
    paiseField(summary, 'todayEmiCollectionPaise') || paiseField(loan, 'todayEmiCollectionPaise')
  const monthlyDailyCollection =
    paiseField(summary, 'monthlyDailyCollectionPaise') ||
    paiseField(bachat, 'monthlyDailyCollectionPaise') ||
    paiseField(bachat, 'totalCollectionsPaise')
  const monthlyEmiCollection =
    paiseField(summary, 'monthlyEmiCollectionPaise') ||
    paiseField(loan, 'monthlyEmiCollectionPaise') ||
    paiseField(loan, 'totalEMICollectedPaise')
  const monthlyExpenses =
    paiseField(summary, 'monthlyExpensesPaise') ||
    paiseField(expenses, 'monthlyExpensesPaise') ||
    paiseField(expenses, 'totalExpensesPaise')
  const totalBachatAmount =
    paiseField(summary, 'totalBachatAmountPaise') || paiseField(bachat, 'totalBachatAmountPaise')
  const totalLoanGiven =
    paiseField(summary, 'totalLoanGivenPaise') || paiseField(loan, 'totalLoanGivenPaise')
  const totalEMICollected =
    paiseField(summary, 'totalEMICollectedPaise') || paiseField(loan, 'totalEMICollectedPaise')
  const remainingLoanBalance =
    paiseField(summary, 'remainingLoanBalancePaise') || paiseField(loan, 'remainingLoanBalancePaise')
  const totalInvestments =
    paiseField(summary, 'totalInvestmentsPaise') || paiseField(investments, 'totalInvestmentsPaise')
  const totalExpenses =
    paiseField(summary, 'totalExpensesPaise') || paiseField(expenses, 'totalExpensesPaise')
  const dailyPendingAmount = paiseField(bachat, 'pendingAmountPaise')
  const penaltyAmount =
    paiseField(summary, 'penaltyAmountPaise') ||
    paiseField(bachat, 'penaltyAmountPaise') +
      paiseField(loan, 'penaltyAmountPaise')
  const monthlyCollection = monthlyDailyCollection + monthlyEmiCollection

  return {
    ...base,
    totalCustomers: numberValue(summary.totalCustomers),
    totalSavings: totalBachatAmount,
    pendingAmount: dailyPendingAmount,
    totalAvailableBankBalance: paiseField(summary, 'totalBankBalancePaise'),
    totalLoanGiven,
    totalInvestments,
    totalExpenses,
    totalAccounts:
      numberValue(bachat.activeAccounts) +
      numberValue(saving.activeAccounts) +
      numberValue(loan.activeAccounts) +
      numberValue(fd.activeAccounts) +
      numberValue(deposit.activeAccounts) +
      numberValue(bishi.activeGroups) +
      numberValue(investments.activeInvestments),
    totalDeposits: paiseField(deposit, 'totalDepositAmountPaise'),
    totalFdAmount: paiseField(fd, 'totalFdAmountPaise'),
    totalBishiCollections:
      paiseField(bishi, 'totalBishiCollectionPaise') || paiseField(bishi, 'totalBishiAmountPaise'),
    monthlyExpenses,
    profitLossMtd: monthlyCollection - monthlyExpenses,
    todayExpenses: paiseField(expenses, 'todayExpensesPaise'),
    todayCollection,
    todayEmiCollection,
    monthlyCollection,
    monthlyDailyCollection,
    monthlyEmiCollection,
    paidToday: numberValue(bachat.paidCount),
    pendingToday: numberValue(bachat.pendingCount),
    totalLoans: numberValue(loan.totalAccounts),
    activeLoans: numberValue(loan.activeAccounts),
    totalLoanRepaid: totalEMICollected,
    remainingLoanBalance,
    emiOverdueCount: numberValue(loan.overdueCount),
    emiOverdueAmount: paiseField(loan, 'overdueAmountPaise'),
    penaltyAmount,
    dailyPendingAmount,
    modules: [
      moduleFromSummary('bachat', 'Bachat', bachat, 'totalBachatAmountPaise'),
      moduleFromSummary('saving', 'Saving', saving, 'balancePaise'),
      moduleFromSummary('loan', 'Loan', loan, 'totalLoanGivenPaise', 'remainingLoanBalancePaise'),
      moduleFromSummary('fd', 'FD', fd, 'totalFdAmountPaise', 'maturityDuePaise'),
      moduleFromSummary('deposit', 'Deposit', deposit, 'totalDepositAmountPaise'),
      moduleFromSummary('expenses', 'Expenses', expenses, 'totalExpensesPaise', 'todayExpensesPaise'),
      moduleFromSummary('bishi', 'Bishi', bishi, 'totalBishiCollectionPaise', 'payoutDuePaise'),
      moduleFromSummary('investments', 'Investments', investments, 'totalInvestmentsPaise'),
    ],
    recentTransactions: summary.recentTransactions || [],
    collectionTrend: summary.collectionTrend || [],
    collectorPerformance: summary.collectorPerformance || [],
    lastUpdatedAt: Date.now(),
    monthlySummary: {
      dailyCollection: monthlyDailyCollection,
      emiCollection: monthlyEmiCollection,
      totalCollection: monthlyCollection,
      pendingAmount: dailyPendingAmount,
    },
  }
}

export const listenDashboardStats = (currentUser, callback, onError) => {
  let legacyUnsubscribe = null
  const startLegacy = () => {
    if (!legacyUnsubscribe) {
      legacyUnsubscribe = listenLegacyDashboardStats(currentUser, callback, onError)
    }
  }

  const summaryUnsubscribe = listenFinanceSummary(
    (summary) => {
      if (!summary) {
        startLegacy()
        return
      }
      if (legacyUnsubscribe) {
        legacyUnsubscribe()
        legacyUnsubscribe = null
      }
      callback(statsFromFinanceSummary(summary))
    },
    (error) => {
      startLegacy()
      if (onError) onError(error)
    },
  )

  return () => {
    summaryUnsubscribe()
    if (legacyUnsubscribe) legacyUnsubscribe()
  }
}

export const syncFinanceState = async (currentUser) => {
  if (!currentUser) return

  const today = todayKey()
  if (hasSyncedToday(currentUser, today)) return

  await syncLoanPenaltiesServer()
  markSyncedToday(currentUser, today)
}

export const getStats = async () => makeEmptyStats()

export const getRecentCollections = async ({ page_size: pageSize = 6 } = {}) => {
  const snapshot = await getDocs(
    query(
      collection(db, COLLECTIONS.dailyCollections),
      where('date', '==', todayKey()),
      orderBy('createdAt', 'desc'),
      limit(pageLimit(pageSize, 6)),
    ),
  )
  const results = docsWithIds(snapshot)
  return { results, count: results.length, page: 1, pageSize }
}

export const getRecentLoans = async ({ page_size: pageSize = 6 } = {}) => {
  const snapshot = await getDocs(
    query(collection(db, COLLECTIONS.loans), orderBy('createdAt', 'desc'), limit(pageLimit(pageSize, 6))),
  )
  const results = docsWithIds(snapshot)
  return { results, count: results.length, page: 1, pageSize }
}

export const getPendingCustomers = async ({ page_size: pageSize = 6 } = {}) => ({
  results: [],
  count: 0,
  page: 1,
  pageSize,
})

export const getWeeklyChart = async () => []

export const getMonthlyChart = async () => []

export const getNotifications = async () => []

export const clearCache = () => {}

export default {
  listenDashboardStats,
  syncFinanceState,
  getStats,
  getRecentCollections,
  getRecentLoans,
  getPendingCustomers,
  getWeeklyChart,
  getMonthlyChart,
  getNotifications,
  clearCache,
}
