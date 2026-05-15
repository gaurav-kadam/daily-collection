import useAuth from '../hooks/useAuth'

const collections = [
  'users',
  'customers',
  'dailyCollections',
  'loans',
  'emiPayments',
  'notifications',
]

function SettingsPage() {
  const { user } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="page-title">Settings</h2>
        <p className="mt-1 text-sm text-slate-500">Firebase project workspace</p>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="card p-4">
          <h3 className="section-title">Profile</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
              <dt className="text-slate-500">Name</dt>
              <dd className="font-semibold text-slate-950">{user?.fullName}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
              <dt className="text-slate-500">Email</dt>
              <dd className="font-semibold text-slate-950">{user?.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Role</dt>
              <dd className="font-semibold capitalize text-slate-950">{user?.role}</dd>
            </div>
          </dl>
        </article>

        <article className="card p-4">
          <h3 className="section-title">Firestore Collections</h3>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {collections.map((collectionName) => (
              <div
                key={collectionName}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700"
              >
                {collectionName}
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}

export default SettingsPage
