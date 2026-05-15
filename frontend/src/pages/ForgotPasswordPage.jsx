import { useState } from 'react'
import { Link } from 'react-router-dom'
import authService from '../services/authService'

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setMessage('')
    setError('')
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address.')
      return
    }

    setLoading(true)
    try {
      const response = await authService.forgotPassword(email.toLowerCase().trim())
      setMessage(response.detail || 'Password reset instructions sent.')
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Unable to process request.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-5">
      <div className="card w-full max-w-md p-6 md:p-8">
        <h2 className="font-display text-2xl font-bold text-slate-900">Forgot Password</h2>
        <p className="mt-1 text-sm text-slate-500">
          Enter your registered email to receive reset instructions.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="input-field"
              placeholder="admin@company.com"
            />
          </label>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          {message && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>
          )}

          <button
            type="submit"
            className="btn-primary flex w-full items-center justify-center gap-2"
            disabled={loading}
          >
            {loading && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            )}
            {loading ? 'Submitting...' : 'Send Reset Link'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-600">
          Back to{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            login
          </Link>
        </p>
      </div>
    </div>
  )
}

export default ForgotPasswordPage
