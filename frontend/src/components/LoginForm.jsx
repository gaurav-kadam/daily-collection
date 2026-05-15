import { useState } from 'react'
import { IoEyeOff, IoEye } from 'react-icons/io5'

const initialState = {
  email: '',
  password: '',
  remember_me: true,
}

function LoginForm({ onSubmit, loading = false, errorMessage = '' }) {
  const [formData, setFormData] = useState(initialState)
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})

  const validate = () => {
    const errors = {}
    if (!formData.email.trim()) {
      errors.email = 'Email is required.'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Enter a valid email address.'
    }

    if (!formData.password) {
      errors.password = 'Password is required.'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target
    setFormData((previous) => ({
      ...previous,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validate()) return
    await onSubmit({
      ...formData,
      email: formData.email.trim().toLowerCase(),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">Email</span>
        <input
          type="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          className="input-field"
          placeholder="collector@company.com"
          autoComplete="email"
        />
        {fieldErrors.email && <span className="text-xs text-rose-600">{fieldErrors.email}</span>}
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
            placeholder="********"
            autoComplete="current-password"
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

      <label className="flex items-center justify-between gap-3 text-sm text-slate-600">
        <span className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            name="remember_me"
            checked={formData.remember_me}
            onChange={handleChange}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Remember me
        </span>
      </label>

      {errorMessage && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
      )}

      <button type="submit" className="btn-primary flex w-full items-center justify-center gap-2" disabled={loading}>
        {loading && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        )}
        {loading ? 'Signing in...' : 'Login'}
      </button>
    </form>
  )
}

export default LoginForm
