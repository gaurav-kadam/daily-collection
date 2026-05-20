import { formatCurrency } from '../utils/format'

function ReportRow({ label, value, currency = true }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="font-semibold text-slate-950">
        {currency ? formatCurrency(value) : value}
      </span>
    </div>
  )
}

function ChartsSection({ weekly = [], monthly = [], loanDistribution = [] }) {
  const weeklyTotal = weekly.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const monthlyTotal = monthly.reduce((sum, item) => sum + Number(item.amount || 0), 0)

  return (
    <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      <div className="card p-4">
        <div className="mb-4">
          <h3 className="section-title">Weekly Collection</h3>
          <p className="text-sm text-slate-500">Daily totals for the last 7 days</p>
        </div>
        <div className="space-y-3">
          <ReportRow label="Weekly total" value={weeklyTotal} />
          {weekly.map((item) => (
            <ReportRow key={item.date || item.label} label={item.label || item.date} value={item.amount} />
          ))}
          {weekly.length === 0 && (
            <p className="rounded-lg bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">
              No weekly collection data yet
            </p>
          )}
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-4">
          <h3 className="section-title">Loan Distribution</h3>
          <p className="text-sm text-slate-500">Current loan status mix</p>
        </div>
        <div className="space-y-3">
          {loanDistribution.map((item) => (
            <ReportRow key={item.name} label={item.name} value={item.value} currency={false} />
          ))}
          {loanDistribution.length === 0 && (
            <p className="rounded-lg bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">
              No loan data yet
            </p>
          )}
        </div>
      </div>

      <div className="card overflow-hidden xl:col-span-2">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="section-title">Monthly Collection</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Month</th>
                <th className="px-4 py-3">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              <tr>
                <td className="px-4 py-3 font-semibold text-slate-950">Total</td>
                <td className="px-4 py-3 font-semibold text-slate-950">
                  {formatCurrency(monthlyTotal)}
                </td>
              </tr>
              {monthly.map((item) => (
                <tr key={item.month || item.label}>
                  <td className="px-4 py-3 text-slate-600">{item.label || item.month}</td>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {formatCurrency(item.amount)}
                  </td>
                </tr>
              ))}
              {monthly.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan="2">
                    No monthly collection data yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

export default ChartsSection
