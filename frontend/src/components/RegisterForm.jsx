import { useState } from 'react'
import { IoEye, IoEyeOff } from 'react-icons/io5'

const initialForm = {
  full_name: '',
  email: '',
  mobile: '',
  password: '',
  confirm_password: '',
  role: 'collector',
}

function RegisterForm({ onSubmit, loading = false, errorMessage = '', defaultRole = 'collector' }) {
  const [formData, setFormData] = useState({ ...initialForm, role: defaultRole })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})

  const validate = () => {
    const errors = {}
    if (!formData.full_name.trim()) errors.full_name = 'Full name is required.'
    if (!formData.email.trim()) {
      errors.email = 'Email is required.'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Enter a valid email address.'
    }
    if (!formData.mobile.trim()) errors.mobile = 'Mobile number is required.'
    if (!formData.password) {
      errors.password = 'Password is required.'
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters.'
    }
    if (!formData.confirm_password) {
      errors.confirm_password = 'Confirm password is required.'
    } else if (formData.confirm_password !== formData.password) {
      errors.confirm_password = 'Passwords do not match.'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((previous) => ({ ...previous, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validate()) return
    await onSubmit({
      ...formData,
      email: formData.email.trim().toLowerCase(),
      full_name: formData.full_name.trim(),
      mobile: formData.mobile.trim(),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
      <label className="flex flex-col gap-1.5 md:col-span-2">
        <span className="text-sm font-medium text-slate-700">Full Name</span>
        <input
          name="full_name"
          value={formData.full_name}
          onChange={handleChange}
          className="input-field"
          placeholder="Rahul Sharma"
        />
        {fieldErrors.full_name && (
          <span className="text-xs text-rose-600">{fieldErrors.full_name}</span>
        )}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">Email</span>
        <input
          type="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          className="input-field"
          placeholder="collector@company.com"
        />
        {fieldErrors.email && <span className="text-xs text-rose-600">{fieldErrors.email}</span>}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">Mobile Number</span>
        <input
          name="mobile"
          value={formData.mobile}
          onChange={handleChange}
          className="input-field"
          placeholder="9876543210"
        />
        {fieldErrors.mobile && <span className="text-xs text-rose-600">{fieldErrors.mobile}</span>}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">Password</span>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            name="password"
            value={formData.password}
            onChange={handleChange}
            className="input-field pr-11"
            placeholder="Minimum 8 characters"
          />
          <button
            type="button"
            onClick={() => setShowPassword((previous) => !previous)}
            className="absolute inset-y-0 right-2 my-auto h-8 rounded-lg px-2 text-slate-500 hover:bg-slate-100"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <IoEyeOff size={18} /> : <IoEye size={18} />}
          </button>
        </div>
        {fieldErrors.password && (
          <span className="text-xs text-rose-600">{fieldErrors.password}</span>
        )}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">Confirm Password</span>
        <div className="relative">
          <input
            type={showConfirmPassword ? 'text' : 'password'}
            name="confirm_password"
            value={formData.confirm_password}
            onChange={handleChange}
            className="input-field pr-11"
            placeholder="Re-enter password"
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword((previous) => !previous)}
            className="absolute inset-y-0 right-2 my-auto h-8 rounded-lg px-2 text-slate-500 hover:bg-slate-100"
            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
          >
            {showConfirmPassword ? <IoEyeOff size={18} /> : <IoEye size={18} />}
          </button>
        </div>
        {fieldErrors.confirm_password && (
          <span className="text-xs text-rose-600">{fieldErrors.confirm_password}</span>
        )}
      </label>

      <label className="flex flex-col gap-1.5 md:col-span-2">
        <span className="text-sm font-medium text-slate-700">Role</span>
        <select
          name="role"
          value={formData.role}
          onChange={handleChange}
          className="input-field"
        >
          <option value="admin">Admin</option>
          <option value="collector">Collector</option>
        </select>
      </label>

      {errorMessage && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 md:col-span-2">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        className="btn-primary flex items-center justify-center gap-2 md:col-span-2"
        disabled={loading}
      >
        {loading && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        )}
        {loading ? 'Creating account...' : 'Create User'}
      </button>
    </form>
  )
}

export default RegisterForm
