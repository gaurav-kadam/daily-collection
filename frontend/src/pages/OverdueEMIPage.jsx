import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import Loader from '../components/Loader'
import useAuth from '../hooks/useAuth'
import { getPendingEmi } from '../services/loanService'
import { formatCurrency } from '../utils/format'

function OverdueEMIPage() {
  const { user } = useAuth()
  const [overdueLoans, setOverdueLoans] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    let isMounted = true
    getPendingEmi({ currentUser: user, overdueOnly: true, pageSize: 100 })
      .then((data) => {
        if (isMounted) setOverdueLoans(data.results || [])
      })
      .catch((error) => {
        toast.error(error.message)
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [user])

  if (loading) return <Loader text="Loading overdue EMI..." />

  return (
    <div className="space-y-6">
      <div>
        <h2 className="page-title">EMI Overdue</h2>
        <p className="mt-1 text-sm text-slate-500">{overdueLoans.length} active overdue loans</p>
      </div>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3">Overdue</th>
                <th className="px-4 py-3">EMI Due</th>
                <th className="px-4 py-3">Penalty</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {overdueLoans.map((loan) => (
                <tr key={loan.loanId || loan.id}>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {loan.customerName || loan.shopName}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{loan.nextDueDate}</td>
                  <td className="px-4 py-3 text-rose-700">{loan.overdueDays} days</td>
                  <td className="px-4 py-3">{formatCurrency(loan.emiDueAmount)}</td>
                  <td className="px-4 py-3 text-rose-700">
                    {formatCurrency(loan.penaltyAmount)}
                  </td>
                  <td className="px-4 py-3">
                    <Link to="/emi-payments" className="btn-secondary !py-1.5">
                      Collect EMI
                    </Link>
                  </td>
                </tr>
              ))}
              {overdueLoans.length === 0 && (
                <tr>
                  <td className="px-4 py-10 text-center text-slate-500" colSpan="6">
                    No overdue EMI found
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

export default OverdueEMIPage
