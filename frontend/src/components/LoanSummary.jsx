import { formatCurrency } from '../utils/format'

function LoanSummary({ loans = [], stats }) {
  const activeLoans = stats?.activeLoans ?? loans.filter((loan) => loan.loanStatus === 'active').length
  const totalLoanAmount =
    stats?.totalLoanAmount ?? loans.reduce((sum, loan) => sum + Number(loan.loanAmount || 0), 0)
  const emiDue = stats?.emiDue ?? loans.reduce((sum, loan) => sum + Number(loan.monthlyEMI || 0), 0)

  return (
    <section className="card p-4">
      <h3 className="section-title">Loan Summary</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Active Loans</p>
          <p className="mt-2 font-display text-xl font-bold text-slate-900">{activeLoans}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Loan Amount</p>
          <p className="mt-2 font-display text-xl font-bold text-slate-900">
            {formatCurrency(totalLoanAmount)}
          </p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">EMI Due</p>
          <p className="mt-2 font-display text-xl font-bold text-slate-900">
            {formatCurrency(emiDue)}
          </p>
        </div>
      </div>
    </section>
  )
}

export default LoanSummary
