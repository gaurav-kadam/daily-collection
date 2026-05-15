import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency } from '../utils/format'

const pieColors = ['#2563eb', '#059669', '#f59e0b', '#dc2626']

function MoneyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-soft">
      <p className="font-medium text-slate-900">{label}</p>
      <p className="text-slate-600">{formatCurrency(payload[0].value)}</p>
    </div>
  )
}

function ChartsSection({ weekly = [], monthly = [], loanDistribution = [] }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      <div className="card p-4">
        <div className="mb-4">
          <h3 className="section-title">Weekly Collection</h3>
          <p className="text-sm text-slate-500">Daily trend for the last 7 days</p>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weekly}>
              <defs>
                <linearGradient id="weeklyCollection" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `INR ${value}`} />
              <Tooltip content={<MoneyTooltip />} />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="#2563eb"
                strokeWidth={2}
                fill="url(#weeklyCollection)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-4">
          <h3 className="section-title">Loan Distribution</h3>
          <p className="text-sm text-slate-500">Current loan status mix</p>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={loanDistribution.length ? loanDistribution : [{ name: 'No Loans', value: 1 }]}
                dataKey="value"
                nameKey="name"
                innerRadius={58}
                outerRadius={92}
                paddingAngle={3}
              >
                {(loanDistribution.length ? loanDistribution : [{ name: 'No Loans', value: 1 }]).map(
                  (entry, index) => (
                    <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                  ),
                )}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card p-4 xl:col-span-2">
        <div className="mb-4">
          <h3 className="section-title">Monthly Collection</h3>
          <p className="text-sm text-slate-500">Collection progress by month</p>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `INR ${value}`} />
              <Tooltip content={<MoneyTooltip />} />
              <Bar dataKey="amount" fill="#059669" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  )
}

export default ChartsSection
