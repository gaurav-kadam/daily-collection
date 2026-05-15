import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RegisterForm from '../components/RegisterForm'
import useAuth from '../hooks/useAuth'

function RegisterPage() {
  const navigate = useNavigate()
  const { registerUser, actionLoading } = useAuth()
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const handleRegister = async (payload) => {
    setError('')
    setSuccessMessage('')
    try {
      await registerUser({
        fullName: payload.fullName || payload.full_name,
        email: payload.email,
        mobile: payload.mobile,
        password: payload.password,
        role: payload.role,
      })
      setSuccessMessage(`${payload.role} account created successfully.`)
      setTimeout(() => {
        navigate('/dashboard')
      }, 1200)
    } catch (requestError) {
      const responseData = requestError.response?.data
      if (typeof responseData === 'object' && responseData !== null) {
        const firstMessage = Object.values(responseData)?.[0]
        setError(Array.isArray(firstMessage) ? firstMessage[0] : String(firstMessage))
      } else {
        setError(requestError.message || 'Unable to create user account.')
      }
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">Register User</h2>
        <p className="mt-1 text-sm text-slate-600">
          Admin can create admin or collector accounts from this screen.
        </p>
      </div>

      <div className="card p-6">
        {successMessage && (
          <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </div>
        )}
        <RegisterForm onSubmit={handleRegister} loading={actionLoading} errorMessage={error} />
      </div>
    </div>
  )
}

export default RegisterPage
