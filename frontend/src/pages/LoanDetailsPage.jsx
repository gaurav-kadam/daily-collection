import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import EMIHistoryTable from '../components/loans/EMIHistoryTable'
import LoanStatusBadge from '../components/loans/LoanStatusBadge'
import Loader from '../components/Loader'
import loanService from '../services/loanService'
import { formatDate } from '../utils/date'
import { formatCurrency } from '../utils/format'

function Detail({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function LoanDetailsPage() {
  const { loanId } = useParams()
  const [loan, setLoan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadLoan = async () => {
      try {
        setLoan(await loanService.getById(loanId))
      } catch {
        setError('Unable to load loan details.')
      } finally {
        setLoading(false)
      }
    }
    loadLoan()
  }, [loanId])

  if (loading) return <Loader text="Loading loan details..." />
  if (!loan) return <div className="card p-6 text-sm text-slate-700">Loan not found.</div>

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="page-title">{loan.customerName}</h2>
          <p className="mt-1 text-sm text-slate-600">{loan.shopName} | Loan ID: {loan.loanId}</p>
        </div>
        <div className="flex gap-2">
          <LoanStatusBadge status={loan.loanStatus} />
          {loan.loanStatus === 'active' && <Link to="/emi-payments" className="btn-primary">Add EMI</Link>}
          <Link to="/loans" className="btn-secondary">Back</Link>
        </div>
      </section>
      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      <section className="grid gap-3 md:grid-cols-3">
        <Detail label="Loan Amount" value={formatCurrency(loan.loanAmount)} />
        <Detail label="Processing Fee" value={formatCurrency(loan.processingFee)} />
        <Detail label="Final Disbursed" value={formatCurrency(loan.finalDisbursedAmount)} />
        <Detail label="Monthly EMI" value={formatCurrency(loan.monthlyEMI)} />
        <Detail label="Total Paid" value={formatCurrency(loan.totalPaid)} />
        <Detail label="Remaining Balance" value={formatCurrency(loan.remainingBalance)} />
        <Detail label="Loan Date" value={formatDate(loan.loanDate)} />
        <Detail label="Due Date" value={formatDate(loan.dueDate)} />
        <Detail label="Duration" value={`${loan.loanDurationMonths} months`} />
      </section>
      <section className="card p-5">
        <h3 className="section-title mb-4">Loan Status Timeline</h3>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="badge bg-slate-100 text-slate-700">Created</span>
          <span className="badge bg-amber-50 text-amber-700">Pending</span>
          {['active', 'completed'].includes(loan.loanStatus) && <span className="badge bg-sky-50 text-sky-700">Approved</span>}
          {loan.loanStatus === 'completed' && <span className="badge bg-emerald-50 text-emerald-700">Completed</span>}
          {loan.loanStatus === 'rejected' && <span className="badge bg-rose-50 text-rose-700">Rejected</span>}
        </div>
      </section>
      <section>
        <h3 className="section-title mb-4">Payment History</h3>
        <EMIHistoryTable payments={loan.payments || []} />
      </section>
    </div>
  )
}

export default LoanDetailsPage
