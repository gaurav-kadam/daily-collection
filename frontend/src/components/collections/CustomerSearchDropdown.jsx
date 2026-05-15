import { useMemo, useState } from 'react'
import { FiSearch } from 'react-icons/fi'
import { formatCurrency, formatPhone } from '../../utils/format'

function CustomerSearchDropdown({ customers = [], value, onSelect }) {
  const [query, setQuery] = useState('')
  const selected = customers.find((customer) => customer.id === value)
  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return customers.slice(0, 8)
    return customers
      .filter((customer) =>
        [customer.ownerName, customer.shopName, customer.mobile, customer.area]
          .filter(Boolean)
          .some((item) => String(item).toLowerCase().includes(normalized)),
      )
      .slice(0, 8)
  }, [customers, query])

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">Customer Search</label>
      <div className="relative">
        <FiSearch className="pointer-events-none absolute left-3 top-3 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={selected ? `${selected.shopName} - ${selected.ownerName}` : 'Search name, shop, mobile, area'}
          className="input-field pl-10"
        />
      </div>
      <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white">
        {matches.map((customer) => (
          <button
            key={customer.id}
            type="button"
            onClick={() => {
              onSelect(customer)
              setQuery('')
            }}
            className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-b-0 hover:bg-brand-50 ${
              value === customer.id ? 'bg-brand-50' : ''
            }`}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-900">{customer.shopName}</span>
              <span className="block truncate text-xs text-slate-500">
                {customer.ownerName} | {formatPhone(customer.mobile)}
              </span>
            </span>
            <span className="shrink-0 text-sm font-semibold text-slate-700">{formatCurrency(customer.dailyAmount)}</span>
          </button>
        ))}
        {!matches.length && <p className="px-3 py-6 text-center text-sm text-slate-500">No customers found.</p>}
      </div>
    </div>
  )
}

export default CustomerSearchDropdown
