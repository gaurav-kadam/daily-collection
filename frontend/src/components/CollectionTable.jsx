import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDate } from '../utils/date'
import { formatCurrency } from '../utils/format'

const statusClass = {
  paid: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-700',
  missed: 'bg-rose-50 text-rose-700',
}

function CollectionTable({ rows = [], onSearch, pagination }) {
  const [search, setSearch] = useState('')

  const visibleRows = useMemo(() => rows, [rows])

  const handleSearch = (event) => {
    const value = event.target.value
    setSearch(value)
    onSearch?.(value)
  }

  return (
    <section className="card p-4">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="section-title">Recent Collections</h3>
          <p className="text-sm text-slate-500">{pagination?.count ?? rows.length} records</p>
        </div>
        <input
          type="search"
          value={search}
          onChange={handleSearch}
          className="input-field max-w-sm"
          placeholder="Search customer or collector"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead className="bg-slate-50">
            <tr>
              {['Customer Name', 'Shop Name', 'Amount', 'Date', 'Collector Name', 'Status'].map(
                (header) => (
                  <th
                    key={header}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {header}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan="6" className="px-4 py-10 text-center text-sm text-slate-500">
                  No collection records found.
                </td>
              </tr>
            )}
            {visibleRows.map((row) => (
              <tr key={row.collectionId || row.id} className="border-t border-slate-100 text-sm">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {row.customerName || '-'}
                </td>
                <td className="px-4 py-3 text-slate-600">{row.shopName || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{formatCurrency(row.amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(row.date)}</td>
                <td className="px-4 py-3 text-slate-600">{row.collectorName || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${statusClass[row.status] ?? statusClass.pending}`}>
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.count > pagination.pageSize && (
        <div className="mt-4 flex items-center justify-end gap-3 text-sm text-slate-600">
          <span>
            Page {pagination.page} of {Math.ceil(pagination.count / pagination.pageSize)}
          </span>
          <Link to="/collections" className="font-medium text-brand-600 hover:text-brand-700">
            View all
          </Link>
        </div>
      )}
    </section>
  )
}

export default CollectionTable
