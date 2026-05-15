import { useEffect } from 'react'
import ChartsSection from '../components/ChartsSection'
import Loader from '../components/Loader'
import useDashboard from '../hooks/useDashboard'

function ReportsPage() {
  const { stats, weeklyChart, monthlyChart, loading, error, loadDashboard } = useDashboard()

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">Reports</h2>
        <p className="mt-1 text-sm text-slate-600">Collection and loan performance trends.</p>
      </div>
      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {loading && !stats ? (
        <Loader text="Loading reports..." />
      ) : (
        <ChartsSection
          weekly={weeklyChart}
          monthly={monthlyChart}
          loanDistribution={stats?.loanDistribution || []}
        />
      )}
    </div>
  )
}

export default ReportsPage
