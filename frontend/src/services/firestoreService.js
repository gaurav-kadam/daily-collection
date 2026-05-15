export const COLLECTIONS = {
  users: 'users',
  customers: 'customers',
  dailyCollections: 'dailyCollections',
  loans: 'loans',
  emiPayments: 'emiPayments',
  notifications: 'notifications',
  dailySummaries: 'dailySummaries',
  penalties: 'penalties',
}

export const USER_ROLES = {
  admin: 'admin',
  collector: 'collector',
}

export const PAYMENT_METHODS = ['cash', 'online']
export const CUSTOMER_STATUSES = ['active', 'inactive', 'blocked']
export const LOAN_STATUSES = ['pending', 'active', 'completed', 'rejected']

export const FINANCE_RULES = {
  dailyPenaltyPerDay: 10,
  emiPenaltyPerDay: 50,
  defaultInterestRate: 0,
}

export const MONEY_SCALE = 100

export const todayKey = () => {
  const now = new Date()
  const timezoneOffset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10)
}

export const docWithId = (snapshot) => ({
  id: snapshot.id,
  ...snapshot.data(),
})

export const docsWithIds = (querySnapshot) => querySnapshot.docs.map(docWithId)

export const numberValue = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const moneyToPaise = (value) => Math.round(numberValue(value) * MONEY_SCALE)

export const paiseToMoney = (value) => numberValue(value) / MONEY_SCALE

export const normalizeMoney = (value) => paiseToMoney(moneyToPaise(value))

export const moneyValue = (record, rupeeField, paiseField = `${rupeeField}Paise`) => {
  if (record?.[paiseField] !== undefined && record?.[paiseField] !== null) {
    return paiseToMoney(record[paiseField])
  }
  return numberValue(record?.[rupeeField])
}

export const normalizeText = (value) => String(value || '').trim()

export const normalizeSearchText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export const makeSearchKeywords = (...parts) => {
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

export const parseDateKey = (value) => {
  if (!value) return null
  if (value?.toDate) return value.toDate()

  const raw = String(value)
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (match) {
    const [, year, month, day] = match
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  }

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export const dateKeyFromDate = (value) => {
  const date = value instanceof Date ? value : parseDateKey(value)
  if (!date) return todayKey()
  return date.toISOString().slice(0, 10)
}

export const addDaysKey = (dateKey, days) => {
  const date = parseDateKey(dateKey)
  if (!date) return todayKey()
  date.setUTCDate(date.getUTCDate() + Number(days || 0))
  return dateKeyFromDate(date)
}

export const addMonthsKey = (dateKey, months) => {
  const date = parseDateKey(dateKey)
  if (!date) return todayKey()
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + Number(months || 0))
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate()
  date.setUTCDate(Math.min(day, lastDay))
  return dateKeyFromDate(date)
}

export const daysBetween = (fromDateKey, toDateKey = todayKey()) => {
  const from = parseDateKey(fromDateKey)
  const to = parseDateKey(toDateKey)
  if (!from || !to) return 0
  return Math.max(Math.floor((to.getTime() - from.getTime()) / 86400000), 0)
}

export const monthStartKey = (dateKey = todayKey()) => {
  const date = parseDateKey(dateKey)
  if (!date) return todayKey().slice(0, 7) + '-01'
  return dateKeyFromDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)))
}

export const monthEndKey = (dateKey = todayKey()) => {
  const date = parseDateKey(dateKey)
  if (!date) return addDaysKey(addMonthsKey(monthStartKey(), 1), -1)
  return dateKeyFromDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)))
}

export const elapsedMonthlyInstallments = (loanDate, asOfDate = todayKey()) => {
  const start = parseDateKey(loanDate)
  const asOf = parseDateKey(asOfDate)
  if (!start || !asOf || asOf < start) return 0

  let months =
    (asOf.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (asOf.getUTCMonth() - start.getUTCMonth())

  if (asOf.getUTCDate() >= start.getUTCDate()) months += 1
  return Math.max(months, 0)
}

export const pageLimit = (value, fallback = 50, max = 200) =>
  Math.min(Math.max(numberValue(value, fallback), 1), max)
