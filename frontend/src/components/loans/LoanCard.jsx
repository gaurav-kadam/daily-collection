import { Link } from 'react-router-dom'
import { formatCurrency } from '../../utils/format'
import LoanStatusBadge from './LoanStatusBadge'

function LoanCard({ loan }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">{loan.loanId}</p>
          <h3 className="mt-1 font-semibold text-slate-900">{loan.customerName}</h3>
          <p className="text-sm text-slate-500">{loan.shopName}</p>
        </div>
        <LoanStatusBadge status={loan.loanStatus} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-slate-500">Loan</dt><dd className="font-semibold">{formatCurrency(loan.loanAmount)}</dd></div>
        <div><dt className="text-xs text-slate-500">EMI</dt><dd className="font-semibold">{formatCurrency(loan.monthlyEMI)}</dd></div>
        <div className="col-span-2"><dt className="text-xs text-slate-500">Remaining</dt><dd className="font-semibold text-rose-700">{formatCurrency(loan.remainingBalance)}</dd></div>
      </dl>
      <Link to={`/loans/${loan.id}`} className="btn-secondary mt-4 block text-center">View Loan</Link>
    </article>
  )
}

export default LoanCard
