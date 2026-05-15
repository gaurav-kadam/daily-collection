import { Link } from 'react-router-dom'

function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card max-w-lg p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-cyan-700">404 Error</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-slate-900">Page not found</h1>
        <Link to="/dashboard" className="btn-primary mt-6 inline-flex">
          Go to Dashboard
        </Link>
      </div>
    </div>
  )
}

export default NotFoundPage
