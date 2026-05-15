import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { FiCreditCard } from 'react-icons/fi'
import Loader from '../components/Loader'
import useAuth from '../hooks/useAuth'
import { todayKey } from '../services/firestoreService'
import { calculateLoanMetrics, listenLoans } from '../services/loanService'
import { createEmiPayment, listenEmiPayments } from '../services/emiPaymentService'
import { formatCurrency } from '../utils/format'

const emptyForm = {
  loanId: '',
  amountPaid: '',
  paymentDate: todayKey(),
  paymentMethod: 'cash',
  remarks: '',
}

function EMIPaymentPage() {
  const { user } = useAuth()
  const [loans, setLoans] = useState([])
  const [payments, setPayments] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return undefined

    const unsubscribeLoans = listenLoans(
      user,
      (items) => {
        setLoans(items)
        setLoading(false)
      },
      (error) => {
        toast.error(error.message)
        setLoading(false)
      },
      { status: 'active', pageSize: 100 },
    )
    const unsubscribePayments = listenEmiPayments(
      user,
      setPayments,
      (error) => toast.error(error.message),
      { pageSize: 50 },
    )

    return () => {
      unsubscribeLoans()
      unsubscribePayments()
    }
  }, [user])

  const activeLoans = useMemo(
    () => loans.filter((loan) => loan.loanStatus === 'active'),
    [loans],
  )
  const selectedLoan = useMemo(
    () => loans.find((loan) => (loan.loanId || loan.id) === form.loanId),
    [form.loanId, loans],
  )
  const selectedLoanMetrics = useMemo(
    () => (selectedLoan ? calculateLoanMetrics(selectedLoan) : null),
    [selectedLoan],
  )

  const updateForm = (event) => {
    const { name, value } = event.target
    setForm((previous) => ({ ...previous, [name]: value }))
  }

  const handleLoanChange = (event) => {
    const loan = loans.find((item) => (item.loanId || item.id) === event.target.value)
    const metrics = loan ? calculateLoanMetrics(loan) : null
    setForm((previous) => ({
      ...previous,
      loanId: event.target.value,
      amountPaid: metrics?.emiDueAmount || loan?.monthlyEMI || '',
    }))
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!selectedLoan) {
      toast.error('Select a loan')
      return
    }

    setSaving(true)
    try {
      await createEmiPayment({ loan: selectedLoan, payload: form, currentUser: user })
      setPayments((previous) =>
        [
          {
            paymentId: `pending-${Date.now()}`,
            loanId: selectedLoan.loanId || selectedLoan.id,
            customerName: selectedLoan.customerName,
            shopName: selectedLoan.shopName,
            amountPaid: form.amountPaid,
            paymentDate: form.paymentDate,
            remainingBalance: Math.max(
              Number(selectedLoan.remainingBalance || 0) - Number(form.amountPaid || 0),
              0,
            ),
            paymentMethod: form.paymentMethod,
          },
          ...previous,
        ].slice(0, 50),
      )
      setForm(emptyForm)
      toast.success('EMI payment saved')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <Loader text="Loading EMI payments..." />
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="page-title">EMI Payments</h2>
        <p className="mt-1 text-sm text-slate-500">{payments.length} payment records</p>
      </div>

      <form className="card grid gap-3 p-4 md:grid-cols-6" onSubmit={handleCreate}>
        <select
          className="input-field md:col-span-2"
          name="loanId"
          value={form.loanId}
          onChange={handleLoanChange}
          required
        >
          <option value="">Select active loan</option>
          {activeLoans.map((loan) => (
            <option key={loan.loanId || loan.id} value={loan.loanId || loan.id}>
              {loan.customerName || loan.shopName} - {formatCurrency(loan.remainingBalance)}
            </option>
          ))}
        </select>
        <input
          className="input-field"
          name="amountPaid"
          type="number"
          min="1"
          placeholder="Amount paid"
          value={form.amountPaid}
          onChange={updateForm}
          required
        />
        <input
          className="input-field"
          name="paymentDate"
          type="date"
          value={form.paymentDate}
          onChange={updateForm}
        />
        <select
          className="input-field"
          name="paymentMethod"
          value={form.paymentMethod}
          onChange={updateForm}
        >
          <option value="cash">Cash</option>
          <option value="online">Online</option>
        </select>
        <input
          className="input-field"
          name="remarks"
          placeholder="Remarks"
          value={form.remarks}
          onChange={updateForm}
        />
        {selectedLoan && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm md:col-span-5">
            <span className="text-slate-500">Monthly EMI:</span>{' '}
            <strong>{formatCurrency(selectedLoan.monthlyEMI)}</strong>
            <span className="mx-3 text-slate-300">|</span>
            <span className="text-slate-500">Remaining:</span>{' '}
            <strong>{formatCurrency(selectedLoan.remainingBalance)}</strong>
            {selectedLoanMetrics?.overdueDays > 0 && (
              <>
                <span className="mx-3 text-slate-300">|</span>
                <span className="text-slate-500">Penalty:</span>{' '}
                <strong className="text-rose-700">
                  {formatCurrency(selectedLoanMetrics.penaltyAmount)}
                </strong>
              </>
            )}
          </div>
        )}
        <button className="btn-primary gap-2" type="submit" disabled={saving}>
          <FiCreditCard />
          {saving ? 'Saving...' : 'Collect EMI'}
        </button>
      </form>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Remaining</th>
                <th className="px-4 py-3">Method</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {payments.map((payment) => (
                <tr key={payment.paymentId || payment.id}>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {payment.customerName || payment.shopName}
                  </td>
                  <td className="px-4 py-3">{formatCurrency(payment.amountPaid)}</td>
                  <td className="px-4 py-3 text-slate-600">{payment.paymentDate}</td>
                  <td className="px-4 py-3">{formatCurrency(payment.remainingBalance)}</td>
                  <td className="px-4 py-3 capitalize text-slate-600">{payment.paymentMethod}</td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan="5">
                    No EMI payments found
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

export default EMIPaymentPage
