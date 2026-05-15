function Loader({ text = 'Loading...', fullScreen = false }) {
  const wrapperClass = fullScreen
    ? 'flex min-h-screen items-center justify-center'
    : 'flex items-center justify-center py-8'

  return (
    <div className={wrapperClass}>
      <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-soft ring-1 ring-slate-200">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600" />
        <span className="text-sm text-slate-700">{text}</span>
      </div>
    </div>
  )
}

export default Loader
