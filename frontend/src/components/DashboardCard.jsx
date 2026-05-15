import { HiArrowTrendingUp } from 'react-icons/hi2'
import { formatCurrency } from '../utils/format'

const toneMap = {
  primary: 'bg-brand-50 text-brand-700 ring-brand-100',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  warning: 'bg-amber-50 text-amber-700 ring-amber-100',
  info: 'bg-sky-50 text-sky-700 ring-sky-100',
  danger: 'bg-rose-50 text-rose-700 ring-rose-100',
}

function DashboardCard({
  title,
  value,
  tone = 'primary',
  currency = false,
  icon,
  growth = 'Live',
}) {
  return (
    <article className="card transform-gpu p-4 transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm text-slate-500">{title}</p>
          <h3 className="mt-2 font-display text-2xl font-bold text-slate-900">
            {currency ? formatCurrency(value) : value}
          </h3>
        </div>
        <span className={`rounded-lg p-2.5 ring-1 ${toneMap[tone] ?? toneMap.primary}`}>
          {icon}
        </span>
      </div>
      <div className="mt-4 inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
        <HiArrowTrendingUp className="text-emerald-600" />
        {growth}
      </div>
    </article>
  )
}

export default DashboardCard
