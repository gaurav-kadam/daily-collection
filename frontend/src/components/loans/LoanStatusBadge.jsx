const styles = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  active: 'bg-sky-50 text-sky-700 ring-sky-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
  closed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}

function LoanStatusBadge({ status }) {
  const normalized = status || 'pending'
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${styles[normalized] || styles.pending}`}>
      {normalized === 'closed' ? 'completed' : normalized}
    </span>
  )
}

export default LoanStatusBadge
