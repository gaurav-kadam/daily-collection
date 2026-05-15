import { Link } from 'react-router-dom'
import { FiCreditCard, FiEye } from 'react-icons/fi'
import { formatDate } from '../../utils/date'
import { formatCurrency, formatPhone } from '../../utils/format'

function PendingCustomerCard({ customer, onCollect }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-slate-900">{customer.shopName}</h3>
          <p className="text-sm text-slate-600">{customer.customerName}</p>
          <p className="mt-1 text-xs text-slate-500">{formatPhone(customer.mobile)}</p>
        </div>
        <span className="badge bg-amber-50 text-amber-700">{customer.pendingDays} days</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Pending</dt>
          <dd className="font-semibold text-amber-700">{formatCurrency(customer.pendingAmount)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Last Payment</dt>
          <dd className="font-medium text-slate-800">{customer.lastPaymentDate ? formatDate(customer.lastPaymentDate) : '-'}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-slate-500">Collector</dt>
          <dd className="font-medium text-slate-800">{customer.collectorName || '-'}</dd>
        </div>
      </dl>
      <div className="mt-4 flex gap-2">
        <button type="button" className="btn-primary inline-flex flex-1 items-center justify-center gap-2" onClick={() => onCollect(customer)}>
          <FiCreditCard /> Collect
        </button>
        <Link to={`/customers/${customer.customerId}`} className="btn-secondary inline-flex flex-1 items-center justify-center gap-2">
          <FiEye /> View
        </Link>
      </div>
    </article>
  )
}

export default PendingCustomerCard
