export const getProcessingFee = (amount) => {
  const loanAmount = Number(amount)
  if (loanAmount >= 5000 && loanAmount <= 50000) return 5000
  return 0
}

export const getEmiAmount = (amount, installments) => {
  const totalInstallments = Number(installments)
  if (!totalInstallments || totalInstallments <= 0) return 0
  return Number(amount) / totalInstallments
}

export const getMonthlyEmi = (amount, interestRate = 5, durationMonths = 12) => {
  const principal = Number(amount || 0)
  const months = Number(durationMonths || 0)
  if (!principal || !months) return 0
  const interest = principal * (Number(interestRate || 0) / 100)
  return (principal + interest) / months
}

export const getLoanTotals = (amount, interestRate = 5, durationMonths = 12, processingFee) => {
  const loanAmount = Number(amount || 0)
  const fee = processingFee === undefined || processingFee === '' ? getProcessingFee(loanAmount) : Number(processingFee || 0)
  const monthlyEMI = getMonthlyEmi(loanAmount, interestRate, durationMonths)
  return {
    processingFee: fee,
    finalDisbursedAmount: Math.max(loanAmount - fee, 0),
    monthlyEMI,
    totalPayableAmount: monthlyEMI * Number(durationMonths || 0),
  }
}
