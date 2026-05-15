import { useEffect, useState } from 'react'
import { FiZap } from 'react-icons/fi'
import { formatCurrency } from '../../utils/format'
import CustomerSearchDropdown from './CustomerSearchDropdown'

function CollectionForm({ customers = [], selectedCustomerId = '', saving = false, onSubmit }) {
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [values, setValues] = useState({
    amount: '',
    paymentMethod: 'cash',
    status: 'paid',
    remarks: '',
  })

  useEffect(() => {
    if (!selectedCustomerId) return
    const customer = customers.find((item) => item.id === selectedCustomerId)
    if (customer) {
      setSelectedCustomer(customer)
      setValues((previous) => ({ ...previous, amount: customer.dailyAmount || 0 }))
    }
  }, [customers, selectedCustomerId])

  const selectCustomer = (customer) => {
    setSelectedCustomer(customer)
    setValues((previous) => ({ ...previous, amount: customer.dailyAmount || 0 }))
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setValues((previous) => ({ ...previous, [name]: value }))
  }

  const submit = (event) => {
    event.preventDefault()
    if (!selectedCustomer) return
    onSubmit({
      customerId: selectedCustomer.id,
      amount: Number(values.amount || 0),
      pendingAmount: values.status === 'paid' ? 0 : Number(values.amount || selectedCustomer.dailyAmount || 0),
      paymentMethod: values.paymentMethod,
      status: values.status,
      remarks: values.remarks,
    })
  }

  const quickAmounts = selectedCustomer
    ? [selectedCustomer.dailyAmount, selectedCustomer.dailyAmount * 2, selectedCustomer.pendingAmount].filter(Boolean)
    : []

  return (
    <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <CustomerSearchDropdown customers={customers} value={selectedCustomer?.id} onSelect={selectCustomer} />

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <FiZap className="text-brand-600" /> Fast Entry
        </div>
        {selectedCustomer ? (
          <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-900">{selectedCustomer.ownerName}</p>
            <p className="text-slate-600">{selectedCustomer.shopName}</p>
            <p className="mt-2 text-slate-500">Daily amount: {formatCurrency(selectedCustomer.dailyAmount)}</p>
          </div>
        ) : (
          <p className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Select a customer to start.</p>
        )}

        <div className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Collected Amount</span>
            <input
              type="number"
              min="0"
              name="amount"
              value={values.amount}
              onChange={handleChange}
              className="input-field text-lg font-semibold"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {quickAmounts.map((amount) => (
              <button
                key={amount}
                type="button"
                className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700"
                onClick={() => setValues((previous) => ({ ...previous, amount }))}
              >
                {formatCurrency(amount)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Method</span>
              <select name="paymentMethod" value={values.paymentMethod} onChange={handleChange} className="input-field">
                <option value="cash">Cash</option>
                <option value="online">Online</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Status</span>
              <select name="status" value={values.status} onChange={handleChange} className="input-field">
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="missed">Missed</option>
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Remarks</span>
            <textarea name="remarks" value={values.remarks} onChange={handleChange} className="input-field min-h-20" />
          </label>
          <button type="submit" className="btn-primary min-h-12 w-full text-base" disabled={!selectedCustomer || saving}>
            {saving ? 'Saving...' : 'Submit Collection'}
          </button>
        </div>
      </section>
    </form>
  )
}

export default CollectionForm
