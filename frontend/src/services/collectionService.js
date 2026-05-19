import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/firebase'
import {
  COLLECTIONS,
  USER_ROLES,
  addDaysKey,
  docsWithIds,
  moneyValue,
  numberValue,
  pageLimit,
  todayKey,
} from './firestoreService'
import {
  getBachatAccount,
  getActiveBachatAccounts,
  listenBachatCollections,
  recordBachatCollection,
} from './erpService'

const collectionsRef = collection(db, COLLECTIONS.bachatCollections)
const legacyCollectionsRef = collection(db, COLLECTIONS.dailyCollections)

export const collectionDocumentId = (customerId, date) => `${customerId}_${date}`

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
    const results = docsWithIds(snapshot).map(mapCollectionRecord)
    if (results.length) return results
    const legacySnapshot = await getDocs(
      query(
        legacyCollectionsRef,
        ...constraints,
        orderBy('date', 'desc'),
        limit(pageLimit(pageSize, 25, 100)),
      ),
    )
    return docsWithIds(legacySnapshot).map(mapCollectionRecord)
  } catch {
    const snapshot = await getDocs(
      query(legacyCollectionsRef, ...constraints, limit(pageLimit(pageSize, 25, 100))),
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
  return listenBachatCollections(currentUser, date, callback, onError)
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

export const createDailyCollection = async ({ customer, payload }) => {
  const date = payload.date || todayKey()
  const response = await recordBachatCollection({
    customerId: customer.customerId || customer.id,
    date,
    amountCollected: payload.amountCollected,
    pendingRecovered: payload.pendingRecovered,
    paymentMethod: payload.paymentMethod,
    remarks: payload.remarks,
  })

  return {
    collectionId: response.collectionId || collectionDocumentId(customer.customerId || customer.id, date),
    status: response.status,
    record: response.record,
  }
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
  let results = docsWithIds(snapshot).map(mapCollectionRecord)
  if (!results.length) {
    const legacySnapshot = await getDocs(query(legacyCollectionsRef, ...constraints))
    results = docsWithIds(legacySnapshot).map(mapCollectionRecord)
  }
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
  let records = docsWithIds(snapshot).map(mapCollectionRecord)
  if (!records.length) {
    const legacySnapshot = await getDocs(
      query(legacyCollectionsRef, ...constraints, orderBy('createdAt', 'desc')),
    )
    records = docsWithIds(legacySnapshot).map(mapCollectionRecord)
  }
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
  const collectionConstraints =
    currentUser?.role === USER_ROLES.collector
      ? [where('collectorId', '==', currentUser.userId), where('date', '==', date)]
      : [where('date', '==', date)]

  const [accountData, collectionSnapshot] = await Promise.all([
    getActiveBachatAccounts({ currentUser, pageSize }),
    getDocs(query(collectionsRef, ...collectionConstraints)),
  ])
  const collectedCustomerIds = new Set(
    docsWithIds(collectionSnapshot).map((collectionRecord) => collectionRecord.customerId),
  )
  const yesterday = addDaysKey(date, -1)
  const results = (accountData.results || [])
    .filter((account) => !collectedCustomerIds.has(account.customerId || account.id))
    .map((account) => ({
      ...account,
      id: account.customerId || account.id,
      customerName: account.customerName,
      ownerName: account.customerName,
      assignedCollectorId: account.collectorId,
      assignedCollectorName: account.collectorName,
      collectorName: account.collectorName,
      pendingAmount:
        moneyValue(account, 'pendingAmount') +
        (account.lastCollectionDate && account.lastCollectionDate < date
          ? moneyValue(account, 'dailyAmount')
          : 0),
      pendingDays:
        numberValue(account.pendingDays) +
        (account.lastCollectionDate && account.lastCollectionDate <= yesterday ? 1 : 0),
      lastPaymentDate: account.lastCollectionDate || '',
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
  const account = await getBachatAccount(customerId)
  const expectedAmount = moneyValue(account || customer, 'dailyAmount')
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
