const statusStyles = {
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  missed: 'bg-rose-50 text-rose-700 ring-rose-200',
}

function PaymentStatusBadge({ status }) {
  const normalized = status || 'pending'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${
        statusStyles[normalized] || statusStyles.pending
      }`}
    >
      {normalized}
    </span>
  )
}

export default PaymentStatusBadge
