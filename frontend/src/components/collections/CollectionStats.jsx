import { formatCurrency } from '../../utils/format'

function CollectionStats({ records = [] }) {
  const paid = records.filter((record) => record.status === 'paid')
  const pending = records.filter((record) => record.status === 'pending')
  const missed = records.filter((record) => record.status === 'missed')
  const total = paid.reduce((sum, record) => sum + Number(record.amount || 0), 0)

  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <div className="rounded-lg bg-slate-50 p-3">
        <p className="text-xs text-slate-500">Records</p>
        <p className="text-lg font-bold text-slate-900">{records.length}</p>
      </div>
      <div className="rounded-lg bg-emerald-50 p-3">
        <p className="text-xs text-emerald-700">Collected</p>
        <p className="text-lg font-bold text-emerald-800">{formatCurrency(total)}</p>
      </div>
      <div className="rounded-lg bg-amber-50 p-3">
        <p className="text-xs text-amber-700">Pending</p>
        <p className="text-lg font-bold text-amber-800">{pending.length}</p>
      </div>
      <div className="rounded-lg bg-rose-50 p-3">
        <p className="text-xs text-rose-700">Missed</p>
        <p className="text-lg font-bold text-rose-800">{missed.length}</p>
      </div>
    </div>
  )
}

export default CollectionStats
