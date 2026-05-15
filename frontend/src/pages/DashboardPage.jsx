import { memo, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  FiAlertTriangle,
  FiCalendar,
  FiClock,
  FiCreditCard,
  FiDollarSign,
  FiTrendingUp,
  FiUsers,
} from 'react-icons/fi'
import { MdOutlinePayments } from 'react-icons/md'
import { Link } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import { preloadRoute } from '../routes/routePreload'
import { listenDashboardStats, syncFinanceState } from '../services/dashboardService'
import { USER_ROLES } from '../services/firestoreService'
import { formatCurrency } from '../utils/format'

const initialStats = {
  totalCustomers: 0,
  totalSavings: 0,
  pendingAmount: 0,
  todayCollection: 0,
  todayEmiCollection: 0,
  monthlyCollection: 0,
  monthlyDailyCollection: 0,
  monthlyEmiCollection: 0,
  paidToday: 0,
  pendingToday: 0,
  totalLoans: 0,
  activeLoans: 0,
  remainingLoanBalance: 0,
  emiOverdueCount: 0,
  emiOverdueAmount: 0,
  penaltyAmount: 0,
  dailyPendingAmount: 0,
  recentCollections: [],
  recentLoanPayments: [],
  overdueCustomers: [],
  collectorPerformance: [],
  monthlySummary: {
    dailyCollection: 0,
    emiCollection: 0,
    totalCollection: 0,
    pendingAmount: 0,
  },
}

const accentMap = {
  slate: 'bg-slate-100 text-slate-700',
  cyan: 'bg-cyan-50 text-cyan-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
  sky: 'bg-sky-50 text-sky-700',
}

const formatValue = (value, currency) => (currency ? formatCurrency(value) : value)

const StatCard = memo(function StatCard({
  title,
  value,
  caption,
  icon: Icon,
  accent = 'slate',
  to,
  currency = false,
}) {
  return (
    <Link
      to={to}
      onFocus={() => preloadRoute(to)}
      onMouseEnter={() => preloadRoute(to)}
      className="card block transform-gpu p-4 transition-[transform,border-color,box-shadow] duration-150 hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-200"
    >
      <article>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-500">{title}</p>
            <p className="mt-2 font-display text-2xl font-bold text-slate-950">
              {formatValue(value, currency)}
            </p>
            <p className="mt-1 text-xs text-slate-500">{caption}</p>
          </div>
          <span className={`rounded-lg p-3 ${accentMap[accent] || accentMap.slate}`}>
            <Icon size={21} />
          </span>
        </div>
      </article>
    </Link>
  )
})

function MoneyRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="font-semibold text-slate-950">{formatCurrency(value)}</span>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 w-40 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-48 animate-pulse rounded bg-slate-200" />
      </div>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="card p-4">
            <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-8 w-20 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-3 w-32 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </section>
    </div>
  )
}

function DashboardPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState(initialStats)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return undefined

    let isMounted = true
    syncFinanceState(user).catch((error) => {
      if (isMounted) toast.error(error.message || 'Unable to sync finance status.')
    })

    const unsubscribe = listenDashboardStats(
      user,
      (nextStats) => {
        setStats(nextStats)
        setLoading(false)
      },
      (error) => {
        toast.error(error.message)
        setLoading(false)
      },
    )

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [user])

  if (loading) {
    return <DashboardSkeleton />
  }

  const loanLink = user?.role === USER_ROLES.admin ? '/loans' : '/emi-payments'

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h2 className="page-title">Dashboard</h2>
          <p className="mt-1 text-sm text-slate-500">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Customers"
          value={stats.totalCustomers}
          caption="Open customer registry"
          icon={FiUsers}
          accent="slate"
          to="/customers"
        />
        <StatCard
          title="Pending Customers"
          value={stats.pendingToday}
          caption={formatCurrency(stats.dailyPendingAmount)}
          icon={FiClock}
          accent="amber"
          to="/pending-customers"
        />
        <StatCard
          title="Total Loans"
          value={stats.totalLoans}
          caption={`${stats.activeLoans} active`}
          icon={FiCreditCard}
          accent="sky"
          to={loanLink}
        />
        <StatCard
          title="EMI Overdue"
          value={stats.emiOverdueCount}
          caption={formatCurrency(stats.emiOverdueAmount)}
          icon={FiAlertTriangle}
          accent="rose"
          to="/emi-overdue"
        />
        <StatCard
          title="Penalty Amount"
          value={stats.penaltyAmount}
          caption="Daily and EMI penalties"
          icon={FiDollarSign}
          accent="rose"
          to="/penalties"
          currency
        />
        <StatCard
          title="Today's Collection"
          value={stats.todayCollection}
          caption={`${stats.paidToday} paid entries`}
          icon={MdOutlinePayments}
          accent="emerald"
          to="/collections/today"
          currency
        />
        <StatCard
          title="Today's EMI Collection"
          value={stats.todayEmiCollection}
          caption="Loan payments received"
          icon={FiCreditCard}
          accent="cyan"
          to="/emi-payments"
          currency
        />
        <StatCard
          title="Daily Pending Amount"
          value={stats.dailyPendingAmount}
          caption={`${stats.pendingToday} customers pending`}
          icon={FiCalendar}
          accent="amber"
          to="/pending-customers"
          currency
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="card p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="section-title">Monthly Collection Summary</h3>
            <Link to="/collection-history" className="text-sm font-semibold text-cyan-700">
              View history
            </Link>
          </div>
          <div className="space-y-3">
            <MoneyRow label="Daily collections" value={stats.monthlySummary.dailyCollection} />
            <MoneyRow label="EMI collections" value={stats.monthlySummary.emiCollection} />
            <MoneyRow label="Total collected" value={stats.monthlySummary.totalCollection} />
            <MoneyRow label="Pending amount" value={stats.monthlySummary.pendingAmount} />
          </div>
        </article>

        <article className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="section-title">Overdue Customers List</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Shop</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Days</th>
                  <th className="px-4 py-3">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {stats.overdueCustomers.map((customer) => (
                  <tr key={customer.customerId || customer.id}>
                    <td className="px-4 py-3 font-semibold text-slate-950">{customer.shopName}</td>
                    <td className="px-4 py-3 text-slate-600">{customer.ownerName}</td>
                    <td className="px-4 py-3 text-slate-900">{customer.pendingDays}</td>
                    <td className="px-4 py-3 text-rose-700">
                      {formatCurrency(customer.pendingAmount)}
                    </td>
                  </tr>
                ))}
                {stats.overdueCustomers.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan="4">
                      No overdue customers
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="section-title">Recent Loan Payments</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {stats.recentLoanPayments.map((payment) => (
                  <tr key={payment.paymentId || payment.id}>
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      {payment.customerName || payment.shopName}
                    </td>
                    <td className="px-4 py-3">{formatCurrency(payment.amountPaid)}</td>
                    <td className="px-4 py-3 text-slate-600">{payment.paymentDate}</td>
                    <td className="px-4 py-3">{formatCurrency(payment.remainingBalance)}</td>
                  </tr>
                ))}
                {stats.recentLoanPayments.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan="4">
                      No EMI payments yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="section-title">Collector Performance Summary</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {stats.collectorPerformance.map((collector) => (
              <div
                key={collector.collectorId}
                className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_auto]"
              >
                <div>
                  <p className="font-semibold text-slate-950">{collector.collectorName}</p>
                  <p className="text-xs text-slate-500">{collector.entries} collection entries</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="font-semibold text-slate-950">
                    {formatCurrency(collector.totalAmount)}
                  </p>
                  <p className="text-xs text-slate-500">
                    <FiTrendingUp className="mr-1 inline" />
                    {formatCurrency(collector.emiAmount)} EMI
                  </p>
                </div>
              </div>
            ))}
            {stats.collectorPerformance.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                No collector activity this month
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="section-title">Today Entries</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Shop</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {stats.recentCollections.map((item) => (
                <tr key={item.collectionId || item.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{item.shopName}</td>
                  <td className="px-4 py-3 text-slate-600">{item.customerName}</td>
                  <td className="px-4 py-3 text-slate-900">
                    {formatCurrency(Number(item.amount || 0))}
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge bg-slate-100 text-slate-700">{item.status}</span>
                  </td>
                </tr>
              ))}
              {stats.recentCollections.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan="4">
                    No collection entries today
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

export default DashboardPage
