import {
  arrayRemove,
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
  setDoc,
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
  permanentClosureInterestRate: 0.006,
  fullMaturityRewardDailyMultiplier: 600,
  penaltyRate: 0.02,
}

export const BACHAT_TESTING_RULES_DEFAULTS = {
  testingMode: false,
  interestEligibilityDays: 730,
  rewardEligibilityDays: 1825,
  penaltyCycleDays: 30,
}

const DEBUG_BACHAT_PERMISSIONS = import.meta.env.DEV
const BACHAT_RULES_SETTINGS_ID = 'bachatRules'

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
  permanentClosures: 0,
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

export const normalizeBachatRulesSettings = (settings = {}) => {
  const interestEligibilityDays = Math.max(
    Math.round(numberValue(settings.interestEligibilityDays, BACHAT_TESTING_RULES_DEFAULTS.interestEligibilityDays)),
    1,
  )
  const rewardEligibilityDays = Math.max(
    Math.round(numberValue(settings.rewardEligibilityDays, BACHAT_TESTING_RULES_DEFAULTS.rewardEligibilityDays)),
    interestEligibilityDays,
  )
  const penaltyCycleDays = Math.max(
    Math.round(numberValue(settings.penaltyCycleDays, BACHAT_TESTING_RULES_DEFAULTS.penaltyCycleDays)),
    1,
  )

  return {
    ...BACHAT_TESTING_RULES_DEFAULTS,
    ...settings,
    testingMode: Boolean(settings.testingMode),
    interestEligibilityDays,
    rewardEligibilityDays,
    penaltyCycleDays,
  }
}

const resolveBachatPenaltyCycleDays = (settings = BACHAT_TESTING_RULES_DEFAULTS) => {
  const normalizedSettings = normalizeBachatRulesSettings(settings)
  return normalizedSettings.testingMode ? normalizedSettings.penaltyCycleDays : BACHAT_RULES.daysPerMonth
}

const resolveBachatPenaltyMonthlyAmount = (
  account = {},
  settings = BACHAT_TESTING_RULES_DEFAULTS,
) => {
  const dailyAmount = moneyValue(account, 'dailyAmount')
  if (normalizeBachatRulesSettings(settings).testingMode) {
    return normalizeMoney(dailyAmount * resolveBachatPenaltyCycleDays(settings))
  }

  return moneyValue(account, 'monthlyAmount') || normalizeMoney(dailyAmount * BACHAT_RULES.daysPerMonth)
}

const resolveBachatCycleAmount = (
  account = {},
  settings = BACHAT_TESTING_RULES_DEFAULTS,
) => {
  const dailyAmount = moneyValue(account, 'dailyAmount')
  const normalizedSettings = normalizeBachatRulesSettings(settings)
  if (normalizedSettings.testingMode) {
    return normalizeMoney(dailyAmount * resolveBachatPenaltyCycleDays(settings))
  }

  return resolveBachatPenaltyMonthlyAmount(account, settings)
}

const bachatRulesSettingsRef = () => doc(db, COLLECTIONS.settings, BACHAT_RULES_SETTINGS_ID)

export const getBachatRulesSettings = async ({ currentUser } = {}) => {
  if (currentUser && currentUser.role !== USER_ROLES.admin) {
    return BACHAT_TESTING_RULES_DEFAULTS
  }

  try {
    const snapshot = await getDoc(bachatRulesSettingsRef())
    return normalizeBachatRulesSettings(snapshot.exists() ? snapshot.data() : {})
  } catch (error) {
    debugBachatPermission({
      operation: 'getDoc',
      collectionName: COLLECTIONS.settings,
      docPath: `${COLLECTIONS.settings}/${BACHAT_RULES_SETTINGS_ID}`,
      currentUser,
      error,
    })
    throw error
  }
}

export const listenBachatRulesSettings = ({ currentUser } = {}, callback, onError) => {
  if (currentUser?.role !== USER_ROLES.admin) {
    callback?.(BACHAT_TESTING_RULES_DEFAULTS)
    return () => {}
  }

  return onSnapshot(
    bachatRulesSettingsRef(),
    (snapshot) => callback(normalizeBachatRulesSettings(snapshot.exists() ? snapshot.data() : {})),
    (error) => {
      debugBachatPermission({
        operation: 'listen',
        collectionName: COLLECTIONS.settings,
        docPath: `${COLLECTIONS.settings}/${BACHAT_RULES_SETTINGS_ID}`,
        currentUser,
        error,
      })
      onError?.(error)
    },
  )
}

export const saveBachatRulesSettings = async ({
  payload,
  currentUser,
} = {}) => {
  if (currentUser?.role !== USER_ROLES.admin) {
    throw new Error('Only admins can update Bachat testing settings.')
  }

  const normalizedSettings = normalizeBachatRulesSettings(payload)
  try {
    await setDoc(
      bachatRulesSettingsRef(),
      {
        testingMode: normalizedSettings.testingMode,
        interestEligibilityDays: normalizedSettings.interestEligibilityDays,
        rewardEligibilityDays: normalizedSettings.rewardEligibilityDays,
        penaltyCycleDays: normalizedSettings.penaltyCycleDays,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  } catch (error) {
    debugBachatPermission({
      operation: 'setDoc',
      collectionName: COLLECTIONS.settings,
      docPath: `${COLLECTIONS.settings}/${BACHAT_RULES_SETTINGS_ID}`,
      currentUser,
      error,
    })
    throw error
  }
}

const isActiveBachatAccount = (account = {}) => {
  const status = normalizeText(account.status).toLowerCase()
  const accountStatus = normalizeText(account.accountStatus).toLowerCase()
  if (status && status !== 'active') return false
  if (accountStatus && accountStatus !== 'active') return false
  return true
}

const isPermanentlyClosedBachatAccount = (account = {}) =>
  [account.status, account.accountStatus, account.closureType]
    .map((value) => normalizeText(value).toLowerCase())
    .some((value) => value === 'permanently_closed' || value === 'permanent')

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

export const calculateBachatPendingAmount = (account = {}, asOfDate = todayKey()) => {
  const startDateKey = account?.startDateKey || dateKeyFromDate(account?.startDate) || todayKey()
  const activeDaysTillYesterday = daysBetween(startDateKey, asOfDate)
  const dailyAmount = moneyValue(account, 'dailyAmount')
  const expectedAmountTillYesterday = normalizeMoney(dailyAmount * activeDaysTillYesterday)
  const totalCollectedAmount = moneyValue(account, 'totalCollected') || moneyValue(account, 'totalSavings')
  const pendingAmount = normalizeMoney(
    Math.max(expectedAmountTillYesterday - totalCollectedAmount, 0),
  )

  return {
    activeDaysTillYesterday,
    dailyAmount,
    expectedAmountTillYesterday,
    totalCollectedAmount,
    pendingAmount,
  }
}

export const calculateBachatCoveredMonthStatus = (
  account = {},
  asOfDate = todayKey(),
  bachatRulesSettings = BACHAT_TESTING_RULES_DEFAULTS,
) => {
  const normalizedSettings = normalizeBachatRulesSettings(bachatRulesSettings)
  const startDateKey = account?.startDateKey || dateKeyFromDate(account?.startDate) || todayKey()
  const durationMonths = Math.max(
    numberValue(account?.durationMonths, BACHAT_RULES.defaultDurationMonths),
    1,
  )
  const totalCollectedPaise = moneyToPaise(
    moneyValue(account, 'totalCollected') || moneyValue(account, 'totalSavings'),
  )
  const cycleAmountPaise = moneyToPaise(resolveBachatCycleAmount(account, normalizedSettings))
  const paidMonths = cycleAmountPaise > 0
    ? Math.min(Math.floor(totalCollectedPaise / cycleAmountPaise), durationMonths)
    : 0
  const currentMonth = normalizedSettings.testingMode
    ? Math.min(
        Math.floor(daysBetween(startDateKey, asOfDate) / resolveBachatPenaltyCycleDays(normalizedSettings)) + 1,
        durationMonths,
      )
    : Math.min(elapsedMonthlyInstallments(startDateKey, asOfDate), durationMonths)
  const fullyDueMonths = Math.max(currentMonth - 1, 0)
  const missedMonths = Math.max(fullyDueMonths - paidMonths, 0)

  return {
    startDate: startDateKey,
    currentMonth,
    fullyDueMonths,
    lastFullyCoveredMonth: paidMonths,
    paidMonths,
    missedMonths,
    expectedAmountTillCurrentMonth: paiseToMoney(fullyDueMonths * cycleAmountPaise),
    amountActuallyCollected: paiseToMoney(totalCollectedPaise),
  }
}

export const deriveBachatAccountStatus = (
  account = {},
  asOfDate = todayKey(),
  bachatRulesSettings = BACHAT_TESTING_RULES_DEFAULTS,
) => {
  if (!account) return account

  const coveredStatus = calculateBachatCoveredMonthStatus(account, asOfDate, bachatRulesSettings)
  const penaltyCycleDays = resolveBachatPenaltyCycleDays(bachatRulesSettings)
  const grossPenaltyAmount = calculateProgressiveBachatPenalty({
    missedMonths: coveredStatus.missedMonths,
    dailyAmount: moneyValue(account, 'dailyAmount'),
    bachatRulesSettings,
  })
  const storedTotalPenalty = moneyValue(account, 'totalPenalty')
  const storedPendingPenalty = moneyValue(account, 'penaltyAmount')
  const recoveredPenalty = Math.max(storedTotalPenalty - storedPendingPenalty, 0)
  const penaltyAmount = normalizeMoney(Math.max(grossPenaltyAmount - recoveredPenalty, 0))
  const penaltyStatus =
    grossPenaltyAmount <= 0
      ? 'none'
      : penaltyAmount <= 0
        ? 'recovered'
        : recoveredPenalty > 0
          ? 'partial'
          : 'pending'

  return {
    ...account,
    paidMonths: coveredStatus.paidMonths,
    missedMonths: coveredStatus.missedMonths,
    overdueDays: coveredStatus.missedMonths * penaltyCycleDays,
    penaltyCycleDays,
    penaltyAmount,
    penaltyAmountPaise: moneyToPaise(penaltyAmount),
    totalPenalty: grossPenaltyAmount,
    totalPenaltyPaise: moneyToPaise(grossPenaltyAmount),
    penaltyStatus,
    bachatCoverageStatus: coveredStatus,
  }
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
  }).map((account) => deriveBachatAccountStatus(account))
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
  bachatRulesSettings = BACHAT_TESTING_RULES_DEFAULTS,
} = {}) => {
  const lastPaymentDate = resolveBachatLastPaymentDate(account, paymentDate)
  const daysDifference = daysBetween(lastPaymentDate, paymentDate)
  const normalizedSettings = normalizeBachatRulesSettings(bachatRulesSettings)
  const penaltyCycleDays = resolveBachatPenaltyCycleDays(bachatRulesSettings)
  const hasMissedCycle = normalizedSettings.testingMode
    ? daysDifference >= penaltyCycleDays
    : daysDifference > penaltyCycleDays
  const missedMonths =
    hasMissedCycle
      ? Math.max(Math.floor(daysDifference / penaltyCycleDays), 1)
      : 0

  return {
    lastPaymentDate,
    daysDifference,
    penaltyCycleDays,
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
    permanentClosures: nonNegativeInteger(summaryData.permanentClosures),
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
  const permanentClosures = Math.max(
    state.permanentClosures + numberValue(deltas.permanentClosures),
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
  const todayPendingAmountPaise = 0
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
    permanentClosures: Math.round(permanentClosures),
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
  bachatRulesSettings = BACHAT_TESTING_RULES_DEFAULTS,
} = {}) => {
  return buildBachatPenaltyAnalysis({
    account: { dailyAmount, missedMonths },
    bachatRulesSettings,
  }).grossPenaltyAmount
}

const bachatPenaltyMultiplier = (missedIndex) => Math.max(numberValue(missedIndex) - 1, 1)

export const buildBachatPenaltyAnalysis = ({
  account = {},
  penalty = {},
  recoveryRows = [],
  bachatRulesSettings = BACHAT_TESTING_RULES_DEFAULTS,
} = {}) => {
  const normalizedSettings = normalizeBachatRulesSettings(bachatRulesSettings)
  const dailyAmount = moneyValue(account, 'dailyAmount')
  const penaltyCycleDays = resolveBachatPenaltyCycleDays(bachatRulesSettings)
  const monthlyAmount = resolveBachatPenaltyMonthlyAmount(account, bachatRulesSettings)
  const penaltyBase = normalizeMoney(monthlyAmount * BACHAT_RULES.penaltyRate)
  const missedMonths = Math.max(
    numberValue(account?.missedMonths),
    numberValue(penalty?.missedMonths),
    0,
  )
  const paidMonths = Math.max(numberValue(account?.paidMonths), 0)
  const calculatedOverdueDays = missedMonths * penaltyCycleDays
  const overdueDays = normalizedSettings.testingMode
    ? calculatedOverdueDays
    : Math.max(
        numberValue(penalty?.overdueDays, numberValue(account?.overdueDays)),
        calculatedOverdueDays,
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
    penaltyCycleDays,
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

export const computeBachatClosurePreview = (
  account,
  asOfDate = todayKey(),
  bachatRulesSettings = BACHAT_TESTING_RULES_DEFAULTS,
) => {
  const settlement = computePermanentBachatSettlement(account, asOfDate, bachatRulesSettings)
  return {
    completedMonths: settlement.durationCompletedMonths,
    payoutAmount: settlement.finalSettlementAmount,
    rewardPaid: settlement.rewardAmount,
    interestPaid: settlement.interestAmount,
    totalPenalty: settlement.totalPenalty,
    rule: settlement.rule,
  }
}

export const computePermanentBachatSettlement = (
  account = {},
  asOfDate = todayKey(),
  bachatRulesSettings = BACHAT_TESTING_RULES_DEFAULTS,
) => {
  const normalizedRulesSettings = normalizeBachatRulesSettings(bachatRulesSettings)
  const currentAccount = deriveBachatAccountStatus(account, asOfDate, normalizedRulesSettings)
  const startDateKey = currentAccount?.startDateKey || dateKeyFromDate(currentAccount?.startDate) || todayKey()
  const durationMonths = Math.max(
    numberValue(currentAccount?.durationMonths, BACHAT_RULES.defaultDurationMonths),
    1,
  )
  const completedMonths = Math.min(
    elapsedMonthlyInstallments(startDateKey, asOfDate),
    durationMonths,
  )
  const durationEndDate = addMonthsKey(startDateKey, durationMonths)
  const durationDays = daysBetween(startDateKey, durationEndDate)
  const completedDays = Math.min(daysBetween(startDateKey, asOfDate), durationDays)
  const dailyAmount = moneyValue(currentAccount, 'dailyAmount')
  const totalSavings = moneyValue(currentAccount, 'totalSavings') || moneyValue(currentAccount, 'totalCollected')
  const totalPenalty = moneyValue(currentAccount, 'penaltyAmount')
  const pendingSummary = calculateBachatPendingAmount(currentAccount, asOfDate)
  const pendingAmount = pendingSummary.pendingAmount
  const configuredReward = moneyValue(currentAccount, 'maturityReward')
  const remainingDurationMonths = Math.max(durationMonths - completedMonths, 0)
  const usesTestingDurations = Boolean(normalizedRulesSettings.testingMode)
  const rewardEligible = usesTestingDurations
    ? completedDays >= normalizedRulesSettings.rewardEligibilityDays
    : completedMonths >= BACHAT_RULES.defaultDurationMonths
  const interestEligible = usesTestingDurations
    ? completedDays >= normalizedRulesSettings.interestEligibilityDays &&
      completedDays < normalizedRulesSettings.rewardEligibilityDays
    : completedMonths >= BACHAT_RULES.eligibilityMonths &&
      completedMonths < BACHAT_RULES.defaultDurationMonths
  const rewardAmount =
    rewardEligible
      ? normalizeMoney(
          configuredReward > 0
            ? configuredReward
            : dailyAmount * BACHAT_RULES.fullMaturityRewardDailyMultiplier,
        )
      : 0
  const interestAmount =
    interestEligible
      ? normalizeMoney(totalSavings * BACHAT_RULES.permanentClosureInterestRate)
      : 0
  const finalSettlementAmount = normalizeMoney(totalSavings + interestAmount + rewardAmount - totalPenalty)
  const rule =
    rewardEligible
      ? 'full_maturity_reward'
      : interestEligible
        ? 'after_24_months_interest'
        : 'early_closure_no_benefit'

  return {
    customerId: normalizeText(currentAccount.customerId || currentAccount.id),
    customerName: normalizeText(currentAccount.fullName || currentAccount.ownerName || currentAccount.shopName),
    startDate: startDateKey,
    originalEndDate: currentAccount.endDateKey || currentAccount.endDate || durationEndDate,
    dailyAmount,
    totalSavings,
    pendingAmount,
    pendingActiveDaysTillYesterday: pendingSummary.activeDaysTillYesterday,
    expectedAmountTillYesterday: pendingSummary.expectedAmountTillYesterday,
    pendingTotalCollectedAmount: pendingSummary.totalCollectedAmount,
    totalPenalty,
    penaltyDeducted: totalPenalty,
    durationMonths,
    durationCompletedMonths: completedMonths,
    remainingDurationMonths,
    durationDays,
    durationCompletedDays: completedDays,
    remainingDurationDays: Math.max(durationDays - completedDays, 0),
    interestEligible,
    rewardEligible,
    interestAmount,
    rewardAmount,
    finalSettlementAmount,
    rule,
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
      const todayPendingAmountPaise = 0
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
        permanentClosures: normalized.permanentClosures,
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
    (snapshot) => callback(
      docsWithIds(snapshot)
        .filter(isActiveBachatAccount)
        .map((account) => deriveBachatAccountStatus(account)),
    ),
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
    return deriveBachatAccountStatus({ id: snapshot.id, ...snapshot.data() })
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
      onNext?.(snapshot.exists() ? deriveBachatAccountStatus({ id: snapshot.id, ...snapshot.data() }) : null)
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

const isActiveBachatPenalty = (record = {}) => {
  const status = normalizeText(record.penaltyStatus || record.recoveryStatus || record.status).toLowerCase()
  return moneyValue(record, 'penaltyAmount') > 0 && ![
    'none',
    'recovered',
    'resolved',
    'inactive',
    'deleted',
    'deducted_on_closure',
  ].includes(status)
}

export const listenBachatPenalties = ({
  currentUser,
  pageSize = 1000,
} = {}, callback, onError) => {
  const constraints = []
  if (currentUser?.role === USER_ROLES.collector) {
    constraints.push(where('collectorId', '==', currentUser.userId))
  }
  constraints.push(limit(pageLimit(pageSize, 500, 1000)))

  return onSnapshot(
    query(collection(db, COLLECTIONS.bachatPenalties), ...constraints),
    (snapshot) => callback(docsWithIds(snapshot).filter(isActiveBachatPenalty)),
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

export const getLatestBachatClosureByCustomer = async ({
  customerId,
  currentUser,
} = {}) => {
  const normalizedId = normalizeText(customerId)
  if (!normalizedId) return null

  try {
    const snapshot = await getDocs(
      query(
        collection(db, COLLECTIONS.bachatClosures),
        where('customerId', '==', normalizedId),
        orderBy('createdAt', 'desc'),
        limit(1),
      ),
    )
    return snapshot.docs.length ? { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } : null
  } catch (error) {
    debugBachatPermission({
      operation: 'query',
      collectionName: COLLECTIONS.bachatClosures,
      docPath: COLLECTIONS.bachatClosures,
      currentUser,
      error,
    })
    throw error
  }
}

export const listenBachatClosures = ({
  currentUser,
  pageSize = 1000,
} = {}, callback, onError) => {
  const constraints = []
  if (currentUser?.role === USER_ROLES.collector) {
    constraints.push(where('collectorId', '==', currentUser.userId))
  }
  constraints.push(limit(pageLimit(pageSize, 200, 1000)))

  return onSnapshot(
    query(collection(db, COLLECTIONS.bachatClosures), ...constraints),
    (snapshot) => {
      const rows = docsWithIds(snapshot)
        .filter((record) => normalizeText(record.status || 'closed') === 'closed')
        .sort((first, second) =>
          normalizeText(second.closureDate || second.closedOn).localeCompare(
            normalizeText(first.closureDate || first.closedOn),
          ),
        )
      callback(rows)
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

export const permanentlyCloseBachatAccount = async ({
  customerId,
  closureReason = '',
  currentUser,
  closureDate = todayKey(),
} = {}) => {
  const normalizedCustomerId = normalizeText(customerId)
  if (!normalizedCustomerId) throw new Error('Customer ID is required.')

  const customerReference = customerRef(normalizedCustomerId)
  const accountReference = doc(db, COLLECTIONS.bachatAccounts, normalizedCustomerId)
  const summaryReference = doc(db, COLLECTIONS.bachatSummary, 'main')
  const customerFinancialReference = doc(db, COLLECTIONS.customerFinancials, normalizedCustomerId)
  const closureReference = doc(collection(db, COLLECTIONS.bachatClosures))
  const normalizedClosureDate = dateKeyFromDate(closureDate || todayKey())

  try {
    const bachatRulesSettings = await getBachatRulesSettings({ currentUser })
    await runTransaction(db, async (transaction) => {
      const [customerSnapshot, accountSnapshot, summarySnapshot] = await Promise.all([
        transaction.get(customerReference),
        transaction.get(accountReference),
        transaction.get(summaryReference),
      ])

      if (!customerSnapshot.exists()) {
        throw new Error('Customer record was not found.')
      }
      if (!accountSnapshot.exists()) {
        throw new Error('Bachat account was not found for this customer.')
      }

      const customerData = customerSnapshot.data()
      const accountData = deriveBachatAccountStatus(
        { id: accountSnapshot.id, ...accountSnapshot.data() },
        normalizedClosureDate,
        bachatRulesSettings,
      )
      if (!isActiveBachatAccount(accountData)) {
        throw new Error('Only active Bachat accounts can be permanently closed.')
      }

      const settlement = computePermanentBachatSettlement(
        accountData,
        normalizedClosureDate,
        bachatRulesSettings,
      )
      const customerName = normalizeText(
        settlement.customerName ||
          customerData.fullName ||
          customerData.ownerName ||
          customerData.shopName,
      )
      const collectorId = normalizeText(
        accountData.collectorId || customerData.assignedCollectorId || currentUser?.userId,
      )
      const collectorName = normalizeText(
        accountData.collectorName ||
          customerData.assignedCollectorName ||
          currentUser?.fullName ||
          currentUser?.email,
      )
      const originalEndDate = settlement.originalEndDate
      const existingFlags = buildModuleFlags(customerData.moduleFlags)
      const nextModuleFlags = buildModuleFlags(existingFlags, { bachat: false })
      const activeDailyExpected = moneyValue(accountData, 'dailyAmount')
      const hadMissedPayments = numberValue(accountData.missedMonths) > 0
      const penaltyPaise = moneyToPaise(settlement.totalPenalty)

      transaction.set(closureReference, {
        customerId: normalizedCustomerId,
        customerName,
        closureDate: normalizedClosureDate,
        closureReason: normalizeText(closureReason),
        startDate: settlement.startDate,
        originalEndDate,
        durationMonths: settlement.durationMonths,
        durationCompletedMonths: settlement.durationCompletedMonths,
        remainingDurationMonths: settlement.remainingDurationMonths,
        durationDays: settlement.durationDays,
        durationCompletedDays: settlement.durationCompletedDays,
        remainingDurationDays: settlement.remainingDurationDays,
        totalSavings: settlement.totalSavings,
        totalSavingsPaise: moneyToPaise(settlement.totalSavings),
        pendingAmount: settlement.pendingAmount,
        pendingAmountPaise: moneyToPaise(settlement.pendingAmount),
        pendingActiveDaysTillYesterday: settlement.pendingActiveDaysTillYesterday,
        expectedAmountTillYesterday: settlement.expectedAmountTillYesterday,
        expectedAmountTillYesterdayPaise: moneyToPaise(settlement.expectedAmountTillYesterday),
        pendingTotalCollectedAmount: settlement.pendingTotalCollectedAmount,
        pendingTotalCollectedAmountPaise: moneyToPaise(settlement.pendingTotalCollectedAmount),
        totalPenalty: settlement.totalPenalty,
        totalPenaltyPaise: penaltyPaise,
        penaltyDeducted: settlement.penaltyDeducted,
        penaltyDeductedPaise: penaltyPaise,
        interestAmount: settlement.interestAmount,
        interestAmountPaise: moneyToPaise(settlement.interestAmount),
        rewardAmount: settlement.rewardAmount,
        rewardAmountPaise: moneyToPaise(settlement.rewardAmount),
        finalSettlementAmount: settlement.finalSettlementAmount,
        finalSettlementAmountPaise: moneyToPaise(settlement.finalSettlementAmount),
        interestEligible: settlement.interestEligible,
        rewardEligible: settlement.rewardEligible,
        rule: settlement.rule,
        closureType: 'permanent',
        status: 'closed',
        collectorId,
        collectorName,
        createdById: currentUser?.userId || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      transaction.set(
        accountReference,
        {
          status: 'permanently_closed',
          accountStatus: 'permanently_closed',
          closureDate: normalizedClosureDate,
          finalSettlementAmount: settlement.finalSettlementAmount,
          finalSettlementAmountPaise: moneyToPaise(settlement.finalSettlementAmount),
          closureType: 'permanent',
          bachatRejoinBlockedUntil: originalEndDate,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )

      transaction.set(
        customerReference,
        {
          moduleFlags: nextModuleFlags,
          bachatRejoinBlockedUntil: originalEndDate,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )

      if (penaltyPaise > 0) {
        transaction.set(
          doc(db, COLLECTIONS.bachatPenalties, normalizedCustomerId),
          {
            penaltyStatus: 'deducted_on_closure',
            recoveryStatus: 'deducted_on_closure',
            closureDate: normalizedClosureDate,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
      }

      transaction.set(
        summaryReference,
        buildBachatSummaryPatch({
          summaryData: summarySnapshot.exists() ? summarySnapshot.data() : {},
          nowDateKey: todayKey(),
          deltas: {
            activeAccounts: -1,
            activeDailyExpected: -activeDailyExpected,
            missedPayments: hadMissedPayments ? -1 : 0,
            penalties: -settlement.totalPenalty,
            permanentClosures: 1,
          },
        }),
        { merge: true },
      )

      transaction.set(
        customerFinancialReference,
        {
          customerId: normalizedCustomerId,
          activeModules: arrayRemove('bachat'),
          penalties: 0,
          penaltiesPaise: 0,
          pendingAmount: 0,
          pendingAmountPaise: 0,
          bachatFinalSettlementAmount: settlement.finalSettlementAmount,
          bachatFinalSettlementAmountPaise: moneyToPaise(settlement.finalSettlementAmount),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    })
  } catch (error) {
    debugBachatPermission({
      operation: 'transaction:permanentClosure',
      collectionName: COLLECTIONS.bachatClosures,
      docPath: `${COLLECTIONS.bachatClosures}/${closureReference.id}`,
      currentUser,
      error,
      extra: {
        customerId: normalizedCustomerId,
        closureDate: normalizedClosureDate,
      },
    })
    throw error
  }

  return getBachatAccount(normalizedCustomerId)
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
    const results = [...merged.values()].map((account) => deriveBachatAccountStatus(account))
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
  const isAccountActive = hasBachatAccount && isActiveBachatAccount(account)
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
  const blockedUntil = normalizeText(customer.bachatRejoinBlockedUntil)
  const isRejoinBlocked = Boolean(blockedUntil && blockedUntil > todayKey())

  if (!customerSnapshot.data()?.moduleFlags) {
    updateDoc(customerReference, {
      moduleFlags: customer.moduleFlags,
      ...customerFinanceCleanupPatch(),
      updatedAt: serverTimestamp(),
    }).catch(() => {})
  }

  const account = await getBachatAccount(normalizedCustomerId)
  const hasActiveAccount = Boolean(account && isActiveBachatAccount(account))
  const hasClosedAccount = Boolean(account && isPermanentlyClosedBachatAccount(account))
  if (isRejoinBlocked && !hasActiveAccount) {
    return {
      customer,
      account,
      hasBachatFlag,
      isEnrolled: false,
      isRejoinBlocked: true,
      blockedUntil,
      reason: 'rejoin_blocked',
    }
  }

  if (!account && hasBachatFlag) {
    return {
      customer,
      account: null,
      hasBachatFlag: true,
      isEnrolled: false,
      reason: 'flag_without_account',
    }
  }

  if (hasActiveAccount && !hasBachatFlag) {
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
      isRejoinBlocked,
    },
  })

  return {
    customer: {
      ...customer,
      moduleFlags: buildModuleFlags(customer.moduleFlags, { bachat: hasActiveAccount || hasBachatFlag }),
    },
    account,
    hasBachatFlag,
    isEnrolled: hasActiveAccount,
    isRejoinBlocked: false,
    blockedUntil,
    reason: hasActiveAccount
      ? (hasBachatFlag ? 'flag_and_account' : 'account_only')
      : hasClosedAccount
        ? 'permanently_closed'
        : 'not_enrolled',
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
      const customerData = customerSnapshot.data()
      const nowKey = todayKey()
      const blockedUntil = normalizeText(customerData.bachatRejoinBlockedUntil)
      if (blockedUntil && blockedUntil > nowKey) {
        throw new Error('Customer cannot enroll in Bachat until original maturity date.')
      }
      if (accountSnapshot.exists() && isActiveBachatAccount(accountSnapshot.data())) {
        throw new Error('Customer already enrolled in Bachat module.')
      }

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
  bachatRulesSettings = BACHAT_TESTING_RULES_DEFAULTS,
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
  const penaltyCycleAmountPaise = moneyToPaise(resolveBachatPenaltyMonthlyAmount(accountData, bachatRulesSettings))
  const scheduleMonthlyAmountPaise = moneyToPaise(
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
        bachatRulesSettings,
      }),
    )
  const inactiveGap = calculateBachatInactiveGap({
    account: accountData,
    paymentDate: date,
    bachatRulesSettings,
  })
  const inactiveMissedMonths = inactiveGap.missedMonths
  const inactivePendingPaise = inactiveMissedMonths * penaltyCycleAmountPaise
  const normalizedPenaltyRecoveredPaise = Math.max(Math.round(numberValue(penaltyRecoveredPaise)), 0)
  const nextPendingPaise = Math.max(
    currentPendingPaise + inactivePendingPaise - pendingRecoveredPaise + pendingCreatedPaise,
    0,
  )
  const nextTotalCollectedPaise = Math.max(currentTotalCollectedPaise + totalReceivedPaise, 0)
  const paidMonths = scheduleMonthlyAmountPaise > 0
    ? Math.floor(nextTotalCollectedPaise / scheduleMonthlyAmountPaise)
    : 0
  const previousMissedMonths = Math.max(numberValue(accountData.missedMonths), 0)
  const totalMissedMonths = previousMissedMonths + inactiveMissedMonths
  const grossPenaltyPaise = moneyToPaise(
    calculateProgressiveBachatPenalty({
      missedMonths: totalMissedMonths,
      dailyAmount: moneyValue(accountData, 'dailyAmount'),
      bachatRulesSettings,
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
  const overdueDays = missedMonths * inactiveGap.penaltyCycleDays
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
  const closurePreview = computeBachatClosurePreview(accountData, date, bachatRulesSettings)
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
    penaltyCycleDays: inactiveGap.penaltyCycleDays,
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
      overdueDays: totalMissedMonths * inactiveGap.penaltyCycleDays,
      penaltyCycleDays: inactiveGap.penaltyCycleDays,
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
      penaltyCycleDays: inactiveGap.penaltyCycleDays,
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
    const bachatRulesSettings = await getBachatRulesSettings({ currentUser })
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
      if (!isActiveBachatAccount(accountData)) {
        throw new Error('Bachat account is not active.')
      }

      const expectedAmountPaise = moneyToPaise(moneyValue(accountData, 'dailyAmount'))
      const monthlyAmountPaise = moneyToPaise(resolveBachatPenaltyMonthlyAmount(accountData, bachatRulesSettings))
      const currentPendingPaise = moneyToPaise(moneyValue(accountData, 'pendingAmount'))
      const currentPenaltyPaise = moneyToPaise(moneyValue(accountData, 'penaltyAmount'))
      const inactiveGap = calculateBachatInactiveGap({
        account: accountData,
        paymentDate,
        bachatRulesSettings,
      })
      const inactivePendingPaise = inactiveGap.missedMonths * monthlyAmountPaise
      const pendingDueBeforeCollectionPaise = currentPendingPaise + inactivePendingPaise
      const previousTotalPenaltyPaise =
        moneyToPaise(moneyValue(accountData, 'totalPenalty')) ||
        moneyToPaise(
          calculateProgressiveBachatPenalty({
            missedMonths: numberValue(accountData.missedMonths),
            dailyAmount: moneyValue(accountData, 'dailyAmount'),
            bachatRulesSettings,
          }),
        )
      const grossPenaltyPaise = moneyToPaise(
        calculateProgressiveBachatPenalty({
          missedMonths: numberValue(accountData.missedMonths) + inactiveGap.missedMonths,
          dailyAmount: moneyValue(accountData, 'dailyAmount'),
          bachatRulesSettings,
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
        bachatRulesSettings,
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
  BACHAT_TESTING_RULES_DEFAULTS,
  calculateBachatInactiveGap,
  calculateBachatCoveredMonthStatus,
  deriveBachatAccountStatus,
  calculateBachatLiveMetrics,
  calculateBachatPendingAmount,
  calculateProgressiveBachatPenalty,
  buildBachatPenaltyAnalysis,
  computeBachatClosurePreview,
  computePermanentBachatSettlement,
  getBachatRulesSettings,
  listenBachatRulesSettings,
  normalizeBachatRulesSettings,
  saveBachatRulesSettings,
  listenBachatSummary,
  listenActiveBachatAccounts,
  listenBachatCollections,
  getBachatAccount,
  listenBachatAccount,
  getBachatEnrollmentStatus,
  getBachatCollectionsByCustomer,
  getBachatPenaltyRecoveryHistory,
  listenRecentBachatCollections,
  listenBachatPenalties,
  listenBachatPenaltiesByCustomer,
  listenBachatClosuresByCustomer,
  getLatestBachatClosureByCustomer,
  listenBachatClosures,
  getActiveBachatAccounts,
  getActiveBachatAccountsPage,
  getBachatCollectionsByDate,
  getLatestBachatPenaltiesForCustomers,
  getBachatCollectionCandidateStatus,
  enrollCustomerToBachat,
  permanentlyCloseBachatAccount,
  applyBachatCollectionV2InTransaction,
  createBachatCollection,
}
