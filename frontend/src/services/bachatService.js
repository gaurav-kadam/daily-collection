import {
  arrayUnion,
  collection,
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
  USER_ROLES,
  addMonthsKey,
  dateKeyFromDate,
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
}

const DEBUG_BACHAT_PERMISSIONS = import.meta.env.DEV

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
  totalCollected: 0,
  totalCollectedPaise: 0,
  penalties: 0,
  penaltiesPaise: 0,
  todayCollection: 0,
  todayCollectionPaise: 0,
  monthlyCollection: 0,
  monthlyCollectionPaise: 0,
  missedPayments: 0,
  maturedAccounts: 0,
  prematureClosures: 0,
}

const monthKey = (dateKey) => String(dateKey || '').slice(0, 7)

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
  pendingAmount = 0,
  dailyAmount = 0,
} = {}) => {
  const months = Math.max(numberValue(missedMonths), 0)
  if (!months) return 0

  const monthlyAmount = normalizeMoney(numberValue(dailyAmount) * BACHAT_RULES.daysPerMonth)
  let steppedPenalty = 0

  for (let month = 1; month <= months; month += 1) {
    if (month <= 2) {
      steppedPenalty += monthlyAmount * 0.005
    } else if (month <= 6) {
      steppedPenalty += monthlyAmount * 0.01
    } else {
      steppedPenalty += monthlyAmount * 0.015
    }
  }

  const exposurePenalty = numberValue(pendingAmount) * 0.003
  return normalizeMoney(steppedPenalty + exposurePenalty)
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
      callback(snapshot.exists() ? { id: snapshot.id, ...emptyBachatSummary, ...snapshot.data() } : { id: 'main', ...emptyBachatSummary })
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
  const constraints = [where('status', '==', 'active')]
  if (currentUser?.role === USER_ROLES.collector) {
    constraints.unshift(where('collectorId', '==', currentUser.userId))
  }
  constraints.push(orderBy('updatedAt', 'desc'))
  constraints.push(limit(pageLimit(pageSize, 200, 500)))

  try {
    const snapshot = await getDocs(query(collection(db, COLLECTIONS.bachatAccounts), ...constraints))
    const results = docsWithIds(snapshot)
    return { results, count: results.length }
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
      const [customerSnapshot, accountSnapshot] = await Promise.all([
        transaction.get(customerReference),
        transaction.get(accountReference),
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
        paidMonths: 0,
        missedMonths: 0,
        overdueDays: 0,
        lastCollectionDate: null,
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
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      transaction.set(
        summaryReference,
        {
          activeAccounts: increment(1),
          updatedAt: serverTimestamp(),
        },
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
  const nextPendingPaise = Math.max(
    currentPendingPaise - pendingRecoveredPaise + pendingCreatedPaise,
    0,
  )
  const nextTotalCollectedPaise = Math.max(currentTotalCollectedPaise + totalReceivedPaise, 0)
  const paidMonths = monthlyAmountPaise > 0 ? Math.floor(nextTotalCollectedPaise / monthlyAmountPaise) : 0
  const previousMissedMonths = Math.max(numberValue(accountData.missedMonths), 0)
  const missedMonths =
    nextPendingPaise <= 0
      ? 0
      : Math.max(
          numberValue(accountData.missedMonths),
          monthlyAmountPaise > 0 ? Math.ceil(nextPendingPaise / monthlyAmountPaise) : 0,
        )
  const overdueDays = nextPendingPaise <= 0 ? 0 : missedMonths * BACHAT_RULES.daysPerMonth
  const nextPenaltyAmount = calculateProgressiveBachatPenalty({
    missedMonths,
    pendingAmount: paiseToMoney(nextPendingPaise),
    dailyAmount: moneyValue(accountData, 'dailyAmount'),
  })
  const nextPenaltyPaise = moneyToPaise(nextPenaltyAmount)
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

  const transactionReference = doc(collection(db, COLLECTIONS.bachatCollections))
  const nowKey = todayKey()
  const isToday = date === nowKey
  const isCurrentMonth = monthKey(date) === monthKey(nowKey)

  transaction.set(transactionReference, {
    txId: transactionReference.id,
    customerId: normalizedCustomerId,
    amount: paiseToMoney(totalReceivedPaise),
    amountPaise: totalReceivedPaise,
    amountCollected: paiseToMoney(amountCollectedPaise),
    amountCollectedPaise,
    pendingRecovered: paiseToMoney(pendingRecoveredPaise),
    pendingRecoveredPaise,
    pendingCreated: paiseToMoney(pendingCreatedPaise),
    pendingCreatedPaise,
    paymentDate: date,
    collectorId,
    collectorName,
    paymentMethod: paymentMethod || 'cash',
    status: status || 'paid',
    source: 'v2',
    remarks: normalizeText(remarks),
    createdAt: serverTimestamp(),
  })

  if (missedMonths > 0 || nextPenaltyPaise > 0) {
    const penaltyReference = doc(collection(db, COLLECTIONS.bachatPenalties))
    transaction.set(penaltyReference, {
      penaltyId: penaltyReference.id,
      customerId: normalizedCustomerId,
      missedMonths,
      overdueDays,
      pendingAmount: paiseToMoney(nextPendingPaise),
      pendingAmountPaise: nextPendingPaise,
      penaltyAmount: nextPenaltyAmount,
      penaltyAmountPaise: nextPenaltyPaise,
      recoveryStatus: nextPendingPaise > 0 ? 'pending' : 'recovered',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
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
      paidMonths,
      missedMonths,
      overdueDays,
      lastCollectionDate: date,
      closureEligibility,
      projectedClosurePayout: closurePreview.payoutAmount,
      projectedClosureRule: closurePreview.rule,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  transaction.set(
    doc(db, COLLECTIONS.bachatSummary, 'main'),
    {
      totalCollected: increment(paiseToMoney(totalReceivedPaise)),
      totalCollectedPaise: increment(totalReceivedPaise),
      penalties: increment(paiseToMoney(penaltyDeltaPaise)),
      penaltiesPaise: increment(penaltyDeltaPaise),
      todayCollection: increment(isToday ? paiseToMoney(totalReceivedPaise) : 0),
      todayCollectionPaise: increment(isToday ? totalReceivedPaise : 0),
      monthlyCollection: increment(isCurrentMonth ? paiseToMoney(totalReceivedPaise) : 0),
      monthlyCollectionPaise: increment(isCurrentMonth ? totalReceivedPaise : 0),
      missedPayments: increment(missedPaymentsDelta),
      updatedAt: serverTimestamp(),
    },
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

export default {
  BACHAT_RULES,
  calculateProgressiveBachatPenalty,
  computeBachatClosurePreview,
  listenBachatSummary,
  getBachatAccount,
  listenBachatAccount,
  getBachatEnrollmentStatus,
  getBachatCollectionsByCustomer,
  listenRecentBachatCollections,
  listenBachatPenaltiesByCustomer,
  listenBachatClosuresByCustomer,
  getActiveBachatAccounts,
  enrollCustomerToBachat,
  applyBachatCollectionV2InTransaction,
}
