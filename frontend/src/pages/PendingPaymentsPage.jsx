import { useEffect } from 'react'
import LoanSummary from '../components/LoanSummary'
import Loader from '../components/Loader'
import TableComponent from '../components/TableComponent'
import useDashboard from '../hooks/useDashboard'
import { formatCurrency } from '../utils/format'

function PendingPaymentsPage() {
  const { stats, recentLoans, loading, error, loadDashboard } = useDashboard()

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const columns = [
    { header: 'Customer', accessor: 'customerName' },
    {
      header: 'Loan Amount',
      accessor: 'loanAmount',
      render: (row) => formatCurrency(row.loanAmount),
    },
    {
      header: 'Monthly EMI',
      accessor: 'monthlyEMI',
      render: (row) => formatCurrency(row.monthlyEMI),
    },
    {
      header: 'Remaining',
      accessor: 'remainingBalance',
      render: (row) => formatCurrency(row.remainingBalance),
    },
    { header: 'Status', accessor: 'loanStatus' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">Pending Payments</h2>
        <p className="mt-1 text-sm text-slate-600">Open EMI workload and outstanding balances.</p>
      </div>
      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {loading && !stats ? (
        <Loader text="Loading pending payments..." />
      ) : (
        <>
          <LoanSummary loans={recentLoans.results} stats={stats} />
          <section className="card p-4">
            <TableComponent columns={columns} rows={recentLoans.results} />
          </section>
        </>
      )}
    </div>
  )
}

export default PendingPaymentsPage
