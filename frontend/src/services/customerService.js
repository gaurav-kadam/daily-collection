import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
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
import { uploadCustomerImage } from './cloudinaryService'
import {
  createCustomerIdentity as createCustomerIdentityCallable,
  decorateCustomerFinance,
  decorateCustomersFinance,
  updateCustomerIdentity,
} from './erpService'

const customersRef = collection(db, COLLECTIONS.customers)
const usersRef = collection(db, COLLECTIONS.users)
const CACHE_TTL_MS = 30000
const customerCache = new Map()
const listCache = new Map()
let metaCache = null
const CUSTOMER_ID_PREFIX = 'SBG'
const CUSTOMER_ID_PADDING = 4
const CUSTOMER_COUNTER_ID = 'customerCounter'
const DEBUG_FIRESTORE_WRITES = import.meta.env.DEV

const debugFirestoreWrite = (step, details = {}) => {
  if (!DEBUG_FIRESTORE_WRITES) return
  console.debug('[customer:create]', step, details)
}

const debugCurrentRuleProfile = async (currentUser) => {
  if (!DEBUG_FIRESTORE_WRITES || !auth.currentUser?.uid) return

  try {
    const profileSnapshot = await getDoc(doc(db, COLLECTIONS.users, auth.currentUser.uid))
    debugFirestoreWrite('auth-rule-profile', {
      authUserId: auth.currentUser.uid,
      appUserId: currentUser?.userId || '',
      appRole: currentUser?.role || '',
      firestoreUserExists: profileSnapshot.exists(),
      firestoreRole: profileSnapshot.data()?.role || '',
      firestoreStatus: profileSnapshot.data()?.status || '',
    })
  } catch (error) {
    debugFirestoreWrite('auth-rule-profile:error', {
      authUserId: auth.currentUser.uid,
      appUserId: currentUser?.userId || '',
      appRole: currentUser?.role || '',
      code: error.code,
      message: error.message,
    })
  }
}

const getCachedValue = (cacheEntry) =>
  cacheEntry && Date.now() - cacheEntry.createdAt < CACHE_TTL_MS ? cacheEntry.value : null

const cacheCustomer = (customer) => {
  const cacheEntry = { value: customer, createdAt: Date.now() }
  if (customer.id) customerCache.set(customer.id, cacheEntry)
  if (customer.customerId) customerCache.set(customer.customerId, cacheEntry)
}

const makeListCacheKey = (params) => JSON.stringify(params || {})

const formatCustomerCode = (value) =>
  `${CUSTOMER_ID_PREFIX}${String(value).padStart(CUSTOMER_ID_PADDING, '0')}`

const generateCustomerReference = async () =>
  runTransaction(db, async (transaction) => {
    const counterReference = doc(db, COLLECTIONS.systemCounters, CUSTOMER_COUNTER_ID)
    debugFirestoreWrite('counter:read:start', { path: counterReference.path })
    const counterSnapshot = await transaction.get(counterReference)
    let nextValue = Number(counterSnapshot.data()?.value || 0) + 1
    debugFirestoreWrite('counter:read:success', {
      exists: counterSnapshot.exists(),
      currentValue: counterSnapshot.data()?.value || 0,
      nextValue,
    })

    for (let attempts = 0; attempts < 25; attempts += 1) {
      const customerId = formatCustomerCode(nextValue)
      const customerReference = doc(customersRef, customerId)
      debugFirestoreWrite('customer-id:check:start', {
        customerId,
        path: customerReference.path,
      })
      const customerSnapshot = await transaction.get(customerReference)
      if (!customerSnapshot.exists()) {
        debugFirestoreWrite('counter:update:queued', {
          path: counterReference.path,
          value: nextValue,
          customerId,
        })
        transaction.set(
          counterReference,
          {
            counterId: CUSTOMER_COUNTER_ID,
            value: nextValue,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
        debugFirestoreWrite('customer-id:selected', { customerId })
        return customerReference
      }
      debugFirestoreWrite('customer-id:exists', { customerId })
      nextValue += 1
    }

    throw new Error('Unable to generate a unique customer ID. Please try again.')
  })

const uploadProgressFor = (onUploadProgress, field) => (progress) => {
  if (!onUploadProgress) return
  onUploadProgress({ field, progress })
}

export const listenCustomers = (currentUser, callback, onError) => {
  const constraints =
    currentUser?.role === USER_ROLES.collector
      ? [where('assignedCollectorId', '==', currentUser.userId), orderBy('shopName')]
      : [orderBy('shopName')]

  return onSnapshot(
    query(customersRef, ...constraints),
    (snapshot) => {
      decorateCustomersFinance(docsWithIds(snapshot))
        .then(callback)
        .catch(() => callback(docsWithIds(snapshot)))
    },
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
  const profilePhotoUrl = normalizeText(
    payload.profilePhotoUrl || payload.photoUrl || payload.photo,
  )
  const documentPhotoUrl = normalizeText(payload.documentPhotoUrl)
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
    profilePhotoUrl,
    documentPhotoUrl,
    photoUrl: profilePhotoUrl,
    photo: profilePhotoUrl,
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

  const functionPayload = {
    customerId: customerReference.id,
    shopName,
    ownerName,
    mobile,
    alternateMobile,
    area,
    address: record.address,
    dailyAmount,
    joiningDate: payload.joiningDate || null,
    assignedCollectorId: record.assignedCollectorId,
    assignedCollectorName: record.assignedCollectorName,
    status: record.status,
    idProofType: record.idProofType,
    idProofNumber: record.idProofNumber,
    notes: record.notes,
    profilePhotoUrl,
    documentPhotoUrl,
    photoUrl: profilePhotoUrl,
    photo: profilePhotoUrl,
    createBachatAccount: moneyToPaise(dailyAmount) > 0,
  }

  debugFirestoreWrite('customer:function:start', {
    path: customerReference.path,
    customerId: functionPayload.customerId,
    authUserId: auth.currentUser?.uid || '',
    appUserId: currentUser?.userId || '',
    appRole: currentUser?.role || '',
    hasProfilePhotoUrl: Boolean(functionPayload.profilePhotoUrl),
    hasDocumentPhotoUrl: Boolean(functionPayload.documentPhotoUrl),
  })
  try {
    const response = await createCustomerIdentityCallable(functionPayload)
    const customer = decorateCustomerFinance(
      response.customer || { id: customerReference.id, ...functionPayload },
      null,
      response.bachatAccount,
    )
    debugFirestoreWrite('customer:function:success', {
      path: customerReference.path,
      customerId: customer.customerId,
    })
    cacheCustomer(customer)
    listCache.clear()
    return customer
  } catch (error) {
    debugFirestoreWrite('customer:function:error', {
      path: customerReference.path,
      code: error.code,
      message: error.message,
      authUserId: auth.currentUser?.uid || '',
      appUserId: currentUser?.userId || '',
      appRole: currentUser?.role || '',
    })
    throw error
  }
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
  const decoratedCustomers = await decorateCustomersFinance(docsWithIds(snapshot))
  const results = decoratedCustomers
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
  const results = await decorateCustomersFinance(docsWithIds(snapshot))
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
    const customer = decorateCustomerFinance({ id: snapshot.id, ...snapshot.data() })
    const decorated = (await decorateCustomersFinance([customer]))[0]
    cacheCustomer(decorated)
    return decorated
  }

  const fieldSnapshot = await getDocs(
    query(customersRef, where('customerId', '==', customerId), limit(1)),
  )
  if (fieldSnapshot.empty) throw new Error('Customer not found.')

  const match = fieldSnapshot.docs[0]
  const customer = (await decorateCustomersFinance([{ id: match.id, ...match.data() }]))[0]
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
  debugFirestoreWrite('create:start', {
    authUserId: auth.currentUser?.uid || '',
    appUserId: currentUser?.userId || '',
    appRole: currentUser?.role || '',
  })
  await debugCurrentRuleProfile(currentUser)
  let customerReference
  try {
    customerReference = await generateCustomerReference()
    debugFirestoreWrite('counter:transaction:success', {
      customerId: customerReference.id,
      path: customerReference.path,
    })
  } catch (error) {
    debugFirestoreWrite('counter:transaction:error', {
      code: error.code,
      message: error.message,
      authUserId: auth.currentUser?.uid || '',
      appUserId: currentUser?.userId || '',
      appRole: currentUser?.role || '',
    })
    throw error
  }
  const profileUpload = payload.profilePhotoFile
    ? await uploadCustomerImage(
        customerReference.id,
        payload.profilePhotoFile,
        'profile',
        uploadProgressFor(onUploadProgress, 'profilePhoto'),
      )
    : null
  const documentUpload = payload.documentPhotoFile
    ? await uploadCustomerImage(
        customerReference.id,
        payload.documentPhotoFile,
        'document',
        uploadProgressFor(onUploadProgress, 'documentPhoto'),
      )
    : null
  const profilePhotoUrl = profileUpload?.url || normalizeText(payload.profilePhotoUrl || payload.photoUrl || payload.photo)
  const documentPhotoUrl = documentUpload?.url || normalizeText(payload.documentPhotoUrl)
  const selectedCollector = payload.assignedCollectorId
    ? (await getDoc(doc(db, COLLECTIONS.users, payload.assignedCollectorId))).data()
    : null
  return createCustomer(
    {
      ...payload,
      customerReference,
      profilePhotoUrl,
      documentPhotoUrl,
      photoUrl: profilePhotoUrl,
      photo: profilePhotoUrl,
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
    updates.profilePhotoUrl = ''
    updates.photoUrl = ''
    updates.photo = ''
  } else if (payload.profilePhotoFile) {
    const upload = await uploadCustomerImage(
      customerId,
      payload.profilePhotoFile,
      'profile',
      uploadProgressFor(onUploadProgress, 'profilePhoto'),
    )
    updates.profilePhotoUrl = upload.url
    updates.photoUrl = upload.url
    updates.photo = upload.url
  } else if (
    payload.profilePhotoUrl !== undefined ||
    payload.photoUrl !== undefined ||
    payload.photo !== undefined
  ) {
    const profilePhotoUrl = normalizeText(payload.profilePhotoUrl || payload.photoUrl || payload.photo)
    updates.profilePhotoUrl = profilePhotoUrl
    updates.photoUrl = profilePhotoUrl
    updates.photo = profilePhotoUrl
  }

  if (payload.removeDocumentPhoto) {
    updates.documentPhotoUrl = ''
  } else if (payload.documentPhotoFile) {
    const upload = await uploadCustomerImage(
      customerId,
      payload.documentPhotoFile,
      'document',
      uploadProgressFor(onUploadProgress, 'documentPhoto'),
    )
    updates.documentPhotoUrl = upload.url
  } else if (payload.documentPhotoUrl !== undefined) {
    updates.documentPhotoUrl = normalizeText(payload.documentPhotoUrl)
  }

  if (updates.assignedCollectorId && !updates.assignedCollectorName) {
    const collectorSnapshot = await getDoc(doc(db, COLLECTIONS.users, updates.assignedCollectorId))
    updates.assignedCollectorName = collectorSnapshot.data()?.fullName || ''
  }

  const functionPayload = { ...updates }
  delete functionPayload.updatedAt
  const response = await updateCustomerIdentity({
    customerId,
    ...functionPayload,
  })
  customerCache.delete(customerId)
  listCache.clear()
  const updatedCustomer = response?.customer
    ? decorateCustomerFinance(response.customer)
    : await getById(customerId)
  cacheCustomer(updatedCustomer)
  return updatedCustomer
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
