import { FiAlertCircle, FiCheckCircle, FiClock } from 'react-icons/fi'
import { FaRupeeSign } from 'react-icons/fa'
import { formatCurrency } from '../../utils/format'

const cards = [
  { key: 'totalCollection', label: 'Today Collection', icon: FaRupeeSign, tone: 'emerald' },
  { key: 'totalPaidCustomers', label: 'Paid Customers', icon: FiCheckCircle, tone: 'sky' },
  { key: 'totalPendingCustomers', label: 'Pending Entries', icon: FiClock, tone: 'amber' },
  { key: 'totalMissedPayments', label: 'Missed Payments', icon: FiAlertCircle, tone: 'rose' },
]

const tones = {
  emerald: 'bg-emerald-50 text-emerald-700',
  sky: 'bg-sky-50 text-sky-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
}

function CollectionSummaryCards({ summary = {} }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        const value = card.key === 'totalCollection' ? formatCurrency(summary[card.key]) : summary[card.key] || 0
        return (
          <article key={card.key} className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">{card.label}</p>
              <span className={`rounded-lg p-2 ${tones[card.tone]}`}>
                <Icon />
              </span>
            </div>
            <p className="mt-3 font-display text-2xl font-bold text-slate-900">{value}</p>
          </article>
        )
      })}
    </section>
  )
}

export default CollectionSummaryCards
