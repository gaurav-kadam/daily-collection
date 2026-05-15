import { Navigate, Outlet } from 'react-router-dom'
import Loader from '../components/Loader'
import useAuth from '../hooks/useAuth'

function ProtectedRoute({ allowedRoles = [] }) {
  const { isAuthenticated, loading, user } = useAuth()

  if (loading) {
    return <Loader fullScreen text="Checking your access..." />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user?.role)) {
    const fallbackPath = user?.role === 'collector' ? '/collections' : '/dashboard'
    return <Navigate to={fallbackPath} replace />
  }

  return <Outlet />
}

export default ProtectedRoute
