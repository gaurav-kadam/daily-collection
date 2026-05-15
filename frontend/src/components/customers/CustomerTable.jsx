import { Link } from 'react-router-dom'
import { FiEdit2, FiEye, FiTrash2 } from 'react-icons/fi'
import { formatCurrency, formatPhone } from '../../utils/format'
import StatusBadge from './StatusBadge'

const headerClass =
  'whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'
const cellClass = 'whitespace-nowrap px-4 py-3 text-sm text-slate-700'

function SortButton({ label, field, sortBy, sortDir, onSort }) {
  const active = sortBy === field
  return (
    <button type="button" className="inline-flex items-center gap-1" onClick={() => onSort(field)}>
      {label}
      {active && <span className="text-slate-400">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </button>
  )
}

function CustomerTable({ customers, canManage, sortBy, sortDir, onSort, onDelete }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] border-collapse">
          <thead className="bg-slate-50">
            <tr>
              <th className={headerClass}>Customer ID</th>
              <th className={headerClass}>
                <SortButton label="Shop Name" field="shopName" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              </th>
              <th className={headerClass}>
                <SortButton label="Owner Name" field="ownerName" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              </th>
              <th className={headerClass}>Mobile Number</th>
              <th className={headerClass}>
                <SortButton label="Daily Amount" field="dailyAmount" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              </th>
              <th className={headerClass}>Total Savings</th>
              <th className={headerClass}>Pending Amount</th>
              <th className={headerClass}>Assigned Collector</th>
              <th className={headerClass}>Status</th>
              <th className={headerClass}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!customers.length && (
              <tr>
                <td colSpan="10" className="px-4 py-10 text-center text-sm text-slate-500">
                  No customers found.
                </td>
              </tr>
            )}
            {customers.map((customer) => (
              <tr key={customer.id} className="border-t border-slate-100">
                <td className={cellClass}>{customer.customerId}</td>
                <td className={`${cellClass} font-semibold text-slate-900`}>{customer.shopName}</td>
                <td className={cellClass}>{customer.ownerName}</td>
                <td className={cellClass}>{formatPhone(customer.mobile)}</td>
                <td className={cellClass}>{formatCurrency(customer.dailyAmount)}</td>
                <td className={cellClass}>{formatCurrency(customer.totalSavings)}</td>
                <td className={`${cellClass} text-amber-700`}>{formatCurrency(customer.pendingAmount)}</td>
                <td className={cellClass}>{customer.assignedCollectorName || '-'}</td>
                <td className={cellClass}>
                  <StatusBadge status={customer.status} />
                </td>
                <td className={cellClass}>
                  <div className="flex items-center gap-2">
                    <Link className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" to={`/customers/${customer.id}`} title="View">
                      <FiEye />
                    </Link>
                    {canManage && (
                      <>
                        <Link
                          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                          to={`/customers/${customer.id}/edit`}
                          title="Edit"
                        >
                          <FiEdit2 />
                        </Link>
                        <button
                          type="button"
                          className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                          onClick={() => onDelete(customer)}
                          title="Delete"
                        >
                          <FiTrash2 />
                        </button>
                      </>
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

export default CustomerTable
