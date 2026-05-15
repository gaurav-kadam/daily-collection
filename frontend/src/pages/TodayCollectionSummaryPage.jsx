import { useEffect, useState } from 'react'
import CollectionSummaryCards from '../components/collections/CollectionSummaryCards'
import CollectionTable from '../components/collections/CollectionTable'
import Loader from '../components/Loader'
import useAuth from '../hooks/useAuth'
import collectionService from '../services/collectionService'
import { todayISO } from '../utils/date'

function TodayCollectionSummaryPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({})
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return undefined
    const loadSummary = async () => {
      try {
        const data = await collectionService.getToday({ date: todayISO(), currentUser: user })
        setSummary(data)
      } catch {
        setError('Unable to load today summary.')
      } finally {
        setLoading(false)
      }
    }
    loadSummary()
    return undefined
  }, [user])

  return (
    <div className="space-y-6">
      <section>
        <h2 className="page-title">Today Collection Summary</h2>
        <p className="mt-1 text-sm text-slate-600">Live snapshot for {todayISO()}.</p>
      </section>
      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {loading ? (
        <Loader text="Loading today summary..." />
      ) : (
        <>
          <CollectionSummaryCards summary={summary} />
          <CollectionTable records={summary.records || []} onEdit={() => {}} onDelete={() => {}} onExport={() => {}} />
        </>
      )}
    </div>
  )
}

export default TodayCollectionSummaryPage
