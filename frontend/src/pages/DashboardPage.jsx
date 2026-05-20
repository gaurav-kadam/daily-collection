import { memo, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  FiActivity,
  FiAlertTriangle,
  FiArrowUpRight,
  FiBarChart2,
  FiBriefcase,
  FiClock,
  FiCreditCard,
  FiDatabase,
  FiDollarSign,
  FiLayers,
  FiPieChart,
  FiShield,
  FiTrendingDown,
  FiTrendingUp,
  FiUsers,
} from 'react-icons/fi'
import { MdOutlinePayments } from 'react-icons/md'
import { Link } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import { preloadRoute } from '../routes/routePreload'
import { listenDashboardStats, syncFinanceState } from '../services/dashboardService'
import { formatCurrency } from '../utils/format'

const initialStats = {
  totalCustomers: 0,
  totalSavings: 0,
  pendingAmount: 0,
  totalAvailableBankBalance: 0,
  totalLoanGiven: 0,
  totalInvestments: 0,
  totalAccounts: 0,
  monthlyExpenses: 0,
  profitLossMtd: 0,
  todayPayouts: 0,
  todayExpenses: 0,
  totalBachatAmount: 0,
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
  recentTransactions: [],
  overdueCustomers: [],
  collectorPerformance: [],
  modules: [],
  collectionTrend: [],
  collectionProgress: 0,
  lastUpdatedAt: null,
  monthlySummary: {
    dailyCollection: 0,
    emiCollection: 0,
    totalCollection: 0,
    pendingAmount: 0,
  },
}

const cardAccent = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  rose: 'bg-rose-50 text-rose-700 ring-rose-100',
  cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
}

const moduleIcons = {
  bachat: MdOutlinePayments,
  saving: FiShield,
  loan: FiCreditCard,
  fd: FiClock,
  deposit: FiDatabase,
  expenses: FiTrendingDown,
  bishi: FiLayers,
  investments: FiBriefcase,
}

const moduleTone = {
  bachat: 'from-cyan-500 to-emerald-500',
  saving: 'from-emerald-500 to-teal-500',
  loan: 'from-sky-500 to-indigo-500',
  fd: 'from-amber-500 to-orange-500',
  deposit: 'from-blue-500 to-cyan-500',
  expenses: 'from-rose-500 to-red-500',
  bishi: 'from-violet-500 to-fuchsia-500',
  investments: 'from-slate-700 to-slate-950',
}

const pieColors = ['#0891b2', '#059669', '#f59e0b', '#e11d48']

const clampPercent = (value) => Math.max(Math.min(Number(value || 0), 100), 0)

function MoneyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-soft">
      <p className="font-semibold text-slate-900">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} className="text-slate-600">
          {item.name || item.dataKey}: {formatCurrency(item.value)}
        </p>
      ))}
    </div>
  )
}

const FinanceStatCard = memo(function FinanceStatCard({
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
      className="card group block min-h-[150px] transform-gpu p-4 transition duration-150 hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-200"
    >
      <div className="flex h-full flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <span className={`rounded-lg p-2.5 ring-1 ${cardAccent[accent] || cardAccent.slate}`}>
            <Icon size={19} />
          </span>
        </div>
        <div>
          <p className="font-display text-2xl font-bold text-slate-950">
            {currency ? formatCurrency(value) : value}
          </p>
          <p className="mt-1 text-xs text-slate-500">{caption}</p>
        </div>
        <div className="flex items-center gap-1 text-xs font-semibold text-cyan-700">
          Open
          <FiArrowUpRight className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
      </div>
    </Link>
  )
})

function BalanceBanner({ stats }) {
  return (
    <section className="overflow-hidden rounded-lg bg-slate-950 text-white shadow-soft">
      <div className="relative px-5 py-8 md:px-7 md:py-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.22),transparent_35%),linear-gradient(135deg,rgba(15,23,42,0),rgba(8,145,178,0.14))]" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">
              Available Company Balance
            </p>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-normal text-white md:text-6xl">
              {formatCurrency(stats.totalAvailableBankBalance)}
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              to="/dashboard/bachat"
              onFocus={() => preloadRoute('/dashboard/bachat')}
              onMouseEnter={() => preloadRoute('/dashboard/bachat')}
              className="group rounded-lg border border-white/10 bg-white/10 px-4 py-3 backdrop-blur transition duration-150 hover:-translate-y-0.5 hover:border-cyan-200/40 hover:bg-white/15 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-cyan-200/50 md:min-w-56"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                Total Bachat Balance
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-white">
                {formatCurrency(stats.totalBachatAmount)}
              </p>
              <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-cyan-100">
                Open Bachat Dashboard
                <FiArrowUpRight className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </p>
            </Link>

            <Link
              to="/emi-payments"
              onFocus={() => preloadRoute('/emi-payments')}
              onMouseEnter={() => preloadRoute('/emi-payments')}
              className="group rounded-lg border border-white/10 bg-white/10 px-4 py-3 backdrop-blur transition duration-150 hover:-translate-y-0.5 hover:border-cyan-200/40 hover:bg-white/15 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-cyan-200/50 md:min-w-56"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                Today's EMI Collection
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-white">
                {formatCurrency(stats.todayEmiCollection)}
              </p>
              <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-cyan-100">
                Open EMI Operations
                <FiArrowUpRight className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </p>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

function ModuleCard({ module }) {
  const Icon = moduleIcons[module.id] || FiLayers

  return (
    <article className="card flex min-h-[210px] flex-col justify-between p-5">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-lg font-bold text-slate-950">{module.label}</p>
          </div>
          <span className={`rounded-lg bg-gradient-to-br p-3 text-white ${moduleTone[module.id]}`}>
            <Icon size={20} />
          </span>
        </div>

        <p className="mt-8 font-display text-3xl font-bold text-slate-950">
          {formatCurrency(module.amount)}
        </p>
      </div>
      <Link
        to={module.route}
        onFocus={() => preloadRoute(module.route)}
        onMouseEnter={() => preloadRoute(module.route)}
        className="btn-secondary mt-4 w-full gap-2"
      >
        View Dashboard
        <FiArrowUpRight />
      </Link>
    </article>
  )
}

function AnalyticsSection({ stats }) {
  const collectionMix = useMemo(
    () => [
      { name: 'Daily', value: stats.monthlySummary.dailyCollection },
      { name: 'EMI', value: stats.monthlySummary.emiCollection },
      { name: 'Pending', value: stats.monthlySummary.pendingAmount },
      { name: 'Expenses', value: stats.monthlyExpenses },
    ],
    [stats],
  )

  return (
    <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
      <article className="card p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="section-title">Collection Analytics</h3>
            <p className="text-sm text-slate-500">Daily and EMI movement for this month.</p>
          </div>
          <span className="rounded-lg bg-cyan-50 p-2.5 text-cyan-700">
            <FiBarChart2 />
          </span>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.collectionTrend}>
              <defs>
                <linearGradient id="dailyCollection" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0891b2" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#0891b2" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="emiCollection" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `INR ${value}`} />
              <Tooltip content={<MoneyTooltip />} />
              <Area
                type="monotone"
                dataKey="daily"
                name="Daily"
                stroke="#0891b2"
                strokeWidth={2}
                fill="url(#dailyCollection)"
              />
              <Area
                type="monotone"
                dataKey="emi"
                name="EMI"
                stroke="#059669"
                strokeWidth={2}
                fill="url(#emiCollection)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="card p-4">
        <div className="mb-4">
          <h3 className="section-title">Monthly Collection Summary</h3>
          <p className="text-sm text-slate-500">
            {Math.round(clampPercent(stats.collectionProgress))}% of expected movement.
          </p>
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={collectionMix}
                dataKey="value"
                nameKey="name"
                innerRadius={58}
                outerRadius={82}
                paddingAngle={3}
              >
                {collectionMix.map((entry, index) => (
                  <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatCurrency(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2">
          {collectionMix.map((item, index) => (
            <div key={item.name} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-600">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: pieColors[index % pieColors.length] }}
                />
                {item.name}
              </span>
              <span className="font-semibold text-slate-950">{formatCurrency(item.value)}</span>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}

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
      <div className="h-64 animate-pulse rounded-lg bg-slate-200" />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 9 }).map((_, index) => (
          <div key={index} className="card min-h-[150px] p-4">
            <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
            <div className="mt-7 h-8 w-24 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-3 w-32 animate-pulse rounded bg-slate-100" />
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
        setStats({ ...initialStats, ...nextStats })
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

  const summaryCards = [
    {
      title: 'Total Customers',
      value: stats.totalCustomers,
      caption: 'Customer count',
      icon: FiUsers,
      accent: 'slate',
      to: '/customers',
    },
    {
      title: 'Pending Collection',
      value: stats.dailyPendingAmount,
      caption: `${stats.pendingToday} customers pending`,
      icon: FiClock,
      accent: 'amber',
      to: '/pending-customers',
      currency: true,
    },
    {
      title: 'Monthly Collection',
      value: stats.monthlyDailyCollection,
      caption: 'Current month Bachat',
      icon: MdOutlinePayments,
      accent: 'emerald',
      to: '/collection-history',
      currency: true,
    },
    {
      title: 'Total Given Loan',
      value: stats.remainingLoanBalance,
      caption: `${stats.activeLoans} active loans`,
      icon: FiCreditCard,
      accent: 'cyan',
      to: '/dashboard/loan',
      currency: true,
    },
    {
      title: 'EMI Collection',
      value: stats.monthlyEmiCollection,
      caption: 'Current month EMI',
      icon: FiDollarSign,
      accent: 'emerald',
      to: '/emi-payments',
      currency: true,
    },
    {
      title: 'EMI Overdue',
      value: stats.emiOverdueAmount,
      caption: `${stats.emiOverdueCount} overdue loans`,
      icon: FiAlertTriangle,
      accent: 'rose',
      to: '/emi-overdue',
      currency: true,
    },
    {
      title: 'Total Investment',
      value: stats.totalInvestments,
      caption: 'Company investments',
      icon: FiBriefcase,
      accent: 'indigo',
      to: '/dashboard/investments',
      currency: true,
    },
    {
      title: 'Monthly Expenses',
      value: stats.monthlyExpenses,
      caption: 'Operational outflow',
      icon: FiTrendingDown,
      accent: 'rose',
      to: '/dashboard/expenses',
      currency: true,
    },
    {
      title: 'Profit & Loss',
      value: stats.profitLossMtd,
      caption: stats.profitLossMtd >= 0 ? 'Positive month' : 'Net outflow',
      icon: stats.profitLossMtd >= 0 ? FiTrendingUp : FiTrendingDown,
      accent: stats.profitLossMtd >= 0 ? 'emerald' : 'rose',
      to: '/dashboard/expenses',
      currency: true,
    },
  ]

  return (
    <div className="space-y-6">
      <BalanceBanner stats={stats} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map((card) => (
          <FinanceStatCard key={card.title} {...card} />
        ))}
      </section>

      <section>
        <div className="mb-3 flex flex-col justify-between gap-2 md:flex-row md:items-end">
          <div>
            <h2 className="section-title">All Modules</h2>
            <p className="text-sm text-slate-500">
              Click a module to open its focused operations dashboard.
            </p>
          </div>
          <Link to="/reports" className="btn-secondary gap-2 self-start md:self-auto">
            <FiPieChart />
            Reports
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.modules.map((module) => (
            <ModuleCard key={module.id} module={module} />
          ))}
        </div>
      </section>

      <AnalyticsSection stats={stats} />

      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <article className="card p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="section-title">Finance Position</h3>
              <p className="text-sm text-slate-500">Current month operating view.</p>
            </div>
            <span className="rounded-lg bg-slate-100 p-2.5 text-slate-700">
              <FiActivity />
            </span>
          </div>
          <div className="space-y-3">
            <MoneyRow label="Daily collections" value={stats.monthlySummary.dailyCollection} />
            <MoneyRow label="EMI collections" value={stats.monthlySummary.emiCollection} />
            <MoneyRow label="Total collected" value={stats.monthlySummary.totalCollection} />
            <MoneyRow label="Pending amount" value={stats.monthlySummary.pendingAmount} />
            <MoneyRow label="Monthly expenses" value={stats.monthlyExpenses} />
            <MoneyRow label="Profit / loss" value={stats.profitLossMtd} />
          </div>
        </article>

        <article className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="section-title">Overdue Customers</h3>
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
                    <td className="px-4 py-3 font-semibold text-rose-700">
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
            <h3 className="section-title">Recent Transactions</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Transaction</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {stats.recentTransactions.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-semibold text-slate-950">{item.title}</td>
                    <td className="px-4 py-3 text-slate-600">{item.type}</td>
                    <td className="px-4 py-3 text-slate-600">{item.date || '-'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      {formatCurrency(item.amount)}
                    </td>
                  </tr>
                ))}
                {stats.recentTransactions.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan="4">
                      No recent transactions
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="section-title">Collector Performance</h3>
          </div>
          <div className="h-80 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.collectorPerformance} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="collectorName"
                  width={110}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<MoneyTooltip />} />
                <Bar dataKey="totalAmount" name="Total" fill="#0f766e" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>
    </div>
  )
}

export default DashboardPage
