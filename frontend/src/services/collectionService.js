import {
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
  normalizeText,
  numberValue,
  pageLimit,
  paiseToMoney,
  todayKey,
} from './firestoreService'

const collectionsRef = collection(db, COLLECTIONS.dailyCollections)
const customersRef = collection(db, COLLECTIONS.customers)

export const collectionDocumentId = (customerId, date) => `${customerId}_${date}`

const dailySummaryDocumentId = (date, collectorId) => `${date}_${collectorId || 'unassigned'}`

const mapCollectionRecord = (record) => ({
  ...record,
  amount:
    moneyValue(record, 'amount') ||
    moneyValue(record, 'amountCollected') + moneyValue(record, 'pendingRecovered'),
  collection_date: record.date,
})

const uniqueIds = (ids = []) => [...new Set(ids.filter(Boolean).map(String))]

const sortCollectionsDesc = (records) =>
  [...records].sort((first, second) =>
    String(second.date || second.collection_date || '').localeCompare(
      String(first.date || first.collection_date || ''),
    ),
  )

const getCollectionsForCustomerId = async ({ customerId, currentUser, pageSize }) => {
  const constraints = []
  if (currentUser?.role === USER_ROLES.collector) {
    constraints.push(where('collectorId', '==', currentUser.userId))
  }
  constraints.push(where('customerId', '==', customerId))

  try {
    const snapshot = await getDocs(
      query(
        collectionsRef,
        ...constraints,
        orderBy('date', 'desc'),
        limit(pageLimit(pageSize, 25, 100)),
      ),
    )
    return docsWithIds(snapshot).map(mapCollectionRecord)
  } catch {
    const snapshot = await getDocs(
      query(collectionsRef, ...constraints, limit(pageLimit(pageSize, 25, 100))),
    )
    return sortCollectionsDesc(docsWithIds(snapshot).map(mapCollectionRecord))
  }
}

export const getByCustomerIds = async ({
  customerIds = [],
  currentUser,
  pageSize = 25,
} = {}) => {
  const ids = uniqueIds(customerIds)
  if (!ids.length) return { results: [], count: 0 }

  const batches = await Promise.allSettled(
    ids.map((customerId) => getCollectionsForCustomerId({ customerId, currentUser, pageSize })),
  )
  const rejected = batches.find((batch) => batch.status === 'rejected')
  const merged = new Map()
  batches
    .filter((batch) => batch.status === 'fulfilled')
    .flatMap((batch) => batch.value)
    .forEach((record) => {
      merged.set(record.collectionId || record.id, record)
    })
  const results = sortCollectionsDesc([...merged.values()]).slice(0, pageLimit(pageSize, 25, 100))
  if (!results.length && rejected) throw rejected.reason

  return {
    results,
    count: results.length,
  }
}

export const listenDailyCollections = (currentUser, date = todayKey(), callback, onError) => {
  const constraints =
    currentUser?.role === USER_ROLES.collector
      ? [
          where('collectorId', '==', currentUser.userId),
          where('date', '==', date),
          orderBy('createdAt', 'desc'),
        ]
      : [where('date', '==', date), orderBy('createdAt', 'desc')]

  return onSnapshot(
    query(collectionsRef, ...constraints),
    (snapshot) => callback(docsWithIds(snapshot)),
    onError,
  )
}

export const listenCollectionHistory = (currentUser, callback, onError) => {
  const constraints =
    currentUser?.role === USER_ROLES.collector
      ? [where('collectorId', '==', currentUser.userId), orderBy('date', 'desc')]
      : [orderBy('date', 'desc')]

  return onSnapshot(
    query(collectionsRef, ...constraints),
    (snapshot) => callback(docsWithIds(snapshot)),
    onError,
  )
}

export const createDailyCollection = async ({ customer, payload, currentUser }) => {
  const date = payload.date || todayKey()
  const collectionId = collectionDocumentId(customer.customerId || customer.id, date)
  const collectionReference = doc(db, COLLECTIONS.dailyCollections, collectionId)
  const customerReference = doc(db, COLLECTIONS.customers, customer.customerId || customer.id)
  const expectedAmountPaise = moneyToPaise(moneyValue(customer, 'dailyAmount'))
  const amountCollectedPaise = moneyToPaise(payload.amountCollected)
  const pendingRecoveredPaise = Math.min(
    moneyToPaise(payload.pendingRecovered),
    moneyToPaise(moneyValue(customer, 'pendingAmount')),
  )
  const pendingCreatedPaise = Math.max(expectedAmountPaise - amountCollectedPaise, 0)
  const expectedAmount = paiseToMoney(expectedAmountPaise)
  const amountCollected = paiseToMoney(amountCollectedPaise)
  const pendingRecovered = paiseToMoney(pendingRecoveredPaise)
  const pendingCreated = paiseToMoney(pendingCreatedPaise)
  const status =
    amountCollectedPaise >= expectedAmountPaise
      ? 'paid'
      : amountCollectedPaise > 0
        ? 'partial'
        : 'pending'

  await runTransaction(db, async (transaction) => {
    const existingCollection = await transaction.get(collectionReference)
    if (existingCollection.exists()) {
      throw new Error('Collection for this customer already exists for selected date.')
    }

    const customerSnapshot = await transaction.get(customerReference)
    if (!customerSnapshot.exists()) {
      throw new Error('Customer record was not found.')
    }

    const customerData = customerSnapshot.data()
    const currentPendingPaise = moneyToPaise(moneyValue(customerData, 'pendingAmount'))
    const nextPendingAmountPaise = Math.max(
      currentPendingPaise - pendingRecoveredPaise + pendingCreatedPaise,
      0,
    )
    const nextPendingAmount = paiseToMoney(nextPendingAmountPaise)
    const nextPendingDays =
      nextPendingAmountPaise === 0
        ? 0
        : Math.max(
            numberValue(customerData.pendingDays) + (pendingCreatedPaise > 0 ? 1 : 0),
            0,
          )
    const dailyPenaltyPaise = moneyToPaise(nextPendingDays * FINANCE_RULES.dailyPenaltyPerDay)

    const collectorId =
      currentUser.role === USER_ROLES.admin
        ? customerData.assignedCollectorId || currentUser.userId
        : currentUser.userId
    const collectorName =
      customerData.assignedCollectorName ||
      currentUser.fullName ||
      currentUser.email ||
      ''
    const totalReceivedPaise = amountCollectedPaise + pendingRecoveredPaise
    const totalReceived = paiseToMoney(totalReceivedPaise)

    const record = {
      collectionId,
      customerId: customerSnapshot.id,
      customerName: customerData.ownerName || '',
      shopName: customerData.shopName || '',
      collectorId,
      collectorName,
      expectedAmount,
      expectedAmountPaise,
      amountCollected,
      amountCollectedPaise,
      amount: totalReceived,
      amountPaise: totalReceivedPaise,
      pendingCreated,
      pendingCreatedPaise,
      pendingRecovered,
      pendingRecoveredPaise,
      paymentMethod: payload.paymentMethod || 'cash',
      date,
      status,
      overdueDays: daysBetween(date, todayKey()),
      penaltyAmount: 0,
      penaltyAmountPaise: 0,
      remarks: normalizeText(payload.remarks),
      createdById: currentUser.userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    const summaryReference = doc(
      db,
      COLLECTIONS.dailySummaries,
      dailySummaryDocumentId(date, collectorId),
    )
    const penaltyReference = doc(
      db,
      COLLECTIONS.penalties,
      `daily_${customerSnapshot.id}`,
    )

    transaction.set(collectionReference, record)
    transaction.update(customerReference, {
      totalSavings: increment(totalReceived),
      totalSavingsPaise: increment(totalReceivedPaise),
      pendingAmount: nextPendingAmount,
      pendingAmountPaise: nextPendingAmountPaise,
      pendingDays: nextPendingDays,
      overdueDays: nextPendingDays,
      penaltyAmount: paiseToMoney(dailyPenaltyPaise),
      penaltyAmountPaise: dailyPenaltyPaise,
      lastCollectionDate: date,
      lastDailySyncDate: date,
      lastPenaltyUpdated: todayKey(),
      updatedAt: serverTimestamp(),
    })
    transaction.set(
      summaryReference,
      {
        summaryId: summaryReference.id,
        date,
        collectorId,
        collectorName,
        entryCount: increment(1),
        paidCount: increment(status === 'paid' ? 1 : 0),
        partialCount: increment(status === 'partial' ? 1 : 0),
        pendingCount: increment(status === 'pending' ? 1 : 0),
        expectedAmount: increment(expectedAmount),
        expectedAmountPaise: increment(expectedAmountPaise),
        totalCollection: increment(totalReceived),
        totalCollectionPaise: increment(totalReceivedPaise),
        pendingCreated: increment(pendingCreated),
        pendingCreatedPaise: increment(pendingCreatedPaise),
        pendingRecovered: increment(pendingRecovered),
        pendingRecoveredPaise: increment(pendingRecoveredPaise),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    transaction.set(
      penaltyReference,
      {
        penaltyId: penaltyReference.id,
        type: 'daily',
        status: nextPendingAmountPaise > 0 ? 'active' : 'resolved',
        customerId: customerSnapshot.id,
        customerName: customerData.ownerName || '',
        shopName: customerData.shopName || '',
        collectorId,
        collectorName,
        overdueDays: nextPendingDays,
        penaltyAmount: paiseToMoney(dailyPenaltyPaise),
        penaltyAmountPaise: dailyPenaltyPaise,
        pendingAmount: nextPendingAmount,
        pendingAmountPaise: nextPendingAmountPaise,
        lastPenaltyUpdated: todayKey(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })

  return { collectionId, status }
}

export const getAll = async ({
  customer_id: customerId,
  customerId: normalizedCustomerId,
  dateFrom,
  dateTo,
  status,
  pageSize = 100,
  currentUser,
} = {}) => {
  const constraints = []
  const targetCustomerId = customerId || normalizedCustomerId
  if (currentUser?.role === USER_ROLES.collector) {
    constraints.push(where('collectorId', '==', currentUser.userId))
  }
  if (targetCustomerId) constraints.push(where('customerId', '==', targetCustomerId))
  if (status) constraints.push(where('status', '==', status))
  if (dateFrom) constraints.push(where('date', '>=', dateFrom))
  if (dateTo) constraints.push(where('date', '<=', dateTo))
  constraints.push(orderBy('date', 'desc'))
  constraints.push(limit(pageLimit(pageSize)))

  const snapshot = await getDocs(query(collectionsRef, ...constraints))
  const results = docsWithIds(snapshot).map(mapCollectionRecord)
  return {
    results,
    count: results.length,
  }
}

export const getToday = async ({ date = todayKey(), currentUser } = {}) => {
  const constraints =
    currentUser?.role === USER_ROLES.collector
      ? [where('collectorId', '==', currentUser.userId), where('date', '==', date)]
      : [where('date', '==', date)]

  const snapshot = await getDocs(query(collectionsRef, ...constraints, orderBy('createdAt', 'desc')))
  const records = docsWithIds(snapshot).map(mapCollectionRecord)
  const totalCollection = records.reduce((sum, record) => sum + moneyValue(record, 'amount'), 0)
  const paid = records.filter((record) => record.status === 'paid')

  return {
    date,
    records,
    totalCollection,
    totalPaidCustomers: paid.length,
    totalPendingCustomers: records.filter((record) => record.status !== 'paid').length,
    totalMissedPayments: records.filter((record) => record.status === 'missed').length,
  }
}

export const getPending = async ({ pageSize = 100, date = todayKey(), currentUser } = {}) => {
  const customerConstraints =
    currentUser?.role === USER_ROLES.collector
      ? [
          where('assignedCollectorId', '==', currentUser.userId),
          where('status', '==', 'active'),
          orderBy('shopName'),
        ]
      : [where('status', '==', 'active'), orderBy('shopName')]
  const collectionConstraints =
    currentUser?.role === USER_ROLES.collector
      ? [where('collectorId', '==', currentUser.userId), where('date', '==', date)]
      : [where('date', '==', date)]

  const [customerSnapshot, collectionSnapshot] = await Promise.all([
    getDocs(query(customersRef, ...customerConstraints, limit(pageLimit(pageSize, 100, 500)))),
    getDocs(query(collectionsRef, ...collectionConstraints)),
  ])
  const collectedCustomerIds = new Set(
    docsWithIds(collectionSnapshot).map((collectionRecord) => collectionRecord.customerId),
  )
  const yesterday = addDaysKey(date, -1)
  const results = docsWithIds(customerSnapshot)
    .filter((customer) => !collectedCustomerIds.has(customer.customerId || customer.id))
    .map((customer) => ({
      ...customer,
      customerName: customer.ownerName,
      collectorName: customer.assignedCollectorName,
      pendingAmount:
        moneyValue(customer, 'pendingAmount') +
        (customer.lastCollectionDate && customer.lastCollectionDate < date
          ? moneyValue(customer, 'dailyAmount')
          : 0),
      pendingDays:
        numberValue(customer.pendingDays) +
        (customer.lastCollectionDate && customer.lastCollectionDate <= yesterday ? 1 : 0),
      lastPaymentDate: customer.lastCollectionDate || '',
    }))

  return {
    results,
    count: results.length,
  }
}

export const create = async (payload, currentUser) => {
  const customerId = payload.customerId || payload.customer_id
  const customerSnapshot = await getDoc(doc(db, COLLECTIONS.customers, customerId))
  if (!customerSnapshot.exists()) throw new Error('Customer record was not found.')
  const customer = { id: customerSnapshot.id, ...customerSnapshot.data() }
  const expectedAmount = moneyValue(customer, 'dailyAmount')
  const receivedAmount = numberValue(payload.amount)
  const isMissed = ['pending', 'missed'].includes(payload.status)

  return createDailyCollection({
    customer,
    payload: {
      date: payload.date || todayKey(),
      amountCollected: isMissed ? 0 : Math.min(receivedAmount, expectedAmount),
      pendingRecovered: isMissed ? 0 : Math.max(receivedAmount - expectedAmount, 0),
      paymentMethod: payload.paymentMethod,
      remarks: payload.remarks,
    },
    currentUser,
  })
}

export default {
  listenDailyCollections,
  listenCollectionHistory,
  createDailyCollection,
  getByCustomerIds,
  getAll,
  getToday,
  getPending,
  create,
}
