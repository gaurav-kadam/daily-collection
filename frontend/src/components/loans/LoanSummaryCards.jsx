import { FiCheckCircle, FiClock, FiCreditCard, FiTrendingDown } from 'react-icons/fi'
import { formatCurrency } from '../../utils/format'

function LoanSummaryCards({ loans = [] }) {
  const active = loans.filter((loan) => loan.loanStatus === 'active')
  const pending = loans.filter((loan) => loan.loanStatus === 'pending')
  const completed = loans.filter((loan) => loan.loanStatus === 'completed')
  const outstanding = active.reduce((sum, loan) => sum + Number(loan.remainingBalance || 0), 0)
  const cards = [
    { label: 'Active Loans', value: active.length, icon: FiCreditCard, tone: 'sky' },
    { label: 'Pending Approval', value: pending.length, icon: FiClock, tone: 'amber' },
    { label: 'Completed', value: completed.length, icon: FiCheckCircle, tone: 'emerald' },
    { label: 'Outstanding', value: formatCurrency(outstanding), icon: FiTrendingDown, tone: 'rose' },
  ]
  const tones = {
    sky: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
  }
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <article key={card.label} className="card p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{card.label}</p>
              <span className={`rounded-lg p-2 ${tones[card.tone]}`}><Icon /></span>
            </div>
            <p className="mt-3 font-display text-2xl font-bold text-slate-900">{card.value}</p>
          </article>
        )
      })}
    </section>
  )
}

export default LoanSummaryCards
