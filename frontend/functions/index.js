const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

initializeApp()

const db = getFirestore()

const COLLECTIONS = {
  users: 'users',
  customers: 'customers',
  bachatAccounts: 'bachatAccounts',
  bachatCollections: 'bachatCollections',
  bachatPenalties: 'bachatPenalties',
  bachatClosures: 'bachatClosures',
  savingAccounts: 'savingAccounts',
  savingTransactions: 'savingTransactions',
  loans: 'loans',
  emiPayments: 'emiPayments',
  loanPenalties: 'loanPenalties',
  fdAccounts: 'fdAccounts',
  fdTransactions: 'fdTransactions',
  depositAccounts: 'depositAccounts',
  depositTransactions: 'depositTransactions',
  bishiGroups: 'bishiGroups',
  bishiMembers: 'bishiMembers',
  bishiPayments: 'bishiPayments',
  bishiRounds: 'bishiRounds',
  companyInvestments: 'companyInvestments',
  expenses: 'expenses',
  financeSummary: 'financeSummary',
  bachatSummary: 'bachatSummary',
  savingSummary: 'savingSummary',
  loanSummary: 'loanSummary',
  fdSummary: 'fdSummary',
  depositSummary: 'depositSummary',
  bishiSummary: 'bishiSummary',
  investmentSummary: 'investmentSummary',
  expenseSummary: 'expenseSummary',
  customerFinancials: 'customerFinancials',
  dailyModuleSummaries: 'dailyModuleSummaries',
  dailyCollections: 'dailyCollections',
  dailySummaries: 'dailySummaries',
  penalties: 'penalties',
  financeEntries: 'financeEntries',
  systemCounters: 'systemCounters',
}

const USER_ROLES = {
  admin: 'admin',
  collector: 'collector',
}

const FINANCE_RULES = {
  dailyPenaltyPerDayPaise: 1000,
  emiPenaltyPerDayPaise: 5000,
  defaultInterestRate: 0,
}

const CUSTOMER_ID_PREFIX = 'SBG'
const CUSTOMER_ID_PADDING = 4
const CUSTOMER_COUNTER_ID = 'customerCounter'
const DEFAULT_BACHAT_DURATION_MONTHS = 60
const DEFAULT_BACHAT_INTEREST_ELIGIBILITY_MONTHS = 24
const IST_TIME_ZONE = 'Asia/Kolkata'
const BATCH_LIMIT = 400

const serverTimestamp = () => FieldValue.serverTimestamp()
const increment = (value) => FieldValue.increment(Number(value || 0))
const arrayUnion = (...values) => FieldValue.arrayUnion(...values)
const arrayRemove = (...values) => FieldValue.arrayRemove(...values)

const numberValue = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const moneyToPaise = (value) => Math.round(numberValue(value) * 100)
const paiseToMoney = (value) => numberValue(value) / 100
const normalizeMoney = (value) => paiseToMoney(moneyToPaise(value))

const plainRecord = (record) => {
  if (!record) return record
  const { createdAt, updatedAt, migratedAt, closedAt, rebuiltAt, ...plain } = record
  return plain
}

const moneyValue = (record, rupeeField, paiseField = `${rupeeField}Paise`) => {
  if (record?.[paiseField] !== undefined && record?.[paiseField] !== null) {
    return paiseToMoney(record[paiseField])
  }
  return numberValue(record?.[rupeeField])
}

const normalizeText = (value) => String(value || '').trim()

const normalizeSearchText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const makeSearchKeywords = (...parts) => {
  const text = normalizeSearchText(parts.filter(Boolean).join(' '))
  const tokens = text.split(/\s+/).filter(Boolean)
  const keywords = new Set(tokens)

  tokens.forEach((token) => {
    const maxLength = Math.min(token.length, 24)
    for (let length = 2; length <= maxLength; length += 1) {
      keywords.add(token.slice(0, length))
    }
  })

  return [...keywords]
}

const todayKey = () => {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const part = (type) => parts.find((item) => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

const parseDateKey = (value) => {
  if (!value) return null
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const [, year, month, day] = match
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
}

const dateKeyFromDate = (date) => date.toISOString().slice(0, 10)

const addDaysKey = (dateKey, days) => {
  const date = parseDateKey(dateKey) || parseDateKey(todayKey())
  date.setUTCDate(date.getUTCDate() + numberValue(days))
  return dateKeyFromDate(date)
}

const addMonthsKey = (dateKey, months) => {
  const date = parseDateKey(dateKey) || parseDateKey(todayKey())
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + numberValue(months))
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate()
  date.setUTCDate(Math.min(day, lastDay))
  return dateKeyFromDate(date)
}

const daysBetween = (fromDateKey, toDateKey = todayKey()) => {
  const from = parseDateKey(fromDateKey)
  const to = parseDateKey(toDateKey)
  if (!from || !to) return 0
  return Math.max(Math.floor((to.getTime() - from.getTime()) / 86400000), 0)
}

const elapsedMonthlyInstallments = (loanDate, asOfDate = todayKey()) => {
  const start = parseDateKey(loanDate)
  const asOf = parseDateKey(asOfDate)
  if (!start || !asOf || asOf < start) return 0

  let months =
    (asOf.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (asOf.getUTCMonth() - start.getUTCMonth())

  if (asOf.getUTCDate() >= start.getUTCDate()) months += 1
  return Math.max(months, 0)
}

const formatCustomerCode = (value) =>
  `${CUSTOMER_ID_PREFIX}${String(value).padStart(CUSTOMER_ID_PADDING, '0')}`

const callable = (handler) =>
  onCall({ enforceAppCheck: false }, async (request) => handler(request.data || {}, request))

const requireAuth = async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in is required.')

  const snapshot = await db.collection(COLLECTIONS.users).doc(uid).get()
  if (!snapshot.exists) {
    throw new HttpsError('permission-denied', 'User profile was not found.')
  }

  const profile = { userId: uid, id: uid, ...snapshot.data() }
  if (profile.status && profile.status !== 'active') {
    throw new HttpsError('permission-denied', 'User profile is inactive.')
  }
  return profile
}

const requireAdmin = async (request) => {
  const user = await requireAuth(request)
  if (user.role !== USER_ROLES.admin) {
    throw new HttpsError('permission-denied', 'Admin access is required.')
  }
  return user
}

const canAccessCollectorRecord = (user, record) =>
  user.role === USER_ROLES.admin || normalizeText(record.collectorId) === user.userId

const assertCollectorAccess = (user, record, message = 'This record is not assigned to you.') => {
  if (!canAccessCollectorRecord(user, record)) {
    throw new HttpsError('permission-denied', message)
  }
}

const generateCustomerReference = async (transaction, preferredCustomerId) => {
  if (preferredCustomerId) {
    const customerReference = db.collection(COLLECTIONS.customers).doc(preferredCustomerId)
    const existing = await transaction.get(customerReference)
    if (existing.exists) {
      throw new HttpsError('already-exists', 'Customer ID already exists.')
    }
    return customerReference
  }

  const counterReference = db.collection(COLLECTIONS.systemCounters).doc(CUSTOMER_COUNTER_ID)
  const counterSnapshot = await transaction.get(counterReference)
  let nextValue = Number(counterSnapshot.data()?.value || 0) + 1

  for (let attempts = 0; attempts < 25; attempts += 1) {
    const customerId = formatCustomerCode(nextValue)
    const customerReference = db.collection(COLLECTIONS.customers).doc(customerId)
    const customerSnapshot = await transaction.get(customerReference)
    if (!customerSnapshot.exists) {
      transaction.set(
        counterReference,
        {
          counterId: CUSTOMER_COUNTER_ID,
          value: nextValue,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      return customerReference
    }
    nextValue += 1
  }

  throw new HttpsError('internal', 'Unable to generate a unique customer ID.')
}

const customerIdentityPayload = (payload, customerId, user) => {
  const shopName = normalizeText(payload.shopName || payload.businessName)
  const ownerName = normalizeText(payload.ownerName || payload.fullName)
  const mobile = normalizeText(payload.mobile)
  const alternateMobile = normalizeText(payload.alternateMobile)
  const area = normalizeText(payload.area)
  const profilePhotoUrl = normalizeText(payload.profilePhotoUrl || payload.photoUrl || payload.photo)

  return {
    customerId,
    shopName,
    businessName: shopName,
    shopNameLower: normalizeSearchText(shopName),
    ownerName,
    fullName: ownerName,
    ownerNameLower: normalizeSearchText(ownerName),
    mobile,
    mobileSearch: normalizeSearchText(mobile),
    alternateMobile,
    alternateMobileSearch: normalizeSearchText(alternateMobile),
    address: normalizeText(payload.address),
    area,
    areaLower: normalizeSearchText(area),
    profilePhotoUrl,
    photoUrl: profilePhotoUrl,
    photo: profilePhotoUrl,
    documentPhotoUrl: normalizeText(payload.documentPhotoUrl),
    idProofType: normalizeText(payload.idProofType),
    idProofNumber: normalizeText(payload.idProofNumber),
    status: payload.status || 'active',
    notes: normalizeText(payload.notes),
    searchKeywords: makeSearchKeywords(shopName, ownerName, mobile, alternateMobile, area, customerId),
    createdById: user.userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
}

const moduleSummaryCollection = (moduleId) => {
  const map = {
    bachat: COLLECTIONS.bachatSummary,
    saving: COLLECTIONS.savingSummary,
    loan: COLLECTIONS.loanSummary,
    fd: COLLECTIONS.fdSummary,
    deposit: COLLECTIONS.depositSummary,
    bishi: COLLECTIONS.bishiSummary,
    investments: COLLECTIONS.investmentSummary,
    expenses: COLLECTIONS.expenseSummary,
  }
  return map[moduleId]
}

const setModuleSummaryDelta = (transaction, moduleId, fields) => {
  const collectionName = moduleSummaryCollection(moduleId)
  if (!collectionName) return

  const summaryReference = db.collection(collectionName).doc('main')
  const financeReference = db.collection(COLLECTIONS.financeSummary).doc('main')
  const updates = {
    module: moduleId,
    updatedAt: serverTimestamp(),
  }
  const financeUpdates = {
    updatedAt: serverTimestamp(),
  }

  Object.entries(fields).forEach(([field, value]) => {
    updates[field] = increment(value)
    financeUpdates[`modules.${moduleId}.${field}`] = increment(value)
  })

  transaction.set(summaryReference, updates, { merge: true })
  transaction.set(financeReference, financeUpdates, { merge: true })
}

const setFinanceDelta = (transaction, fields) => {
  const financeReference = db.collection(COLLECTIONS.financeSummary).doc('main')
  const updates = { updatedAt: serverTimestamp() }
  Object.entries(fields).forEach(([field, value]) => {
    updates[field] = increment(value)
  })
  transaction.set(financeReference, updates, { merge: true })
}

const setDailyModuleDelta = (transaction, { moduleId, date, collectorId, collectorName, fields }) => {
  const summaryId = `${moduleId}_${date}_${collectorId || 'unassigned'}`
  const updates = {
    summaryId,
    module: moduleId,
    date,
    collectorId: collectorId || '',
    collectorName: collectorName || '',
    updatedAt: serverTimestamp(),
  }
  Object.entries(fields).forEach(([field, value]) => {
    updates[field] = increment(value)
  })
  transaction.set(db.collection(COLLECTIONS.dailyModuleSummaries).doc(summaryId), updates, {
    merge: true,
  })
}

const bachatAccountPayload = ({ customerId, customer, payload, user }) => {
  const dailyAmountPaise = moneyToPaise(payload.dailyAmount)
  if (dailyAmountPaise <= 0) {
    throw new HttpsError('invalid-argument', 'Bachat daily amount must be greater than zero.')
  }

  const durationMonths = Math.max(numberValue(payload.durationMonths, DEFAULT_BACHAT_DURATION_MONTHS), 1)
  const startDate = payload.startDate || payload.joiningDate || todayKey()
  const monthlyAmountPaise = dailyAmountPaise * 30
  const totalDepositTargetPaise = monthlyAmountPaise * durationMonths
  const maturityRewardPaise = moneyToPaise(payload.maturityReward || payload.maturityRewardAmount)
  const maturityAmountPaise =
    moneyToPaise(payload.maturityAmount) || totalDepositTargetPaise + maturityRewardPaise
  const collectorId = normalizeText(payload.collectorId || payload.assignedCollectorId)
  const collectorName = normalizeText(payload.collectorName || payload.assignedCollectorName)

  return {
    accountId: customerId,
    customerId,
    module: 'bachat',
    customerName: customer.ownerName || customer.fullName || '',
    shopName: customer.shopName || customer.businessName || '',
    collectorId,
    collectorName,
    dailyAmount: paiseToMoney(dailyAmountPaise),
    dailyAmountPaise,
    monthlyAmount: paiseToMoney(monthlyAmountPaise),
    monthlyAmountPaise,
    durationMonths,
    startDate,
    maturityDate: addMonthsKey(startDate, durationMonths),
    totalDepositTarget: paiseToMoney(totalDepositTargetPaise),
    totalDepositTargetPaise,
    maturityReward: paiseToMoney(maturityRewardPaise),
    maturityRewardPaise,
    maturityAmount: paiseToMoney(maturityAmountPaise),
    maturityAmountPaise,
    totalCollected: 0,
    totalCollectedPaise: 0,
    pendingAmount: 0,
    pendingAmountPaise: 0,
    pendingDays: 0,
    overdueDays: 0,
    penaltyAmount: 0,
    penaltyAmountPaise: 0,
    lastCollectionDate: null,
    lastDailySyncDate: startDate,
    lastPenaltyUpdated: null,
    status: payload.status || 'active',
    prematureClosureEligible: false,
    interestEligibilityMonths: DEFAULT_BACHAT_INTEREST_ELIGIBILITY_MONTHS,
    legacyCustomerFinanceMirrored: true,
    createdById: user.userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
}

const updateCustomerFinancialsForBachatEnrollment = (transaction, customerId, account) => {
  transaction.set(
    db.collection(COLLECTIONS.customerFinancials).doc(customerId),
    {
      customerId,
      activeModules: arrayUnion('bachat'),
      bachat: {
        accountId: customerId,
        status: account.status,
        collectorId: account.collectorId || '',
        collectorName: account.collectorName || '',
        dailyAmount: account.dailyAmount,
        dailyAmountPaise: account.dailyAmountPaise,
        monthlyAmount: account.monthlyAmount,
        monthlyAmountPaise: account.monthlyAmountPaise,
        durationMonths: account.durationMonths,
        startDate: account.startDate,
        maturityDate: account.maturityDate,
        maturityAmount: account.maturityAmount,
        maturityAmountPaise: account.maturityAmountPaise,
        totalCollected: 0,
        totalCollectedPaise: 0,
        pendingAmount: 0,
        pendingAmountPaise: 0,
        pendingDays: 0,
        penaltyAmount: 0,
        penaltyAmountPaise: 0,
      },
      totalBachat: 0,
      totalBachatPaise: 0,
      pendingAmount: 0,
      pendingAmountPaise: 0,
      penalties: 0,
      penaltiesPaise: 0,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

const expectedInstallmentsDue = (loanDate, durationMonths, asOfDate = todayKey()) => {
  let due = 0
  const duration = Math.max(numberValue(durationMonths), 0)
  for (let index = 1; index <= duration; index += 1) {
    if (addMonthsKey(loanDate, index) <= asOfDate) due += 1
  }
  return due
}

const calculateLoanMetrics = (loan, asOfDate = todayKey()) => {
  const paidInstallments = numberValue(loan.paidInstallments)
  const durationMonths = Math.max(numberValue(loan.loanDurationMonths, 1), 1)
  const monthlyEMIPaise = moneyToPaise(moneyValue(loan, 'monthlyEMI'))
  const remainingBalancePaise = moneyToPaise(moneyValue(loan, 'remainingBalance'))
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
    overdueDays > 0 && remainingBalancePaise > 0 ? 1 : 0,
  )
  const emiDueAmountPaise = Math.min(monthlyEMIPaise * pendingInstallments, remainingBalancePaise)
  const penaltyAmountPaise = overdueDays * FINANCE_RULES.emiPenaltyPerDayPaise

  return {
    nextDueDate,
    dueDate: loan.dueDate || addMonthsKey(loan.loanDate || asOfDate, durationMonths),
    dueInstallments,
    pendingInstallments,
    pendingMonths: pendingInstallments,
    overdueDays,
    emiDueAmount: paiseToMoney(emiDueAmountPaise),
    emiDueAmountPaise,
    penaltyAmount: paiseToMoney(penaltyAmountPaise),
    penaltyAmountPaise,
    loanStatus: remainingBalancePaise <= 0 ? 'completed' : loan.loanStatus || 'active',
  }
}

const processingFeeForAmountPaise = (amountPaise) =>
  amountPaise >= 500000 && amountPaise <= 5000000 ? 500000 : 0

const makeLoanRecord = ({ customerId, customer, payload, user, loanReference }) => {
  const loanAmountPaise = moneyToPaise(payload.loanAmount)
  if (loanAmountPaise <= 0) {
    throw new HttpsError('invalid-argument', 'Loan amount must be greater than zero.')
  }

  const processingFeePaise =
    payload.processingFee === undefined || payload.processingFee === ''
      ? processingFeeForAmountPaise(loanAmountPaise)
      : moneyToPaise(payload.processingFee)
  const durationMonths = Math.max(numberValue(payload.loanDurationMonths, 12), 1)
  const interestRate = numberValue(payload.interestRate, FINANCE_RULES.defaultInterestRate)
  const totalPayableAmountPaise = Math.round(loanAmountPaise + loanAmountPaise * (interestRate / 100))
  const monthlyEMIPaise = Math.ceil(totalPayableAmountPaise / durationMonths)
  const loanDate = payload.loanDate || todayKey()
  const dueDate = addMonthsKey(loanDate, durationMonths)
  const nextDueDate = addMonthsKey(loanDate, 1)
  const collectorId = normalizeText(payload.collectorId || customer.assignedCollectorId || '')
  const collectorName = normalizeText(payload.collectorName || customer.assignedCollectorName || '')

  return {
    loanId: loanReference.id,
    customerId,
    customerName: customer.ownerName || customer.fullName || '',
    shopName: customer.shopName || customer.businessName || '',
    collectorId,
    collectorName,
    loanAmount: paiseToMoney(loanAmountPaise),
    loanAmountPaise,
    processingFee: paiseToMoney(processingFeePaise),
    processingFeePaise,
    finalDisbursedAmount: paiseToMoney(Math.max(loanAmountPaise - processingFeePaise, 0)),
    finalDisbursedAmountPaise: Math.max(loanAmountPaise - processingFeePaise, 0),
    interestRate,
    totalPayableAmount: paiseToMoney(totalPayableAmountPaise),
    totalPayableAmountPaise,
    remainingBalance: paiseToMoney(totalPayableAmountPaise),
    remainingBalancePaise: totalPayableAmountPaise,
    totalPaid: 0,
    totalPaidPaise: 0,
    paidInstallments: 0,
    loanDurationMonths: durationMonths,
    monthlyEMI: paiseToMoney(monthlyEMIPaise),
    monthlyEMIPaise,
    loanDate,
    dueDate,
    nextDueDate,
    overdueDays: 0,
    penaltyAmount: 0,
    penaltyAmountPaise: 0,
    lastPenaltyUpdated: null,
    lastEMIPaymentDate: null,
    loanStatus: payload.loanStatus || 'active',
    remarks: normalizeText(payload.remarks),
    createdById: user.userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
}

exports.createCustomerIdentity = callable(async (payload, request) => {
  const user = await requireAdmin(request)
  const preferredCustomerId = normalizeText(payload.customerId)
  let createdCustomer
  let createdAccount = null

  await db.runTransaction(async (transaction) => {
    const customerReference = await generateCustomerReference(transaction, preferredCustomerId)
    const customerId = customerReference.id
    const record = customerIdentityPayload(payload, customerId, user)
    transaction.set(customerReference, record)
    setFinanceDelta(transaction, { totalCustomers: 1 })

    const shouldEnrollBachat =
      payload.createBachatAccount !== false && moneyToPaise(payload.dailyAmount) > 0
    if (shouldEnrollBachat) {
      const accountReference = db.collection(COLLECTIONS.bachatAccounts).doc(customerId)
      const accountSnapshot = await transaction.get(accountReference)
      if (!accountSnapshot.exists) {
        const account = bachatAccountPayload({
          customerId,
          customer: record,
          payload,
          user,
        })
        transaction.set(accountReference, account)
        updateCustomerFinancialsForBachatEnrollment(transaction, customerId, account)
        setModuleSummaryDelta(transaction, 'bachat', {
          totalAccounts: 1,
          activeAccounts: account.status === 'active' ? 1 : 0,
          totalMonthlyCommitmentPaise: account.monthlyAmountPaise,
        })
        transaction.set(
          customerReference,
          {
            assignedCollectorId: account.collectorId || '',
            assignedCollectorName: account.collectorName || '',
            joiningDate: account.startDate,
            dailyAmount: account.dailyAmount,
            dailyAmountPaise: account.dailyAmountPaise,
            totalSavings: 0,
            totalSavingsPaise: 0,
            pendingAmount: 0,
            pendingAmountPaise: 0,
            pendingDays: 0,
            overdueDays: 0,
            penaltyAmount: 0,
            penaltyAmountPaise: 0,
            lastDailySyncDate: account.startDate,
            legacyFinanceShadow: true,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
        createdAccount = account
      }
    }

    createdCustomer = { id: customerId, ...plainRecord(record) }
  })

  return { customer: createdCustomer, bachatAccount: plainRecord(createdAccount) }
})

exports.updateCustomerIdentity = callable(async (payload, request) => {
  await requireAdmin(request)
  const customerId = normalizeText(payload.customerId)
  if (!customerId) throw new HttpsError('invalid-argument', 'customerId is required.')

  const customerReference = db.collection(COLLECTIONS.customers).doc(customerId)
  const snapshot = await customerReference.get()
  if (!snapshot.exists) throw new HttpsError('not-found', 'Customer record was not found.')

  const current = snapshot.data()
  const next = {
    shopName: normalizeText(payload.shopName || payload.businessName),
    businessName: normalizeText(payload.shopName || payload.businessName),
    ownerName: normalizeText(payload.ownerName || payload.fullName),
    fullName: normalizeText(payload.ownerName || payload.fullName),
    mobile: normalizeText(payload.mobile),
    alternateMobile: normalizeText(payload.alternateMobile),
    area: normalizeText(payload.area),
    address: normalizeText(payload.address),
    idProofType: normalizeText(payload.idProofType),
    idProofNumber: normalizeText(payload.idProofNumber),
    notes: normalizeText(payload.notes),
    status: payload.status || current.status || 'active',
    documentPhotoUrl:
      payload.documentPhotoUrl === undefined
        ? current.documentPhotoUrl || ''
        : normalizeText(payload.documentPhotoUrl),
    updatedAt: serverTimestamp(),
  }

  next.shopNameLower = normalizeSearchText(next.shopName)
  next.ownerNameLower = normalizeSearchText(next.ownerName)
  next.mobileSearch = normalizeSearchText(next.mobile)
  next.alternateMobileSearch = normalizeSearchText(next.alternateMobile)
  next.areaLower = normalizeSearchText(next.area)
  next.searchKeywords = makeSearchKeywords(
    next.shopName,
    next.ownerName,
    next.mobile,
    next.alternateMobile,
    next.area,
    customerId,
  )

  if (payload.profilePhotoUrl !== undefined || payload.photoUrl !== undefined || payload.photo !== undefined) {
    const profilePhotoUrl = normalizeText(payload.profilePhotoUrl || payload.photoUrl || payload.photo)
    next.profilePhotoUrl = profilePhotoUrl
    next.photoUrl = profilePhotoUrl
    next.photo = profilePhotoUrl
  }
  if (payload.assignedCollectorId !== undefined) {
    next.assignedCollectorId = normalizeText(payload.assignedCollectorId)
    next.assignedCollectorName = normalizeText(payload.assignedCollectorName)
    next.legacyFinanceShadow = true
  }
  if (payload.joiningDate !== undefined) {
    next.joiningDate = payload.joiningDate || null
    next.legacyFinanceShadow = true
  }
  if (payload.dailyAmount !== undefined && payload.dailyAmount !== '') {
    const dailyAmountPaise = moneyToPaise(payload.dailyAmount)
    next.dailyAmount = paiseToMoney(dailyAmountPaise)
    next.dailyAmountPaise = dailyAmountPaise
    next.legacyFinanceShadow = true
  }

  await customerReference.set(next, { merge: true })

  const accountUpdates = {}
  if (payload.assignedCollectorId !== undefined) {
    accountUpdates.collectorId = normalizeText(payload.assignedCollectorId)
    accountUpdates.collectorName = normalizeText(payload.assignedCollectorName)
  }
  if (payload.joiningDate !== undefined) {
    accountUpdates.startDate = payload.joiningDate || null
  }
  if (payload.dailyAmount !== undefined && payload.dailyAmount !== '') {
    const dailyAmountPaise = moneyToPaise(payload.dailyAmount)
    accountUpdates.dailyAmount = paiseToMoney(dailyAmountPaise)
    accountUpdates.dailyAmountPaise = dailyAmountPaise
    accountUpdates.monthlyAmount = paiseToMoney(dailyAmountPaise * 30)
    accountUpdates.monthlyAmountPaise = dailyAmountPaise * 30
  }
  if (Object.keys(accountUpdates).length) {
    accountUpdates.updatedAt = serverTimestamp()
    await db.collection(COLLECTIONS.bachatAccounts).doc(customerId).set(accountUpdates, { merge: true })
    const bachatUpdates = {}
    if (accountUpdates.collectorId !== undefined) {
      bachatUpdates.collectorId = accountUpdates.collectorId
    }
    if (accountUpdates.collectorName !== undefined) {
      bachatUpdates.collectorName = accountUpdates.collectorName
    }
    if (accountUpdates.dailyAmount !== undefined) {
      bachatUpdates.dailyAmount = accountUpdates.dailyAmount
      bachatUpdates.dailyAmountPaise = accountUpdates.dailyAmountPaise
      bachatUpdates.monthlyAmount = accountUpdates.monthlyAmount
      bachatUpdates.monthlyAmountPaise = accountUpdates.monthlyAmountPaise
    }
    if (accountUpdates.startDate !== undefined) {
      bachatUpdates.startDate = accountUpdates.startDate
    }
    await db.collection(COLLECTIONS.customerFinancials).doc(customerId).set(
      {
        bachat: bachatUpdates,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  }

  const updated = await customerReference.get()
  return { customer: { id: updated.id, ...plainRecord(updated.data()) } }
})

exports.enrollBachat = callable(async (payload, request) => {
  const user = await requireAdmin(request)
  const customerId = normalizeText(payload.customerId)
  if (!customerId) throw new HttpsError('invalid-argument', 'customerId is required.')

  let account
  await db.runTransaction(async (transaction) => {
    const customerReference = db.collection(COLLECTIONS.customers).doc(customerId)
    const accountReference = db.collection(COLLECTIONS.bachatAccounts).doc(customerId)
    const [customerSnapshot, accountSnapshot] = await Promise.all([
      transaction.get(customerReference),
      transaction.get(accountReference),
    ])
    if (!customerSnapshot.exists) throw new HttpsError('not-found', 'Customer record was not found.')
    if (accountSnapshot.exists && accountSnapshot.data().status !== 'closed') {
      throw new HttpsError('already-exists', 'Customer is already enrolled in Bachat.')
    }

    account = bachatAccountPayload({
      customerId,
      customer: customerSnapshot.data(),
      payload,
      user,
    })
    transaction.set(accountReference, account, { merge: true })
    updateCustomerFinancialsForBachatEnrollment(transaction, customerId, account)
    transaction.set(
      customerReference,
      {
        assignedCollectorId: account.collectorId || '',
        assignedCollectorName: account.collectorName || '',
        joiningDate: account.startDate,
        dailyAmount: account.dailyAmount,
        dailyAmountPaise: account.dailyAmountPaise,
        totalSavings: account.totalCollected || 0,
        totalSavingsPaise: account.totalCollectedPaise || 0,
        pendingAmount: account.pendingAmount || 0,
        pendingAmountPaise: account.pendingAmountPaise || 0,
        pendingDays: account.pendingDays || 0,
        overdueDays: account.overdueDays || 0,
        penaltyAmount: account.penaltyAmount || 0,
        penaltyAmountPaise: account.penaltyAmountPaise || 0,
        legacyFinanceShadow: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    setModuleSummaryDelta(transaction, 'bachat', {
      totalAccounts: accountSnapshot.exists ? 0 : 1,
      activeAccounts: account.status === 'active' ? 1 : 0,
      totalMonthlyCommitmentPaise: account.monthlyAmountPaise,
    })
  })

  return { bachatAccount: plainRecord(account) }
})

exports.recordBachatCollection = callable(async (payload, request) => {
  const user = await requireAuth(request)
  const customerId = normalizeText(payload.customerId)
  const date = payload.date || payload.collectionDate || todayKey()
  if (!customerId) throw new HttpsError('invalid-argument', 'customerId is required.')

  const collectionId = `${customerId}_${date}`
  let result

  await db.runTransaction(async (transaction) => {
    const accountReference = db.collection(COLLECTIONS.bachatAccounts).doc(customerId)
    const customerReference = db.collection(COLLECTIONS.customers).doc(customerId)
    const collectionReference = db.collection(COLLECTIONS.bachatCollections).doc(collectionId)
    const [accountSnapshot, customerSnapshot, existingCollection] = await Promise.all([
      transaction.get(accountReference),
      transaction.get(customerReference),
      transaction.get(collectionReference),
    ])

    if (!accountSnapshot.exists) {
      throw new HttpsError('failed-precondition', 'Customer is not enrolled in Bachat.')
    }
    if (!customerSnapshot.exists) throw new HttpsError('not-found', 'Customer record was not found.')
    if (existingCollection.exists) {
      throw new HttpsError('already-exists', 'Collection for this customer already exists for selected date.')
    }

    const account = accountSnapshot.data()
    if (account.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Bachat collection is allowed only for active accounts.')
    }
    assertCollectorAccess(user, account, 'This Bachat account is not assigned to you.')

    const expectedAmountPaise = moneyToPaise(moneyValue(account, 'dailyAmount'))
    const amountCollectedPaise = Math.max(moneyToPaise(payload.amountCollected ?? payload.amount), 0)
    const existingPendingPaise = moneyToPaise(moneyValue(account, 'pendingAmount'))
    const pendingRecoveredPaise = Math.min(
      Math.max(moneyToPaise(payload.pendingRecovered), 0),
      existingPendingPaise,
    )
    const pendingCreatedPaise = Math.max(expectedAmountPaise - amountCollectedPaise, 0)
    const totalReceivedPaise = amountCollectedPaise + pendingRecoveredPaise
    const nextPendingAmountPaise = Math.max(
      existingPendingPaise - pendingRecoveredPaise + pendingCreatedPaise,
      0,
    )
    const nextPendingDays =
      nextPendingAmountPaise === 0
        ? 0
        : Math.max(numberValue(account.pendingDays) + (pendingCreatedPaise > 0 ? 1 : 0), 0)
    const penaltyAmountPaise = nextPendingDays * FINANCE_RULES.dailyPenaltyPerDayPaise
    const status =
      amountCollectedPaise >= expectedAmountPaise
        ? 'paid'
        : amountCollectedPaise > 0
          ? 'partial'
          : 'pending'
    const collectorId = account.collectorId || user.userId
    const collectorName = account.collectorName || user.fullName || user.email || ''
    const customer = customerSnapshot.data()
    const record = {
      collectionId,
      customerId,
      accountId: customerId,
      module: 'bachat',
      customerName: customer.ownerName || customer.fullName || account.customerName || '',
      shopName: customer.shopName || customer.businessName || account.shopName || '',
      collectorId,
      collectorName,
      expectedAmount: paiseToMoney(expectedAmountPaise),
      expectedAmountPaise,
      amountCollected: paiseToMoney(amountCollectedPaise),
      amountCollectedPaise,
      pendingRecovered: paiseToMoney(pendingRecoveredPaise),
      pendingRecoveredPaise,
      pendingCreated: paiseToMoney(pendingCreatedPaise),
      pendingCreatedPaise,
      amount: paiseToMoney(totalReceivedPaise),
      amountPaise: totalReceivedPaise,
      paymentMethod: payload.paymentMethod || 'cash',
      collectionDate: date,
      date,
      status,
      overdueDays: daysBetween(date, todayKey()),
      penaltyAmount: 0,
      penaltyAmountPaise: 0,
      remarks: normalizeText(payload.remarks),
      createdById: user.userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    transaction.set(collectionReference, record)
    transaction.update(accountReference, {
      totalCollected: increment(paiseToMoney(totalReceivedPaise)),
      totalCollectedPaise: increment(totalReceivedPaise),
      pendingAmount: paiseToMoney(nextPendingAmountPaise),
      pendingAmountPaise: nextPendingAmountPaise,
      pendingDays: nextPendingDays,
      overdueDays: nextPendingDays,
      penaltyAmount: paiseToMoney(penaltyAmountPaise),
      penaltyAmountPaise,
      lastCollectionDate: date,
      lastDailySyncDate: date,
      lastPenaltyUpdated: todayKey(),
      updatedAt: serverTimestamp(),
    })
    transaction.set(
      db.collection(COLLECTIONS.bachatPenalties).doc(`bachat_${customerId}`),
      {
        penaltyId: `bachat_${customerId}`,
        type: 'bachat',
        status: nextPendingAmountPaise > 0 ? 'active' : 'resolved',
        customerId,
        accountId: customerId,
        customerName: record.customerName,
        shopName: record.shopName,
        collectorId,
        collectorName,
        overdueDays: nextPendingDays,
        penaltyAmount: paiseToMoney(penaltyAmountPaise),
        penaltyAmountPaise,
        pendingAmount: paiseToMoney(nextPendingAmountPaise),
        pendingAmountPaise: nextPendingAmountPaise,
        lastPenaltyUpdated: todayKey(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    transaction.set(
      db.collection(COLLECTIONS.customerFinancials).doc(customerId),
      {
        customerId,
        activeModules: arrayUnion('bachat'),
        totalBachat: increment(paiseToMoney(totalReceivedPaise)),
        totalBachatPaise: increment(totalReceivedPaise),
        pendingAmount: paiseToMoney(nextPendingAmountPaise),
        pendingAmountPaise: nextPendingAmountPaise,
        penalties: paiseToMoney(penaltyAmountPaise),
        penaltiesPaise: penaltyAmountPaise,
        bachat: {
          totalCollected: increment(paiseToMoney(totalReceivedPaise)),
          totalCollectedPaise: increment(totalReceivedPaise),
          pendingAmount: paiseToMoney(nextPendingAmountPaise),
          pendingAmountPaise: nextPendingAmountPaise,
          pendingDays: nextPendingDays,
          penaltyAmount: paiseToMoney(penaltyAmountPaise),
          penaltyAmountPaise: penaltyAmountPaise,
          lastCollectionDate: date,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    setModuleSummaryDelta(transaction, 'bachat', {
      totalCollectionsPaise: totalReceivedPaise,
      totalBachatAmountPaise: totalReceivedPaise,
      todayCollectionPaise: date === todayKey() ? totalReceivedPaise : 0,
      pendingAmountPaise: pendingCreatedPaise - pendingRecoveredPaise,
      penaltyAmountPaise,
      collectionCount: 1,
      paidCount: status === 'paid' ? 1 : 0,
      partialCount: status === 'partial' ? 1 : 0,
      pendingCount: status === 'pending' ? 1 : 0,
    })
    setFinanceDelta(transaction, {
      totalBankBalancePaise: totalReceivedPaise,
      totalBachatAmountPaise: totalReceivedPaise,
      todayCollectionPaise: date === todayKey() ? totalReceivedPaise : 0,
    })
    setDailyModuleDelta(transaction, {
      moduleId: 'bachat',
      date,
      collectorId,
      collectorName,
      fields: {
        collectionCount: 1,
        totalCollectionPaise: totalReceivedPaise,
        expectedAmountPaise,
        pendingCreatedPaise,
        pendingRecoveredPaise,
      },
    })

    transaction.set(db.collection(COLLECTIONS.dailyCollections).doc(collectionId), record, {
      merge: true,
    })
    transaction.set(
      db.collection(COLLECTIONS.dailySummaries).doc(`${date}_${collectorId || 'unassigned'}`),
      {
        summaryId: `${date}_${collectorId || 'unassigned'}`,
        date,
        collectorId,
        collectorName,
        entryCount: increment(1),
        paidCount: increment(status === 'paid' ? 1 : 0),
        partialCount: increment(status === 'partial' ? 1 : 0),
        pendingCount: increment(status === 'pending' ? 1 : 0),
        expectedAmount: increment(paiseToMoney(expectedAmountPaise)),
        expectedAmountPaise: increment(expectedAmountPaise),
        totalCollection: increment(paiseToMoney(totalReceivedPaise)),
        totalCollectionPaise: increment(totalReceivedPaise),
        pendingCreated: increment(paiseToMoney(pendingCreatedPaise)),
        pendingCreatedPaise: increment(pendingCreatedPaise),
        pendingRecovered: increment(paiseToMoney(pendingRecoveredPaise)),
        pendingRecoveredPaise: increment(pendingRecoveredPaise),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    transaction.set(
      db.collection(COLLECTIONS.penalties).doc(`daily_${customerId}`),
      {
        penaltyId: `daily_${customerId}`,
        type: 'daily',
        status: nextPendingAmountPaise > 0 ? 'active' : 'resolved',
        customerId,
        customerName: record.customerName,
        shopName: record.shopName,
        collectorId,
        collectorName,
        overdueDays: nextPendingDays,
        penaltyAmount: paiseToMoney(penaltyAmountPaise),
        penaltyAmountPaise,
        pendingAmount: paiseToMoney(nextPendingAmountPaise),
        pendingAmountPaise: nextPendingAmountPaise,
        lastPenaltyUpdated: todayKey(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    transaction.set(
      customerReference,
      {
        totalSavings: increment(paiseToMoney(totalReceivedPaise)),
        totalSavingsPaise: increment(totalReceivedPaise),
        pendingAmount: paiseToMoney(nextPendingAmountPaise),
        pendingAmountPaise: nextPendingAmountPaise,
        pendingDays: nextPendingDays,
        overdueDays: nextPendingDays,
        penaltyAmount: paiseToMoney(penaltyAmountPaise),
        penaltyAmountPaise,
        lastCollectionDate: date,
        lastDailySyncDate: date,
        lastPenaltyUpdated: todayKey(),
        legacyFinanceShadow: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )

    result = { collectionId, status, record: plainRecord(record) }
  })

  return result
})

exports.closeBachatAccount = callable(async (payload, request) => {
  const user = await requireAdmin(request)
  const customerId = normalizeText(payload.customerId)
  if (!customerId) throw new HttpsError('invalid-argument', 'customerId is required.')

  await db.runTransaction(async (transaction) => {
    const accountReference = db.collection(COLLECTIONS.bachatAccounts).doc(customerId)
    const closureReference = db.collection(COLLECTIONS.bachatClosures).doc()
    const accountSnapshot = await transaction.get(accountReference)
    if (!accountSnapshot.exists) throw new HttpsError('not-found', 'Bachat account was not found.')
    const account = accountSnapshot.data()
    if (account.status === 'closed') throw new HttpsError('failed-precondition', 'Bachat account is already closed.')

    const closure = {
      closureId: closureReference.id,
      customerId,
      accountId: customerId,
      closureType: payload.closureType || 'premature',
      payoutAmount: normalizeMoney(payload.payoutAmount ?? account.totalCollected),
      payoutAmountPaise: moneyToPaise(payload.payoutAmount ?? account.totalCollected),
      settlementDate: payload.settlementDate || todayKey(),
      remarks: normalizeText(payload.remarks),
      createdById: user.userId,
      createdAt: serverTimestamp(),
    }
    transaction.set(closureReference, closure)
    transaction.update(accountReference, {
      status: 'closed',
      closedAt: serverTimestamp(),
      closureId: closureReference.id,
      updatedAt: serverTimestamp(),
    })
    transaction.set(
      db.collection(COLLECTIONS.customerFinancials).doc(customerId),
      {
        activeModules: arrayRemove('bachat'),
        bachat: {
          status: 'closed',
          closureId: closureReference.id,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    setModuleSummaryDelta(transaction, 'bachat', {
      activeAccounts: -1,
      closedAccounts: 1,
      closurePayoutPaise: closure.payoutAmountPaise,
    })
    setFinanceDelta(transaction, {
      totalBankBalancePaise: -closure.payoutAmountPaise,
      totalMaturedPayoutsPaise: closure.payoutAmountPaise,
    })
  })

  return { customerId, status: 'closed' }
})

exports.createLoan = callable(async (payload, request) => {
  const user = await requireAdmin(request)
  const customerId = normalizeText(payload.customerId)
  if (!customerId) throw new HttpsError('invalid-argument', 'customerId is required.')
  const loanReference = db.collection(COLLECTIONS.loans).doc()
  let loan

  await db.runTransaction(async (transaction) => {
    const customerReference = db.collection(COLLECTIONS.customers).doc(customerId)
    const customerSnapshot = await transaction.get(customerReference)
    if (!customerSnapshot.exists) throw new HttpsError('not-found', 'Customer record was not found.')

    const activeLoanSnapshot = await db
      .collection(COLLECTIONS.loans)
      .where('customerId', '==', customerId)
      .where('loanStatus', '==', 'active')
      .limit(1)
      .get()
    if (!activeLoanSnapshot.empty) {
      throw new HttpsError('failed-precondition', 'Customer already has an active loan.')
    }

    loan = makeLoanRecord({
      customerId,
      customer: customerSnapshot.data(),
      payload,
      user,
      loanReference,
    })
    transaction.set(loanReference, loan)
    transaction.set(
      customerReference,
      {
        loanStatus: 'active',
        activeLoanId: loanReference.id,
        legacyFinanceShadow: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    transaction.set(
      db.collection(COLLECTIONS.customerFinancials).doc(customerId),
      {
        customerId,
        activeModules: arrayUnion('loan'),
        totalLoan: increment(loan.loanAmount),
        totalLoanPaise: increment(loan.loanAmountPaise),
        pendingAmount: increment(loan.remainingBalance),
        pendingAmountPaise: increment(loan.remainingBalancePaise),
        loan: {
          activeLoanId: loanReference.id,
          totalLoanAmount: increment(loan.loanAmount),
          totalLoanAmountPaise: increment(loan.loanAmountPaise),
          remainingBalance: increment(loan.remainingBalance),
          remainingBalancePaise: increment(loan.remainingBalancePaise),
          status: 'active',
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    setModuleSummaryDelta(transaction, 'loan', {
      totalAccounts: 1,
      activeAccounts: 1,
      totalLoanGivenPaise: loan.loanAmountPaise,
      remainingLoanBalancePaise: loan.remainingBalancePaise,
      processingFeePaise: loan.processingFeePaise,
    })
    setFinanceDelta(transaction, {
      totalBankBalancePaise: -loan.finalDisbursedAmountPaise,
      totalLoanGivenPaise: loan.loanAmountPaise,
      remainingLoanBalancePaise: loan.remainingBalancePaise,
    })
  })

  return { loan: plainRecord(loan) }
})

exports.recordEmiPayment = callable(async (payload, request) => {
  const user = await requireAuth(request)
  const loanId = normalizeText(payload.loanId)
  if (!loanId) throw new HttpsError('invalid-argument', 'loanId is required.')
  const paymentReference = db.collection(COLLECTIONS.emiPayments).doc()
  let result

  await db.runTransaction(async (transaction) => {
    const loanReference = db.collection(COLLECTIONS.loans).doc(loanId)
    const loanSnapshot = await transaction.get(loanReference)
    if (!loanSnapshot.exists) throw new HttpsError('not-found', 'Loan record was not found.')

    const loanData = loanSnapshot.data()
    if (loanData.loanStatus !== 'active') {
      throw new HttpsError('failed-precondition', 'EMI can be collected only for active loans.')
    }
    assertCollectorAccess(user, loanData, 'This loan is not assigned to you.')

    const amountPaidPaise = moneyToPaise(payload.amountPaid)
    if (amountPaidPaise <= 0) {
      throw new HttpsError('invalid-argument', 'EMI amount must be greater than zero.')
    }

    const metricsBeforePayment = calculateLoanMetrics({ id: loanSnapshot.id, ...loanData })
    const remainingBalancePaise = moneyToPaise(moneyValue(loanData, 'remainingBalance'))
    const appliedToLoanPaise = Math.min(amountPaidPaise, remainingBalancePaise)
    const nextBalancePaise = Math.max(remainingBalancePaise - appliedToLoanPaise, 0)
    const nextStatus = nextBalancePaise <= 0 ? 'completed' : 'active'
    const paidInstallments = numberValue(loanData.paidInstallments) + 1
    const nextDueDate =
      nextStatus === 'completed'
        ? loanData.dueDate || metricsBeforePayment.dueDate
        : calculateLoanMetrics({
            ...loanData,
            paidInstallments,
            remainingBalance: paiseToMoney(nextBalancePaise),
            remainingBalancePaise: nextBalancePaise,
            loanStatus: nextStatus,
          }).nextDueDate
    const metricsAfterPayment = calculateLoanMetrics({
      ...loanData,
      paidInstallments,
      remainingBalance: paiseToMoney(nextBalancePaise),
      remainingBalancePaise: nextBalancePaise,
      loanStatus: nextStatus,
      nextDueDate,
    })

    const paymentDate = payload.paymentDate || todayKey()
    const payment = {
      paymentId: paymentReference.id,
      loanId,
      customerId: loanData.customerId,
      customerName: loanData.customerName || '',
      shopName: loanData.shopName || '',
      collectorId: loanData.collectorId || user.userId,
      collectorName: loanData.collectorName || user.fullName || user.email || '',
      amountPaid: paiseToMoney(amountPaidPaise),
      amountPaidPaise,
      principalPaid: paiseToMoney(appliedToLoanPaise),
      principalPaidPaise: appliedToLoanPaise,
      paymentMethod: payload.paymentMethod || 'cash',
      paymentDate,
      remainingBalance: paiseToMoney(nextBalancePaise),
      remainingBalancePaise: nextBalancePaise,
      installmentNumber: paidInstallments,
      dueDate: metricsBeforePayment.nextDueDate,
      overdueDays: metricsBeforePayment.overdueDays,
      penaltyAmount: metricsBeforePayment.penaltyAmount,
      penaltyAmountPaise: metricsBeforePayment.penaltyAmountPaise,
      collectedById: user.userId,
      collectedByName: user.fullName || user.email || '',
      remarks: normalizeText(payload.remarks),
      createdAt: serverTimestamp(),
    }

    transaction.set(paymentReference, payment)
    transaction.update(loanReference, {
      totalPaid: increment(paiseToMoney(appliedToLoanPaise)),
      totalPaidPaise: increment(appliedToLoanPaise),
      remainingBalance: paiseToMoney(nextBalancePaise),
      remainingBalancePaise: nextBalancePaise,
      paidInstallments,
      loanStatus: nextStatus,
      lastEMIPaymentDate: paymentDate,
      nextDueDate,
      overdueDays: metricsAfterPayment.overdueDays,
      penaltyAmount: metricsAfterPayment.penaltyAmount,
      penaltyAmountPaise: metricsAfterPayment.penaltyAmountPaise,
      lastPenaltyUpdated: todayKey(),
      updatedAt: serverTimestamp(),
    })
    transaction.set(
      db.collection(COLLECTIONS.loanPenalties).doc(`loan_${loanId}`),
      {
        penaltyId: `loan_${loanId}`,
        type: 'loan',
        status:
          metricsAfterPayment.overdueDays > 0 && metricsAfterPayment.penaltyAmountPaise > 0
            ? 'active'
            : 'resolved',
        loanId,
        customerId: loanData.customerId,
        customerName: loanData.customerName || '',
        shopName: loanData.shopName || '',
        collectorId: loanData.collectorId || user.userId,
        collectorName: loanData.collectorName || '',
        overdueDays: metricsAfterPayment.overdueDays,
        penaltyAmount: metricsAfterPayment.penaltyAmount,
        penaltyAmountPaise: metricsAfterPayment.penaltyAmountPaise,
        pendingAmount: metricsAfterPayment.emiDueAmount,
        pendingAmountPaise: metricsAfterPayment.emiDueAmountPaise,
        dueDate: metricsAfterPayment.nextDueDate,
        lastPenaltyUpdated: todayKey(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    transaction.set(
      db.collection(COLLECTIONS.penalties).doc(`emi_${loanId}`),
      {
        penaltyId: `emi_${loanId}`,
        type: 'emi',
        status:
          metricsAfterPayment.overdueDays > 0 && metricsAfterPayment.penaltyAmountPaise > 0
            ? 'active'
            : 'resolved',
        loanId,
        customerId: loanData.customerId,
        customerName: loanData.customerName || '',
        shopName: loanData.shopName || '',
        collectorId: loanData.collectorId || user.userId,
        collectorName: loanData.collectorName || '',
        overdueDays: metricsAfterPayment.overdueDays,
        penaltyAmount: metricsAfterPayment.penaltyAmount,
        penaltyAmountPaise: metricsAfterPayment.penaltyAmountPaise,
        pendingAmount: metricsAfterPayment.emiDueAmount,
        pendingAmountPaise: metricsAfterPayment.emiDueAmountPaise,
        dueDate: metricsAfterPayment.nextDueDate,
        lastPenaltyUpdated: todayKey(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    transaction.set(
      db.collection(COLLECTIONS.customerFinancials).doc(loanData.customerId),
      {
        totalLoanPaid: increment(paiseToMoney(appliedToLoanPaise)),
        totalLoanPaidPaise: increment(appliedToLoanPaise),
        pendingAmountPaise: increment(-appliedToLoanPaise),
        pendingAmount: increment(-paiseToMoney(appliedToLoanPaise)),
        penalties: metricsAfterPayment.penaltyAmount,
        penaltiesPaise: metricsAfterPayment.penaltyAmountPaise,
        loan: {
          totalPaid: increment(paiseToMoney(appliedToLoanPaise)),
          totalPaidPaise: increment(appliedToLoanPaise),
          remainingBalance: paiseToMoney(nextBalancePaise),
          remainingBalancePaise: nextBalancePaise,
          status: nextStatus,
          overdueDays: metricsAfterPayment.overdueDays,
          penaltyAmount: metricsAfterPayment.penaltyAmount,
          penaltyAmountPaise: metricsAfterPayment.penaltyAmountPaise,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    if (nextStatus === 'completed') {
      transaction.set(
        db.collection(COLLECTIONS.customerFinancials).doc(loanData.customerId),
        {
          activeModules: arrayRemove('loan'),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      transaction.set(
        db.collection(COLLECTIONS.customers).doc(loanData.customerId),
        {
          loanStatus: 'completed',
          activeLoanId: '',
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    }
    setModuleSummaryDelta(transaction, 'loan', {
      totalEMICollectedPaise: appliedToLoanPaise,
      remainingLoanBalancePaise: -appliedToLoanPaise,
      todayEmiCollectionPaise: paymentDate === todayKey() ? appliedToLoanPaise : 0,
      completedLoans: nextStatus === 'completed' ? 1 : 0,
      activeAccounts: nextStatus === 'completed' ? -1 : 0,
      overdueAmountPaise: metricsAfterPayment.emiDueAmountPaise,
      penaltyAmountPaise: metricsAfterPayment.penaltyAmountPaise,
    })
    setFinanceDelta(transaction, {
      totalBankBalancePaise: appliedToLoanPaise,
      totalEMICollectedPaise: appliedToLoanPaise,
      remainingLoanBalancePaise: -appliedToLoanPaise,
      todayEmiCollectionPaise: paymentDate === todayKey() ? appliedToLoanPaise : 0,
    })
    setDailyModuleDelta(transaction, {
      moduleId: 'loan',
      date: paymentDate,
      collectorId: payment.collectorId,
      collectorName: payment.collectorName,
      fields: {
        paymentCount: 1,
        totalCollectionPaise: appliedToLoanPaise,
      },
    })

    result = { paymentId: paymentReference.id, payment: plainRecord(payment), loanStatus: nextStatus }
  })

  return result
})

exports.syncLoanPenalties = callable(async (payload, request) => {
  const user = await requireAuth(request)
  const loanId = normalizeText(payload.loanId)
  const query = loanId
    ? db.collection(COLLECTIONS.loans).where('loanId', '==', loanId).limit(1)
    : db.collection(COLLECTIONS.loans).where('loanStatus', '==', 'active').limit(100)
  const snapshot = await query.get()
  let updated = 0

  for (const loanDocument of snapshot.docs) {
    const loanData = { id: loanDocument.id, ...loanDocument.data() }
    if (user.role !== USER_ROLES.admin && loanData.collectorId !== user.userId) continue
    const metrics = calculateLoanMetrics(loanData)
    await db.runTransaction(async (transaction) => {
      transaction.update(loanDocument.ref, {
        nextDueDate: metrics.nextDueDate,
        dueDate: metrics.dueDate,
        overdueDays: metrics.overdueDays,
        penaltyAmount: metrics.penaltyAmount,
        penaltyAmountPaise: metrics.penaltyAmountPaise,
        loanStatus: metrics.loanStatus,
        lastPenaltyUpdated: todayKey(),
        updatedAt: serverTimestamp(),
      })
      transaction.set(
        db.collection(COLLECTIONS.loanPenalties).doc(`loan_${loanDocument.id}`),
        {
          penaltyId: `loan_${loanDocument.id}`,
          type: 'loan',
          status:
            metrics.overdueDays > 0 && metrics.penaltyAmountPaise > 0 ? 'active' : 'resolved',
          loanId: loanDocument.id,
          customerId: loanData.customerId,
          customerName: loanData.customerName || '',
          shopName: loanData.shopName || '',
          collectorId: loanData.collectorId || user.userId,
          collectorName: loanData.collectorName || '',
          overdueDays: metrics.overdueDays,
          penaltyAmount: metrics.penaltyAmount,
          penaltyAmountPaise: metrics.penaltyAmountPaise,
          pendingAmount: metrics.emiDueAmount,
          pendingAmountPaise: metrics.emiDueAmountPaise,
          dueDate: metrics.nextDueDate,
          lastPenaltyUpdated: todayKey(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    })
    updated += 1
  }

  return { updated }
})

const createBasicAccount = async ({ payload, request, moduleId, collectionName, summaryFields }) => {
  const user = await requireAdmin(request)
  const reference = payload.accountId
    ? db.collection(collectionName).doc(payload.accountId)
    : db.collection(collectionName).doc()
  const customerId = normalizeText(payload.customerId)
  const amountPaise = moneyToPaise(payload.amount || payload.openingAmount || payload.investmentAmount)
  const record = {
    accountId: reference.id,
    customerId,
    module: moduleId,
    amount: paiseToMoney(amountPaise),
    amountPaise,
    status: payload.status || 'active',
    createdById: user.userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...payload,
  }
  await db.runTransaction(async (transaction) => {
    transaction.set(reference, record)
    setModuleSummaryDelta(transaction, moduleId, summaryFields(amountPaise))
    if (customerId) {
      transaction.set(
        db.collection(COLLECTIONS.customerFinancials).doc(customerId),
        {
          activeModules: arrayUnion(moduleId),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    }
  })
  return { record: plainRecord(record) }
}

exports.openSavingAccount = callable((payload, request) =>
  createBasicAccount({
    payload,
    request,
    moduleId: 'saving',
    collectionName: COLLECTIONS.savingAccounts,
    summaryFields: () => ({ totalAccounts: 1, activeAccounts: 1 }),
  }),
)

exports.recordSavingTransaction = callable(async (payload, request) => {
  const user = await requireAuth(request)
  const customerId = normalizeText(payload.customerId)
  const accountReference = db.collection(COLLECTIONS.savingAccounts).doc(customerId)
  const transactionReference = db.collection(COLLECTIONS.savingTransactions).doc()
  const amountPaise = moneyToPaise(payload.amount)
  const direction = payload.type === 'withdrawal' ? -1 : 1
  await db.runTransaction(async (transaction) => {
    const accountSnapshot = await transaction.get(accountReference)
    if (!accountSnapshot.exists) throw new HttpsError('not-found', 'Saving account was not found.')
    const account = accountSnapshot.data()
    assertCollectorAccess(user, account)
    const deltaPaise = direction * amountPaise
    transaction.set(transactionReference, {
      transactionId: transactionReference.id,
      customerId,
      type: payload.type || 'deposit',
      amount: paiseToMoney(amountPaise),
      amountPaise,
      transactionDate: payload.transactionDate || todayKey(),
      paymentMethod: payload.paymentMethod || 'cash',
      remarks: normalizeText(payload.remarks),
      createdById: user.userId,
      createdAt: serverTimestamp(),
    })
    transaction.update(accountReference, {
      balance: increment(paiseToMoney(deltaPaise)),
      balancePaise: increment(deltaPaise),
      updatedAt: serverTimestamp(),
    })
    setModuleSummaryDelta(transaction, 'saving', {
      balancePaise: deltaPaise,
      transactionCount: 1,
    })
    setFinanceDelta(transaction, { totalBankBalancePaise: deltaPaise })
  })
  return { transactionId: transactionReference.id }
})

exports.openFdAccount = callable((payload, request) =>
  createBasicAccount({
    payload,
    request,
    moduleId: 'fd',
    collectionName: COLLECTIONS.fdAccounts,
    summaryFields: (amountPaise) => ({
      totalAccounts: 1,
      activeAccounts: 1,
      totalFdAmountPaise: amountPaise,
    }),
  }),
)

exports.recordFdTransaction = callable((payload, request) =>
  createBasicTransaction({
    payload,
    request,
    moduleId: 'fd',
    collectionName: COLLECTIONS.fdTransactions,
    summaryField: 'totalFdTransactionPaise',
  }),
)

exports.openDepositAccount = callable((payload, request) =>
  createBasicAccount({
    payload,
    request,
    moduleId: 'deposit',
    collectionName: COLLECTIONS.depositAccounts,
    summaryFields: (amountPaise) => ({
      totalAccounts: 1,
      activeAccounts: 1,
      totalDepositAmountPaise: amountPaise,
    }),
  }),
)

exports.recordDepositTransaction = callable((payload, request) =>
  createBasicTransaction({
    payload,
    request,
    moduleId: 'deposit',
    collectionName: COLLECTIONS.depositTransactions,
    summaryField: 'totalDepositTransactionPaise',
  }),
)

async function createBasicTransaction({ payload, request, moduleId, collectionName, summaryField }) {
  const user = await requireAuth(request)
  const reference = db.collection(collectionName).doc()
  const amountPaise = moneyToPaise(payload.amount)
  const record = {
    transactionId: reference.id,
    module: moduleId,
    customerId: normalizeText(payload.customerId),
    amount: paiseToMoney(amountPaise),
    amountPaise,
    transactionDate: payload.transactionDate || payload.date || todayKey(),
    type: payload.type || 'deposit',
    paymentMethod: payload.paymentMethod || 'cash',
    remarks: normalizeText(payload.remarks),
    createdById: user.userId,
    createdAt: serverTimestamp(),
  }
  await db.runTransaction(async (transaction) => {
    transaction.set(reference, record)
    setModuleSummaryDelta(transaction, moduleId, {
      [summaryField]: amountPaise,
      transactionCount: 1,
    })
  })
  return { record: plainRecord(record) }
}

exports.createBishiGroup = callable(async (payload, request) => {
  const user = await requireAdmin(request)
  const reference = db.collection(COLLECTIONS.bishiGroups).doc()
  const amountPaise = moneyToPaise(payload.amount || payload.roundAmount)
  const record = {
    groupId: reference.id,
    module: 'bishi',
    name: normalizeText(payload.name),
    amount: paiseToMoney(amountPaise),
    amountPaise,
    status: payload.status || 'active',
    createdById: user.userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  await db.runTransaction(async (transaction) => {
    transaction.set(reference, record)
    setModuleSummaryDelta(transaction, 'bishi', {
      groups: 1,
      activeGroups: 1,
      totalBishiAmountPaise: amountPaise,
    })
  })
  return { group: plainRecord(record) }
})

exports.addBishiMember = callable(async (payload, request) => {
  const user = await requireAdmin(request)
  const reference = db.collection(COLLECTIONS.bishiMembers).doc()
  const record = {
    memberId: reference.id,
    groupId: normalizeText(payload.groupId),
    customerId: normalizeText(payload.customerId),
    status: payload.status || 'active',
    createdById: user.userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  await reference.set(record)
  return { member: plainRecord(record) }
})

exports.recordBishiPayment = callable((payload, request) =>
  createBasicTransaction({
    payload,
    request,
    moduleId: 'bishi',
    collectionName: COLLECTIONS.bishiPayments,
    summaryField: 'totalBishiCollectionPaise',
  }),
)

exports.closeBishiRound = callable(async (payload, request) => {
  const user = await requireAdmin(request)
  const reference = db.collection(COLLECTIONS.bishiRounds).doc()
  const record = {
    roundId: reference.id,
    groupId: normalizeText(payload.groupId),
    winnerCustomerId: normalizeText(payload.winnerCustomerId),
    payoutAmount: normalizeMoney(payload.payoutAmount),
    payoutAmountPaise: moneyToPaise(payload.payoutAmount),
    roundDate: payload.roundDate || todayKey(),
    status: 'closed',
    createdById: user.userId,
    createdAt: serverTimestamp(),
  }
  await reference.set(record)
  return { round: plainRecord(record) }
})

exports.recordExpense = callable(async (payload, request) => {
  const user = await requireAdmin(request)
  const reference = db.collection(COLLECTIONS.expenses).doc()
  const amountPaise = moneyToPaise(payload.amount || payload.expenseAmount)
  const record = {
    expenseId: reference.id,
    module: 'expenses',
    category: normalizeText(payload.category),
    amount: paiseToMoney(amountPaise),
    amountPaise,
    date: payload.date || todayKey(),
    remarks: normalizeText(payload.remarks),
    createdById: user.userId,
    createdAt: serverTimestamp(),
  }
  await db.runTransaction(async (transaction) => {
    transaction.set(reference, record)
    setModuleSummaryDelta(transaction, 'expenses', {
      totalExpensesPaise: amountPaise,
      expenseCount: 1,
    })
    setFinanceDelta(transaction, {
      totalBankBalancePaise: -amountPaise,
      totalExpensesPaise: amountPaise,
    })
  })
  return { expense: plainRecord(record) }
})

exports.recordCompanyInvestment = callable(async (payload, request) => {
  const user = await requireAdmin(request)
  const reference = db.collection(COLLECTIONS.companyInvestments).doc()
  const amountPaise = moneyToPaise(payload.amount || payload.investmentAmount)
  const record = {
    investmentId: reference.id,
    module: 'investments',
    type: normalizeText(payload.type),
    name: normalizeText(payload.name),
    amount: paiseToMoney(amountPaise),
    amountPaise,
    roi: numberValue(payload.roi),
    date: payload.date || todayKey(),
    status: payload.status || 'active',
    createdById: user.userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  await db.runTransaction(async (transaction) => {
    transaction.set(reference, record)
    setModuleSummaryDelta(transaction, 'investments', {
      totalInvestmentsPaise: amountPaise,
      activeInvestments: record.status === 'active' ? 1 : 0,
    })
    setFinanceDelta(transaction, {
      totalBankBalancePaise: -amountPaise,
      totalInvestmentsPaise: amountPaise,
    })
  })
  return { investment: plainRecord(record) }
})

const legacyFinanceText = (entry) =>
  [
    entry.module,
    entry.type,
    entry.category,
    entry.kind,
    entry.name,
    entry.status,
    entry.entryType,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

const classifyLegacyFinanceEntry = (entry) => {
  const text = legacyFinanceText(entry)
  if (text.includes('expense') || text.includes('salary') || text.includes('rent')) return 'expenses'
  if (text.includes('investment') || text.includes('land') || text.includes('asset')) return 'investments'
  if (text.includes('bishi')) return 'bishi'
  if (text.includes('fd') || text.includes('fixed deposit')) return 'fd'
  if (text.includes('deposit')) return 'deposit'
  if (text.includes('withdraw')) return 'saving'
  return 'unknown'
}

exports.migrateLegacyData = callable(async (payload, request) => {
  const user = await requireAdmin(request)
  const dryRun = payload.commit !== true
  const migrationBatchId = normalizeText(payload.migrationBatchId) || `migration_${Date.now()}`
  const [customerSnapshot, collectionSnapshot, financeSnapshot] = await Promise.all([
    db.collection(COLLECTIONS.customers).limit(BATCH_LIMIT).get(),
    db.collection(COLLECTIONS.dailyCollections).limit(BATCH_LIMIT).get(),
    db.collection(COLLECTIONS.financeEntries).limit(BATCH_LIMIT).get().catch(() => ({ docs: [] })),
  ])

  const report = {
    dryRun,
    migrationBatchId,
    customersScanned: customerSnapshot.size,
    bachatAccountsToCreate: 0,
    bachatCollectionsToCreate: collectionSnapshot.size,
    financeEntriesScanned: financeSnapshot.docs.length,
    financeEntriesByModule: {},
    limit: BATCH_LIMIT,
  }

  financeSnapshot.docs.forEach((docSnapshot) => {
    const moduleId = classifyLegacyFinanceEntry(docSnapshot.data())
    report.financeEntriesByModule[moduleId] = (report.financeEntriesByModule[moduleId] || 0) + 1
  })

  customerSnapshot.docs.forEach((docSnapshot) => {
    const data = docSnapshot.data()
    if (moneyToPaise(data.dailyAmount) > 0) report.bachatAccountsToCreate += 1
  })

  if (dryRun) return report

  let batch = db.batch()
  let writeCount = 0
  const commitIfNeeded = async (force = false) => {
    if (writeCount >= 450 || (force && writeCount > 0)) {
      await batch.commit()
      batch = db.batch()
      writeCount = 0
    }
  }

  for (const customerDocument of customerSnapshot.docs) {
    const customer = customerDocument.data()
    const dailyAmountPaise = moneyToPaise(customer.dailyAmount)
    if (dailyAmountPaise <= 0) continue
    const accountReference = db.collection(COLLECTIONS.bachatAccounts).doc(customerDocument.id)
    const monthlyAmountPaise = dailyAmountPaise * 30
    const durationMonths = DEFAULT_BACHAT_DURATION_MONTHS
    batch.set(
      accountReference,
      {
        accountId: customerDocument.id,
        customerId: customerDocument.id,
        module: 'bachat',
        customerName: customer.ownerName || customer.fullName || '',
        shopName: customer.shopName || customer.businessName || '',
        collectorId: customer.assignedCollectorId || '',
        collectorName: customer.assignedCollectorName || '',
        dailyAmount: paiseToMoney(dailyAmountPaise),
        dailyAmountPaise,
        monthlyAmount: paiseToMoney(monthlyAmountPaise),
        monthlyAmountPaise,
        durationMonths,
        startDate: customer.joiningDate || customer.lastDailySyncDate || todayKey(),
        maturityDate: addMonthsKey(customer.joiningDate || customer.lastDailySyncDate || todayKey(), durationMonths),
        totalCollected: moneyValue(customer, 'totalSavings'),
        totalCollectedPaise: moneyToPaise(moneyValue(customer, 'totalSavings')),
        pendingAmount: moneyValue(customer, 'pendingAmount'),
        pendingAmountPaise: moneyToPaise(moneyValue(customer, 'pendingAmount')),
        pendingDays: numberValue(customer.pendingDays),
        overdueDays: numberValue(customer.overdueDays),
        penaltyAmount: moneyValue(customer, 'penaltyAmount'),
        penaltyAmountPaise: moneyToPaise(moneyValue(customer, 'penaltyAmount')),
        lastCollectionDate: customer.lastCollectionDate || null,
        lastDailySyncDate: customer.lastDailySyncDate || null,
        lastPenaltyUpdated: customer.lastPenaltyUpdated || null,
        status: customer.status || 'active',
        legacyId: customerDocument.id,
        migrationBatchId,
        migratedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    batch.set(
      db.collection(COLLECTIONS.customerFinancials).doc(customerDocument.id),
      {
        customerId: customerDocument.id,
        activeModules: arrayUnion('bachat'),
        totalBachat: moneyValue(customer, 'totalSavings'),
        totalBachatPaise: moneyToPaise(moneyValue(customer, 'totalSavings')),
        pendingAmount: moneyValue(customer, 'pendingAmount'),
        pendingAmountPaise: moneyToPaise(moneyValue(customer, 'pendingAmount')),
        penalties: moneyValue(customer, 'penaltyAmount'),
        penaltiesPaise: moneyToPaise(moneyValue(customer, 'penaltyAmount')),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    writeCount += 2
    await commitIfNeeded()
  }

  for (const collectionDocument of collectionSnapshot.docs) {
    batch.set(
      db.collection(COLLECTIONS.bachatCollections).doc(collectionDocument.id),
      {
        ...collectionDocument.data(),
        module: 'bachat',
        legacyId: collectionDocument.id,
        migrationBatchId,
        migratedAt: serverTimestamp(),
      },
      { merge: true },
    )
    writeCount += 1
    await commitIfNeeded()
  }

  await commitIfNeeded(true)
  await rebuildSummariesFromCollections(user.userId)
  return { ...report, dryRun: false, committed: true }
})

const sumField = (records, field) =>
  records.reduce((sum, record) => sum + numberValue(record[field]), 0)

async function rebuildSummariesFromCollections(rebuiltById) {
  const [
    bachatAccountsSnapshot,
    bachatCollectionsSnapshot,
    loanSnapshot,
    emiSnapshot,
    expensesSnapshot,
    investmentsSnapshot,
  ] = await Promise.all([
    db.collection(COLLECTIONS.bachatAccounts).limit(1000).get(),
    db.collection(COLLECTIONS.bachatCollections).limit(1000).get(),
    db.collection(COLLECTIONS.loans).limit(1000).get(),
    db.collection(COLLECTIONS.emiPayments).limit(1000).get(),
    db.collection(COLLECTIONS.expenses).limit(1000).get().catch(() => ({ docs: [] })),
    db.collection(COLLECTIONS.companyInvestments).limit(1000).get().catch(() => ({ docs: [] })),
  ])

  const bachatAccounts = bachatAccountsSnapshot.docs.map((docSnapshot) => docSnapshot.data())
  const bachatCollections = bachatCollectionsSnapshot.docs.map((docSnapshot) => docSnapshot.data())
  const loans = loanSnapshot.docs.map((docSnapshot) => docSnapshot.data())
  const emis = emiSnapshot.docs.map((docSnapshot) => docSnapshot.data())
  const expenses = expensesSnapshot.docs.map((docSnapshot) => docSnapshot.data())
  const investments = investmentsSnapshot.docs.map((docSnapshot) => docSnapshot.data())

  const totalBachatAmountPaise = sumField(bachatCollections, 'amountPaise')
  const totalLoanGivenPaise = sumField(loans, 'loanAmountPaise')
  const remainingLoanBalancePaise = sumField(loans, 'remainingBalancePaise')
  const totalEMICollectedPaise = sumField(emis, 'principalPaidPaise')
  const totalExpensesPaise = sumField(expenses, 'amountPaise')
  const totalInvestmentsPaise = sumField(investments, 'amountPaise')
  const totalBankBalancePaise =
    totalBachatAmountPaise + totalEMICollectedPaise - totalLoanGivenPaise - totalExpensesPaise - totalInvestmentsPaise

  const writePayloads = [
    [
      db.collection(COLLECTIONS.bachatSummary).doc('main'),
      {
        module: 'bachat',
        totalAccounts: bachatAccounts.length,
        activeAccounts: bachatAccounts.filter((account) => account.status === 'active').length,
        totalBachatAmountPaise,
        totalCollectionsPaise: totalBachatAmountPaise,
        pendingAmountPaise: sumField(bachatAccounts, 'pendingAmountPaise'),
        penaltyAmountPaise: sumField(bachatAccounts, 'penaltyAmountPaise'),
        rebuiltById,
        updatedAt: serverTimestamp(),
      },
    ],
    [
      db.collection(COLLECTIONS.loanSummary).doc('main'),
      {
        module: 'loan',
        totalAccounts: loans.length,
        activeAccounts: loans.filter((loan) => loan.loanStatus === 'active').length,
        totalLoanGivenPaise,
        totalEMICollectedPaise,
        remainingLoanBalancePaise,
        rebuiltById,
        updatedAt: serverTimestamp(),
      },
    ],
    [
      db.collection(COLLECTIONS.financeSummary).doc('main'),
      {
        totalBankBalancePaise,
        totalBachatAmountPaise,
        totalLoanGivenPaise,
        totalEMICollectedPaise,
        totalExpensesPaise,
        totalInvestmentsPaise,
        remainingLoanBalancePaise,
        modules: {
          bachat: {
            totalAccounts: bachatAccounts.length,
            activeAccounts: bachatAccounts.filter((account) => account.status === 'active').length,
            totalBachatAmountPaise,
            totalCollectionsPaise: totalBachatAmountPaise,
            pendingAmountPaise: sumField(bachatAccounts, 'pendingAmountPaise'),
            penaltyAmountPaise: sumField(bachatAccounts, 'penaltyAmountPaise'),
          },
          loan: {
            totalAccounts: loans.length,
            activeAccounts: loans.filter((loan) => loan.loanStatus === 'active').length,
            totalLoanGivenPaise,
            totalEMICollectedPaise,
            remainingLoanBalancePaise,
          },
          expenses: {
            totalExpensesPaise,
          },
          investments: {
            totalInvestmentsPaise,
          },
        },
        rebuildLimit: 1000,
        rebuiltById,
        updatedAt: serverTimestamp(),
      },
    ],
  ]

  const batch = db.batch()
  writePayloads.forEach(([reference, payload]) => batch.set(reference, payload, { merge: true }))
  await batch.commit()

  return {
    totalBankBalancePaise,
    totalBachatAmountPaise,
    totalLoanGivenPaise,
    totalEMICollectedPaise,
    totalExpensesPaise,
    totalInvestmentsPaise,
    remainingLoanBalancePaise,
  }
}

exports.rebuildFinanceSummaries = callable(async (_payload, request) => {
  const user = await requireAdmin(request)
  const summary = await rebuildSummariesFromCollections(user.userId)
  return { summary, limit: 1000 }
})

exports.reconcileFinanceSummaries = callable(async (_payload, request) => {
  await requireAdmin(request)
  const [summarySnapshot, rebuilt] = await Promise.all([
    db.collection(COLLECTIONS.financeSummary).doc('main').get(),
    rebuildSummariesFromCollections('reconcile'),
  ])
  const current = summarySnapshot.exists ? summarySnapshot.data() : {}
  const fields = [
    'totalBankBalancePaise',
    'totalBachatAmountPaise',
    'totalLoanGivenPaise',
    'totalEMICollectedPaise',
    'totalExpensesPaise',
    'totalInvestmentsPaise',
    'remainingLoanBalancePaise',
  ]
  return {
    fields: fields.map((field) => ({
      field,
      current: numberValue(current[field]),
      rebuilt: numberValue(rebuilt[field]),
      delta: numberValue(current[field]) - numberValue(rebuilt[field]),
    })),
  }
})
