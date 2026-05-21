import {
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
} from 'firebase/firestore'
import { auth, db } from '../firebase/firebase'
import {
  buildModuleFlags,
  COLLECTIONS,
  PAYMENT_METHODS,
  USER_ROLES,
  addMonthsKey,
  dateKeyFromDate,
  daysBetween,
  docsWithIds,
  elapsedMonthlyInstallments,
  moneyToPaise,
  moneyValue,
  normalizeMoney,
  normalizeText,
  numberValue,
  pageLimit,
  paiseToMoney,
  todayKey,
} from './firestoreService'

export const BACHAT_RULES = {
  defaultDurationMonths: 60,
  eligibilityMonths: 24,
  daysPerMonth: 30,
  postEligibilityBenefitRate: 0.12,
  penaltyRate: 0.02,
}

const DEBUG_BACHAT_PERMISSIONS = import.meta.env.DEV

const customerFinanceCleanupPatch = () => ({
  dailyAmount: deleteField(),
  dailyAmountPaise: deleteField(),
  totalSavings: deleteField(),
  totalSavingsPaise: deleteField(),
  pendingAmount: deleteField(),
  pendingAmountPaise: deleteField(),
  pendingDays: deleteField(),
  overdueDays: deleteField(),
  penaltyAmount: deleteField(),
  penaltyAmountPaise: deleteField(),
  totalCollected: deleteField(),
  totalCollectedPaise: deleteField(),
  loanStatus: deleteField(),
  activeLoanId: deleteField(),
  lastCollectionDate: deleteField(),
  lastDailySyncDate: deleteField(),
  lastPenaltyUpdated: deleteField(),
})

const isPermissionDenied = (error) =>
  error?.code === 'permission-denied' ||
  String(error?.message || '').toLowerCase().includes('insufficient permissions')

const debugBachatPermission = ({
  operation,
  collectionName,
  docPath = '',
  currentUser,
  error,
  extra = {},
}) => {
  if (!DEBUG_BACHAT_PERMISSIONS) return

  const payload = {
    operation,
    authUid: auth.currentUser?.uid || '',
    resolvedRole: currentUser?.role || '',
    requestedCollection: collectionName,
    failedPath: docPath,
    ...extra,
  }

  if (error && isPermissionDenied(error)) {
    console.error('[bachat:permission-denied]', {
      ...payload,
      code: error.code || '',
      message: error.message || '',
    })
    return
  }

  if (error) {
    console.error('[bachat:error]', {
      ...payload,
      code: error.code || '',
      message: error.message || '',
    })
    return
  }

  console.debug('[bachat:trace]', payload)
}

const emptyBachatSummary = {
  activeAccounts: 0,
  activeDailyExpected: 0,
  activeDailyExpectedPaise: 0,
  totalCollected: 0,
  totalCollectedPaise: 0,
  totalBachatAmount: 0,
  totalBachatAmountPaise: 0,
  penalties: 0,
  penaltiesPaise: 0,
  todayCollection: 0,
  todayCollectionPaise: 0,
  todayTarget: 0,
  todayTargetPaise: 0,
  todayPendingAmount: 0,
  todayPendingAmountPaise: 0,
  monthlyCollection: 0,
  monthlyCollectionPaise: 0,
  monthlyTarget: 0,
  monthlyTargetPaise: 0,
  collectionProgress: 0,
  missedPayments: 0,
  maturedAccounts: 0,
  prematureClosures: 0,
  summaryDayKey: '',
  summaryMonthKey: '',
}

const monthKey = (dateKey) => String(dateKey || '').slice(0, 7)
const nonNegativeInteger = (value) => Math.max(Math.round(numberValue(value)), 0)
const clampPercent = (value) => Math.max(Math.min(numberValue(value), 100), 0)
const daysInMonthFromDateKey = (dateKey = todayKey()) => {
  const [yearPart, monthPart] = String(dateKey || todayKey()).split('-')
  const year = Math.max(numberValue(yearPart), 1970)
  const month = Math.max(numberValue(monthPart), 1)
  const utcDate = new Date(Date.UTC(year, month, 0))
  return Math.max(numberValue(utcDate.getUTCDate()), 28)
}
const normalizePaymentMethod = (value) => {
  const method = normalizeText(value).toLowerCase()
  return PAYMENT_METHODS.includes(method) ? method : 'cash'
}

const isActiveBachatAccount = (account = {}) => {
  const status = normalizeText(account.status).toLowerCase()
  return !status || status === 'active'
}

const resolveBachatCustomerId = (record = {}) =>
  normalizeText(record.customerId || record.id)

const getBachatCollectionAmount = (record = {}) => {
  const totalAmount = moneyValue(record, 'amount')
  if (totalAmount > 0) return totalAmount

  return (
    moneyValue(record, 'amountCollected') +
    moneyValue(record, 'pendingRecovered') +
    moneyValue(record, 'penaltyRecovered')
  )
}

export const calculateBachatLiveMetrics = ({
  accounts = [],
  collections = [],
  customers = null,
} = {}) => {
  const hasCustomerSource = Array.isArray(customers)
  const currentCustomerIds = hasCustomerSource
    ? new Set(customers.map((customer) => resolveBachatCustomerId(customer)).filter(Boolean))
    : null

  const activeAccounts = accounts.filter((account) => {
    const customerId = resolveBachatCustomerId(account)
    if (!customerId || !isActiveBachatAccount(account)) return false
    return !hasCustomerSource || currentCustomerIds.has(customerId)
  })
  const activeCustomerIds = new Set(activeAccounts.map((account) => resolveBachatCustomerId(account)))
  const activeCollections = collections.filter((collectionRecord) =>
    activeCustomerIds.has(resolveBachatCustomerId(collectionRecord)),
  )
  const totalBachatAmount = activeCollections.reduce(
    (sum, collectionRecord) => sum + getBachatCollectionAmount(collectionRecord),
    0,
  )

  return {
    activeAccounts,
    activeCollections,
    activeCustomerIds,
    totalBachatAmount,
  }
}

const resolveBachatLastPaymentDate = (account = {}, fallbackDate = todayKey()) =>
  normalizeText(
    account.lastPaymentDate ||
      account.lastCollectionDate ||
      account.enrolledOn ||
      account.startDateKey ||
      account.startDate ||
      fallbackDate,
  )

export const calculateBachatInactiveGap = ({
  account = {},
  paymentDate = todayKey(),
} = {}) => {
  const lastPaymentDate = resolveBachatLastPaymentDate(account, paymentDate)
  const daysDifference = daysBetween(lastPaymentDate, paymentDate)
  const missedMonths =
    daysDifference > BACHAT_RULES.daysPerMonth
      ? Math.max(Math.floor(daysDifference / BACHAT_RULES.daysPerMonth), 1)
      : 0

  return {
    lastPaymentDate,
    daysDifference,
    missedMonths,
  }
}

const resolveBachatSummaryState = ({ summaryData = {}, nowDateKey = todayKey() } = {}) => {
  const expectedDayKey = normalizeText(nowDateKey) || todayKey()
  const expectedMonthKey = monthKey(expectedDayKey)
  const summaryDayKey = normalizeText(summaryData.summaryDayKey)
  const summaryMonthKey = normalizeText(summaryData.summaryMonthKey)
  const hasTotalBachatAmount =
    summaryData.totalBachatAmount !== undefined || summaryData.totalBachatAmountPaise !== undefined

  const todayCollectionPaise = moneyToPaise(moneyValue(summaryData, 'todayCollection'))
  const monthlyCollectionPaise = moneyToPaise(moneyValue(summaryData, 'monthlyCollection'))
  const totalBachatAmountPaise = moneyToPaise(
    hasTotalBachatAmount
      ? moneyValue(summaryData, 'totalBachatAmount')
      : moneyValue(summaryData, 'totalCollected'),
  )
  const penaltiesPaise = moneyToPaise(moneyValue(summaryData, 'penalties'))
  const activeDailyExpectedPaise = moneyToPaise(moneyValue(summaryData, 'activeDailyExpected'))

  const normalizedTodayCollectionPaise = summaryDayKey === expectedDayKey ? todayCollectionPaise : 0
  const normalizedMonthlyCollectionPaise =
    summaryMonthKey === expectedMonthKey ? monthlyCollectionPaise : 0

  return {
    activeAccounts: nonNegativeInteger(summaryData.activeAccounts),
    activeDailyExpectedPaise: Math.max(activeDailyExpectedPaise, 0),
    totalBachatAmountPaise: Math.max(totalBachatAmountPaise, 0),
    penaltiesPaise: Math.max(penaltiesPaise, 0),
    todayCollectionPaise: Math.max(normalizedTodayCollectionPaise, 0),
    monthlyCollectionPaise: Math.max(normalizedMonthlyCollectionPaise, 0),
    missedPayments: nonNegativeInteger(summaryData.missedPayments),
    maturedAccounts: nonNegativeInteger(summaryData.maturedAccounts),
    prematureClosures: nonNegativeInteger(summaryData.prematureClosures),
    summaryDayKey: expectedDayKey,
    summaryMonthKey: expectedMonthKey,
  }
}

const buildBachatSummaryPatch = ({
  summaryData = {},
  nowDateKey = todayKey(),
  collectionDateKey = nowDateKey,
  deltas = {},
} = {}) => {
  const state = resolveBachatSummaryState({ summaryData, nowDateKey })
  const activeAccounts = Math.max(state.activeAccounts + numberValue(deltas.activeAccounts), 0)
  const activeDailyExpectedPaise = Math.max(
    state.activeDailyExpectedPaise + moneyToPaise(numberValue(deltas.activeDailyExpected)),
    0,
  )
  const totalBachatAmountDelta =
    deltas.totalBachatAmount !== undefined ? deltas.totalBachatAmount : deltas.totalCollected
  const totalBachatAmountPaise = Math.max(
    state.totalBachatAmountPaise + moneyToPaise(numberValue(totalBachatAmountDelta)),
    0,
  )
  const penaltiesPaise = Math.max(
    state.penaltiesPaise + moneyToPaise(numberValue(deltas.penalties)),
    0,
  )
  const missedPayments = Math.max(state.missedPayments + numberValue(deltas.missedPayments), 0)
  const maturedAccounts = Math.max(state.maturedAccounts + numberValue(deltas.maturedAccounts), 0)
  const prematureClosures = Math.max(
    state.prematureClosures + numberValue(deltas.prematureClosures),
    0,
  )

  const includeTodayCollection = normalizeText(collectionDateKey) === state.summaryDayKey
  const includeMonthlyCollection =
    monthKey(collectionDateKey) === state.summaryMonthKey
  const todayCollectionPaise = Math.max(
    state.todayCollectionPaise +
      (includeTodayCollection ? moneyToPaise(numberValue(deltas.todayCollection)) : 0),
    0,
  )
  const monthlyCollectionPaise = Math.max(
    state.monthlyCollectionPaise +
      (includeMonthlyCollection ? moneyToPaise(numberValue(deltas.monthlyCollection)) : 0),
    0,
  )
  const todayTargetPaise = Math.max(activeDailyExpectedPaise, 0)
  const monthlyTargetPaise = Math.max(
    activeDailyExpectedPaise * daysInMonthFromDateKey(state.summaryDayKey),
    0,
  )
  const todayPendingAmountPaise = Math.max(activeDailyExpectedPaise - todayCollectionPaise, 0)
  const collectionProgress = todayTargetPaise <= 0
    ? 0
    : clampPercent((todayCollectionPaise / todayTargetPaise) * 100)

  return {
    activeAccounts,
    activeDailyExpected: paiseToMoney(activeDailyExpectedPaise),
    activeDailyExpectedPaise,
    totalBachatAmount: paiseToMoney(totalBachatAmountPaise),
    totalBachatAmountPaise,
    totalCollected: paiseToMoney(totalBachatAmountPaise),
    totalCollectedPaise: totalBachatAmountPaise,
    penalties: paiseToMoney(penaltiesPaise),
    penaltiesPaise,
    todayCollection: paiseToMoney(todayCollectionPaise),
    todayCollectionPaise,
    todayTarget: paiseToMoney(todayTargetPaise),
    todayTargetPaise,
    todayPendingAmount: paiseToMoney(todayPendingAmountPaise),
    todayPendingAmountPaise,
    monthlyCollection: paiseToMoney(monthlyCollectionPaise),
    monthlyCollectionPaise,
    monthlyTarget: paiseToMoney(monthlyTargetPaise),
    monthlyTargetPaise,
    collectionProgress,
    missedPayments: Math.round(missedPayments),
    maturedAccounts: Math.round(maturedAccounts),
    prematureClosures: Math.round(prematureClosures),
    summaryDayKey: state.summaryDayKey,
    summaryMonthKey: state.summaryMonthKey,
    updatedAt: serverTimestamp(),
  }
}

const normalizeCustomerIdentity = (customer = {}) => ({
  customerId: normalizeText(customer.customerId || customer.id),
  fullName: normalizeText(customer.fullName || customer.ownerName || ''),
  mobile: normalizeText(customer.mobile || ''),
  alternateMobile: normalizeText(customer.alternateMobile || ''),
  address: normalizeText(customer.address || ''),
  area: normalizeText(customer.area || ''),
  profilePhoto: normalizeText(
    customer.profilePhoto || customer.profilePhotoUrl || customer.photoUrl || customer.photo || '',
  ),
  documentPhoto: normalizeText(customer.documentPhoto || customer.documentPhotoUrl || ''),
})

const customerRef = (customerId) => doc(db, COLLECTIONS.customers, normalizeText(customerId))

export const calculateProgressiveBachatPenalty = ({
  missedMonths = 0,
  dailyAmount = 0,
} = {}) => {
  return buildBachatPenaltyAnalysis({ account: { dailyAmount, missedMonths } }).grossPenaltyAmount
}

const bachatPenaltyMultiplier = (missedIndex) => Math.max(numberValue(missedIndex) - 1, 1)

export const buildBachatPenaltyAnalysis = ({
  account = {},
  penalty = {},
  recoveryRows = [],
} = {}) => {
  const dailyAmount = moneyValue(account, 'dailyAmount')
  const monthlyAmount =
    moneyValue(account, 'monthlyAmount') || normalizeMoney(dailyAmount * BACHAT_RULES.daysPerMonth)
  const penaltyBase = normalizeMoney(monthlyAmount * BACHAT_RULES.penaltyRate)
  const missedMonths = Math.max(
    numberValue(penalty?.missedMonths, numberValue(account?.missedMonths)),
    0,
  )
  const paidMonths = Math.max(numberValue(account?.paidMonths), 0)
  const overdueDays = Math.max(
    numberValue(penalty?.overdueDays, numberValue(account?.overdueDays)),
    missedMonths * BACHAT_RULES.daysPerMonth,
  )
  const breakdown = Array.from({ length: Math.round(missedMonths) }).map((_, index) => {
    const missedIndex = index + 1
    const multiplier = bachatPenaltyMultiplier(missedIndex)
    const penaltyAmount = normalizeMoney(penaltyBase * multiplier)

    return {
      missedIndex,
      missedMonth: paidMonths + missedIndex,
      multiplier,
      baseAmount: penaltyBase,
      formula: `${penaltyBase} x ${multiplier}`,
      penaltyAmount,
    }
  })
  const grossPenaltyAmount = normalizeMoney(
    breakdown.reduce((sum, item) => sum + item.penaltyAmount, 0),
  )
  const recoveredFromRows = normalizeMoney(
    recoveryRows.reduce((sum, item) => sum + moneyValue(item, 'penaltyRecovered'), 0),
  )
  const pendingPenaltyAmount = Math.max(
    moneyValue(account, 'penaltyAmount') || moneyValue(penalty, 'penaltyAmount'),
    0,
  )
  const recoveredFromBalance = Math.max(grossPenaltyAmount - pendingPenaltyAmount, 0)
  const recoveredAmount = normalizeMoney(Math.max(recoveredFromRows, recoveredFromBalance))
  const pendingRecovery = normalizeMoney(Math.max(grossPenaltyAmount - recoveredAmount, 0))
  const storedRecoveryStatus = normalizeText(penalty?.recoveryStatus).toLowerCase()
  const recoveryStatus =
    storedRecoveryStatus === 'waived'
      ? 'waived'
      : grossPenaltyAmount <= 0
        ? 'recovered'
        : pendingRecovery <= 0
          ? 'recovered'
          : recoveredAmount > 0
            ? 'partial'
            : 'pending'

  return {
    dailyAmount,
    monthlyAmount,
    penaltyRate: BACHAT_RULES.penaltyRate,
    penaltyRatePercent: BACHAT_RULES.penaltyRate * 100,
    penaltyBase,
    missedMonths,
    overdueDays,
    breakdown,
    grossPenaltyAmount,
    recoveredAmount,
    pendingRecovery,
    recoveryStatus,
  }
}

export const computeBachatClosurePreview = (account, asOfDate = todayKey()) => {
  const startDateKey = account?.startDateKey || dateKeyFromDate(account?.startDate) || todayKey()
  const durationMonths = Math.max(
    numberValue(account?.durationMonths, BACHAT_RULES.defaultDurationMonths),
    1,
  )
  const completedMonths = Math.min(
    elapsedMonthlyInstallments(startDateKey, asOfDate),
    durationMonths,
  )
  const principal = moneyValue(account, 'totalCollected')
  const maturityAmount = moneyValue(account, 'maturityAmount')

  if (completedMonths >= durationMonths) {
    return {
      completedMonths,
      payoutAmount: maturityAmount,
      rewardPaid: Math.max(maturityAmount - principal, 0),
      rule: 'maturity',
    }
  }

  if (completedMonths >= BACHAT_RULES.eligibilityMonths) {
    const rewardPaid = normalizeMoney(principal * BACHAT_RULES.postEligibilityBenefitRate)
    return {
      completedMonths,
      payoutAmount: normalizeMoney(principal + rewardPaid),
      rewardPaid,
      rule: 'after_24_months',
    }
  }

  return {
    completedMonths,
    payoutAmount: principal,
    rewardPaid: 0,
    rule: 'before_24_months',
  }
}

export const listenBachatSummary = (callback, onError) =>
  onSnapshot(
    doc(db, COLLECTIONS.bachatSummary, 'main'),
    (snapshot) => {
      const rawSummary = snapshot.exists() ? snapshot.data() : {}
      const normalized = resolveBachatSummaryState({
        summaryData: { ...emptyBachatSummary, ...rawSummary },
        nowDateKey: todayKey(),
      })
      const todayPendingAmountPaise = Math.max(
        normalized.activeDailyExpectedPaise - normalized.todayCollectionPaise,
        0,
      )
      const todayTargetPaise = Math.max(normalized.activeDailyExpectedPaise, 0)
      const monthlyTargetPaise = Math.max(
        normalized.activeDailyExpectedPaise * daysInMonthFromDateKey(normalized.summaryDayKey),
        0,
      )
      const collectionProgress = todayTargetPaise <= 0
        ? 0
        : clampPercent((normalized.todayCollectionPaise / todayTargetPaise) * 100)

      callback({
        id: snapshot.exists() ? snapshot.id : 'main',
        ...emptyBachatSummary,
        ...rawSummary,
        activeAccounts: normalized.activeAccounts,
        activeDailyExpected: paiseToMoney(normalized.activeDailyExpectedPaise),
        activeDailyExpectedPaise: normalized.activeDailyExpectedPaise,
        totalBachatAmount: paiseToMoney(normalized.totalBachatAmountPaise),
        totalBachatAmountPaise: normalized.totalBachatAmountPaise,
        totalCollected: paiseToMoney(normalized.totalBachatAmountPaise),
        totalCollectedPaise: normalized.totalBachatAmountPaise,
        penalties: paiseToMoney(normalized.penaltiesPaise),
        penaltiesPaise: normalized.penaltiesPaise,
        todayCollection: paiseToMoney(normalized.todayCollectionPaise),
        todayCollectionPaise: normalized.todayCollectionPaise,
        todayTarget: paiseToMoney(todayTargetPaise),
        todayTargetPaise,
        monthlyCollection: paiseToMoney(normalized.monthlyCollectionPaise),
        monthlyCollectionPaise: normalized.monthlyCollectionPaise,
        monthlyTarget: paiseToMoney(monthlyTargetPaise),
        monthlyTargetPaise,
        todayPendingAmount: paiseToMoney(todayPendingAmountPaise),
        todayPendingAmountPaise,
        collectionProgress,
        missedPayments: normalized.missedPayments,
        maturedAccounts: normalized.maturedAccounts,
        prematureClosures: normalized.prematureClosures,
        summaryDayKey: normalized.summaryDayKey,
        summaryMonthKey: normalized.summaryMonthKey,
      })
    },
    (error) => {
      debugBachatPermission({
        operation: 'listen',
        collectionName: COLLECTIONS.bachatSummary,
        docPath: `${COLLECTIONS.bachatSummary}/main`,
        error,
      })
      if (onError) onError(error)
    },
  )

export const listenActiveBachatAccounts = ({
  currentUser,
  pageSize = 1000,
} = {}, callback, onError) => {
  const constraints = []
  if (currentUser?.role === USER_ROLES.collector) {
    constraints.push(where('collectorId', '==', currentUser.userId))
  }
  constraints.push(limit(pageLimit(pageSize, 500, 1000)))

  return onSnapshot(
    query(collection(db, COLLECTIONS.bachatAccounts), ...constraints),
    (snapshot) => callback(docsWithIds(snapshot).filter(isActiveBachatAccount)),
    onError,
  )
}

export const listenBachatCollections = ({
  currentUser,
  pageSize = 1000,
} = {}, callback, onError) => {
  const constraints = []
  if (currentUser?.role === USER_ROLES.collector) {
    constraints.push(where('collectorId', '==', currentUser.userId))
  }
  constraints.push(limit(pageLimit(pageSize, 500, 1000)))

  return onSnapshot(
    query(collection(db, COLLECTIONS.bachatCollections), ...constraints),
    (snapshot) => callback(docsWithIds(snapshot)),
    onError,
  )
}

export const getBachatAccount = async (customerId) => {
  const normalizedId = normalizeText(customerId)
  if (!normalizedId) throw new Error('Customer ID is required.')
  try {
    const snapshot = await getDoc(doc(db, COLLECTIONS.bachatAccounts, normalizedId))
    if (!snapshot.exists()) return null
    return { id: snapshot.id, ...snapshot.data() }
  } catch (error) {
    debugBachatPermission({
      operation: 'getDoc',
      collectionName: COLLECTIONS.bachatAccounts,
      docPath: `${COLLECTIONS.bachatAccounts}/${normalizedId}`,
      error,
    })
    throw error
  }
}

export const getBachatCollectionsByCustomer = async ({
  customerId,
  currentUser,
  pageSize = 12,
  cursor = null,
} = {}) => {
  const normalizedId = normalizeText(customerId)
  if (!normalizedId) return { results: [], count: 0 }

  const constraints = [where('customerId', '==', normalizedId)]
  if (currentUser?.role === USER_ROLES.collector) {
    constraints.push(where('collectorId', '==', currentUser.userId))
  }
  constraints.push(orderBy('paymentDate', 'desc'))
  if (cursor) {
    constraints.push(startAfter(cursor))
  }
  constraints.push(limit(pageLimit(pageSize, 12, 50)))

  try {
    const snapshot = await getDocs(query(collection(db, COLLECTIONS.bachatCollections), ...constraints))
    const results = docsWithIds(snapshot)
    return {
      results,
      count: results.length,
      cursor: snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1] : null,
      hasMore: results.length >= pageLimit(pageSize, 12, 50),
    }
  } catch (error) {
    debugBachatPermission({
      operation: 'query',
      collectionName: COLLECTIONS.bachatCollections,
      docPath: COLLECTIONS.bachatCollections,
      currentUser,
      error,
    })
    throw error
  }
}

export const getBachatPenaltyRecoveryHistory = async ({
  customerId,
  currentUser,
  pageSize = 50,
} = {}) => {
  const response = await getBachatCollectionsByCustomer({
    customerId,
    currentUser,
    pageSize: pageLimit(pageSize, 50, 50),
  })

  const results = (response.results || []).filter(
    (record) => moneyValue(record, 'penaltyRecovered') > 0,
  )

  return {
    results,
    count: results.length,
  }
}

export const listenBachatAccount = ({
  customerId,
  currentUser,
  onNext,
  onError,
} = {}) => {
  const normalizedId = normalizeText(customerId)
  if (!normalizedId) {
    onNext?.(null)
    return () => {}
  }

  return onSnapshot(
    doc(db, COLLECTIONS.bachatAccounts, normalizedId),
    (snapshot) => {
      onNext?.(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null)
    },
    (error) => {
      debugBachatPermission({
        operation: 'listen',
        collectionName: COLLECTIONS.bachatAccounts,
        docPath: `${COLLECTIONS.bachatAccounts}/${normalizedId}`,
        currentUser,
        error,
      })
      onError?.(error)
    },
  )
}

export const listenRecentBachatCollections = ({
  customerId,
  currentUser,
  pageSize = 5,
  onNext,
  onError,
} = {}) => {
  const normalizedId = normalizeText(customerId)
  if (!normalizedId) {
    onNext?.({ results: [] })
    return () => {}
  }

  const constraints = [
    where('customerId', '==', normalizedId),
    orderBy('paymentDate', 'desc'),
    limit(pageLimit(pageSize, 5, 20)),
  ]

  return onSnapshot(
    query(collection(db, COLLECTIONS.bachatCollections), ...constraints),
    (snapshot) => {
      const results = docsWithIds(snapshot)
      onNext?.({
        results,
        cursor: snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1] : null,
      })
    },
    (error) => {
      debugBachatPermission({
        operation: 'listen',
        collectionName: COLLECTIONS.bachatCollections,
        docPath: COLLECTIONS.bachatCollections,
        currentUser,
        error,
      })
      onError?.(error)
    },
  )
}

export const listenBachatPenaltiesByCustomer = ({
  customerId,
  currentUser,
  onNext,
  onError,
} = {}) => {
  const normalizedId = normalizeText(customerId)
  if (!normalizedId) {
    onNext?.({ latest: null })
    return () => {}
  }

  const penaltiesQuery = query(
    collection(db, COLLECTIONS.bachatPenalties),
    where('customerId', '==', normalizedId),
    orderBy('updatedAt', 'desc'),
    limit(1),
  )

  return onSnapshot(
    penaltiesQuery,
    (snapshot) => {
      const latest = snapshot.docs.length ? { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } : null
      onNext?.({ latest })
    },
    (error) => {
      debugBachatPermission({
        operation: 'listen',
        collectionName: COLLECTIONS.bachatPenalties,
        docPath: COLLECTIONS.bachatPenalties,
        currentUser,
        error,
      })
      onError?.(error)
    },
  )
}

export const listenBachatClosuresByCustomer = ({
  customerId,
  currentUser,
  onNext,
  onError,
} = {}) => {
  const normalizedId = normalizeText(customerId)
  if (!normalizedId) {
    onNext?.({ latest: null })
    return () => {}
  }

  const closuresQuery = query(
    collection(db, COLLECTIONS.bachatClosures),
    where('customerId', '==', normalizedId),
    orderBy('createdAt', 'desc'),
    limit(1),
  )

  return onSnapshot(
    closuresQuery,
    (snapshot) => {
      const latest = snapshot.docs.length ? { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } : null
      onNext?.({ latest })
    },
    (error) => {
      debugBachatPermission({
        operation: 'listen',
        collectionName: COLLECTIONS.bachatClosures,
        docPath: COLLECTIONS.bachatClosures,
        currentUser,
        error,
      })
      onError?.(error)
    },
  )
}

export const getActiveBachatAccounts = async ({ currentUser, pageSize = 500 } = {}) => {
  const scopedConstraints = []
  if (currentUser?.role === USER_ROLES.collector) {
    scopedConstraints.push(where('collectorId', '==', currentUser.userId))
  }
  const normalizedLimit = pageLimit(pageSize, 200, 1000)

  try {
    const strictQuery = query(
      collection(db, COLLECTIONS.bachatAccounts),
      ...scopedConstraints,
      where('status', '==', 'active'),
      orderBy('updatedAt', 'desc'),
      limit(normalizedLimit),
    )
    const relaxedQuery = query(
      collection(db, COLLECTIONS.bachatAccounts),
      ...scopedConstraints,
      limit(normalizedLimit),
    )
    const [strictSnapshot, relaxedSnapshot] = await Promise.all([
      getDocs(strictQuery),
      getDocs(relaxedQuery),
    ])
    const merged = new Map()
    docsWithIds(strictSnapshot).forEach((account) => {
      if (isActiveBachatAccount(account)) merged.set(account.customerId || account.id, account)
    })
    docsWithIds(relaxedSnapshot).forEach((account) => {
      if (isActiveBachatAccount(account)) merged.set(account.customerId || account.id, account)
    })
    const results = [...merged.values()]
    return {
      results,
      count: results.length,
      cursor: strictSnapshot.docs.length ? strictSnapshot.docs[strictSnapshot.docs.length - 1] : null,
      hasMore: results.length >= normalizedLimit,
    }
  } catch (error) {
    debugBachatPermission({
      operation: 'query',
      collectionName: COLLECTIONS.bachatAccounts,
      docPath: COLLECTIONS.bachatAccounts,
      currentUser,
      error,
    })
    throw error
  }
}

export const getBachatCollectionCandidateStatus = async ({
  customerId,
  currentUser,
} = {}) => {
  const normalizedCustomerId = normalizeText(customerId)
  if (!normalizedCustomerId) {
    throw new Error('Customer ID is required.')
  }

  const customerSnapshot = await getDoc(customerRef(normalizedCustomerId))
  if (!customerSnapshot.exists()) {
    throw new Error('Customer record was not found.')
  }

  const customerData = customerSnapshot.data()
  const account = await getBachatAccount(normalizedCustomerId)
  const moduleFlags = buildModuleFlags(customerData.moduleFlags)
  const hasBachatFlag = Boolean(moduleFlags.bachat)
  const hasBachatAccount = Boolean(account)
  const isAccountActive = hasBachatAccount && normalizeText(account.status || 'active') === 'active'
  const canCollect = hasBachatFlag && isAccountActive
  const reason = !hasBachatFlag
    ? 'flag_disabled'
    : !hasBachatAccount
      ? 'account_missing'
      : !isAccountActive
        ? 'account_inactive'
        : 'ready'

  debugBachatPermission({
    operation: 'collection-candidate-status',
    collectionName: COLLECTIONS.customers,
    docPath: `${COLLECTIONS.customers}/${normalizedCustomerId}`,
    currentUser,
    extra: {
      hasBachatFlag,
      hasBachatAccount,
      accountStatus: normalizeText(account?.status || ''),
      reason,
    },
  })

  return {
    customer: {
      id: customerSnapshot.id,
      ...customerData,
      moduleFlags,
    },
    account,
    hasBachatFlag,
    hasBachatAccount,
    isAccountActive,
    canCollect,
    reason,
  }
}

export const getActiveBachatAccountsPage = async ({
  currentUser,
  pageSize = 25,
  cursor = null,
} = {}) => {
  const constraints = [where('status', '==', 'active')]
  if (currentUser?.role === USER_ROLES.collector) {
    constraints.unshift(where('collectorId', '==', currentUser.userId))
  }
  constraints.push(orderBy('updatedAt', 'desc'))
  if (cursor) {
    constraints.push(startAfter(cursor))
  }
  const normalizedLimit = pageLimit(pageSize, 25, 100)
  constraints.push(limit(normalizedLimit))

  try {
    const snapshot = await getDocs(query(collection(db, COLLECTIONS.bachatAccounts), ...constraints))
    const results = docsWithIds(snapshot)
    return {
      results,
      count: results.length,
      cursor: snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1] : null,
      hasMore: results.length >= normalizedLimit,
    }
  } catch (error) {
    debugBachatPermission({
      operation: 'query',
      collectionName: COLLECTIONS.bachatAccounts,
      docPath: COLLECTIONS.bachatAccounts,
      currentUser,
      error,
    })
    throw error
  }
}

export const getBachatCollectionsByDate = async ({
  date = todayKey(),
  currentUser,
  pageSize = 500,
} = {}) => {
  const constraints = [where('paymentDate', '==', date)]
  if (currentUser?.role === USER_ROLES.collector) {
    constraints.push(where('collectorId', '==', currentUser.userId))
  }
  constraints.push(limit(pageLimit(pageSize, 200, 1000)))

  try {
    const snapshot = await getDocs(query(collection(db, COLLECTIONS.bachatCollections), ...constraints))
    const results = docsWithIds(snapshot)
    return { results, count: results.length }
  } catch (error) {
    debugBachatPermission({
      operation: 'query',
      collectionName: COLLECTIONS.bachatCollections,
      docPath: COLLECTIONS.bachatCollections,
      currentUser,
      error,
    })
    throw error
  }
}

export const getLatestBachatPenaltiesForCustomers = async ({
  customerIds = [],
  currentUser,
} = {}) => {
  const ids = [...new Set(customerIds.map((value) => normalizeText(value)).filter(Boolean))]
  if (!ids.length) return {}

  const results = await Promise.allSettled(
    ids.map(async (customerId) => {
      const snapshot = await getDocs(
        query(
          collection(db, COLLECTIONS.bachatPenalties),
          where('customerId', '==', customerId),
          orderBy('updatedAt', 'desc'),
          limit(1),
        ),
      )
      if (snapshot.empty) return [customerId, null]
      return [customerId, { id: snapshot.docs[0].id, ...snapshot.docs[0].data() }]
    }),
  )

  const penaltiesMap = {}
  results.forEach((entry) => {
    if (entry.status === 'fulfilled') {
      const [customerId, record] = entry.value
      penaltiesMap[customerId] = record
    } else {
      debugBachatPermission({
        operation: 'query',
        collectionName: COLLECTIONS.bachatPenalties,
        docPath: COLLECTIONS.bachatPenalties,
        currentUser,
        error: entry.reason,
      })
    }
  })

  return penaltiesMap
}

export const getBachatEnrollmentStatus = async ({
  customerId,
  currentUser,
} = {}) => {
  const normalizedCustomerId = normalizeText(customerId)
  if (!normalizedCustomerId) {
    throw new Error('Customer ID is required.')
  }

  const customerReference = customerRef(normalizedCustomerId)
  const customerSnapshot = await getDoc(customerReference)
  if (!customerSnapshot.exists()) {
    throw new Error('Customer record was not found.')
  }

  const customer = {
    id: customerSnapshot.id,
    ...customerSnapshot.data(),
    moduleFlags: buildModuleFlags(customerSnapshot.data()?.moduleFlags),
  }
  const hasBachatFlag = Boolean(customer.moduleFlags.bachat)

  if (!customerSnapshot.data()?.moduleFlags) {
    updateDoc(customerReference, {
      moduleFlags: customer.moduleFlags,
      ...customerFinanceCleanupPatch(),
      updatedAt: serverTimestamp(),
    }).catch(() => {})
  }

  const account = await getBachatAccount(normalizedCustomerId)
  if (!account && hasBachatFlag) {
    return {
      customer,
      account: null,
      hasBachatFlag: true,
      isEnrolled: false,
      reason: 'flag_without_account',
    }
  }

  if (account && !hasBachatFlag) {
    updateDoc(customerReference, {
      moduleFlags: buildModuleFlags(customer.moduleFlags, { bachat: true }),
      ...customerFinanceCleanupPatch(),
      updatedAt: serverTimestamp(),
    }).catch(() => {})
  }

  debugBachatPermission({
    operation: 'enrollment-status',
    collectionName: COLLECTIONS.customers,
    docPath: `${COLLECTIONS.customers}/${normalizedCustomerId}`,
    currentUser,
    extra: {
      hasBachatFlag,
      hasAccount: Boolean(account),
    },
  })

  return {
    customer: {
      ...customer,
      moduleFlags: buildModuleFlags(customer.moduleFlags, { bachat: Boolean(account) || hasBachatFlag }),
    },
    account,
    hasBachatFlag,
    isEnrolled: Boolean(account),
    reason: account ? (hasBachatFlag ? 'flag_and_account' : 'account_only') : 'not_enrolled',
  }
}

export const enrollCustomerToBachat = async ({
  customer,
  payload,
  currentUser,
}) => {
  const identity = normalizeCustomerIdentity(customer)
  if (!identity.customerId) throw new Error('Customer record was not found.')

  const customerReference = doc(db, COLLECTIONS.customers, identity.customerId)
  const accountReference = doc(db, COLLECTIONS.bachatAccounts, identity.customerId)
  const summaryReference = doc(db, COLLECTIONS.bachatSummary, 'main')
  const customerFinancialReference = doc(db, COLLECTIONS.customerFinancials, identity.customerId)

  const dailyAmount = normalizeMoney(payload.dailyAmount)
  if (dailyAmount <= 0) throw new Error('Daily amount must be greater than zero.')
  const durationMonths = Math.max(
    numberValue(payload.durationMonths, BACHAT_RULES.defaultDurationMonths),
    1,
  )
  const startDateKey = dateKeyFromDate(payload.startDate || todayKey())
  const endDateKey = addMonthsKey(startDateKey, durationMonths)
  const monthlyAmount = normalizeMoney(dailyAmount * BACHAT_RULES.daysPerMonth)
  const totalTargetAmount = normalizeMoney(monthlyAmount * durationMonths)
  const maturityReward = normalizeMoney(payload.maturityReward)
  const maturityAmount = normalizeMoney(totalTargetAmount + maturityReward)

  try {
    await runTransaction(db, async (transaction) => {
      const [customerSnapshot, accountSnapshot, summarySnapshot] = await Promise.all([
        transaction.get(customerReference),
        transaction.get(accountReference),
        transaction.get(summaryReference),
      ])

      if (!customerSnapshot.exists()) {
        throw new Error('Customer record was not found.')
      }
      if (accountSnapshot.exists()) {
        throw new Error('Customer already enrolled in Bachat module.')
      }

      const customerData = customerSnapshot.data()
      const collectorId = normalizeText(
        payload.collectorId ||
          customerData.assignedCollectorId ||
          currentUser?.userId ||
          '',
      )
      const collectorName = normalizeText(
        payload.collectorName ||
          customerData.assignedCollectorName ||
          currentUser?.fullName ||
          currentUser?.email ||
          '',
      )
      const nowKey = todayKey()
      const nextModuleFlags = buildModuleFlags(customerData.moduleFlags, { bachat: true })

      transaction.set(accountReference, {
        customerId: identity.customerId,
        fullName: identity.fullName,
        mobile: identity.mobile,
        alternateMobile: identity.alternateMobile,
        address: identity.address,
        area: identity.area,
        profilePhoto: identity.profilePhoto,
        documentPhoto: identity.documentPhoto,
        dailyAmount,
        dailyAmountPaise: moneyToPaise(dailyAmount),
        monthlyAmount,
        monthlyAmountPaise: moneyToPaise(monthlyAmount),
        durationMonths,
        totalTargetAmount,
        totalTargetAmountPaise: moneyToPaise(totalTargetAmount),
        maturityReward,
        maturityRewardPaise: moneyToPaise(maturityReward),
        maturityAmount,
        maturityAmountPaise: moneyToPaise(maturityAmount),
        startDateKey,
        endDateKey,
        startDate: startDateKey,
        endDate: endDateKey,
        totalCollected: 0,
        totalCollectedPaise: 0,
        pendingAmount: 0,
        pendingAmountPaise: 0,
        penaltyAmount: 0,
        penaltyAmountPaise: 0,
        totalPenalty: 0,
        totalPenaltyPaise: 0,
        paidMonths: 0,
        missedMonths: 0,
        overdueDays: 0,
        lastPaymentDate: startDateKey,
        lastCollectionDate: null,
        lastPenaltyAppliedDate: null,
        penaltyStatus: 'none',
        collectorId,
        collectorName,
        status: 'active',
        closureEligibility: false,
        schemaVersion: 2,
        enrolledOn: nowKey,
        createdById: currentUser?.userId || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      transaction.set(
        customerReference,
        {
          moduleFlags: nextModuleFlags,
          ...customerFinanceCleanupPatch(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      transaction.set(
        summaryReference,
        buildBachatSummaryPatch({
          summaryData: summarySnapshot.exists() ? summarySnapshot.data() : {},
          nowDateKey: nowKey,
          deltas: {
            activeAccounts: 1,
            activeDailyExpected: dailyAmount,
          },
        }),
        { merge: true },
      )
      transaction.set(
        customerFinancialReference,
        {
          customerId: identity.customerId,
          activeModules: arrayUnion('bachat'),
          totalBachat: increment(0),
          totalBachatPaise: increment(0),
          penalties: 0,
          penaltiesPaise: 0,
          pendingAmount: 0,
          pendingAmountPaise: 0,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    })
  } catch (error) {
    debugBachatPermission({
      operation: 'transaction:enroll',
      collectionName: COLLECTIONS.bachatAccounts,
      docPath: `${COLLECTIONS.bachatAccounts}/${identity.customerId}`,
      currentUser,
      error,
      extra: {
        transactionPaths: [
          `${COLLECTIONS.customers}/${identity.customerId}`,
          `${COLLECTIONS.bachatAccounts}/${identity.customerId}`,
          `${COLLECTIONS.bachatSummary}/main`,
          `${COLLECTIONS.customerFinancials}/${identity.customerId}`,
          `${COLLECTIONS.customers}/${identity.customerId}.moduleFlags`,
        ],
      },
    })
    throw error
  }

  return getBachatAccount(identity.customerId)
}

export const applyBachatCollectionV2InTransaction = async ({
  transaction,
  customerId,
  customerData,
  currentUser,
  date,
  paymentMethod,
  remarks,
  amountCollectedPaise,
  pendingRecoveredPaise,
  penaltyRecoveredPaise = 0,
  pendingCreatedPaise,
  totalReceivedPaise,
  status,
}) => {
  const normalizedCustomerId = normalizeText(customerId)
  if (!normalizedCustomerId) return { applied: false, reason: 'missing_customer' }

  const accountReference = doc(db, COLLECTIONS.bachatAccounts, normalizedCustomerId)
  const accountSnapshot = await transaction.get(accountReference)
  if (!accountSnapshot.exists()) {
    return { applied: false, reason: 'not_enrolled' }
  }

  const accountData = accountSnapshot.data()
  const monthlyAmountPaise = moneyToPaise(
    moneyValue(accountData, 'monthlyAmount') ||
      moneyValue(accountData, 'dailyAmount') * BACHAT_RULES.daysPerMonth,
  )
  const currentTotalCollectedPaise = moneyToPaise(moneyValue(accountData, 'totalCollected'))
  const currentPendingPaise = moneyToPaise(moneyValue(accountData, 'pendingAmount'))
  const currentPenaltyPaise = moneyToPaise(moneyValue(accountData, 'penaltyAmount'))
  const previousTotalPenaltyPaise =
    moneyToPaise(moneyValue(accountData, 'totalPenalty')) ||
    moneyToPaise(
      calculateProgressiveBachatPenalty({
        missedMonths: numberValue(accountData.missedMonths),
        dailyAmount: moneyValue(accountData, 'dailyAmount'),
      }),
    )
  const inactiveGap = calculateBachatInactiveGap({ account: accountData, paymentDate: date })
  const inactiveMissedMonths = inactiveGap.missedMonths
  const inactivePendingPaise = inactiveMissedMonths * monthlyAmountPaise
  const normalizedPenaltyRecoveredPaise = Math.max(Math.round(numberValue(penaltyRecoveredPaise)), 0)
  const nextPendingPaise = Math.max(
    currentPendingPaise + inactivePendingPaise - pendingRecoveredPaise + pendingCreatedPaise,
    0,
  )
  const nextTotalCollectedPaise = Math.max(currentTotalCollectedPaise + totalReceivedPaise, 0)
  const paidMonths = monthlyAmountPaise > 0 ? Math.floor(nextTotalCollectedPaise / monthlyAmountPaise) : 0
  const previousMissedMonths = Math.max(numberValue(accountData.missedMonths), 0)
  const totalMissedMonths = previousMissedMonths + inactiveMissedMonths
  const grossPenaltyPaise = moneyToPaise(
    calculateProgressiveBachatPenalty({
      missedMonths: totalMissedMonths,
      dailyAmount: moneyValue(accountData, 'dailyAmount'),
    }),
  )
  const newPenaltyPaise = Math.max(grossPenaltyPaise - previousTotalPenaltyPaise, 0)
  const effectivePenaltyRecoveredPaise = Math.min(
    normalizedPenaltyRecoveredPaise,
    currentPenaltyPaise + newPenaltyPaise,
  )
  const nextPenaltyPaise = Math.max(currentPenaltyPaise + newPenaltyPaise - effectivePenaltyRecoveredPaise, 0)
  const shouldResetMissedTracking = nextPendingPaise <= 0 && nextPenaltyPaise <= 0
  const missedMonths = shouldResetMissedTracking ? 0 : totalMissedMonths
  const overdueDays = missedMonths * BACHAT_RULES.daysPerMonth
  const accountTotalPenaltyPaise = shouldResetMissedTracking ? 0 : grossPenaltyPaise
  const nextPenaltyAmount = paiseToMoney(nextPenaltyPaise)
  const penaltyRecovered = paiseToMoney(effectivePenaltyRecoveredPaise)
  const penaltyRecoveredPaiseValue = effectivePenaltyRecoveredPaise
  const recoveryStatus =
    grossPenaltyPaise <= 0
      ? 'none'
      : nextPenaltyPaise <= 0
        ? 'recovered'
        : effectivePenaltyRecoveredPaise > 0
          ? 'partial'
          : 'pending'
  const penaltyDeltaPaise = nextPenaltyPaise - currentPenaltyPaise
  const missedPaymentsDelta =
    previousMissedMonths <= 0 && missedMonths > 0
      ? 1
      : previousMissedMonths > 0 && missedMonths <= 0
        ? -1
        : 0
  const closureEligibility = paidMonths >= BACHAT_RULES.eligibilityMonths
  const closurePreview = computeBachatClosurePreview(accountData, date)
  const isCollectorActor = currentUser?.role === USER_ROLES.collector
  const collectorId = isCollectorActor
    ? normalizeText(currentUser?.userId)
    : normalizeText(
        accountData.collectorId || customerData?.assignedCollectorId || currentUser?.userId,
      )
  const collectorName = isCollectorActor
    ? normalizeText(
        currentUser?.fullName ||
          currentUser?.email ||
          customerData?.assignedCollectorName ||
          accountData.collectorName,
      )
    : normalizeText(
        accountData.collectorName ||
          customerData?.assignedCollectorName ||
          currentUser?.fullName ||
          currentUser?.email,
      )
  if (isCollectorActor && !collectorId) {
    throw new Error('Collector authentication context is missing.')
  }

  const transactionReference = doc(db, COLLECTIONS.bachatCollections, `${normalizedCustomerId}_${date}`)
  const existingSameDaySnapshot = await transaction.get(transactionReference)
  if (existingSameDaySnapshot.exists()) {
    throw new Error('Bachat collection already exists for this customer on selected date.')
  }
  const nowKey = todayKey()
  const previousLastPaymentDate = normalizeText(accountData.lastPaymentDate)
  const nextLastPaymentDate =
    totalReceivedPaise > 0
      ? !previousLastPaymentDate || previousLastPaymentDate < date
        ? date
        : previousLastPaymentDate
      : previousLastPaymentDate || inactiveGap.lastPaymentDate
  const lastPenaltyAppliedDate =
    inactiveMissedMonths > 0 ? date : normalizeText(accountData.lastPenaltyAppliedDate) || null
  const summaryReference = doc(db, COLLECTIONS.bachatSummary, 'main')
  const summarySnapshot = await transaction.get(summaryReference)
  const isToday = date === nowKey

  transaction.set(transactionReference, {
    txId: transactionReference.id,
    customerId: normalizedCustomerId,
    amount: paiseToMoney(totalReceivedPaise),
    amountPaise: totalReceivedPaise,
    amountCollected: paiseToMoney(amountCollectedPaise),
    amountCollectedPaise,
    pendingRecovered: paiseToMoney(pendingRecoveredPaise),
    pendingRecoveredPaise,
    penaltyRecovered,
    penaltyRecoveredPaise: penaltyRecoveredPaiseValue,
    pendingCreated: paiseToMoney(pendingCreatedPaise),
    pendingCreatedPaise,
    inactiveGapDays: inactiveGap.daysDifference,
    inactiveMissedMonths,
    inactivePendingCreated: paiseToMoney(inactivePendingPaise),
    inactivePendingCreatedPaise: inactivePendingPaise,
    paymentDate: date,
    collectorId,
    collectorName,
    paymentMethod: paymentMethod || 'cash',
    status: status || 'paid',
    source: 'v2',
    remarks: normalizeText(remarks),
    createdAt: serverTimestamp(),
  })

  if (grossPenaltyPaise > 0 || effectivePenaltyRecoveredPaise > 0 || previousMissedMonths > 0) {
    const penaltyReference = doc(db, COLLECTIONS.bachatPenalties, normalizedCustomerId)
    transaction.set(penaltyReference, {
      penaltyId: penaltyReference.id,
      customerId: normalizedCustomerId,
      missedMonths: totalMissedMonths,
      overdueDays: totalMissedMonths * BACHAT_RULES.daysPerMonth,
      pendingAmount: paiseToMoney(nextPendingPaise),
      pendingAmountPaise: nextPendingPaise,
      totalPenalty: paiseToMoney(grossPenaltyPaise),
      totalPenaltyPaise: grossPenaltyPaise,
      penaltyAmount: nextPenaltyAmount,
      penaltyAmountPaise: nextPenaltyPaise,
      recoveredPenalty: penaltyRecovered,
      recoveredPenaltyPaise: penaltyRecoveredPaiseValue,
      inactiveGapDays: inactiveGap.daysDifference,
      inactiveMissedMonths,
      lastPaymentDate: nextLastPaymentDate,
      lastPenaltyAppliedDate,
      penaltyStatus: recoveryStatus,
      recoveryStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  }

  transaction.set(
    accountReference,
    {
      collectorId,
      collectorName,
      totalCollected: paiseToMoney(nextTotalCollectedPaise),
      totalCollectedPaise: nextTotalCollectedPaise,
      pendingAmount: paiseToMoney(nextPendingPaise),
      pendingAmountPaise: nextPendingPaise,
      penaltyAmount: nextPenaltyAmount,
      penaltyAmountPaise: nextPenaltyPaise,
      totalPenalty: paiseToMoney(accountTotalPenaltyPaise),
      totalPenaltyPaise: accountTotalPenaltyPaise,
      paidMonths,
      missedMonths,
      overdueDays,
      lastPaymentDate: nextLastPaymentDate,
      lastCollectionDate: date,
      lastPenaltyAppliedDate,
      penaltyStatus: recoveryStatus,
      closureEligibility,
      projectedClosurePayout: closurePreview.payoutAmount,
      projectedClosureRule: closurePreview.rule,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  transaction.set(
    summaryReference,
    buildBachatSummaryPatch({
      summaryData: summarySnapshot.exists() ? summarySnapshot.data() : {},
      nowDateKey: nowKey,
      collectionDateKey: date,
      deltas: {
        totalBachatAmount: paiseToMoney(totalReceivedPaise),
        penalties: paiseToMoney(penaltyDeltaPaise),
        todayCollection: isToday ? paiseToMoney(totalReceivedPaise) : 0,
        monthlyCollection: paiseToMoney(totalReceivedPaise),
        missedPayments: missedPaymentsDelta,
      },
    }),
    { merge: true },
  )

  transaction.set(
    doc(db, COLLECTIONS.customerFinancials, normalizedCustomerId),
    {
      customerId: normalizedCustomerId,
      activeModules: arrayUnion('bachat'),
      totalBachat: increment(paiseToMoney(totalReceivedPaise)),
      totalBachatPaise: increment(totalReceivedPaise),
      penalties: nextPenaltyAmount,
      penaltiesPaise: nextPenaltyPaise,
      pendingAmount: paiseToMoney(nextPendingPaise),
      pendingAmountPaise: nextPendingPaise,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  return { applied: true, txId: transactionReference.id }
}

export const createBachatCollection = async ({
  customerId,
  payload,
  currentUser,
} = {}) => {
  const normalizedCustomerId = normalizeText(customerId || payload?.customerId)
  if (!normalizedCustomerId) {
    throw new Error('Customer ID is required.')
  }

  const paymentDate = dateKeyFromDate(payload?.date || payload?.paymentDate || todayKey())
  const paymentMethod = normalizePaymentMethod(payload?.paymentMethod)
  const notes = normalizeText(payload?.notes || payload?.remarks)
  const requestedAmount = normalizeMoney(payload?.amount)
  if (requestedAmount <= 0) {
    throw new Error('Collection amount must be greater than zero.')
  }

  const duplicateSnapshot = await getDocs(
    query(
      collection(db, COLLECTIONS.bachatCollections),
      where('customerId', '==', normalizedCustomerId),
      where('paymentDate', '==', paymentDate),
      limit(1),
    ),
  )
  if (!duplicateSnapshot.empty) {
    throw new Error('Bachat collection already exists for this customer on selected date.')
  }

  const customerReference = customerRef(normalizedCustomerId)
  const accountReference = doc(db, COLLECTIONS.bachatAccounts, normalizedCustomerId)

  try {
    let transactionResult = { applied: false, txId: '' }
    await runTransaction(db, async (transaction) => {
      const [customerSnapshot, accountSnapshot] = await Promise.all([
        transaction.get(customerReference),
        transaction.get(accountReference),
      ])
      if (!customerSnapshot.exists()) {
        throw new Error('Customer record was not found.')
      }
      if (!accountSnapshot.exists()) {
        throw new Error('Bachat account was not found for this customer.')
      }

      const customerData = customerSnapshot.data()
      const accountData = accountSnapshot.data()
      const moduleFlags = buildModuleFlags(customerData.moduleFlags)
      if (!moduleFlags.bachat) {
        throw new Error('Customer is not enrolled in Bachat module.')
      }
      if (normalizeText(accountData.status || 'active') !== 'active') {
        throw new Error('Bachat account is not active.')
      }

      const expectedAmountPaise = moneyToPaise(moneyValue(accountData, 'dailyAmount'))
      const monthlyAmountPaise = moneyToPaise(
        moneyValue(accountData, 'monthlyAmount') ||
          moneyValue(accountData, 'dailyAmount') * BACHAT_RULES.daysPerMonth,
      )
      const currentPendingPaise = moneyToPaise(moneyValue(accountData, 'pendingAmount'))
      const currentPenaltyPaise = moneyToPaise(moneyValue(accountData, 'penaltyAmount'))
      const inactiveGap = calculateBachatInactiveGap({ account: accountData, paymentDate })
      const inactivePendingPaise = inactiveGap.missedMonths * monthlyAmountPaise
      const pendingDueBeforeCollectionPaise = currentPendingPaise + inactivePendingPaise
      const previousTotalPenaltyPaise =
        moneyToPaise(moneyValue(accountData, 'totalPenalty')) ||
        moneyToPaise(
          calculateProgressiveBachatPenalty({
            missedMonths: numberValue(accountData.missedMonths),
            dailyAmount: moneyValue(accountData, 'dailyAmount'),
          }),
        )
      const grossPenaltyPaise = moneyToPaise(
        calculateProgressiveBachatPenalty({
          missedMonths: numberValue(accountData.missedMonths) + inactiveGap.missedMonths,
          dailyAmount: moneyValue(accountData, 'dailyAmount'),
        }),
      )
      const availablePenaltyPaise =
        currentPenaltyPaise + Math.max(grossPenaltyPaise - previousTotalPenaltyPaise, 0)
      const requestedAmountPaise = moneyToPaise(requestedAmount)
      const requestedPenaltyRecoveredPaise = Math.max(
        moneyToPaise(normalizeMoney(payload?.penaltyRecovered)),
        0,
      )
      const maxAcceptedPaise = expectedAmountPaise + pendingDueBeforeCollectionPaise
      if (requestedAmountPaise > maxAcceptedPaise) {
        throw new Error(
          `Amount exceeds allowed maximum for today. Maximum collectable is ${paiseToMoney(maxAcceptedPaise)}.`,
        )
      }
      if (requestedPenaltyRecoveredPaise > availablePenaltyPaise) {
        throw new Error(
          `Penalty exceeds available due. Maximum penalty collectable is ${paiseToMoney(availablePenaltyPaise)}.`,
        )
      }

      const hasInactivePendingDue = inactivePendingPaise > 0
      const pendingRecoveredPaise = hasInactivePendingDue
        ? Math.min(requestedAmountPaise, pendingDueBeforeCollectionPaise)
        : Math.min(
            Math.max(requestedAmountPaise - expectedAmountPaise, 0),
            pendingDueBeforeCollectionPaise,
          )
      const amountCollectedPaise = hasInactivePendingDue
        ? Math.min(Math.max(requestedAmountPaise - pendingRecoveredPaise, 0), expectedAmountPaise)
        : Math.min(requestedAmountPaise, expectedAmountPaise)
      const penaltyRecoveredPaise = requestedPenaltyRecoveredPaise
      const pendingCreatedPaise = hasInactivePendingDue
        ? 0
        : Math.max(expectedAmountPaise - amountCollectedPaise, 0)
      const totalReceivedPaise = amountCollectedPaise + pendingRecoveredPaise + penaltyRecoveredPaise
      const status = hasInactivePendingDue
        ? pendingRecoveredPaise >= pendingDueBeforeCollectionPaise
          ? 'paid'
          : 'partial'
        : amountCollectedPaise >= expectedAmountPaise
          ? 'paid'
          : amountCollectedPaise > 0
            ? 'partial'
            : 'pending'

      transactionResult = await applyBachatCollectionV2InTransaction({
        transaction,
        customerId: normalizedCustomerId,
        customerData,
        currentUser,
        date: paymentDate,
        paymentMethod,
        remarks: notes,
        amountCollectedPaise,
        pendingRecoveredPaise,
        penaltyRecoveredPaise,
        pendingCreatedPaise,
        totalReceivedPaise,
        status,
      })
    })
    return transactionResult
  } catch (error) {
    debugBachatPermission({
      operation: 'transaction:createBachatCollection',
      collectionName: COLLECTIONS.bachatCollections,
      docPath: `${COLLECTIONS.bachatCollections}/${normalizedCustomerId}_${paymentDate}`,
      currentUser,
      error,
      extra: {
        customerId: normalizedCustomerId,
        paymentDate,
      },
    })
    throw error
  }
}

export default {
  BACHAT_RULES,
  calculateBachatInactiveGap,
  calculateBachatLiveMetrics,
  calculateProgressiveBachatPenalty,
  buildBachatPenaltyAnalysis,
  computeBachatClosurePreview,
  listenBachatSummary,
  listenActiveBachatAccounts,
  listenBachatCollections,
  getBachatAccount,
  listenBachatAccount,
  getBachatEnrollmentStatus,
  getBachatCollectionsByCustomer,
  getBachatPenaltyRecoveryHistory,
  listenRecentBachatCollections,
  listenBachatPenaltiesByCustomer,
  listenBachatClosuresByCustomer,
  getActiveBachatAccounts,
  getActiveBachatAccountsPage,
  getBachatCollectionsByDate,
  getLatestBachatPenaltiesForCustomers,
  getBachatCollectionCandidateStatus,
  enrollCustomerToBachat,
  applyBachatCollectionV2InTransaction,
  createBachatCollection,
}
