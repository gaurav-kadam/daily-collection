import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../firebase/firebase'
import {
  COLLECTIONS,
  USER_ROLES,
  docsWithIds,
  moneyValue,
  pageLimit,
  paiseToMoney,
} from './firestoreService'

const callableCache = new Map()

const getCallable = (name) => {
  if (!callableCache.has(name)) callableCache.set(name, httpsCallable(functions, name))
  return callableCache.get(name)
}

export const callErpFunction = async (name, payload = {}) => {
  const response = await getCallable(name)(payload)
  return response.data
}

export const createCustomerIdentity = (payload) =>
  callErpFunction('createCustomerIdentity', payload)

export const updateCustomerIdentity = (payload) =>
  callErpFunction('updateCustomerIdentity', payload)

export const enrollBachat = (payload) => callErpFunction('enrollBachat', payload)

export const recordBachatCollection = (payload) =>
  callErpFunction('recordBachatCollection', payload)

export const closeBachatAccount = (payload) =>
  callErpFunction('closeBachatAccount', payload)

export const createLoan = (payload) => callErpFunction('createLoan', payload)

export const recordEmiPayment = (payload) =>
  callErpFunction('recordEmiPayment', payload)

export const syncLoanPenalties = (payload = {}) =>
  callErpFunction('syncLoanPenalties', payload)

export const migrateLegacyData = (payload = {}) =>
  callErpFunction('migrateLegacyData', payload)

export const rebuildFinanceSummaries = (payload = {}) =>
  callErpFunction('rebuildFinanceSummaries', payload)

export const reconcileFinanceSummaries = (payload = {}) =>
  callErpFunction('reconcileFinanceSummaries', payload)

const chunk = (items, size = 10) => {
  const result = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

const uniqueIds = (ids = []) => [...new Set(ids.filter(Boolean).map(String))]

const readDocsByIds = async (collectionName, ids) => {
  const normalizedIds = uniqueIds(ids)
  if (!normalizedIds.length) return new Map()

  const batches = await Promise.all(
    chunk(normalizedIds).map((idBatch) =>
      getDocs(query(collection(db, collectionName), where(documentId(), 'in', idBatch))),
    ),
  )

  const records = new Map()
  batches
    .flatMap((snapshot) => docsWithIds(snapshot))
    .forEach((record) => records.set(record.id, record))
  return records
}

export const getCustomerFinancialsMap = (customerIds = []) =>
  readDocsByIds(COLLECTIONS.customerFinancials, customerIds)

export const getBachatAccountsMap = (customerIds = []) =>
  readDocsByIds(COLLECTIONS.bachatAccounts, customerIds)

export const getCustomerFinancials = async (customerId) => {
  if (!customerId) return null
  const snapshot = await getDoc(doc(db, COLLECTIONS.customerFinancials, customerId))
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
}

export const getBachatAccount = async (customerId) => {
  if (!customerId) return null
  const snapshot = await getDoc(doc(db, COLLECTIONS.bachatAccounts, customerId))
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
}

export const getActiveBachatAccounts = async ({ currentUser, pageSize = 200 } = {}) => {
  const constraints = []
  if (currentUser?.role === USER_ROLES.collector) {
    constraints.push(where('collectorId', '==', currentUser.userId))
  }
  constraints.push(where('status', '==', 'active'))
  constraints.push(orderBy('shopName'))
  constraints.push(limit(pageLimit(pageSize, 200, 500)))

  const snapshot = await getDocs(query(collection(db, COLLECTIONS.bachatAccounts), ...constraints))
  return {
    results: docsWithIds(snapshot),
    count: snapshot.size,
  }
}

export const listenBachatCollections = (currentUser, date, callback, onError) => {
  const constraints =
    currentUser?.role === USER_ROLES.collector
      ? [
          where('collectorId', '==', currentUser.userId),
          where('date', '==', date),
          orderBy('createdAt', 'desc'),
        ]
      : [where('date', '==', date), orderBy('createdAt', 'desc')]

  return onSnapshot(
    query(collection(db, COLLECTIONS.bachatCollections), ...constraints),
    (snapshot) => callback(docsWithIds(snapshot)),
    onError,
  )
}

export const listenFinanceSummary = (callback, onError) =>
  onSnapshot(
    doc(db, COLLECTIONS.financeSummary, 'main'),
    (snapshot) => callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
    onError,
  )

const preferredValue = (...values) => values.find((value) => value !== undefined && value !== null)

const moneyMaybe = (record, rupeeField, paiseField = `${rupeeField}Paise`) => {
  if (!record) return undefined
  if (record[paiseField] !== undefined && record[paiseField] !== null) return moneyValue(record, rupeeField, paiseField)
  if (record[rupeeField] !== undefined && record[rupeeField] !== null) return moneyValue(record, rupeeField, paiseField)
  return undefined
}

export const decorateCustomerFinance = (customer, financial, bachatAccount) => {
  const bachat = financial?.bachat || {}
  const account = bachatAccount || {}
  const customerId = customer.customerId || customer.id
  const dailyAmount = preferredValue(
    moneyMaybe(account, 'dailyAmount'),
    moneyMaybe(bachat, 'dailyAmount'),
    moneyMaybe(customer, 'dailyAmount'),
    0,
  )
  const totalSavings = preferredValue(
    moneyMaybe(account, 'totalCollected'),
    moneyMaybe(bachat, 'totalCollected'),
    moneyMaybe(financial, 'totalBachat'),
    moneyMaybe(customer, 'totalSavings'),
    0,
  )
  const pendingAmount = preferredValue(
    moneyMaybe(account, 'pendingAmount'),
    moneyMaybe(bachat, 'pendingAmount'),
    moneyMaybe(customer, 'pendingAmount'),
    0,
  )
  const penaltyAmount = preferredValue(
    moneyMaybe(account, 'penaltyAmount'),
    moneyMaybe(bachat, 'penaltyAmount'),
    moneyMaybe(financial, 'penalties'),
    moneyMaybe(customer, 'penaltyAmount'),
    0,
  )

  return {
    ...customer,
    customerId,
    financial,
    bachatAccount,
    activeModules: financial?.activeModules || (account.status === 'active' ? ['bachat'] : []),
    assignedCollectorId:
      account.collectorId || bachat.collectorId || customer.assignedCollectorId || '',
    assignedCollectorName:
      account.collectorName || bachat.collectorName || customer.assignedCollectorName || '',
    joiningDate: account.startDate || bachat.startDate || customer.joiningDate || null,
    dailyAmount,
    dailyAmountPaise: preferredValue(
      account.dailyAmountPaise,
      bachat.dailyAmountPaise,
      customer.dailyAmountPaise,
      Math.round(Number(dailyAmount || 0) * 100),
    ),
    totalSavings,
    totalSavingsPaise: preferredValue(
      account.totalCollectedPaise,
      bachat.totalCollectedPaise,
      financial?.totalBachatPaise,
      customer.totalSavingsPaise,
      Math.round(Number(totalSavings || 0) * 100),
    ),
    pendingAmount,
    pendingAmountPaise: preferredValue(
      account.pendingAmountPaise,
      bachat.pendingAmountPaise,
      customer.pendingAmountPaise,
      Math.round(Number(pendingAmount || 0) * 100),
    ),
    pendingDays: preferredValue(account.pendingDays, bachat.pendingDays, customer.pendingDays, 0),
    overdueDays: preferredValue(account.overdueDays, bachat.overdueDays, customer.overdueDays, 0),
    penaltyAmount,
    penaltyAmountPaise: preferredValue(
      account.penaltyAmountPaise,
      bachat.penaltyAmountPaise,
      financial?.penaltiesPaise,
      customer.penaltyAmountPaise,
      Math.round(Number(penaltyAmount || 0) * 100),
    ),
    lastCollectionDate:
      account.lastCollectionDate || bachat.lastCollectionDate || customer.lastCollectionDate || '',
  }
}

export const decorateCustomersFinance = async (customers = []) => {
  const ids = customers.map((customer) => customer.customerId || customer.id).filter(Boolean)
  const [financials, bachatAccounts] = await Promise.all([
    getCustomerFinancialsMap(ids),
    getBachatAccountsMap(ids),
  ])

  return customers.map((customer) => {
    const customerId = customer.customerId || customer.id
    return decorateCustomerFinance(customer, financials.get(customerId), bachatAccounts.get(customerId))
  })
}

export const moduleAmountFromSummary = (moduleSummary, preferredField) =>
  paiseToMoney(moduleSummary?.[preferredField] || moduleSummary?.amountPaise || 0)

export default {
  callErpFunction,
  createCustomerIdentity,
  updateCustomerIdentity,
  enrollBachat,
  recordBachatCollection,
  closeBachatAccount,
  createLoan,
  recordEmiPayment,
  syncLoanPenalties,
  migrateLegacyData,
  rebuildFinanceSummaries,
  reconcileFinanceSummaries,
  getCustomerFinancials,
  getCustomerFinancialsMap,
  getBachatAccount,
  getBachatAccountsMap,
  getActiveBachatAccounts,
  listenBachatCollections,
  listenFinanceSummary,
  decorateCustomerFinance,
  decorateCustomersFinance,
  moduleAmountFromSummary,
}
