import { FiCreditCard, FiMapPin, FiPhone, FiUser } from 'react-icons/fi'
import TableComponent from '../TableComponent'
import { formatDate } from '../../utils/date'
import { formatCurrency, formatPhone } from '../../utils/format'
import StatusBadge from './StatusBadge'

function DetailItem({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-800">{value || '-'}</dd>
    </div>
  )
}

function SummaryTile({ label, value, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-50 text-slate-900',
    emerald: 'bg-emerald-50 text-emerald-800',
    amber: 'bg-amber-50 text-amber-800',
    sky: 'bg-sky-50 text-sky-800',
  }
  return (
    <div className={`rounded-lg p-4 ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase opacity-70">{label}</p>
      <p className="mt-2 font-display text-2xl font-bold">{value}</p>
    </div>
  )
}

function CustomerProfile({ customer, collections = [], loans = [] }) {
  const collectionColumns = [
    { header: 'Date', accessor: 'date', render: (row) => formatDate(row.date || row.collection_date) },
    {
      header: 'Amount',
      accessor: 'amount',
      render: (row) =>
        formatCurrency(row.amount ?? Number(row.amountCollected || 0) + Number(row.pendingRecovered || 0)),
    },
    { header: 'Status', accessor: 'status' },
  ]

  const loanColumns = [
    {
      header: 'Loan Amount',
      accessor: 'loanAmount',
      render: (row) => formatCurrency(row.loanAmount || row.loan_amount),
    },
    { header: 'EMI', accessor: 'monthlyEMI', render: (row) => formatCurrency(row.monthlyEMI || row.emi_amount) },
    {
      header: 'Installments',
      accessor: 'paidInstallments',
      render: (row) => `${row.paidInstallments || row.paid_installments || 0}/${row.loanDurationMonths || row.total_installments || 0}`,
    },
    { header: 'Status', accessor: 'loanStatus', render: (row) => row.loanStatus || row.status },
  ]

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
              {customer.photo ? (
                <img src={customer.photo} alt={customer.shopName} className="h-full w-full object-cover" />
              ) : (
                <FiUser className="text-3xl text-slate-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="page-title truncate">{customer.shopName}</h2>
                <StatusBadge status={customer.status} />
              </div>
              <p className="mt-1 text-sm text-slate-600">Customer ID: {customer.customerId}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <p className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <FiUser /> {customer.ownerName}
                </p>
                <p className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <FiPhone /> {formatPhone(customer.mobile)}
                </p>
                <p className="inline-flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                  <FiMapPin /> {customer.address}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <h3 className="section-title mb-4">Assigned Collector</h3>
          <p className="text-lg font-semibold text-slate-900">{customer.assignedCollectorName || 'Unassigned'}</p>
          <p className="mt-2 text-sm text-slate-500">Area: {customer.area || '-'}</p>
          <p className="mt-2 text-sm text-slate-500">Joined: {formatDate(customer.joiningDate)}</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryTile label="Total Savings" value={formatCurrency(customer.totalSavings)} tone="emerald" />
        <SummaryTile label="Pending Amount" value={formatCurrency(customer.pendingAmount)} tone="amber" />
        <SummaryTile label="Pending Days" value={customer.pendingDays || 0} />
        <SummaryTile label="Loan Status" value={customer.loanStatus ? 'Active' : 'None'} tone="sky" />
      </section>

      <section className="card p-5">
        <h3 className="section-title mb-4">Personal Details</h3>
        <dl className="grid gap-4 md:grid-cols-3">
          <DetailItem label="Alternate Mobile" value={formatPhone(customer.alternateMobile)} />
          <DetailItem label="Daily Amount" value={formatCurrency(customer.dailyAmount)} />
          <DetailItem label="ID Proof" value={[customer.idProofType, customer.idProofNumber].filter(Boolean).join(' - ')} />
          <DetailItem label="Notes" value={customer.notes} />
        </dl>
      </section>

      <section className="card p-4 md:p-5">
        <h3 className="section-title mb-4">Collection History</h3>
        <TableComponent columns={collectionColumns} rows={collections} />
      </section>

      <section className="card p-4 md:p-5">
        <h3 className="section-title mb-4">Loan Summary</h3>
        <div className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600">
          <FiCreditCard /> {customer.loanStatus ? 'Customer has an active loan.' : 'No active loan for this customer.'}
        </div>
        <TableComponent columns={loanColumns} rows={loans} />
      </section>
    </div>
  )
}

export default CustomerProfile
