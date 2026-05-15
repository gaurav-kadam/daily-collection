import { useState } from 'react'
import FormInput from '../FormInput'

function EMIPaymentForm({ loan, saving = false, onSubmit }) {
  const [values, setValues] = useState({
    amountPaid: loan?.monthlyEMI || '',
    paymentMethod: 'cash',
    remarks: '',
  })
  const handleChange = (event) => setValues((previous) => ({ ...previous, [event.target.name]: event.target.value }))
  const submit = (event) => {
    event.preventDefault()
    onSubmit({ ...values, loanId: loan.id, amountPaid: Number(values.amountPaid) })
  }
  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <FormInput label="Amount Paid" type="number" min="1" name="amountPaid" value={values.amountPaid} onChange={handleChange} required />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">Payment Method</span>
        <select name="paymentMethod" value={values.paymentMethod} onChange={handleChange} className="input-field">
          <option value="cash">Cash</option>
          <option value="online">Online</option>
        </select>
      </label>
      <div className="md:col-span-2">
        <FormInput label="Remarks" name="remarks" value={values.remarks} onChange={handleChange} as="textarea" />
      </div>
      <div className="md:col-span-2 flex justify-end">
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Add EMI Payment'}</button>
      </div>
    </form>
  )
}

export default EMIPaymentForm
