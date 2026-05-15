import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { FiPlus } from 'react-icons/fi'
import Loader from '../components/Loader'
import useAuth from '../hooks/useAuth'
import customerService from '../services/customerService'
import { todayKey } from '../services/firestoreService'
import { createLoan, getAll as getLoans, processingFeeForAmount } from '../services/loanService'
import { formatCurrency } from '../utils/format'

const emptyForm = {
  customerId: '',
  loanAmount: '',
  loanDurationMonths: 12,
  loanDate: todayKey(),
  remarks: '',
}

function LoanPage() {
  const { user } = useAuth()
  const [customers, setCustomers] = useState([])
  const [loans, setLoans] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return

    let isMounted = true
    setLoading(true)
    Promise.all([
      getLoans({ currentUser: user, pageSize: 100 }),
      customerService.getAll({ currentUser: user, status: 'active', pageSize: 100 }),
    ])
      .then(([loanData, customerData]) => {
        if (!isMounted) return
        setLoans(loanData.results || [])
        setCustomers(customerData.results || [])
      })
      .catch((error) => toast.error(error.message))
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [user])

  const selectedCustomer = useMemo(
    () => customers.find((customer) => (customer.customerId || customer.id) === form.customerId),
    [customers, form.customerId],
  )

  const updateForm = (event) => {
    const { name, value } = event.target
    setForm((previous) => ({ ...previous, [name]: value }))
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!selectedCustomer) {
      toast.error('Select a customer')
      return
    }

    setSaving(true)
    try {
      const created = await createLoan({ customer: selectedCustomer, payload: form, currentUser: user })
      setLoans((previous) => [created, ...previous].slice(0, 100))
      setForm(emptyForm)
      toast.success('Loan created')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <Loader text="Loading loans..." />
  }

  const processingFee = processingFeeForAmount(form.loanAmount)
  const finalDisbursed = Math.max(Number(form.loanAmount || 0) - processingFee, 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="page-title">Loans</h2>
        <p className="mt-1 text-sm text-slate-500">{loans.length} records</p>
      </div>

      <form className="card grid gap-3 p-4 md:grid-cols-6" onSubmit={handleCreate}>
        <select
          className="input-field md:col-span-2"
          name="customerId"
          value={form.customerId}
          onChange={updateForm}
          required
        >
          <option value="">Select customer</option>
          {customers.map((customer) => (
            <option key={customer.customerId || customer.id} value={customer.customerId || customer.id}>
              {customer.shopName} - {customer.ownerName}
            </option>
          ))}
        </select>
        <input
          className="input-field"
          name="loanAmount"
          type="number"
          min="1"
          placeholder="Loan amount"
          value={form.loanAmount}
          onChange={updateForm}
          required
        />
        <input
          className="input-field"
          name="loanDurationMonths"
          type="number"
          min="1"
          placeholder="Months"
          value={form.loanDurationMonths}
          onChange={updateForm}
        />
        <input
          className="input-field"
          name="loanDate"
          type="date"
          value={form.loanDate}
          onChange={updateForm}
        />
        <input
          className="input-field"
          name="remarks"
          placeholder="Remarks"
          value={form.remarks}
          onChange={updateForm}
        />
        <div className="rounded-lg bg-slate-50 p-3 text-sm md:col-span-5">
          <span className="text-slate-500">Processing fee:</span>{' '}
          <strong>{formatCurrency(processingFee)}</strong>
          <span className="mx-3 text-slate-300">|</span>
          <span className="text-slate-500">Disbursed:</span>{' '}
          <strong>{formatCurrency(finalDisbursed)}</strong>
        </div>
        <button className="btn-primary gap-2" type="submit" disabled={saving}>
          <FiPlus />
          {saving ? 'Saving...' : 'Create'}
        </button>
      </form>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Loan</th>
                <th className="px-4 py-3">Fee</th>
                <th className="px-4 py-3">Disbursed</th>
                <th className="px-4 py-3">Remaining</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loans.map((loan) => (
                <tr key={loan.loanId || loan.id}>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {loan.customerName || loan.shopName}
                  </td>
                  <td className="px-4 py-3">{formatCurrency(loan.loanAmount)}</td>
                  <td className="px-4 py-3">{formatCurrency(loan.processingFee)}</td>
                  <td className="px-4 py-3">{formatCurrency(loan.finalDisbursedAmount)}</td>
                  <td className="px-4 py-3">{formatCurrency(loan.remainingBalance)}</td>
                  <td className="px-4 py-3">
                    <span className="badge bg-slate-100 text-slate-700">{loan.loanStatus}</span>
                  </td>
                </tr>
              ))}
              {loans.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan="6">
                    No loans found
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

export default LoanPage
