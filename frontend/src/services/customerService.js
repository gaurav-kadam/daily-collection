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
  normalizeSearchText,
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
  const cacheEntry = { value: customer, createdAt: Date.now() }
  if (customer.id) customerCache.set(customer.id, cacheEntry)
  if (customer.customerId) customerCache.set(customer.customerId, cacheEntry)
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
  const customerReference = payload.customerReference || doc(customersRef)
  const dailyAmountPaise = moneyToPaise(payload.dailyAmount)
  const dailyAmount = normalizeMoney(payload.dailyAmount)
  const photoUrl = normalizeText(payload.photoUrl || payload.photo)
  const shopName = normalizeText(payload.shopName)
  const ownerName = normalizeText(payload.ownerName)
  const mobile = normalizeText(payload.mobile)
  const alternateMobile = normalizeText(payload.alternateMobile)
  const area = normalizeText(payload.area)

  const record = {
    customerId: customerReference.id,
    shopName,
    shopNameLower: normalizeSearchText(shopName),
    ownerName,
    ownerNameLower: normalizeSearchText(ownerName),
    mobile,
    mobileSearch: normalizeSearchText(mobile),
    alternateMobile,
    alternateMobileSearch: normalizeSearchText(alternateMobile),
    area,
    areaLower: normalizeSearchText(area),
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
    photoUrl,
    photo: photoUrl,
    searchKeywords: makeSearchKeywords(
      shopName,
      ownerName,
      mobile,
      alternateMobile,
      area,
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

export const searchCustomers = async ({
  term,
  pageSize = 25,
  currentUser,
} = {}) => {
  const normalizedTerm = normalizeSearchText(term)
  const tokens = normalizedTerm.split(/\s+/).filter(Boolean)
  const searchToken = tokens[0]
  if (!searchToken || searchToken.length < 2) {
    return { results: [], count: 0 }
  }

  const constraints = [where('searchKeywords', 'array-contains', searchToken)]
  if (currentUser?.role === USER_ROLES.collector) {
    constraints.unshift(where('assignedCollectorId', '==', currentUser.userId))
  }
  constraints.push(limit(pageLimit(pageSize, 25, 50)))

  const snapshot = await getDocs(query(customersRef, ...constraints))
  const results = docsWithIds(snapshot)
    .filter((customer) => {
      if (tokens.length <= 1) return true
      const searchableText = normalizeSearchText(
        [
          customer.shopName,
          customer.ownerName,
          customer.mobile,
          customer.alternateMobile,
          customer.area,
        ].join(' '),
      )
      return tokens.every((token) => searchableText.includes(token))
    })
    .sort((first, second) =>
      String(first.shopName || '').localeCompare(String(second.shopName || '')),
    )

  results.forEach(cacheCustomer)
  return {
    results,
    count: results.length,
  }
}

export const getById = async (customerId) => {
  const cached = getCachedValue(customerCache.get(customerId))
  if (cached) return cached

  const snapshot = await getDoc(doc(db, COLLECTIONS.customers, customerId))
  if (snapshot.exists()) {
    const customer = { id: snapshot.id, ...snapshot.data() }
    cacheCustomer(customer)
    return customer
  }

  const fieldSnapshot = await getDocs(
    query(customersRef, where('customerId', '==', customerId), limit(1)),
  )
  if (fieldSnapshot.empty) throw new Error('Customer not found.')

  const match = fieldSnapshot.docs[0]
  const customer = { id: match.id, ...match.data() }
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

export const create = async (payload, currentUser, { onUploadProgress } = {}) => {
  const customerReference = doc(customersRef)
  const photoUrl = payload.photoFile
    ? await uploadCustomerPhoto(customerReference.id, payload.photoFile, onUploadProgress)
    : normalizeText(payload.photoUrl || payload.photo)
  const selectedCollector = payload.assignedCollectorId
    ? (await getDoc(doc(db, COLLECTIONS.users, payload.assignedCollectorId))).data()
    : null
  return createCustomer(
    {
      ...payload,
      customerReference,
      photoUrl,
      photo: photoUrl,
      assignedCollectorName:
        payload.assignedCollectorName || selectedCollector?.fullName || '',
    },
    currentUser || { userId: auth.currentUser?.uid || '' },
  )
}

export const update = async (customerId, payload, _currentUser, { onUploadProgress } = {}) => {
  const dailyAmount = normalizeMoney(payload.dailyAmount)
  const shopName = normalizeText(payload.shopName)
  const ownerName = normalizeText(payload.ownerName)
  const mobile = normalizeText(payload.mobile)
  const alternateMobile = normalizeText(payload.alternateMobile)
  const area = normalizeText(payload.area)
  const updates = {
    shopName,
    shopNameLower: normalizeSearchText(shopName),
    ownerName,
    ownerNameLower: normalizeSearchText(ownerName),
    mobile,
    mobileSearch: normalizeSearchText(mobile),
    alternateMobile,
    alternateMobileSearch: normalizeSearchText(alternateMobile),
    area,
    areaLower: normalizeSearchText(area),
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
      shopName,
      ownerName,
      mobile,
      alternateMobile,
      area,
    ),
    updatedAt: serverTimestamp(),
  }

  if (payload.removePhoto) {
    updates.photoUrl = ''
    updates.photo = ''
  } else if (payload.photoFile) {
    const photoUrl = await uploadCustomerPhoto(customerId, payload.photoFile, onUploadProgress)
    updates.photoUrl = photoUrl
    updates.photo = photoUrl
  } else if (payload.photoUrl !== undefined || payload.photo !== undefined) {
    const photoUrl = normalizeText(payload.photoUrl || payload.photo)
    updates.photoUrl = photoUrl
    updates.photo = photoUrl
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
  searchCustomers,
  create,
  update,
}
