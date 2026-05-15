import { CURRENCY_CODE } from './constants'

export const formatCurrency = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: CURRENCY_CODE,
    maximumFractionDigits: 0,
  }).format(Number(value || 0))

export const formatPhone = (mobileNumber) => {
  if (!mobileNumber) return '-'
  return String(mobileNumber)
}
