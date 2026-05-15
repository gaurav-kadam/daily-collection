import { FiDownload, FiEdit2, FiTrash2 } from 'react-icons/fi'
import { formatDate } from '../../utils/date'
import { formatCurrency } from '../../utils/format'
import PaymentStatusBadge from './PaymentStatusBadge'

function CollectionTable({ records = [], canManage = false, onEdit, onDelete, onExport }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h3 className="section-title">Collection History</h3>
        <button type="button" onClick={onExport} className="btn-secondary inline-flex items-center gap-2">
          <FiDownload /> Export
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse">
          <thead className="bg-slate-50">
            <tr>
              {['Date', 'Customer Name', 'Shop Name', 'Amount', 'Collector Name', 'Payment Method', 'Status', 'Actions'].map((header) => (
                <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!records.length && (
              <tr>
                <td colSpan="8" className="px-4 py-10 text-center text-sm text-slate-500">
                  No collection records found.
                </td>
              </tr>
            )}
            {records.map((record) => (
              <tr key={record.id} className="border-t border-slate-100 text-sm text-slate-700">
                <td className="whitespace-nowrap px-4 py-3">{formatDate(record.date)}</td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">{record.customerName}</td>
                <td className="whitespace-nowrap px-4 py-3">{record.shopName}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatCurrency(record.amount)}</td>
                <td className="whitespace-nowrap px-4 py-3">{record.collectorName || '-'}</td>
                <td className="whitespace-nowrap px-4 py-3 capitalize">{record.paymentMethod}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <PaymentStatusBadge status={record.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button type="button" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" onClick={() => onEdit(record)}>
                      <FiEdit2 />
                    </button>
                    {canManage && (
                      <button type="button" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" onClick={() => onDelete(record)}>
                        <FiTrash2 />
                      </button>
                    )}
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

export default CollectionTable
