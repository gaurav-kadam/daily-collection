import { useMemo, useState } from 'react'
import FormInput from '../FormInput'
import { todayISO } from '../../utils/date'
import { validateCloudinaryImage } from '../../services/cloudinaryService'
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
  photoUrl: '',
  profilePhotoUrl: '',
  documentPhotoUrl: '',
  profilePhotoFile: null,
  documentPhotoFile: null,
  removePhoto: false,
  removeDocumentPhoto: false,
}

const idProofOptions = ['', 'Aadhaar', 'PAN', 'Driving License', 'Voter ID', 'Other']

function validate(values) {
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

  const profileImageError = validateCloudinaryImage(values.profilePhotoFile)
  const documentImageError = validateCloudinaryImage(values.documentPhotoFile)
  if (profileImageError) errors.profilePhotoFile = profileImageError
  if (documentImageError) errors.documentPhotoFile = documentImageError
  return errors
}

function CustomerForm({
  initialValues,
  collectors = [],
  areaOptions = [],
  submitLabel = 'Save Customer',
  saving = false,
  uploadProgress = null,
  onSubmit,
}) {
  const [values, setValues] = useState({
    ...initialState,
    joiningDate: todayISO(),
    ...initialValues,
    profilePhotoUrl:
      initialValues?.profilePhotoUrl || initialValues?.photoUrl || initialValues?.photo || '',
    documentPhotoUrl: initialValues?.documentPhotoUrl || '',
    photoUrl: initialValues?.photoUrl || initialValues?.photo || '',
  })
  const [errors, setErrors] = useState({})

  const collectorOptions = useMemo(
    () => collectors.filter((collector) => collector.status !== 'inactive'),
    [collectors],
  )
  const areaSuggestions = useMemo(
    () => [...new Set(areaOptions.filter(Boolean).map((area) => String(area).trim()).filter(Boolean))].sort(),
    [areaOptions],
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

  const handleProfileImageChange = (file) => {
    setValues((previous) => ({ ...previous, profilePhotoFile: file, removePhoto: false }))
  }

  const handleRemoveProfileImage = () => {
    setValues((previous) => ({
      ...previous,
      photo: '',
      photoUrl: '',
      profilePhotoUrl: '',
      profilePhotoFile: null,
      removePhoto: true,
    }))
  }

  const handleDocumentImageChange = (file) => {
    setValues((previous) => ({ ...previous, documentPhotoFile: file, removeDocumentPhoto: false }))
  }

  const handleRemoveDocumentImage = () => {
    setValues((previous) => ({
      ...previous,
      documentPhotoUrl: '',
      documentPhotoFile: null,
      removeDocumentPhoto: true,
    }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const nextErrors = validate(values)
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
        <FormInput
          label="Shop Name"
          name="shopName"
          value={values.shopName}
          onChange={handleChange}
          error={errors.shopName}
          required
        />
        <FormInput
          label="Owner Name"
          name="ownerName"
          value={values.ownerName}
          onChange={handleChange}
          error={errors.ownerName}
          required
        />
        <FormInput
          label="Mobile Number"
          name="mobile"
          value={values.mobile}
          onChange={handleChange}
          inputMode="numeric"
          maxLength="10"
          error={errors.mobile}
          required
        />
        <FormInput
          label="Alternate Mobile"
          name="alternateMobile"
          value={values.alternateMobile}
          onChange={handleChange}
          inputMode="numeric"
          maxLength="10"
          error={errors.alternateMobile}
        />
        <FormInput
          label="Area"
          name="area"
          value={values.area}
          onChange={handleChange}
          list={areaSuggestions.length ? 'customer-area-options' : undefined}
          error={errors.area}
          required
        />
        {areaSuggestions.length > 0 && (
          <datalist id="customer-area-options">
            {areaSuggestions.map((area) => (
              <option key={area} value={area} />
            ))}
          </datalist>
        )}
        <FormInput
          label="Daily Amount"
          name="dailyAmount"
          type="number"
          min="1"
          value={values.dailyAmount}
          onChange={handleChange}
          error={errors.dailyAmount}
          required
        />
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
            <option value="blocked">Blocked</option>
          </select>
        </label>
        <div className="md:col-span-2">
          <FormInput
            label="Address"
            name="address"
            value={values.address}
            onChange={handleChange}
            as="textarea"
            error={errors.address}
            required
          />
        </div>
        <div className="md:col-span-2">
          <ImageUploader
            label="Profile Photo"
            emptyLabel="Upload profile photo"
            replaceLabel="Replace profile photo"
            alt="Customer profile"
            value={values.profilePhotoUrl || values.photoUrl || values.photo}
            file={values.profilePhotoFile}
            onChange={handleProfileImageChange}
            onRemove={handleRemoveProfileImage}
            error={errors.profilePhotoFile}
            progress={
              typeof uploadProgress === 'number'
                ? uploadProgress
                : uploadProgress?.profilePhoto ?? null
            }
            disabled={saving}
          />
        </div>
        <div className="md:col-span-2">
          <ImageUploader
            label="ID Document Photo"
            emptyLabel="Upload document photo"
            replaceLabel="Replace document photo"
            alt="Customer document"
            value={values.documentPhotoUrl}
            file={values.documentPhotoFile}
            onChange={handleDocumentImageChange}
            onRemove={handleRemoveDocumentImage}
            error={errors.documentPhotoFile}
            progress={uploadProgress?.documentPhoto ?? null}
            disabled={saving}
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
