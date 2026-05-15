const statusStyles = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  inactive: 'bg-slate-100 text-slate-600 ring-slate-200',
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  loan: 'bg-sky-50 text-sky-700 ring-sky-200',
}

function StatusBadge({ status, label }) {
  const normalized = status || 'inactive'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${
        statusStyles[normalized] || statusStyles.inactive
      }`}
    >
      {label || normalized}
    </span>
  )
}

export default StatusBadge
