import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { auth, db } from '../firebase/firebase'
import {
  COLLECTIONS,
  USER_ROLES,
  docsWithIds,
  makeSearchKeywords,
  moneyToPaise,
  normalizeMoney,
  normalizeText,
  pageLimit,
} from './firestoreService'
import { uploadCustomerPhoto } from './storageService'

const customersRef = collection(db, COLLECTIONS.customers)
const usersRef = collection(db, COLLECTIONS.users)
const CACHE_TTL_MS = 30000
const customerCache = new Map()
const listCache = new Map()
let metaCache = null

const getCachedValue = (cacheEntry) =>
  cacheEntry && Date.now() - cacheEntry.createdAt < CACHE_TTL_MS ? cacheEntry.value : null

const cacheCustomer = (customer) => {
  const customerId = customer.customerId || customer.id
  if (!customerId) return
  customerCache.set(customerId, { value: customer, createdAt: Date.now() })
}

const makeListCacheKey = (params) => JSON.stringify(params || {})

export const listenCustomers = (currentUser, callback, onError) => {
  const constraints =
    currentUser?.role === USER_ROLES.collector
      ? [where('assignedCollectorId', '==', currentUser.userId), orderBy('shopName')]
      : [orderBy('shopName')]

  return onSnapshot(
    query(customersRef, ...constraints),
    (snapshot) => callback(docsWithIds(snapshot)),
    onError,
  )
}

export const listenCollectors = (callback, onError) =>
  onSnapshot(
    query(
      usersRef,
      where('role', '==', USER_ROLES.collector),
      where('status', '==', 'active'),
      orderBy('fullName'),
    ),
    (snapshot) => callback(docsWithIds(snapshot)),
    onError,
  )

export const createCustomer = async (payload, currentUser) => {
  const customerReference = doc(customersRef)
  const dailyAmountPaise = moneyToPaise(payload.dailyAmount)
  const dailyAmount = normalizeMoney(payload.dailyAmount)

  const record = {
    customerId: customerReference.id,
    shopName: normalizeText(payload.shopName),
    ownerName: normalizeText(payload.ownerName),
    mobile: normalizeText(payload.mobile),
    alternateMobile: normalizeText(payload.alternateMobile),
    area: normalizeText(payload.area),
    address: normalizeText(payload.address),
    dailyAmount,
    dailyAmountPaise,
    totalSavings: 0,
    totalSavingsPaise: 0,
    pendingAmount: 0,
    pendingAmountPaise: 0,
    pendingDays: 0,
    overdueDays: 0,
    penaltyAmount: 0,
    penaltyAmountPaise: 0,
    lastPenaltyUpdated: null,
    lastDailySyncDate: payload.joiningDate || null,
    assignedCollectorId: normalizeText(payload.assignedCollectorId),
    assignedCollectorName: normalizeText(payload.assignedCollectorName),
    status: payload.status || 'active',
    joiningDate: payload.joiningDate || null,
    idProofType: normalizeText(payload.idProofType),
    idProofNumber: normalizeText(payload.idProofNumber),
    notes: normalizeText(payload.notes),
    photo: normalizeText(payload.photo),
    searchKeywords: makeSearchKeywords(
      payload.shopName,
      payload.ownerName,
      payload.mobile,
      payload.area,
    ),
    createdById: currentUser?.userId || auth.currentUser?.uid || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  await setDoc(customerReference, record)
  const customer = { id: customerReference.id, ...record }
  cacheCustomer(customer)
  listCache.clear()
  return customer
}

export const getAll = async ({
  pageSize = 100,
  status,
  assignedCollectorId,
  currentUser,
} = {}) => {
  const effectiveCollectorId =
    currentUser?.role === USER_ROLES.collector ? currentUser.userId : assignedCollectorId
  const cacheKey = makeListCacheKey({ pageSize, status, assignedCollectorId: effectiveCollectorId })
  const cached = getCachedValue(listCache.get(cacheKey))
  if (cached) return cached

  const constraints = []
  if (status) constraints.push(where('status', '==', status))
  if (effectiveCollectorId) constraints.push(where('assignedCollectorId', '==', effectiveCollectorId))
  constraints.push(orderBy('shopName'))
  constraints.push(limit(pageLimit(pageSize)))

  const snapshot = await getDocs(query(customersRef, ...constraints))
  const results = docsWithIds(snapshot)
  results.forEach(cacheCustomer)
  const response = {
    results,
    count: results.length,
  }
  listCache.set(cacheKey, { value: response, createdAt: Date.now() })
  return response
}

export const getById = async (customerId) => {
  const cached = getCachedValue(customerCache.get(customerId))
  if (cached) return cached

  const snapshot = await getDoc(doc(db, COLLECTIONS.customers, customerId))
  if (!snapshot.exists()) throw new Error('Customer not found.')
  const customer = { id: snapshot.id, ...snapshot.data() }
  cacheCustomer(customer)
  return customer
}

export const getMeta = async () => {
  const cached = getCachedValue(metaCache)
  if (cached) return cached

  const snapshot = await getDocs(
    query(
      usersRef,
      where('role', '==', USER_ROLES.collector),
      where('status', '==', 'active'),
      orderBy('fullName'),
    ),
  )
  const collectors = docsWithIds(snapshot).map((collector) => ({
    ...collector,
    id: collector.userId || collector.id,
    name: collector.fullName || collector.email || 'Collector',
  }))
  metaCache = { value: { collectors }, createdAt: Date.now() }
  return metaCache.value
}

export const create = async (payload, currentUser) => {
  const existing = await getDocs(
    query(customersRef, where('mobile', '==', normalizeText(payload.mobile)), limit(1)),
  )
  if (!existing.empty) {
    throw new Error('A customer with this mobile number already exists.')
  }

  const selectedCollector = payload.assignedCollectorId
    ? (await getDoc(doc(db, COLLECTIONS.users, payload.assignedCollectorId))).data()
    : null
  const created = await createCustomer(
    {
      ...payload,
      assignedCollectorName:
        payload.assignedCollectorName || selectedCollector?.fullName || '',
    },
    currentUser || { userId: auth.currentUser?.uid || '' },
  )

  if (payload.photoFile) {
    const photo = await uploadCustomerPhoto(created.customerId, payload.photoFile)
    await updateDoc(doc(db, COLLECTIONS.customers, created.customerId), {
      photo,
      updatedAt: serverTimestamp(),
    })
    customerCache.delete(created.customerId)
    listCache.clear()
    return { ...created, photo }
  }

  return created
}

export const update = async (customerId, payload) => {
  const dailyAmount = normalizeMoney(payload.dailyAmount)
  const updates = {
    shopName: normalizeText(payload.shopName),
    ownerName: normalizeText(payload.ownerName),
    mobile: normalizeText(payload.mobile),
    alternateMobile: normalizeText(payload.alternateMobile),
    area: normalizeText(payload.area),
    address: normalizeText(payload.address),
    dailyAmount,
    dailyAmountPaise: moneyToPaise(payload.dailyAmount),
    assignedCollectorId: normalizeText(payload.assignedCollectorId),
    assignedCollectorName: normalizeText(payload.assignedCollectorName),
    status: payload.status || 'active',
    joiningDate: payload.joiningDate || null,
    idProofType: normalizeText(payload.idProofType),
    idProofNumber: normalizeText(payload.idProofNumber),
    notes: normalizeText(payload.notes),
    searchKeywords: makeSearchKeywords(
      payload.shopName,
      payload.ownerName,
      payload.mobile,
      payload.area,
    ),
    updatedAt: serverTimestamp(),
  }

  if (payload.removePhoto) {
    updates.photo = ''
  } else if (payload.photoFile) {
    updates.photo = await uploadCustomerPhoto(customerId, payload.photoFile)
  } else if (payload.photo !== undefined) {
    updates.photo = normalizeText(payload.photo)
  }

  if (updates.assignedCollectorId && !updates.assignedCollectorName) {
    const collectorSnapshot = await getDoc(doc(db, COLLECTIONS.users, updates.assignedCollectorId))
    updates.assignedCollectorName = collectorSnapshot.data()?.fullName || ''
  }

  await updateDoc(doc(db, COLLECTIONS.customers, customerId), updates)
  customerCache.delete(customerId)
  listCache.clear()
  return getById(customerId)
}

export default {
  listenCustomers,
  listenCollectors,
  createCustomer,
  getAll,
  getById,
  getMeta,
  create,
  update,
}
