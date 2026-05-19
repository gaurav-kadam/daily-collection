import { memo, useEffect, useState } from 'react'
import { HiOutlineMenuAlt2 } from 'react-icons/hi'
import { FiBell } from 'react-icons/fi'
import { Link, useLocation } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import { listenNotifications } from '../services/notificationService'

const titleMap = {
  '/dashboard': 'Dashboard',
  '/dashboard/bachat': 'Bachat Dashboard',
  '/dashboard/saving': 'Saving Dashboard',
  '/dashboard/loan': 'Loan Dashboard',
  '/dashboard/fd': 'FD Dashboard',
  '/dashboard/deposit': 'Deposit Dashboard',
  '/dashboard/expenses': 'Expenses Dashboard',
  '/dashboard/bishi': 'Bishi Dashboard',
  '/dashboard/investments': 'Investments Dashboard',
  '/customers': 'Customers',
  '/my-customers': 'My Customers',
  '/collections': 'Daily Collections',
  '/collections/today': 'Today Collection',
  '/collection-history': 'Collection History',
  '/pending-customers': 'Pending Customers',
  '/loans': 'Loans',
  '/emi-payments': 'EMI Payments',
  '/emi-overdue': 'EMI Overdue',
  '/penalties': 'Penalties',
  '/notifications': 'Notifications',
  '/register': 'Register User',
  '/reports': 'Reports',
  '/settings': 'Settings',
}

function Navbar({ onMenuClick }) {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!user?.userId) return undefined
    return listenNotifications(user.userId, (items) => {
      setUnreadCount(items.filter((item) => !item.isRead).length)
    })
  }, [user?.userId])

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-3 md:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 lg:hidden"
            aria-label="Open navigation"
          >
            <HiOutlineMenuAlt2 size={21} />
          </button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700">
              SAIBACHATGAT Finance
            </p>
            <h1 className="font-display text-lg font-semibold text-slate-950">
              {titleMap[pathname] || 'SAIBACHATGAT Finance'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/notifications"
            className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
            aria-label="Open notifications"
          >
            <FiBell size={20} />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
            )}
          </Link>

          <div className="hidden text-right md:block">
            <p className="text-sm font-semibold text-slate-800">{user?.fullName}</p>
            <p className="text-xs capitalize text-slate-500">{user?.role}</p>
          </div>
        </div>
      </div>
    </header>
  )
}

export default memo(Navbar)
