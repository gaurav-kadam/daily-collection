import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Loader from '../components/Loader'
import DashboardLayout from '../layouts/DashboardLayout'
import ProtectedRoute from './ProtectedRoute'
import { pageLoaders } from './routePreload'

const LoginPage = lazy(pageLoaders.login)
const DashboardPage = lazy(pageLoaders.dashboard)
const ModuleDashboardPage = lazy(pageLoaders.moduleDashboard)
const CustomersPage = lazy(pageLoaders.customers)
const AddCustomerPage = lazy(pageLoaders.addCustomer)
const EditCustomerPage = lazy(pageLoaders.editCustomer)
const CustomerDetailsPage = lazy(pageLoaders.customerDetails)
const BachatCustomerProfilePage = lazy(pageLoaders.bachatCustomerProfile)
const DailyCollectionPage = lazy(pageLoaders.dailyCollection)
const CollectionHistoryPage = lazy(pageLoaders.collectionHistory)
const TodayCollectionSummaryPage = lazy(pageLoaders.todayCollectionSummary)
const LoanPage = lazy(pageLoaders.loans)
const LoanDetailsPage = lazy(pageLoaders.loanDetails)
const EMIPaymentPage = lazy(pageLoaders.emiPayments)
const OverdueEMIPage = lazy(pageLoaders.overdueEmi)
const PenaltyDetailsPage = lazy(pageLoaders.penalties)
const PendingCustomersPage = lazy(pageLoaders.pendingCustomers)
const NotificationsPage = lazy(pageLoaders.notifications)
const RegisterPage = lazy(pageLoaders.register)
const ReportsPage = lazy(pageLoaders.reports)
const SettingsPage = lazy(pageLoaders.settings)
const NotFoundPage = lazy(pageLoaders.notFound)

function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loader fullScreen text="Loading page..." />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/dashboard/:moduleId" element={<ModuleDashboardPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/my-customers" element={<CustomersPage />} />
              <Route path="/customers/:customerId" element={<CustomerDetailsPage />} />
              <Route path="/bachat/profile/:customerId" element={<BachatCustomerProfilePage />} />
              <Route path="/collections" element={<DailyCollectionPage />} />
              <Route path="/collections/today" element={<TodayCollectionSummaryPage />} />
              <Route path="/collection-history" element={<CollectionHistoryPage />} />
              <Route path="/pending-customers" element={<PendingCustomersPage />} />
              <Route path="/emi-payments" element={<EMIPaymentPage />} />
              <Route path="/emi-overdue" element={<OverdueEMIPage />} />
              <Route path="/penalties" element={<PenaltyDetailsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />

              <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
                <Route path="/customers/add" element={<AddCustomerPage />} />
                <Route path="/customers/:customerId/edit" element={<EditCustomerPage />} />
                <Route path="/loans" element={<LoanPage />} />
                <Route path="/loans/:loanId" element={<LoanDetailsPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default AppRouter
