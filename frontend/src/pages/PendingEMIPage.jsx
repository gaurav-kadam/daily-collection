import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PendingEMITable from '../components/loans/PendingEMITable'
import Loader from '../components/Loader'
import useAuth from '../hooks/useAuth'
import loanService from '../services/loanService'

function PendingEMIPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    let isMounted = true
    const loadRows = async () => {
      try {
        const data = await loanService.getPendingEmi({ currentUser: user, pageSize: 100 })
        if (isMounted) setRows(data.results || [])
      } catch {
        if (isMounted) setError('Unable to load pending EMI customers.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    loadRows()
    return () => {
      isMounted = false
    }
  }, [user])

  return (
    <div className="space-y-6">
      <section>
        <h2 className="page-title">Pending EMI</h2>
        <p className="mt-1 text-sm text-slate-600">Customers with active loan balances.</p>
      </section>
      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {loading ? <Loader text="Loading pending EMI..." /> : <PendingEMITable rows={rows} onPay={() => navigate('/emi-payments')} />}
    </div>
  )
}

export default PendingEMIPage
