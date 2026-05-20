export const pageLoaders = {
  login: () => import('../pages/LoginPage'),
  dashboard: () => import('../pages/DashboardPage'),
  moduleDashboard: () => import('../pages/ModuleDashboardPage'),
  customers: () => import('../pages/CustomersPage'),
  addCustomer: () => import('../pages/AddCustomerPage'),
  editCustomer: () => import('../pages/EditCustomerPage'),
  customerDetails: () => import('../pages/CustomerDetailsPage'),
  bachatCustomerProfile: () => import('../pages/BachatCustomerProfilePage'),
  bachatCollection: () => import('../pages/BachatCollectionPage'),
  dailyCollection: () => import('../pages/DailyCollectionPage'),
  collectionHistory: () => import('../pages/CollectionHistoryPage'),
  todayCollectionSummary: () => import('../pages/TodayCollectionSummaryPage'),
  loans: () => import('../pages/LoanPage'),
  loanDetails: () => import('../pages/LoanDetailsPage'),
  emiPayments: () => import('../pages/EMIPaymentPage'),
  overdueEmi: () => import('../pages/OverdueEMIPage'),
  penalties: () => import('../pages/PenaltyDetailsPage'),
  pendingCustomers: () => import('../pages/PendingCustomersPage'),
  notifications: () => import('../pages/NotificationsPage'),
  register: () => import('../pages/RegisterPage'),
  reports: () => import('../pages/ReportsPage'),
  settings: () => import('../pages/SettingsPage'),
  notFound: () => import('../pages/NotFoundPage'),
}

const routePreloaders = {
  '/login': pageLoaders.login,
  '/dashboard': pageLoaders.dashboard,
  '/dashboard/bachat': pageLoaders.moduleDashboard,
  '/dashboard/saving': pageLoaders.moduleDashboard,
  '/dashboard/loan': pageLoaders.moduleDashboard,
  '/dashboard/fd': pageLoaders.moduleDashboard,
  '/dashboard/deposit': pageLoaders.moduleDashboard,
  '/dashboard/expenses': pageLoaders.moduleDashboard,
  '/dashboard/bishi': pageLoaders.moduleDashboard,
  '/dashboard/investments': pageLoaders.moduleDashboard,
  '/customers': pageLoaders.customers,
  '/my-customers': pageLoaders.customers,
  '/customers/add': pageLoaders.addCustomer,
  '/bachat/dashboard': pageLoaders.moduleDashboard,
  '/bachat/enroll': pageLoaders.moduleDashboard,
  '/bachat/collections': pageLoaders.bachatCollection,
  '/bachat/profile': pageLoaders.bachatCustomerProfile,
  '/bachat/collect': pageLoaders.bachatCollection,
  '/collections': pageLoaders.dailyCollection,
  '/collections/today': pageLoaders.todayCollectionSummary,
  '/collection-history': pageLoaders.collectionHistory,
  '/pending-customers': pageLoaders.pendingCustomers,
  '/loans': pageLoaders.loans,
  '/emi-payments': pageLoaders.emiPayments,
  '/emi-overdue': pageLoaders.overdueEmi,
  '/penalties': pageLoaders.penalties,
  '/notifications': pageLoaders.notifications,
  '/register': pageLoaders.register,
  '/reports': pageLoaders.reports,
  '/settings': pageLoaders.settings,
}

const preloadedRoutes = new Set()

export const preloadRoute = (path) => {
  const loader = routePreloaders[path]
  if (!loader || preloadedRoutes.has(path)) return

  preloadedRoutes.add(path)
  loader().catch(() => preloadedRoutes.delete(path))
}
