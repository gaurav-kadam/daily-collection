import { FiCreditCard, FiImage, FiMapPin, FiPhone, FiUser } from 'react-icons/fi'
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

function SectionHeader({ children }) {
  return <h3 className="section-title mb-4">{children}</h3>
}

function SectionTable({ columns, rows, status, emptyMessage }) {
  if (status?.loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        Loading records...
      </div>
    )
  }

  if (status?.error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {status.error}
      </div>
    )
  }

  return <TableComponent columns={columns} rows={rows} emptyMessage={emptyMessage} />
}

const numeric = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const sortByDateDesc = (records, dateField) =>
  [...records].sort((first, second) =>
    String(second[dateField] || '').localeCompare(String(first[dateField] || '')),
  )

function CustomerProfile({
  customer,
  collections = [],
  loans = [],
  emiPayments = [],
  sectionStatus = {},
}) {
  const photoUrl = customer.photoUrl || customer.photo
  const activeLoans = loans.filter((loan) => (loan.loanStatus || loan.status) === 'active')
  const completedLoans = loans.filter((loan) => (loan.loanStatus || loan.status) === 'completed')
  const outstandingLoanAmount = loans.reduce(
    (total, loan) => total + numeric(loan.remainingBalance || loan.remaining_balance),
    0,
  )
  const totalEmiPaidFromPayments = emiPayments.reduce(
    (total, payment) => total + numeric(payment.amountPaid || payment.amount || payment.paidAmount),
    0,
  )
  const totalEmiPaidFromLoans = loans.reduce(
    (total, loan) => total + numeric(loan.totalPaid || loan.total_paid),
    0,
  )
  const totalEmiPaid = totalEmiPaidFromPayments || totalEmiPaidFromLoans
  const overdueEmiCount = loans.filter((loan) => numeric(loan.overdueDays) > 0).length

  const recentPayments = sortByDateDesc(
    [
      ...collections.map((collection) => ({
        id: `collection-${collection.collectionId || collection.id}`,
        date: collection.date || collection.collection_date,
        amount:
          collection.amount ??
          numeric(collection.amountCollected) + numeric(collection.pendingRecovered),
        status: collection.status,
        paymentType: 'Daily Collection',
        collector: collection.collectorName,
      })),
      ...emiPayments.map((payment) => ({
        id: `emi-${payment.paymentId || payment.id}`,
        date: payment.paymentDate,
        amount: payment.amountPaid || payment.amount,
        status: payment.status || 'paid',
        paymentType: 'EMI',
        collector: payment.collectorName || payment.collectedByName,
      })),
    ],
    'date',
  ).slice(0, 10)

  const collectionColumns = [
    { header: 'Date', accessor: 'date', render: (row) => formatDate(row.date || row.collection_date) },
    {
      header: 'Amount Collected',
      accessor: 'amount',
      render: (row) =>
        formatCurrency(row.amount ?? numeric(row.amountCollected) + numeric(row.pendingRecovered)),
    },
    { header: 'Payment Method', accessor: 'paymentMethod', render: (row) => row.paymentMethod || '-' },
    { header: 'Status', accessor: 'status' },
    { header: 'Collector', accessor: 'collectorName', render: (row) => row.collectorName || '-' },
    {
      header: 'Pending Amount',
      accessor: 'pendingCreated',
      render: (row) => formatCurrency(row.pendingCreated || row.pendingAmount || 0),
    },
    { header: 'Remarks', accessor: 'remarks', render: (row) => row.remarks || '-' },
  ]

  const recentPaymentColumns = [
    { header: 'Date', accessor: 'date', render: (row) => formatDate(row.date) },
    { header: 'Amount', accessor: 'amount', render: (row) => formatCurrency(row.amount) },
    { header: 'Status', accessor: 'status' },
    { header: 'Payment Type', accessor: 'paymentType' },
    { header: 'Collector', accessor: 'collector', render: (row) => row.collector || '-' },
  ]

  const loanColumns = [
    {
      header: 'Loan Amount',
      accessor: 'loanAmount',
      render: (row) => formatCurrency(row.loanAmount || row.loan_amount),
    },
    {
      header: 'Processing Fee',
      accessor: 'processingFee',
      render: (row) => formatCurrency(row.processingFee || row.processing_fee),
    },
    {
      header: 'Remaining Balance',
      accessor: 'remainingBalance',
      render: (row) => formatCurrency(row.remainingBalance || row.remaining_balance),
    },
    { header: 'EMI', accessor: 'monthlyEMI', render: (row) => formatCurrency(row.monthlyEMI || row.emi_amount) },
    { header: 'Loan Status', accessor: 'loanStatus', render: (row) => row.loanStatus || row.status || '-' },
    { header: 'Loan Date', accessor: 'loanDate', render: (row) => formatDate(row.loanDate) },
    { header: 'Due Date', accessor: 'dueDate', render: (row) => formatDate(row.dueDate) },
  ]

  const emiColumns = [
    { header: 'Payment Date', accessor: 'paymentDate', render: (row) => formatDate(row.paymentDate) },
    { header: 'Amount Paid', accessor: 'amountPaid', render: (row) => formatCurrency(row.amountPaid || row.amount) },
    {
      header: 'Remaining Balance',
      accessor: 'remainingBalance',
      render: (row) => formatCurrency(row.remainingBalance || row.remaining_balance),
    },
    { header: 'Payment Method', accessor: 'paymentMethod', render: (row) => row.paymentMethod || '-' },
    { header: 'Loan Reference', accessor: 'loanId', render: (row) => row.loanId || '-' },
  ]

  const recentPaymentStatus =
    sectionStatus.collections?.loading || sectionStatus.emiPayments?.loading
      ? { loading: true, error: '' }
      : {
          loading: false,
          error: sectionStatus.collections?.error || sectionStatus.emiPayments?.error || '',
        }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={customer.shopName}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <FiUser className="text-3xl text-slate-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="page-title truncate">{customer.shopName}</h2>
                <StatusBadge status={customer.status} />
              </div>
              <p className="mt-1 text-sm text-slate-600">Customer ID: {customer.customerId || customer.id}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <p className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <FiUser /> {customer.ownerName}
                </p>
                <p className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <FiPhone /> {formatPhone(customer.mobile)}
                </p>
                <p className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <FiPhone /> {formatPhone(customer.alternateMobile)}
                </p>
                <p className="inline-flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                  <FiMapPin /> {customer.address}
                </p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <SummaryTile label="Daily Amount" value={formatCurrency(customer.dailyAmount)} />
                <SummaryTile label="Savings" value={formatCurrency(customer.totalSavings)} tone="emerald" />
                <SummaryTile label="Pending" value={formatCurrency(customer.pendingAmount)} tone="amber" />
              </div>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <SectionHeader>Assigned Collector</SectionHeader>
          <p className="text-lg font-semibold text-slate-900">{customer.assignedCollectorName || 'Unassigned'}</p>
          <p className="mt-2 text-sm text-slate-500">Area: {customer.area || '-'}</p>
          <p className="mt-2 text-sm text-slate-500">Joined: {formatDate(customer.joiningDate)}</p>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader>Finance Details</SectionHeader>
        <div className="grid gap-4 md:grid-cols-4">
          <SummaryTile label="Daily Amount" value={formatCurrency(customer.dailyAmount)} />
          <SummaryTile label="Total Savings" value={formatCurrency(customer.totalSavings)} tone="emerald" />
          <SummaryTile label="Pending Amount" value={formatCurrency(customer.pendingAmount)} tone="amber" />
          <SummaryTile label="Pending Days" value={customer.pendingDays || 0} tone="sky" />
        </div>
      </section>

      <section className="card p-5">
        <SectionHeader>Personal Details</SectionHeader>
        <dl className="grid gap-4 md:grid-cols-3">
          <DetailItem label="Mobile Number" value={formatPhone(customer.mobile)} />
          <DetailItem label="Alternate Mobile" value={formatPhone(customer.alternateMobile)} />
          <DetailItem label="Address" value={customer.address} />
          <DetailItem label="Area" value={customer.area} />
          <DetailItem label="Joining Date" value={formatDate(customer.joiningDate)} />
        </dl>
      </section>

      <section className="card p-5">
        <SectionHeader>Document Details</SectionHeader>
        <div className="grid gap-5 lg:grid-cols-[180px_1fr]">
          <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {photoUrl ? (
              <img src={photoUrl} alt={customer.shopName} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <FiImage className="text-3xl text-slate-400" />
            )}
          </div>
          <dl className="grid gap-4 md:grid-cols-2">
            <DetailItem label="ID Proof Type" value={customer.idProofType} />
            <DetailItem label="ID Proof Number" value={customer.idProofNumber} />
            <DetailItem label="Uploaded Photo" value={photoUrl ? 'Available' : 'Not uploaded'} />
          </dl>
        </div>
      </section>

      <section className="card p-5">
        <SectionHeader>Notes</SectionHeader>
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{customer.notes || 'No notes added.'}</p>
      </section>

      <section className="card p-4 md:p-5">
        <SectionHeader>Collection History</SectionHeader>
        <SectionTable
          columns={collectionColumns}
          rows={collections}
          status={sectionStatus.collections}
          emptyMessage="No collections recorded for this customer yet."
        />
      </section>

      <section className="card p-4 md:p-5">
        <SectionHeader>Recent Payment History</SectionHeader>
        <SectionTable
          columns={recentPaymentColumns}
          rows={recentPayments}
          status={recentPaymentStatus}
          emptyMessage="No recent payments recorded for this customer."
        />
      </section>

      <section className="card p-4 md:p-5">
        <div className="mb-4 flex items-center gap-2">
          <FiCreditCard className="text-slate-500" />
          <h3 className="section-title">Loan Summary</h3>
        </div>
        {sectionStatus.loans?.loading ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Loading loan summary...
          </div>
        ) : sectionStatus.loans?.error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {sectionStatus.loans.error}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
              <SummaryTile label="Total Loans" value={loans.length} />
              <SummaryTile label="Active Loans" value={activeLoans.length} tone="sky" />
              <SummaryTile label="Completed Loans" value={completedLoans.length} tone="emerald" />
              <SummaryTile label="Outstanding" value={formatCurrency(outstandingLoanAmount)} tone="amber" />
              <SummaryTile label="EMI Paid" value={formatCurrency(totalEmiPaid)} tone="emerald" />
              <SummaryTile label="Overdue EMI" value={overdueEmiCount} tone="amber" />
            </div>
            {sectionStatus.emiPayments?.error && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                EMI payment records could not be loaded, so EMI paid is calculated from loan totals.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="card p-4 md:p-5">
        <SectionHeader>Loan History</SectionHeader>
        <SectionTable
          columns={loanColumns}
          rows={loans}
          status={sectionStatus.loans}
          emptyMessage="No loans recorded for this customer."
        />
      </section>

      <section className="card p-4 md:p-5">
        <SectionHeader>EMI History</SectionHeader>
        <SectionTable
          columns={emiColumns}
          rows={emiPayments}
          status={sectionStatus.emiPayments}
          emptyMessage="No EMI payments recorded for this customer."
        />
      </section>
    </div>
  )
}

export default CustomerProfile
