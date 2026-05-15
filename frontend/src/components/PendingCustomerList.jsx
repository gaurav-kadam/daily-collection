import { Link } from 'react-router-dom'
import { formatCurrency } from '../utils/format'

function PendingCustomerList({ customers = [], showActions = true }) {
  return (
    <section className="card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="section-title">Pending Customers</h3>
          <p className="text-sm text-slate-500">{customers.length} customers need attention</p>
        </div>
      </div>

      <div className="space-y-3">
        {customers.length === 0 && (
          <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            No pending customers for today.
          </p>
        )}
        {customers.map((customer) => (
          <article
            key={customer.customerId || customer.id}
            className="rounded-lg border border-slate-200 p-3 transition hover:border-brand-200 hover:bg-brand-50/30"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {customer.customerName || customer.ownerName}
                </p>
                <p className="truncate text-xs text-slate-500">{customer.shopName}</p>
              </div>
              <span className="badge bg-amber-50 text-amber-700">
                {customer.pendingDays} day{customer.pendingDays === 1 ? '' : 's'}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <span className="text-slate-500">Pending</span>
              <span className="text-right font-semibold text-slate-900">
                {formatCurrency(customer.pendingAmount || customer.dailyAmount)}
              </span>
              <span className="text-slate-500">Mobile</span>
              <span className="text-right text-slate-700">{customer.mobile || '-'}</span>
            </div>
            {showActions && (
              <div className="mt-3 flex gap-2">
                <Link to="/collections" className="btn-primary flex-1 text-center !py-1.5">
                  Quick Collect
                </Link>
                <Link
                  to={`/customers/${customer.customerId || customer.id}`}
                  className="btn-secondary flex-1 text-center !py-1.5"
                >
                  View Profile
                </Link>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

export default PendingCustomerList
