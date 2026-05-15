import { Link } from 'react-router-dom'
import { formatDate } from '../../utils/date'
import { formatCurrency } from '../../utils/format'

function PendingEMITable({ rows = [], onPay }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead className="bg-slate-50">
            <tr>
              {['Customer Name', 'EMI Due', 'Due Date', 'Remaining Balance', 'Pending Months', 'Actions'].map((header) => (
                <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows.length && <tr><td colSpan="6" className="px-4 py-10 text-center text-sm text-slate-500">No pending EMI customers.</td></tr>}
            {rows.map((row) => (
              <tr key={row.loanId} className="border-t border-slate-100 text-sm text-slate-700">
                <td className="px-4 py-3 font-semibold text-slate-900">{row.customerName}</td>
                <td className="px-4 py-3">{formatCurrency(row.emiDueAmount)}</td>
                <td className="px-4 py-3">{formatDate(row.dueDate)}</td>
                <td className="px-4 py-3">{formatCurrency(row.remainingBalance)}</td>
                <td className="px-4 py-3">{row.pendingMonths}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary !py-1.5" onClick={() => onPay(row)}>Add EMI</button>
                    <Link to={`/loans/${row.loanId}`} className="btn-secondary !py-1.5">View Loan</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default PendingEMITable
