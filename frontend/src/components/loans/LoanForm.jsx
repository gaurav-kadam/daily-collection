import { useState } from 'react'
import FormInput from '../FormInput'
import LoanCalculator from './LoanCalculator'
import { getLoanTotals } from '../../utils/loan'

function LoanForm({ customers = [], initialValues = {}, saving = false, onSubmit }) {
  const [values, setValues] = useState({
    customerId: '',
    loanAmount: '',
    processingFee: '',
    interestRate: 5,
    loanDurationMonths: 12,
    remarks: '',
    ...initialValues,
  })

  const handleChange = (event) => {
    const { name, value } = event.target
    setValues((previous) => ({ ...previous, [name]: value }))
  }

  const submit = (event) => {
    event.preventDefault()
    const totals = getLoanTotals(values.loanAmount, values.interestRate, values.loanDurationMonths, values.processingFee)
    onSubmit({
      ...values,
      loanAmount: Number(values.loanAmount),
      processingFee: Number(totals.processingFee),
      interestRate: Number(values.interestRate),
      loanDurationMonths: Number(values.loanDurationMonths),
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className="text-sm font-medium text-slate-700">Customer Search</span>
          <select name="customerId" value={values.customerId} onChange={handleChange} className="input-field" required>
            <option value="">Select customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.shopName || customer.shop_name} ({customer.ownerName || customer.owner_name})
              </option>
            ))}
          </select>
        </label>
        <FormInput label="Loan Amount" type="number" min="1" name="loanAmount" value={values.loanAmount} onChange={handleChange} required />
        <FormInput label="Processing Fee" type="number" min="0" name="processingFee" value={values.processingFee} onChange={handleChange} placeholder="Auto if blank" />
        <FormInput label="Interest Rate (%)" type="number" min="0" name="interestRate" value={values.interestRate} onChange={handleChange} />
        <FormInput label="Loan Duration (Months)" type="number" min="1" name="loanDurationMonths" value={values.loanDurationMonths} onChange={handleChange} />
        <div className="md:col-span-2">
          <FormInput label="Remarks" name="remarks" value={values.remarks} onChange={handleChange} as="textarea" />
        </div>
      </div>
      <LoanCalculator amount={values.loanAmount} interestRate={values.interestRate} durationMonths={values.loanDurationMonths} processingFee={values.processingFee} />
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Loan'}</button>
      </div>
    </form>
  )
}

export default LoanForm
