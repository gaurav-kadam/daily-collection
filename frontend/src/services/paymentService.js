import {
  collection,
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
  docsWithIds,
  pageLimit,
  todayKey,
} from './firestoreService'
import { recordEmiPayment } from './erpService'

const emiPaymentsRef = collection(db, COLLECTIONS.emiPayments)

const uniqueIds = (ids = []) => [...new Set(ids.filter(Boolean).map(String))]

const sortPaymentsDesc = (records) =>
  [...records].sort((first, second) =>
    String(second.paymentDate || '').localeCompare(String(first.paymentDate || '')),
  )

export const listenEmiPayments = (currentUser, callback, onError, { pageSize = 50 } = {}) => {
  const constraints =
    currentUser?.role === USER_ROLES.collector
      ? [where('collectorId', '==', currentUser.userId), orderBy('paymentDate', 'desc')]
      : [orderBy('paymentDate', 'desc')]

  return onSnapshot(
    query(emiPaymentsRef, ...constraints, limit(pageLimit(pageSize, 50, 200))),
    (snapshot) => callback(docsWithIds(snapshot)),
    onError,
  )
}

export const getAllEmiPayments = async ({ currentUser, pageSize = 50 } = {}) => {
  const constraints =
    currentUser?.role === USER_ROLES.collector
      ? [where('collectorId', '==', currentUser.userId), orderBy('paymentDate', 'desc')]
      : [orderBy('paymentDate', 'desc')]
  const snapshot = await getDocs(
    query(emiPaymentsRef, ...constraints, limit(pageLimit(pageSize, 50, 200))),
  )
  const results = docsWithIds(snapshot)
  return { results, count: results.length }
}

const getEmiPaymentsForCustomerId = async ({ customerId, currentUser, pageSize }) => {
  const constraints = []
  if (currentUser?.role === USER_ROLES.collector) {
    constraints.push(where('collectorId', '==', currentUser.userId))
  }
  constraints.push(where('customerId', '==', customerId))

  try {
    const snapshot = await getDocs(
      query(
        emiPaymentsRef,
        ...constraints,
        orderBy('paymentDate', 'desc'),
        limit(pageLimit(pageSize, 25, 100)),
      ),
    )
    return docsWithIds(snapshot)
  } catch {
    const snapshot = await getDocs(
      query(emiPaymentsRef, ...constraints, limit(pageLimit(pageSize, 25, 100))),
    )
    return sortPaymentsDesc(docsWithIds(snapshot))
  }
}

export const getCustomerEmiPayments = async ({
  customerIds = [],
  currentUser,
  pageSize = 25,
} = {}) => {
  const ids = uniqueIds(customerIds)
  if (!ids.length) return { results: [], count: 0 }

  const batches = await Promise.allSettled(
    ids.map((customerId) => getEmiPaymentsForCustomerId({ customerId, currentUser, pageSize })),
  )
  const rejected = batches.find((batch) => batch.status === 'rejected')
  const merged = new Map()
  batches
    .filter((batch) => batch.status === 'fulfilled')
    .flatMap((batch) => batch.value)
    .forEach((payment) => {
      merged.set(payment.paymentId || payment.id, payment)
    })
  const results = sortPaymentsDesc([...merged.values()]).slice(0, pageLimit(pageSize, 25, 100))
  if (!results.length && rejected) throw rejected.reason

  return {
    results,
    count: results.length,
  }
}

export const createEmiPayment = async ({ loan, payload, currentUser }) => {
  const response = await recordEmiPayment({
    loanId: loan.loanId || loan.id,
    amountPaid: payload.amountPaid,
    paymentDate: payload.paymentDate || todayKey(),
    paymentMethod: payload.paymentMethod,
    remarks: payload.remarks,
    collectedById: currentUser?.userId || '',
  })

  return { paymentId: response.paymentId, payment: response.payment }
}

export default {
  listenEmiPayments,
  getAllEmiPayments,
  getCustomerEmiPayments,
  createEmiPayment,
}
