import { useMemo, useState } from 'react'
import FormInput from '../FormInput'
import ImageUploader from './ImageUploader'

const initialState = {
  shopName: '',
  ownerName: '',
  mobile: '',
  alternateMobile: '',
  address: '',
  area: '',
  dailyAmount: 100,
  joiningDate: new Date().toISOString().slice(0, 10),
  idProofType: '',
  idProofNumber: '',
  assignedCollectorId: '',
  assignedCollectorName: '',
  status: 'active',
  notes: '',
  photo: '',
  photoFile: null,
  removePhoto: false,
}

const idProofOptions = ['', 'Aadhaar', 'PAN', 'Voter ID', 'Driving License', 'Other']

function validateImage(file) {
  if (!file) return ''
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return 'Only JPG, PNG, and WEBP images are allowed.'
  }
  if (file.size > 2 * 1024 * 1024) {
    return 'Photo must be 2MB or smaller.'
  }
  return ''
}

function validate(values, existingCustomers, currentCustomerId) {
  const errors = {}
  const mobilePattern = /^\d{10}$/
  if (!values.shopName.trim()) errors.shopName = 'Shop name is required.'
  if (!values.ownerName.trim()) errors.ownerName = 'Owner name is required.'
  if (!mobilePattern.test(values.mobile)) errors.mobile = 'Enter a valid 10 digit mobile number.'
  if (values.alternateMobile && !mobilePattern.test(values.alternateMobile)) {
    errors.alternateMobile = 'Enter a valid 10 digit alternate mobile number.'
  }
  if (!values.address.trim()) errors.address = 'Address is required.'
  if (!values.area.trim()) errors.area = 'Area is required.'
  if (Number(values.dailyAmount) <= 0) errors.dailyAmount = 'Daily amount must be positive.'

  const duplicate = existingCustomers.find(
    (customer) => customer.id !== currentCustomerId && String(customer.mobile) === String(values.mobile),
  )
  if (duplicate) errors.mobile = 'A customer with this mobile number already exists.'

  const imageError = validateImage(values.photoFile)
  if (imageError) errors.photoFile = imageError
  return errors
}

function CustomerForm({
  initialValues,
  collectors = [],
  existingCustomers = [],
  currentCustomerId,
  submitLabel = 'Save Customer',
  saving = false,
  onSubmit,
}) {
  const [values, setValues] = useState({ ...initialState, ...initialValues })
  const [errors, setErrors] = useState({})

  const collectorOptions = useMemo(
    () => collectors.filter((collector) => collector.status !== 'inactive'),
    [collectors],
  )

  const handleChange = (event) => {
    const { name, value } = event.target
    setValues((previous) => {
      const next = { ...previous, [name]: value }
      if (name === 'assignedCollectorId') {
        const collector = collectorOptions.find((item) => item.id === value)
        next.assignedCollectorName = collector?.name || ''
      }
      return next
    })
  }

  const handleImageChange = (file) => {
    setValues((previous) => ({ ...previous, photoFile: file, removePhoto: false }))
  }

  const handleRemoveImage = () => {
    setValues((previous) => ({ ...previous, photo: '', photoFile: null, removePhoto: true }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const nextErrors = validate(values, existingCustomers, currentCustomerId)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    onSubmit({
      ...values,
      dailyAmount: Number(values.dailyAmount),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2">
        <FormInput label="Shop Name" name="shopName" value={values.shopName} onChange={handleChange} required />
        {errors.shopName && <p className="-mt-3 text-xs text-rose-600 md:col-start-1">{errors.shopName}</p>}
        <FormInput label="Owner Name" name="ownerName" value={values.ownerName} onChange={handleChange} required />
        {errors.ownerName && <p className="-mt-3 text-xs text-rose-600 md:col-start-2">{errors.ownerName}</p>}
        <FormInput label="Mobile Number" name="mobile" value={values.mobile} onChange={handleChange} required />
        <FormInput
          label="Alternate Mobile"
          name="alternateMobile"
          value={values.alternateMobile}
          onChange={handleChange}
        />
        {errors.mobile && <p className="-mt-3 text-xs text-rose-600 md:col-start-1">{errors.mobile}</p>}
        {errors.alternateMobile && (
          <p className="-mt-3 text-xs text-rose-600 md:col-start-2">{errors.alternateMobile}</p>
        )}
        <FormInput label="Area" name="area" value={values.area} onChange={handleChange} required />
        <FormInput
          label="Daily Amount"
          name="dailyAmount"
          type="number"
          min="1"
          value={values.dailyAmount}
          onChange={handleChange}
          required
        />
        {errors.area && <p className="-mt-3 text-xs text-rose-600 md:col-start-1">{errors.area}</p>}
        {errors.dailyAmount && <p className="-mt-3 text-xs text-rose-600 md:col-start-2">{errors.dailyAmount}</p>}
        <FormInput
          label="Joining Date"
          name="joiningDate"
          type="date"
          value={values.joiningDate}
          onChange={handleChange}
        />
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Assign Collector</span>
          <select
            name="assignedCollectorId"
            value={values.assignedCollectorId}
            onChange={handleChange}
            className="input-field"
          >
            <option value="">Unassigned</option>
            {collectorOptions.map((collector) => (
              <option key={collector.id} value={collector.id}>
                {collector.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">ID Proof Type</span>
          <select name="idProofType" value={values.idProofType} onChange={handleChange} className="input-field">
            {idProofOptions.map((option) => (
              <option key={option || 'empty'} value={option}>
                {option || 'Select proof'}
              </option>
            ))}
          </select>
        </label>
        <FormInput
          label="ID Proof Number"
          name="idProofNumber"
          value={values.idProofNumber}
          onChange={handleChange}
        />
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Status</span>
          <select name="status" value={values.status} onChange={handleChange} className="input-field">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <div className="md:col-span-2">
          <FormInput label="Address" name="address" value={values.address} onChange={handleChange} as="textarea" required />
          {errors.address && <p className="mt-1 text-xs text-rose-600">{errors.address}</p>}
        </div>
        <div className="md:col-span-2">
          <ImageUploader
            value={values.photo}
            file={values.photoFile}
            onChange={handleImageChange}
            onRemove={handleRemoveImage}
            error={errors.photoFile}
          />
        </div>
        <div className="md:col-span-2">
          <FormInput label="Notes" name="notes" value={values.notes} onChange={handleChange} as="textarea" />
        </div>
      </section>
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  )
}

export default CustomerForm
