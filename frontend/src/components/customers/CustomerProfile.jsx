import {
  FiAlertTriangle,
  FiArrowUpRight,
  FiCalendar,
  FiClock,
  FiCreditCard,
  FiDatabase,
  FiFileText,
  FiImage,
  FiMapPin,
  FiPhone,
  FiShield,
  FiUser,
} from 'react-icons/fi'
import { MdOutlinePayments } from 'react-icons/md'
import { Link } from 'react-router-dom'
import TableComponent from '../TableComponent'
import { getOptimizedImageUrl } from '../../services/cloudinaryService'
import { formatDate } from '../../utils/date'
import { formatCurrency, formatPhone } from '../../utils/format'
import StatusBadge from './StatusBadge'

const moduleTabs = [
  {
    id: 'bachat',
    flag: 'bachat',
    label: 'Bachat',
    icon: MdOutlinePayments,
    tone: 'text-cyan-700 bg-cyan-50 ring-cyan-100',
  },
  {
    id: 'dailyCollection',
    flag: 'dailyCollection',
    label: 'Daily Collection',
    icon: FiCalendar,
    tone: 'text-emerald-700 bg-emerald-50 ring-emerald-100',
  },
  {
    id: 'loan',
    flag: 'loan',
    label: 'Loan',
    icon: FiCreditCard,
    tone: 'text-indigo-700 bg-indigo-50 ring-indigo-100',
  },
  {
    id: 'fd',
    flag: 'fd',
    label: 'FD',
    icon: FiClock,
    tone: 'text-amber-700 bg-amber-50 ring-amber-100',
  },
]

const numberValue = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const moneyValue = (record, field, paiseField = `${field}Paise`) => {
  if (record?.[paiseField] !== undefined && record?.[paiseField] !== null) {
    return numberValue(record[paiseField]) / 100
  }
  return numberValue(record?.[field])
}

const identityName = (customer) =>
  customer.fullName || customer.ownerName || customer.shopName || 'Customer'

function DetailItem({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-800">{value || '-'}</dd>
    </div>
  )
}

function StatCard({ label, value, icon: Icon = FiDatabase, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-50 text-slate-900 ring-slate-100',
    emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-800 ring-amber-100',
    rose: 'bg-rose-50 text-rose-800 ring-rose-100',
    cyan: 'bg-cyan-50 text-cyan-800 ring-cyan-100',
    indigo: 'bg-indigo-50 text-indigo-800 ring-indigo-100',
  }

  return (
    <article className={`min-h-32 rounded-lg p-4 ring-1 ${tones[tone] || tones.slate}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase opacity-70">{label}</p>
          <p className="mt-2 break-words font-display text-2xl font-bold">{value}</p>
        </div>
        <Icon className="mt-1 shrink-0" />
      </div>
    </article>
  )
}

function ModuleEnrollmentEmpty({ module, onEnroll }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
      <p className="font-display text-xl font-bold text-slate-950">
        Customer not enrolled in this module
      </p>
      <p className="mt-2 text-sm text-slate-600">
        Enroll this customer before viewing {module.label} finance records.
      </p>
      <button type="button" className="btn-primary mt-5" onClick={() => onEnroll(module.id)}>
        Enroll Customer
      </button>
    </div>
  )
}

function ModuleLoading() {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
      Loading module records...
    </div>
  )
}

function ModuleError({ message }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      {message || 'Unable to load this module right now.'}
    </div>
  )
}

function BachatModule({ data, customerId }) {
  const account = data?.account || {}
  const collections = data?.collections || []
  const penalty = data?.penalty || null
  const penaltyAmount = moneyValue(account, 'penaltyAmount') || moneyValue(penalty, 'penaltyAmount')
  const collectionSavings = collections.reduce((sum, item) => sum + moneyValue(item, 'amount'), 0)
  const storedSavings =
    account.totalSavings !== undefined || account.totalSavingsPaise !== undefined
      ? moneyValue(account, 'totalSavings')
      : moneyValue(account, 'totalCollected')
  const totalBachatSavings = storedSavings || collectionSavings

  const columns = [
    { header: 'Date', accessor: 'paymentDate', render: (row) => formatDate(row.paymentDate) },
    { header: 'Amount', accessor: 'amount', render: (row) => formatCurrency(moneyValue(row, 'amount')) },
    {
      header: 'Collected',
      accessor: 'amountCollected',
      render: (row) => formatCurrency(moneyValue(row, 'amountCollected')),
    },
    {
      header: 'Pending Recovered',
      accessor: 'pendingRecovered',
      render: (row) => formatCurrency(moneyValue(row, 'pendingRecovered')),
    },
    {
      header: 'Penalty Recovered',
      accessor: 'penaltyRecovered',
      render: (row) => formatCurrency(moneyValue(row, 'penaltyRecovered')),
    },
    { header: 'Status', accessor: 'status', render: (row) => row.status || '-' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-soft md:flex-row md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
            Bachat Module
          </p>
          <h4 className="mt-1 font-display text-xl font-bold text-slate-950">
            Savings, maturity, and recovery overview
          </h4>
        </div>
        <Link
          to={`/bachat/profile/${customerId}`}
          className="btn-secondary gap-2 self-start md:self-auto"
        >
          More Info
          <FiArrowUpRight />
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Daily Amount" value={formatCurrency(moneyValue(account, 'dailyAmount'))} icon={MdOutlinePayments} tone="cyan" />
        <StatCard label="Total Bachat Savings" value={formatCurrency(totalBachatSavings)} icon={FiDatabase} tone="indigo" />
        <StatCard label="Maturity Amount" value={formatCurrency(moneyValue(account, 'maturityAmount'))} icon={FiShield} tone="emerald" />
        <StatCard label="Pending Amount" value={formatCurrency(moneyValue(account, 'pendingAmount'))} icon={FiAlertTriangle} tone="amber" />
        <StatCard label="Penalties" value={formatCurrency(penaltyAmount)} icon={FiAlertTriangle} tone="rose" />
      </div>
      <section className="grid gap-4 lg:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)]">
        <article className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <h3 className="section-title">Bachat Account Details</h3>
            <span className="rounded-lg bg-cyan-50 p-2 text-cyan-700">
              <MdOutlinePayments />
            </span>
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailItem label="Status" value={account.status} />
            <DetailItem label="Paid Months" value={account.paidMonths} />
            <DetailItem label="Missed Months" value={account.missedMonths} />
            <DetailItem label="Overdue Days" value={account.overdueDays} />
            <DetailItem label="Start Date" value={formatDate(account.startDateKey || account.startDate)} />
            <DetailItem label="End Date" value={formatDate(account.endDateKey || account.endDate)} />
            <DetailItem
              label="Closure Status"
              value={account.closureEligibility ? 'Eligible' : account.status === 'closed' ? 'Closed' : 'Active'}
            />
            <DetailItem label="Recent Penalty Status" value={penalty?.recoveryStatus || penalty?.status} />
          </dl>
        </article>
        <article className="card min-w-0 p-5">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="section-title">Recent Bachat History</h3>
              <p className="mt-1 text-sm text-slate-500">Latest saved amounts and recoveries.</p>
            </div>
            <span className="rounded-lg bg-slate-100 p-2 text-slate-700">
              <FiFileText />
            </span>
          </div>
          <TableComponent
            columns={columns}
            rows={collections}
            emptyMessage="No Bachat collections recorded for this customer."
          />
        </article>
      </section>
    </div>
  )
}

function DailyCollectionModule({ data }) {
  const account = data?.account || {}
  const collections = data?.collections || []
  const columns = [
    { header: 'Date', accessor: 'date', render: (row) => formatDate(row.date) },
    {
      header: 'Collected',
      accessor: 'amountCollected',
      render: (row) => formatCurrency(moneyValue(row, 'amountCollected')),
    },
    {
      header: 'Recovered',
      accessor: 'pendingRecovered',
      render: (row) => formatCurrency(moneyValue(row, 'pendingRecovered')),
    },
    {
      header: 'Pending Created',
      accessor: 'pendingCreated',
      render: (row) => formatCurrency(moneyValue(row, 'pendingCreated')),
    },
    { header: 'Status', accessor: 'status', render: (row) => row.status || '-' },
    { header: 'Collector', accessor: 'collectorName', render: (row) => row.collectorName || '-' },
  ]

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Daily Amount" value={formatCurrency(moneyValue(account, 'dailyAmount'))} icon={FiCalendar} tone="emerald" />
        <StatCard label="Total Collected" value={formatCurrency(moneyValue(account, 'totalCollected'))} icon={MdOutlinePayments} tone="cyan" />
        <StatCard label="Pending Amount" value={formatCurrency(moneyValue(account, 'pendingAmount'))} icon={FiAlertTriangle} tone="amber" />
        <StatCard label="Penalties" value={formatCurrency(moneyValue(account, 'penaltyAmount'))} icon={FiAlertTriangle} tone="rose" />
      </div>
      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <article className="card p-4">
          <h3 className="section-title mb-4">Daily Collection Account</h3>
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailItem label="Status" value={account.status} />
            <DetailItem label="Pending Days" value={account.pendingDays} />
            <DetailItem label="Last Collection" value={formatDate(account.lastCollectionDate)} />
            <DetailItem label="Last Sync" value={formatDate(account.lastDailySyncDate)} />
            <DetailItem label="Collector" value={account.collectorName || account.collectorId} />
          </dl>
        </article>
        <article className="card p-4">
          <h3 className="section-title mb-4">Collection And Recovery History</h3>
          <TableComponent
            columns={columns}
            rows={collections}
            emptyMessage="No Daily Collection records found for this customer."
          />
        </article>
      </section>
    </div>
  )
}

function LoanModule({ data }) {
  const account = data?.account || {}
  const payments = data?.payments || []
  const columns = [
    { header: 'Payment Date', accessor: 'paymentDate', render: (row) => formatDate(row.paymentDate) },
    { header: 'Amount Paid', accessor: 'amountPaid', render: (row) => formatCurrency(moneyValue(row, 'amountPaid')) },
    { header: 'Principal', accessor: 'principalPaid', render: (row) => formatCurrency(moneyValue(row, 'principalPaid')) },
    {
      header: 'Remaining Balance',
      accessor: 'remainingBalance',
      render: (row) => formatCurrency(moneyValue(row, 'remainingBalance')),
    },
    { header: 'Method', accessor: 'paymentMethod', render: (row) => row.paymentMethod || '-' },
    { header: 'Loan Ref', accessor: 'loanId', render: (row) => row.loanId || '-' },
  ]

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Principal" value={formatCurrency(moneyValue(account, 'principal'))} icon={FiCreditCard} tone="indigo" />
        <StatCard label="EMI" value={formatCurrency(moneyValue(account, 'monthlyEMI'))} icon={MdOutlinePayments} tone="cyan" />
        <StatCard label="Remaining Balance" value={formatCurrency(moneyValue(account, 'remainingBalance'))} icon={FiAlertTriangle} tone="amber" />
        <StatCard label="Overdue Days" value={numberValue(account.overdueDays)} icon={FiClock} tone="rose" />
      </div>
      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <article className="card p-4">
          <h3 className="section-title mb-4">Loan Account</h3>
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailItem label="Status" value={account.status} />
            <DetailItem label="Interest Rate" value={account.interestRate ? `${account.interestRate}%` : '-'} />
            <DetailItem label="Active Loan ID" value={account.activeLoanId} />
            <DetailItem label="Collector" value={account.collectorName || account.collectorId} />
          </dl>
        </article>
        <article className="card p-4">
          <h3 className="section-title mb-4">EMI History</h3>
          <TableComponent columns={columns} rows={payments} emptyMessage="No EMI payments recorded for this customer." />
        </article>
      </section>
    </div>
  )
}

function FdModule({ data }) {
  const account = data?.account || {}

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="FD Amount" value={formatCurrency(moneyValue(account, 'fdAmount') || moneyValue(account, 'principal') || moneyValue(account, 'amount'))} icon={FiDatabase} tone="amber" />
        <StatCard label="Interest" value={account.interestRate ? `${account.interestRate}%` : formatCurrency(moneyValue(account, 'interestAmount'))} icon={FiShield} tone="emerald" />
        <StatCard label="Maturity" value={formatCurrency(moneyValue(account, 'maturityAmount'))} icon={FiClock} tone="cyan" />
        <StatCard label="Payout Status" value={account.payoutStatus || account.status || '-'} icon={FiFileText} tone="slate" />
      </div>
      <article className="card p-4">
        <h3 className="section-title mb-4">FD Account Details</h3>
        <dl className="grid gap-4 md:grid-cols-3">
          <DetailItem label="Start Date" value={formatDate(account.startDate || account.startDateKey)} />
          <DetailItem label="End Date" value={formatDate(account.endDate || account.endDateKey || account.maturityDate)} />
          <DetailItem label="Maturity Date" value={formatDate(account.maturityDate)} />
          <DetailItem label="Account Status" value={account.status} />
          <DetailItem label="Payout Status" value={account.payoutStatus} />
          <DetailItem label="Collector" value={account.collectorName || account.collectorId} />
        </dl>
      </article>
    </div>
  )
}

function ModuleContent({ activeModule, module, enrolled, data, status, onEnrollModule, customerId }) {
  if (!enrolled) return <ModuleEnrollmentEmpty module={module} onEnroll={onEnrollModule} />
  if (status?.loading) return <ModuleLoading />
  if (status?.error) return <ModuleError message={status.error} />
  if (!data) return <ModuleLoading />
  if (data && !data.account) {
    return <ModuleError message={`${module.label} enrollment exists, but no module account record was found.`} />
  }

  if (activeModule === 'bachat') return <BachatModule data={data} customerId={customerId} />
  if (activeModule === 'dailyCollection') return <DailyCollectionModule data={data} />
  if (activeModule === 'loan') return <LoanModule data={data} />
  if (activeModule === 'fd') return <FdModule data={data} />
  return null
}

function CustomerProfile({
  customer,
  activeModule,
  onModuleChange,
  moduleData = {},
  moduleStatus = {},
  onEnrollModule,
}) {
  const profilePhotoUrl = getOptimizedImageUrl(
    customer.profilePhotoUrl || customer.photoUrl || customer.photo,
    { width: 192, height: 192, crop: 'fill' },
  )
  const documentPhotoUrl = getOptimizedImageUrl(customer.documentPhotoUrl, {
    width: 480,
    height: 360,
    crop: 'fit',
  })
  const activeTab = moduleTabs.find((item) => item.id === activeModule) || moduleTabs[0]
  const moduleFlags = customer.moduleFlags || {}
  const activeEnrolled = Boolean(moduleFlags[activeTab.flag])
  const routeCustomerId = customer.customerId || customer.id

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg bg-slate-950 text-white shadow-soft">
        <div className="relative px-5 py-7 md:px-7 md:py-9">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.2),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0),rgba(20,184,166,0.12))]" />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-center">
            <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/10">
              {profilePhotoUrl ? (
                <img
                  src={profilePhotoUrl}
                  alt={identityName(customer)}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <FiUser className="text-4xl text-slate-300" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-display text-3xl font-bold tracking-normal text-white md:text-5xl">
                  {identityName(customer)}
                </h2>
                <StatusBadge status={customer.status} />
              </div>
              <p className="mt-2 text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100">
                {customer.customerId || customer.id}
              </p>
              <div className="mt-5 grid gap-3 text-sm text-slate-200 sm:grid-cols-2 xl:grid-cols-3">
                <span className="inline-flex items-center gap-2">
                  <FiPhone /> {formatPhone(customer.mobile)}
                </span>
                <span className="inline-flex items-center gap-2">
                  <FiCalendar /> Member since {formatDate(customer.joiningDate)}
                </span>
                <span className="inline-flex items-center gap-2">
                  <FiMapPin /> {customer.area || 'No area assigned'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="card p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h3 className="section-title">Customer Details</h3>
            <p className="mt-1 text-sm text-slate-500">Common identity information shared across modules.</p>
          </div>
          <span className="rounded-lg bg-slate-100 p-2.5 text-slate-700">
            <FiUser />
          </span>
        </div>
        <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <DetailItem label="Shop Name" value={customer.shopName} />
          <DetailItem label="Owner Name" value={customer.ownerName} />
          <DetailItem label="Mobile" value={formatPhone(customer.mobile)} />
          <DetailItem label="Alternate Mobile" value={formatPhone(customer.alternateMobile)} />
          <DetailItem label="Address" value={customer.address} />
          <DetailItem label="Area" value={customer.area} />
          <DetailItem label="Aadhaar" value={customer.aadhaarNumber} />
          <DetailItem label="PAN" value={customer.panNumber} />
          <DetailItem label="ID Proof Type" value={customer.idProofType || customer.kyc?.idType} />
          <DetailItem label="ID Proof Number" value={customer.idProofNumber || customer.kyc?.idNumber} />
          <DetailItem label="Assigned Collector" value={customer.assignedCollectorName || customer.assignedCollectorId} />
          <DetailItem label="Joining Date" value={formatDate(customer.joiningDate)} />
          <DetailItem label="Status" value={customer.status} />
          <DetailItem label="Document" value={documentPhotoUrl ? 'Available' : 'Not uploaded'} />
          <DetailItem label="Notes" value={customer.notes || 'No notes added.'} />
        </dl>
        {documentPhotoUrl && (
          <div className="mt-5 flex items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <FiImage className="text-slate-400" />
            Document image is available on the customer record.
          </div>
        )}
      </section>

      <section className="card p-3">
        <div className="flex gap-2 overflow-x-auto">
          {moduleTabs.map((module) => {
            const Icon = module.icon
            const selected = module.id === activeTab.id
            const enrolled = Boolean(moduleFlags[module.flag])
            return (
              <button
                key={module.id}
                type="button"
                className={`flex min-w-44 items-center justify-between gap-3 rounded-lg px-4 py-3 text-left text-sm font-semibold ring-1 transition ${
                  selected
                    ? `${module.tone} shadow-sm`
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                }`}
                onClick={() => onModuleChange(module.id)}
              >
                <span className="inline-flex items-center gap-2">
                  <Icon />
                  {module.label}
                </span>
                <span className={`h-2 w-2 rounded-full ${enrolled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-col justify-between gap-2 md:flex-row md:items-end">
          <div>
            <h3 className="section-title">{activeTab.label}</h3>
            <p className="text-sm text-slate-500">Only {activeTab.label} module records are loaded here.</p>
          </div>
        </div>
        <ModuleContent
          activeModule={activeTab.id}
          module={activeTab}
          enrolled={activeEnrolled}
          data={moduleData[activeTab.id]}
          status={moduleStatus[activeTab.id]}
          onEnrollModule={onEnrollModule}
          customerId={routeCustomerId}
        />
      </section>
    </div>
  )
}

export default CustomerProfile
