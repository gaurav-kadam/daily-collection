import { Link } from 'react-router-dom'
import { FiEdit2, FiEye, FiTrash2 } from 'react-icons/fi'
import { formatCurrency, formatPhone } from '../../utils/format'
import StatusBadge from './StatusBadge'

function CustomerCard({ customer, canManage, onDelete }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">{customer.customerId}</p>
          <h3 className="mt-1 font-display text-lg font-semibold text-slate-900">{customer.shopName}</h3>
          <p className="text-sm text-slate-600">{customer.ownerName}</p>
        </div>
        <StatusBadge status={customer.status} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Mobile</dt>
          <dd className="font-medium text-slate-800">{formatPhone(customer.mobile)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Daily</dt>
          <dd className="font-medium text-slate-800">{formatCurrency(customer.dailyAmount)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Savings</dt>
          <dd className="font-medium text-slate-800">{formatCurrency(customer.totalSavings)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Pending</dt>
          <dd className="font-medium text-amber-700">{formatCurrency(customer.pendingAmount)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-slate-600">Collector: {customer.assignedCollectorName || '-'}</p>
      <div className="mt-4 flex items-center gap-2">
        <Link className="btn-secondary inline-flex items-center gap-2" to={`/customers/${customer.id}`}>
          <FiEye /> View
        </Link>
        {canManage && (
          <>
            <Link className="btn-secondary inline-flex items-center gap-2" to={`/customers/${customer.id}/edit`}>
              <FiEdit2 /> Edit
            </Link>
            <button
              type="button"
              className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
              onClick={() => onDelete(customer)}
            >
              <FiTrash2 />
            </button>
          </>
        )}
      </div>
    </article>
  )
}

export default CustomerCard
