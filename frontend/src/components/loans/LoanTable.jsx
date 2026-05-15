import { Link } from 'react-router-dom'
import { FiCheck, FiEye, FiTrash2, FiX } from 'react-icons/fi'
import { formatDate } from '../../utils/date'
import { formatCurrency } from '../../utils/format'
import LoanStatusBadge from './LoanStatusBadge'

function LoanTable({ loans = [], canManage = false, onApprove, onReject, onDelete }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse">
          <thead className="bg-slate-50">
            <tr>
              {['Loan ID', 'Customer Name', 'Loan Amount', 'Processing Fee', 'Remaining Balance', 'EMI Amount', 'Status', 'Loan Date', 'Actions'].map((header) => (
                <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loans.length && (
              <tr><td colSpan="9" className="px-4 py-10 text-center text-sm text-slate-500">No loans found.</td></tr>
            )}
            {loans.map((loan) => (
              <tr key={loan.id} className="border-t border-slate-100 text-sm text-slate-700">
                <td className="whitespace-nowrap px-4 py-3">{loan.loanId}</td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">{loan.customerName}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatCurrency(loan.loanAmount)}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatCurrency(loan.processingFee)}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatCurrency(loan.remainingBalance)}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatCurrency(loan.monthlyEMI)}</td>
                <td className="whitespace-nowrap px-4 py-3"><LoanStatusBadge status={loan.loanStatus} /></td>
                <td className="whitespace-nowrap px-4 py-3">{formatDate(loan.loanDate)}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link to={`/loans/${loan.id}`} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><FiEye /></Link>
                    {canManage && loan.loanStatus === 'pending' && (
                      <>
                        <button type="button" className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-50" onClick={() => onApprove(loan)}><FiCheck /></button>
                        <button type="button" className="rounded-lg p-2 text-rose-700 hover:bg-rose-50" onClick={() => onReject(loan)}><FiX /></button>
                      </>
                    )}
                    {canManage && <button type="button" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" onClick={() => onDelete(loan)}><FiTrash2 /></button>}
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

export default LoanTable
