import { formatCurrency } from '../../utils/format'
import { getLoanTotals } from '../../utils/loan'

function LoanCalculator({ amount, interestRate, durationMonths, processingFee }) {
  const totals = getLoanTotals(amount, interestRate, durationMonths, processingFee)
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg bg-slate-50 p-3">
        <p className="text-xs text-slate-500">Processing Fee</p>
        <p className="mt-1 font-semibold text-slate-900">{formatCurrency(totals.processingFee)}</p>
      </div>
      <div className="rounded-lg bg-emerald-50 p-3">
        <p className="text-xs text-emerald-700">Final Disbursed</p>
        <p className="mt-1 font-semibold text-emerald-800">{formatCurrency(totals.finalDisbursedAmount)}</p>
      </div>
      <div className="rounded-lg bg-sky-50 p-3">
        <p className="text-xs text-sky-700">Monthly EMI</p>
        <p className="mt-1 font-semibold text-sky-800">{formatCurrency(totals.monthlyEMI)}</p>
      </div>
    </div>
  )
}

export default LoanCalculator
