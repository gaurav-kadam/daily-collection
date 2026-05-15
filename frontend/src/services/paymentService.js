import {
  collection,
  doc,
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
  USER_ROLES,
  docsWithIds,
  moneyToPaise,
  moneyValue,
  normalizeMoney,
  normalizeText,
  numberValue,
  pageLimit,
  paiseToMoney,
  todayKey,
} from './firestoreService'
import { calculateLoanMetrics } from './loanService'

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
  const paymentReference = doc(emiPaymentsRef)
  const loanReference = doc(db, COLLECTIONS.loans, loan.loanId || loan.id)
  const amountPaidPaise = moneyToPaise(payload.amountPaid)
  const amountPaid = normalizeMoney(payload.amountPaid)

  if (amountPaidPaise <= 0) {
    throw new Error('EMI amount must be greater than zero.')
  }

  await runTransaction(db, async (transaction) => {
    const loanSnapshot = await transaction.get(loanReference)
    if (!loanSnapshot.exists()) {
      throw new Error('Loan record was not found.')
    }

    const loanData = loanSnapshot.data()
    if (loanData.loanStatus !== 'active') {
      throw new Error('EMI can be collected only for active loans.')
    }

    const metricsBeforePayment = calculateLoanMetrics({
      id: loanSnapshot.id,
      ...loanData,
    })
    const remainingBalancePaise = moneyToPaise(moneyValue(loanData, 'remainingBalance'))
    const appliedToLoanPaise = Math.min(amountPaidPaise, remainingBalancePaise)
    const nextBalancePaise = Math.max(remainingBalancePaise - appliedToLoanPaise, 0)
    const nextBalance = paiseToMoney(nextBalancePaise)
    const nextStatus = nextBalancePaise <= 0 ? 'completed' : 'active'
    const paidInstallments = numberValue(loanData.paidInstallments) + 1
    const nextDueDate =
      nextStatus === 'completed'
        ? loanData.dueDate || metricsBeforePayment.dueDate
        : calculateLoanMetrics({
            ...loanData,
            paidInstallments,
            remainingBalance: nextBalance,
            remainingBalancePaise: nextBalancePaise,
            loanStatus: nextStatus,
          }).nextDueDate
    const metricsAfterPayment = calculateLoanMetrics({
      ...loanData,
      paidInstallments,
      remainingBalance: nextBalance,
      remainingBalancePaise: nextBalancePaise,
      loanStatus: nextStatus,
      nextDueDate,
    })
    const penaltyAmountPaise = moneyToPaise(metricsAfterPayment.penaltyAmount)

    const record = {
      paymentId: paymentReference.id,
      loanId: loanSnapshot.id,
      customerId: loanData.customerId,
      customerName: loanData.customerName || '',
      shopName: loanData.shopName || '',
      collectorId: loanData.collectorId || currentUser.userId,
      collectorName: loanData.collectorName || '',
      amountPaid,
      amountPaidPaise,
      principalPaid: paiseToMoney(appliedToLoanPaise),
      principalPaidPaise: appliedToLoanPaise,
      paymentMethod: payload.paymentMethod || 'cash',
      paymentDate: payload.paymentDate || todayKey(),
      remainingBalance: nextBalance,
      remainingBalancePaise: nextBalancePaise,
      installmentNumber: paidInstallments,
      dueDate: metricsBeforePayment.nextDueDate,
      overdueDays: metricsBeforePayment.overdueDays,
      penaltyAmount: metricsBeforePayment.penaltyAmount,
      penaltyAmountPaise: moneyToPaise(metricsBeforePayment.penaltyAmount),
      collectedById: currentUser.userId,
      collectedByName: currentUser.fullName || currentUser.email || '',
      remarks: normalizeText(payload.remarks),
      createdAt: serverTimestamp(),
    }

    transaction.set(paymentReference, record)
    transaction.update(loanReference, {
      totalPaid: increment(paiseToMoney(appliedToLoanPaise)),
      totalPaidPaise: increment(appliedToLoanPaise),
      remainingBalance: nextBalance,
      remainingBalancePaise: nextBalancePaise,
      paidInstallments,
      loanStatus: nextStatus,
      lastEMIPaymentDate: payload.paymentDate || todayKey(),
      nextDueDate,
      overdueDays: metricsAfterPayment.overdueDays,
      penaltyAmount: metricsAfterPayment.penaltyAmount,
      penaltyAmountPaise,
      lastPenaltyUpdated: todayKey(),
      updatedAt: serverTimestamp(),
    })
    transaction.set(
      doc(db, COLLECTIONS.penalties, `emi_${loanSnapshot.id}`),
      {
        penaltyId: `emi_${loanSnapshot.id}`,
        type: 'emi',
        status:
          metricsAfterPayment.overdueDays > 0 && metricsAfterPayment.penaltyAmount > 0
            ? 'active'
            : 'resolved',
        loanId: loanSnapshot.id,
        customerId: loanData.customerId,
        customerName: loanData.customerName || '',
        shopName: loanData.shopName || '',
        collectorId: loanData.collectorId || currentUser.userId,
        collectorName: loanData.collectorName || '',
        overdueDays: metricsAfterPayment.overdueDays,
        penaltyAmount: metricsAfterPayment.penaltyAmount,
        penaltyAmountPaise,
        pendingAmount: metricsAfterPayment.emiDueAmount,
        pendingAmountPaise: moneyToPaise(metricsAfterPayment.emiDueAmount),
        dueDate: metricsAfterPayment.nextDueDate,
        lastPenaltyUpdated: todayKey(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })

  return { paymentId: paymentReference.id }
}

export default {
  listenEmiPayments,
  getAllEmiPayments,
  getCustomerEmiPayments,
  createEmiPayment,
}
