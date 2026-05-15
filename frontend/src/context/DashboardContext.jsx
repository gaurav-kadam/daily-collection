import { createContext, useCallback, useMemo, useState } from 'react'
import dashboardService from '../services/dashboardService'

export const DashboardContext = createContext(null)

export function DashboardProvider({ children }) {
  const [state, setState] = useState({
    stats: null,
    recentCollections: { results: [], count: 0, page: 1, pageSize: 10 },
    recentLoans: { results: [], count: 0, page: 1, pageSize: 10 },
    pendingCustomers: { results: [], count: 0, page: 1, pageSize: 10 },
    weeklyChart: [],
    monthlyChart: [],
    notifications: [],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadDashboard = useCallback(async (collectionParams = {}) => {
    setLoading(true)
    setError('')
    try {
      const [
        stats,
        recentCollections,
        recentLoans,
        pendingCustomers,
        weeklyChart,
        monthlyChart,
        notifications,
      ] = await Promise.all([
        dashboardService.getStats(),
        dashboardService.getRecentCollections(collectionParams),
        dashboardService.getRecentLoans({ page_size: 6 }),
        dashboardService.getPendingCustomers({ page_size: 6 }),
        dashboardService.getWeeklyChart(),
        dashboardService.getMonthlyChart(),
        dashboardService.getNotifications(),
      ])

      setState({
        stats,
        recentCollections,
        recentLoans,
        pendingCustomers,
        weeklyChart,
        monthlyChart,
        notifications,
      })
    } catch {
      setError('Unable to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshDashboard = useCallback(async (collectionParams = {}) => {
    dashboardService.clearCache()
    await loadDashboard(collectionParams)
  }, [loadDashboard])

  const value = useMemo(
    () => ({
      ...state,
      loading,
      error,
      loadDashboard,
      refreshDashboard,
    }),
    [error, loadDashboard, loading, refreshDashboard, state],
  )

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}
