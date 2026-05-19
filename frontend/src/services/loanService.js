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
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/firebase'
import {
  COLLECTIONS,
  FINANCE_RULES,
  USER_ROLES,
  addMonthsKey,
  daysBetween,
  docsWithIds,
  moneyToPaise,
  moneyValue,
  numberValue,
  pageLimit,
  todayKey,
} from './firestoreService'
import { createLoan as createLoanCallable } from './erpService'

const loansRef = collection(db, COLLECTIONS.loans)
const paymentsRef = collection(db, COLLECTIONS.emiPayments)

const uniqueIds = (ids = []) => [...new Set(ids.filter(Boolean).map(String))]

const timestampValue = (value) => {
  if (!value) return 0
  if (value?.toMillis) return value.toMillis()
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

const sortLoansDesc = (records) =>
  [...records].sort(
    (first, second) =>
      timestampValue(second.createdAt) - timestampValue(first.createdAt) ||
      String(second.loanDate || '').localeCompare(String(first.loanDate || '')),
  )

export const processingFeeForAmount = (amount) => {
  const loanAmount = numberValue(amount)
  return loanAmount >= 5000 && loanAmount <= 50000 ? 5000 : 0
}

const expectedInstallmentsDue = (loanDate, durationMonths, asOfDate = todayKey()) => {
  let due = 0
  const duration = Math.max(numberValue(durationMonths), 0)
  for (let index = 1; index <= duration; index += 1) {
    if (addMonthsKey(loanDate, index) <= asOfDate) due += 1
  }
  return due
}

export const calculateLoanMetrics = (loan, asOfDate = todayKey()) => {
  const paidInstallments = numberValue(loan.paidInstallments)
  const durationMonths = Math.max(numberValue(loan.loanDurationMonths, 1), 1)
  const monthlyEMI = moneyValue(loan, 'monthlyEMI')
  const remainingBalance = moneyValue(loan, 'remainingBalance')
  const nextDueDate =
    loan.loanStatus === 'completed'
      ? loan.dueDate || ''
      : addMonthsKey(loan.loanDate || asOfDate, Math.min(paidInstallments + 1, durationMonths))
  const dueInstallments = expectedInstallmentsDue(
    loan.loanDate || asOfDate,
    durationMonths,
    asOfDate,
  )
  const overdueDays =
    loan.loanStatus === 'active' && nextDueDate && nextDueDate < asOfDate
      ? daysBetween(nextDueDate, asOfDate)
      : 0
  const pendingInstallments = Math.max(
    dueInstallments - paidInstallments,
    overdueDays > 0 && remainingBalance > 0 ? 1 : 0,
  )
  const emiDueAmount = Math.min(monthlyEMI * pendingInstallments, remainingBalance)
  const penaltyAmount = overdueDays * FINANCE_RULES.emiPenaltyPerDay

  return {
    nextDueDate,
    dueDate: loan.dueDate || addMonthsKey(loan.loanDate || asOfDate, durationMonths),
    dueInstallments,
    pendingInstallments,
    pendingMonths: pendingInstallments,
    overdueDays,
    emiDueAmount,
    penaltyAmount,
    loanStatus: remainingBalance <= 0 ? 'completed' : loan.loanStatus || 'active',
  }
}

export const listenLoans = (currentUser, callback, onError, { pageSize = 100, status } = {}) => {
  const constraints = []
  if (currentUser?.role === USER_ROLES.collector) {
    constraints.push(where('collectorId', '==', currentUser.userId))
  }
  if (status) constraints.push(where('loanStatus', '==', status))
  constraints.push(orderBy('createdAt', 'desc'))
  constraints.push(limit(pageLimit(pageSize, 100, 300)))

  return onSnapshot(
    query(loansRef, ...constraints),
    (snapshot) => callback(docsWithIds(snapshot)),
    onError,
  )
}

export const getLoanEligibility = async (customer) => {
  if (!customer) {
    return { eligible: false, reasons: ['Customer is required.'] }
  }

  const reasons = []
  if (customer.status && customer.status !== 'active') {
    reasons.push('Customer is not active.')
  }

  const activeLoanSnapshot = await getDocs(
    query(
      loansRef,
      where('customerId', '==', customer.customerId || customer.id),
      where('loanStatus', '==', 'active'),
      limit(1),
    ),
  )
  if (!activeLoanSnapshot.empty) {
    reasons.push('Customer already has an active loan.')
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  }
}

export const createLoan = async ({ customer, payload, currentUser }) => {
  const eligibility = await getLoanEligibility(customer)
  if (!eligibility.eligible) {
    throw new Error(eligibility.reasons[0])
  }

  const response = await createLoanCallable({
    ...payload,
    customerId: customer.customerId || customer.id,
    collectorId: customer.assignedCollectorId || '',
    collectorName: customer.assignedCollectorName || '',
    createdById: currentUser?.userId || '',
  })

  return response.loan
}

export const getAll = async ({
  customer_id: customerId,
  customerId: normalizedCustomerId,
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
  if (status) constraints.push(where('loanStatus', '==', status))
  constraints.push(orderBy('createdAt', 'desc'))
  constraints.push(limit(pageLimit(pageSize, 100, 300)))

  const snapshot = await getDocs(query(loansRef, ...constraints))
  const results = docsWithIds(snapshot)
  return {
    results,
    count: results.length,
  }
}

const getLoansForCustomerId = async ({ customerId, pageSize }) => {
  const constraints = [where('customerId', '==', customerId)]

  try {
    const snapshot = await getDocs(
      query(
        loansRef,
        ...constraints,
        orderBy('createdAt', 'desc'),
        limit(pageLimit(pageSize, 25, 100)),
      ),
    )
    return docsWithIds(snapshot).map((loan) => ({ ...loan, ...calculateLoanMetrics(loan) }))
  } catch {
    const snapshot = await getDocs(
      query(loansRef, ...constraints, limit(pageLimit(pageSize, 25, 100))),
    )
    return sortLoansDesc(docsWithIds(snapshot)).map((loan) => ({
      ...loan,
      ...calculateLoanMetrics(loan),
    }))
  }
}

export const getByCustomerIds = async ({
  customerIds = [],
  pageSize = 25,
} = {}) => {
  const ids = uniqueIds(customerIds)
  if (!ids.length) return { results: [], count: 0 }

  const batches = await Promise.allSettled(
    ids.map((customerId) => getLoansForCustomerId({ customerId, pageSize })),
  )
  const rejected = batches.find((batch) => batch.status === 'rejected')
  const merged = new Map()
  batches
    .filter((batch) => batch.status === 'fulfilled')
    .flatMap((batch) => batch.value)
    .forEach((loan) => {
      merged.set(loan.loanId || loan.id, loan)
    })
  const results = sortLoansDesc([...merged.values()]).slice(0, pageLimit(pageSize, 25, 100))
  if (!results.length && rejected) throw rejected.reason

  return {
    results,
    count: results.length,
  }
}

export const getById = async (loanId) => {
  const loanSnapshot = await getDoc(doc(db, COLLECTIONS.loans, loanId))
  if (!loanSnapshot.exists()) throw new Error('Loan not found.')
  const loan = { id: loanSnapshot.id, ...loanSnapshot.data() }
  const paymentSnapshot = await getDocs(
    query(
      paymentsRef,
      where('loanId', '==', loanSnapshot.id),
      orderBy('paymentDate', 'desc'),
      limit(100),
    ),
  )
  return {
    ...loan,
    ...calculateLoanMetrics(loan),
    payments: docsWithIds(paymentSnapshot),
  }
}

export const getPendingEmi = async ({ pageSize = 100, overdueOnly = false, currentUser } = {}) => {
  const constraints = []
  if (currentUser?.role === USER_ROLES.collector) {
    constraints.push(where('collectorId', '==', currentUser.userId))
  }
  constraints.push(where('loanStatus', '==', 'active'))
  constraints.push(orderBy('createdAt', 'desc'))
  constraints.push(limit(pageLimit(pageSize, 100, 500)))

  const snapshot = await getDocs(
    query(loansRef, ...constraints),
  )
  const rows = docsWithIds(snapshot)
    .map((loan) => ({ ...loan, ...calculateLoanMetrics(loan) }))
    .filter((loan) =>
      overdueOnly ? loan.overdueDays > 0 : loan.pendingInstallments > 0 || loan.remainingBalance > 0,
    )

  return {
    results: rows,
    count: rows.length,
  }
}

export const updateLoanPenalty = async (loan, currentUser) => {
  const loanId = loan.loanId || loan.id
  const loanReference = doc(db, COLLECTIONS.loans, loanId)
  const penaltyReference = doc(db, COLLECTIONS.penalties, `emi_${loanId}`)

  await runTransaction(db, async (transaction) => {
    const loanSnapshot = await transaction.get(loanReference)
    if (!loanSnapshot.exists()) return
    const loanData = { id: loanSnapshot.id, ...loanSnapshot.data() }
    const metrics = calculateLoanMetrics(loanData)
    const penaltyAmountPaise = moneyToPaise(metrics.penaltyAmount)
    const status = metrics.overdueDays > 0 && metrics.penaltyAmount > 0 ? 'active' : 'resolved'

    transaction.update(loanReference, {
      nextDueDate: metrics.nextDueDate,
      dueDate: metrics.dueDate,
      overdueDays: metrics.overdueDays,
      penaltyAmount: metrics.penaltyAmount,
      penaltyAmountPaise,
      loanStatus: metrics.loanStatus,
      lastPenaltyUpdated: todayKey(),
      updatedAt: serverTimestamp(),
    })
    transaction.set(
      penaltyReference,
      {
        penaltyId: penaltyReference.id,
        type: 'emi',
        status,
        loanId,
        customerId: loanData.customerId,
        customerName: loanData.customerName || '',
        shopName: loanData.shopName || '',
        collectorId: loanData.collectorId || currentUser?.userId || '',
        collectorName: loanData.collectorName || '',
        overdueDays: metrics.overdueDays,
        penaltyAmount: metrics.penaltyAmount,
        penaltyAmountPaise,
        pendingAmount: metrics.emiDueAmount,
        pendingAmountPaise: moneyToPaise(metrics.emiDueAmount),
        dueDate: metrics.nextDueDate,
        lastPenaltyUpdated: todayKey(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })
}

export const update = (loanId, payload) =>
  updateDoc(doc(db, COLLECTIONS.loans, loanId), {
    ...payload,
    updatedAt: serverTimestamp(),
  })

export const create = async (payload, currentUser) => {
  const customerSnapshot = await getDoc(doc(db, COLLECTIONS.customers, payload.customerId))
  if (!customerSnapshot.exists()) throw new Error('Customer record was not found.')
  return createLoan({
    customer: { id: customerSnapshot.id, ...customerSnapshot.data() },
    payload,
    currentUser,
  })
}

export default {
  processingFeeForAmount,
  calculateLoanMetrics,
  getLoanEligibility,
  listenLoans,
  createLoan,
  getAll,
  getByCustomerIds,
  getById,
  getPendingEmi,
  updateLoanPenalty,
  update,
  create,
}
