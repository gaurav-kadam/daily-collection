import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import LoanForm from '../components/loans/LoanForm'
import Loader from '../components/Loader'
import useAuth from '../hooks/useAuth'
import customerService from '../services/customerService'
import loanService from '../services/loanService'

function CreateLoanPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const data = await customerService.getAll({ pageSize: 100 })
        setCustomers(data.results || [])
      } catch {
        setError('Unable to load customers.')
      } finally {
        setLoading(false)
      }
    }
    loadCustomers()
  }, [])

  const createLoan = async (payload) => {
    setSaving(true)
    setError('')
    try {
      const loan = await loanService.create(payload, user)
      navigate(`/loans/${loan.id}`)
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Unable to create loan.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loader text="Preparing loan form..." />

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="page-title">Create Loan</h2>
          <p className="mt-1 text-sm text-slate-600">Create a pending loan with automatic EMI calculation.</p>
        </div>
        <Link to="/loans" className="btn-secondary">Back to Loans</Link>
      </section>
      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      <section className="card p-5">
        <LoanForm customers={customers} saving={saving} onSubmit={createLoan} />
      </section>
    </div>
  )
}

export default CreateLoanPage
