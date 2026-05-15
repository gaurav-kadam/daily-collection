import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import Loader from '../components/Loader'
import useAuth from '../hooks/useAuth'
import { listenPenalties } from '../services/penaltyService'
import { formatCurrency } from '../utils/format'

function PenaltyDetailsPage() {
  const { user } = useAuth()
  const [penalties, setPenalties] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return undefined

    return listenPenalties(
      user,
      (items) => {
        setPenalties(items)
        setLoading(false)
      },
      (error) => {
        toast.error(error.message)
        setLoading(false)
      },
    )
  }, [user])

  const totals = useMemo(
    () =>
      penalties.reduce(
        (accumulator, penalty) => ({
          amount: accumulator.amount + Number(penalty.penaltyAmount || 0),
          overdueDays: accumulator.overdueDays + Number(penalty.overdueDays || 0),
        }),
        { amount: 0, overdueDays: 0 },
      ),
    [penalties],
  )

  if (loading) return <Loader text="Loading penalties..." />

  return (
    <div className="space-y-6">
      <div>
        <h2 className="page-title">Penalty Details</h2>
        <p className="mt-1 text-sm text-slate-500">
          {penalties.length} active penalties, {formatCurrency(totals.amount)}
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <article className="card p-4">
          <p className="text-sm text-slate-500">Active Penalties</p>
          <p className="mt-2 font-display text-2xl font-bold text-slate-950">
            {penalties.length}
          </p>
        </article>
        <article className="card p-4">
          <p className="text-sm text-slate-500">Penalty Amount</p>
          <p className="mt-2 font-display text-2xl font-bold text-rose-700">
            {formatCurrency(totals.amount)}
          </p>
        </article>
        <article className="card p-4">
          <p className="text-sm text-slate-500">Total Overdue Days</p>
          <p className="mt-2 font-display text-2xl font-bold text-slate-950">
            {totals.overdueDays}
          </p>
        </article>
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Overdue</th>
                <th className="px-4 py-3">Pending</th>
                <th className="px-4 py-3">Penalty</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {penalties.map((penalty) => (
                <tr key={penalty.penaltyId || penalty.id}>
                  <td className="px-4 py-3">
                    <span className="badge bg-slate-100 text-slate-700">{penalty.type}</span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {penalty.customerName || penalty.shopName}
                  </td>
                  <td className="px-4 py-3 text-rose-700">{penalty.overdueDays || 0} days</td>
                  <td className="px-4 py-3">{formatCurrency(penalty.pendingAmount)}</td>
                  <td className="px-4 py-3 text-rose-700">
                    {formatCurrency(penalty.penaltyAmount)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {penalty.lastPenaltyUpdated || '-'}
                  </td>
                </tr>
              ))}
              {penalties.length === 0 && (
                <tr>
                  <td className="px-4 py-10 text-center text-slate-500" colSpan="6">
                    No active penalties
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default PenaltyDetailsPage
