import { useCallback, useEffect, useState } from 'react'
import CollectionStats from '../components/collections/CollectionStats'
import CollectionTable from '../components/collections/CollectionTable'
import DateFilter from '../components/collections/DateFilter'
import Loader from '../components/Loader'
import collectionService from '../services/collectionService'
import useAuth from '../hooks/useAuth'
import { todayISO } from '../utils/date'

function exportCsv(records) {
  const rows = [
    ['Date', 'Customer Name', 'Shop Name', 'Amount', 'Collector Name', 'Payment Method', 'Status'],
    ...records.map((record) => [
      record.date,
      record.customerName,
      record.shopName,
      record.amount,
      record.collectorName,
      record.paymentMethod,
      record.status,
    ]),
  ]
  const blob = new Blob([rows.map((row) => row.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'collection-history.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}

function CollectionHistoryPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [records, setRecords] = useState([])
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ search: '', status: '', dateFrom: todayISO(), dateTo: todayISO() })

  const loadRecords = useCallback(async () => {
    setLoading(true)
    try {
      const data = await collectionService.getAll({ ...filters, pageSize: 100, currentUser: user })
      setRecords(data.results || [])
    } catch {
      setError('Unable to load collection history.')
    } finally {
      setLoading(false)
    }
  }, [filters, user])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  const updateFilter = (name, value) => setFilters((previous) => ({ ...previous, [name]: value }))

  return (
    <div className="space-y-6">
      <section>
        <h2 className="page-title">Collection History</h2>
        <p className="mt-1 text-sm text-slate-600">Search, filter, and export collection records.</p>
      </section>
      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      <section className="card p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_160px_320px]">
          <input
            type="search"
            value={filters.search}
            onChange={(event) => updateFilter('search', event.target.value)}
            placeholder="Search customer, shop, collector..."
            className="input-field"
          />
          <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)} className="input-field">
            <option value="">All status</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="missed">Missed</option>
          </select>
          <DateFilter dateFrom={filters.dateFrom} dateTo={filters.dateTo} onChange={updateFilter} />
        </div>
        <div className="mt-4">
          <CollectionStats records={records} />
        </div>
      </section>
      {loading ? (
        <Loader text="Loading collection history..." />
      ) : (
        <CollectionTable
          records={records}
          canManage={user?.role === 'admin'}
          onEdit={() => {}}
          onDelete={() => {}}
          onExport={() => exportCsv(records)}
        />
      )}
    </div>
  )
}

export default CollectionHistoryPage
