import { formatDate } from '../../utils/date'
import { formatCurrency } from '../../utils/format'

function EMIHistoryTable({ payments = [] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead className="bg-slate-50">
            <tr>
              {['Date', 'Amount Paid', 'Method', 'Remaining Balance', 'Collected By', 'Remarks'].map((header) => (
                <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!payments.length && <tr><td colSpan="6" className="px-4 py-10 text-center text-sm text-slate-500">No EMI payments yet.</td></tr>}
            {payments.map((payment) => (
              <tr key={payment.paymentId || payment.id} className="border-t border-slate-100 text-sm text-slate-700">
                <td className="px-4 py-3">{formatDate(payment.paymentDate)}</td>
                <td className="px-4 py-3">{formatCurrency(payment.amountPaid)}</td>
                <td className="px-4 py-3 capitalize">{payment.paymentMethod}</td>
                <td className="px-4 py-3">{formatCurrency(payment.remainingBalance)}</td>
                <td className="px-4 py-3">{payment.collectedBy || '-'}</td>
                <td className="px-4 py-3">{payment.remarks || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default EMIHistoryTable
