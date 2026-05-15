import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { FiLock, FiMail } from 'react-icons/fi'
import { Navigate, useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'

function LoginPage() {
  const navigate = useNavigate()
  const { actionLoading, isAuthenticated, login, sendResetEmail } = useAuth()
  const [form, setForm] = useState({
    email: '',
    password: '',
    rememberMe: true,
  })

  useEffect(() => {
    document.title = 'Login | Daily Collection'
  }, [])

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const updateField = (event) => {
    const { name, value, checked, type } = event.target
    setForm((previous) => ({
      ...previous,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    try {
      await login(form)
      toast.success('Signed in successfully')
      navigate('/dashboard', { replace: true })
    } catch (error) {
      toast.error(error.message || 'Login failed')
    }
  }

  const handleReset = async () => {
    if (!form.email) {
      toast.error('Enter your email first')
      return
    }

    try {
      await sendResetEmail(form.email)
      toast.success('Password reset email sent')
    } catch (error) {
      toast.error(error.message || 'Reset email failed')
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft md:grid-cols-[1fr_1.05fr]">
        <div className="hidden bg-slate-950 p-8 text-white md:flex md:flex-col md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-cyan-300">
              Daily Collection
            </p>
            <h1 className="mt-4 font-display text-3xl font-bold leading-tight">
              Shop savings, collections, and EMI control in one workspace.
            </h1>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-white/10 p-3">
              <p className="text-2xl font-bold">01</p>
              <p className="text-slate-300">Collect</p>
            </div>
            <div className="rounded-lg bg-white/10 p-3">
              <p className="text-2xl font-bold">02</p>
              <p className="text-slate-300">Track</p>
            </div>
            <div className="rounded-lg bg-white/10 p-3">
              <p className="text-2xl font-bold">03</p>
              <p className="text-slate-300">Recover</p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <div className="mb-7">
            <p className="text-sm font-semibold uppercase tracking-wider text-cyan-700">
              Secure Login
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-slate-950">
              Welcome back
            </h2>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Username or email
              </span>
              <span className="relative block">
                <FiMail className="pointer-events-none absolute left-3 top-3 text-slate-400" />
                <input
                  className="input-field pl-10"
                  name="email"
                  type="text"
                  value={form.email}
                  onChange={updateField}
                  autoComplete="username"
                  required
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
              <span className="relative block">
                <FiLock className="pointer-events-none absolute left-3 top-3 text-slate-400" />
                <input
                  className="input-field pl-10"
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={updateField}
                  autoComplete="current-password"
                  required
                />
              </span>
            </label>

            <div className="flex items-center justify-between gap-3 text-sm">
              <label className="flex items-center gap-2 text-slate-600">
                <input
                  name="rememberMe"
                  type="checkbox"
                  checked={form.rememberMe}
                  onChange={updateField}
                  className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                />
                Remember me
              </label>
              <button
                type="button"
                onClick={handleReset}
                className="font-semibold text-cyan-700 hover:text-cyan-800"
              >
                Reset password
              </button>
            </div>

            <button type="submit" className="btn-primary w-full" disabled={actionLoading}>
              {actionLoading ? 'Signing in...' : 'Login'}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}

export default LoginPage
