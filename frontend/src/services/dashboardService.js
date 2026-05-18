import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/firebase'
import {
  COLLECTIONS,
  FINANCE_RULES,
  USER_ROLES,
  addDaysKey,
  daysBetween,
  docsWithIds,
  moneyToPaise,
  moneyValue,
  monthEndKey,
  monthStartKey,
  numberValue,
  pageLimit,
  paiseToMoney,
  todayKey,
} from './firestoreService'
import { calculateLoanMetrics, updateLoanPenalty } from './loanService'

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

const runInBatches = async (tasks, batchSize = 10) => {
  for (let index = 0; index < tasks.length; index += batchSize) {
    const batch = tasks.slice(index, index + batchSize)
    await Promise.all(batch.map((task) => task()))
  }
}

const getActivePenaltyTotal = (records) =>
  records
    .filter((item) => item.status === 'active')
    .reduce((sum, item) => sum + moneyValue(item, 'penaltyAmount'), 0)

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

export const listenDashboardStats = (currentUser, callback, onError) => {
  const today = todayKey()
  const monthStart = monthStartKey(today)
  const monthEnd = monthEndKey(today)
  const state = {
    customers: [],
    todayCollections: [],
    monthCollections: [],
    loans: [],
    todayPayments: [],
    monthPayments: [],
    recentPayments: [],
    penalties: [],
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
    const recentLoanPayments = state.recentPayments.slice(0, 6)
    const totalPenaltyAmount =
      getActivePenaltyTotal(state.penalties) ||
      overdueLoans.reduce((sum, loan) => sum + moneyValue(loan, 'penaltyAmount'), 0) +
        activeCustomers.reduce((sum, customer) => sum + moneyValue(customer, 'penaltyAmount'), 0)

    callback({
      totalCustomers: activeCustomers.length,
      totalSavings: activeCustomers.reduce(
        (sum, item) => sum + moneyValue(item, 'totalSavings'),
        0,
      ),
      pendingAmount: activeCustomers.reduce(
        (sum, item) => sum + moneyValue(item, 'pendingAmount'),
        0,
      ),
      todayCollection: getCollectionTotal(state.todayCollections),
      todayEmiCollection: getPaymentTotal(state.todayPayments),
      monthlyCollection: monthlyDailyCollection + monthlyEmiCollection,
      monthlyDailyCollection,
      monthlyEmiCollection,
      paidToday: state.todayCollections.filter((item) => item.status === 'paid').length,
      pendingToday: pendingCustomers.filter((item) => item.missedToday).length,
      totalLoans: state.loans.length,
      activeLoans: activeLoans.length,
      remainingLoanBalance: activeLoans.reduce(
        (sum, item) => sum + moneyValue(item, 'remainingBalance'),
        0,
      ),
      emiOverdueCount: overdueLoans.length,
      emiOverdueAmount: overdueLoans.reduce((sum, loan) => sum + loan.emiDueAmount, 0),
      penaltyAmount: totalPenaltyAmount,
      dailyPendingAmount: pendingCustomers.reduce(
        (sum, customer) => sum + numberValue(customer.pendingAmount),
        0,
      ),
      recentCollections: state.todayCollections.slice(0, 6),
      recentLoanPayments,
      overdueCustomers: pendingCustomers.slice(0, 6),
      collectorPerformance: state.monthCollections.length
        ? getCollectorCollectionPerformance(state.monthCollections, state.monthPayments)
        : getCollectorPerformance(state.todayCollections, state.monthPayments),
      monthlySummary: {
        dailyCollection: monthlyDailyCollection,
        emiCollection: monthlyEmiCollection,
        totalCollection: monthlyDailyCollection + monthlyEmiCollection,
        pendingAmount: pendingCustomers.reduce(
          (sum, customer) => sum + numberValue(customer.pendingAmount),
          0,
        ),
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

  return () => {
    if (recomputeHandle) cancelFrame(recomputeHandle)
    subscriptions.forEach((unsubscribe) => unsubscribe())
  }
}

const syncDailyPenalty = async (customer, currentUser) => {
  const customerId = customer.customerId || customer.id
  const customerReference = doc(db, COLLECTIONS.customers, customerId)
  const penaltyReference = doc(db, COLLECTIONS.penalties, `daily_${customerId}`)

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(customerReference)
    if (!snapshot.exists()) return
    const data = snapshot.data()
    if (data.status === 'inactive') return

    const today = todayKey()
    const cutoffDate = addDaysKey(today, -1)
    const anchorDate = data.lastDailySyncDate || data.lastCollectionDate || data.joiningDate || today
    const missedDays =
      anchorDate < cutoffDate && data.lastCollectionDate !== today
        ? daysBetween(anchorDate, cutoffDate)
        : 0
    const missedAmountPaise = missedDays * moneyToPaise(moneyValue(data, 'dailyAmount'))
    const currentPendingPaise = moneyToPaise(moneyValue(data, 'pendingAmount'))
    const nextPendingPaise = currentPendingPaise + missedAmountPaise
    const nextPendingDays =
      nextPendingPaise > 0 ? numberValue(data.pendingDays) + missedDays : 0
    const nextDailySyncDate =
      missedDays > 0
        ? cutoffDate
        : data.lastDailySyncDate || data.lastCollectionDate || data.joiningDate || today
    const penaltyAmountPaise = moneyToPaise(
      nextPendingDays * FINANCE_RULES.dailyPenaltyPerDay,
    )

    transaction.update(customerReference, {
      pendingAmount: paiseToMoney(nextPendingPaise),
      pendingAmountPaise: nextPendingPaise,
      pendingDays: nextPendingDays,
      overdueDays: nextPendingDays,
      penaltyAmount: paiseToMoney(penaltyAmountPaise),
      penaltyAmountPaise,
      lastDailySyncDate: nextDailySyncDate,
      lastPenaltyUpdated: today,
      updatedAt: serverTimestamp(),
    })
    transaction.set(
      penaltyReference,
      {
        penaltyId: penaltyReference.id,
        type: 'daily',
        status: nextPendingPaise > 0 ? 'active' : 'resolved',
        customerId,
        customerName: data.ownerName || '',
        shopName: data.shopName || '',
        collectorId: data.assignedCollectorId || currentUser?.userId || '',
        collectorName: data.assignedCollectorName || '',
        overdueDays: nextPendingDays,
        penaltyAmount: paiseToMoney(penaltyAmountPaise),
        penaltyAmountPaise,
        pendingAmount: paiseToMoney(nextPendingPaise),
        pendingAmountPaise: nextPendingPaise,
        lastPenaltyUpdated: today,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })
}

export const syncFinanceState = async (currentUser) => {
  if (!currentUser) return

  const today = todayKey()
  if (hasSyncedToday(currentUser, today)) return

  const [customerSnapshot, loanSnapshot] = await Promise.all([
    getDocs(
      query(
        collection(db, COLLECTIONS.customers),
        ...scopedCustomerConstraints(currentUser),
        limit(pageLimit(200, 200, 500)),
      ),
    ),
    getDocs(
      query(
        buildScopedQuery(COLLECTIONS.loans, currentUser),
        where('loanStatus', '==', 'active'),
        limit(pageLimit(200, 200, 500)),
      ),
    ),
  ])

  const customers = docsWithIds(customerSnapshot)
  const loans = docsWithIds(loanSnapshot)
  const cutoffDate = addDaysKey(today, -1)
  const staleCustomers = customers.filter(
    (customer) => {
      const syncDate =
        customer.lastDailySyncDate || customer.lastCollectionDate || customer.joiningDate || today
      return (
        customer.status !== 'inactive' &&
        (customer.lastPenaltyUpdated !== today || syncDate < cutoffDate)
      )
    },
  )
  const staleLoans = loans.filter((loan) => loan.lastPenaltyUpdated !== today)

  const syncTasks = [
    ...staleCustomers
      .slice(0, 100)
      .map((customer) => () => syncDailyPenalty(customer, currentUser)),
    ...staleLoans
      .slice(0, 100)
      .map((loan) => () => updateLoanPenalty(loan, currentUser)),
  ]

  await runInBatches(syncTasks)
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
