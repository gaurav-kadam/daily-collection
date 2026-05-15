import { memo } from 'react'
import { NavLink } from 'react-router-dom'
import {
  FiBell,
  FiCreditCard,
  FiGrid,
  FiLogOut,
  FiPlusCircle,
  FiSettings,
  FiUsers,
  FiAlertTriangle,
} from 'react-icons/fi'
import { MdOutlineAccountBalanceWallet, MdOutlinePayments } from 'react-icons/md'
import { IoClose } from 'react-icons/io5'
import useAuth from '../hooks/useAuth'
import { preloadRoute } from '../routes/routePreload'

const navigation = {
  admin: [
    { to: '/dashboard', label: 'Dashboard', icon: FiGrid },
    { to: '/customers', label: 'Customers', icon: FiUsers },
    { to: '/collections', label: 'Daily Collections', icon: MdOutlinePayments },
    { to: '/pending-customers', label: 'Pending Customers', icon: FiAlertTriangle },
    { to: '/loans', label: 'Loans', icon: MdOutlineAccountBalanceWallet },
    { to: '/emi-payments', label: 'EMI Payments', icon: FiCreditCard },
    { to: '/emi-overdue', label: 'EMI Overdue', icon: FiAlertTriangle },
    { to: '/penalties', label: 'Penalties', icon: MdOutlineAccountBalanceWallet },
    { to: '/register', label: 'Register User', icon: FiPlusCircle },
    { to: '/notifications', label: 'Notifications', icon: FiBell },
    { to: '/settings', label: 'Settings', icon: FiSettings },
  ],
  collector: [
    { to: '/dashboard', label: 'Dashboard', icon: FiGrid },
    { to: '/collections', label: 'Daily Collections', icon: MdOutlinePayments },
    { to: '/pending-customers', label: 'Pending Customers', icon: FiAlertTriangle },
    { to: '/emi-payments', label: 'EMI Payments', icon: FiCreditCard },
    { to: '/emi-overdue', label: 'EMI Overdue', icon: FiAlertTriangle },
    { to: '/penalties', label: 'Penalties', icon: MdOutlineAccountBalanceWallet },
    { to: '/my-customers', label: 'My Customers', icon: FiUsers },
    { to: '/notifications', label: 'Notifications', icon: FiBell },
  ],
}

function Sidebar({ open, onClose }) {
  const { logout, user } = useAuth()
  const links = navigation[user?.role] || navigation.collector

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close sidebar backdrop"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 transform-gpu flex-col bg-slate-950 text-slate-200 transition-transform duration-200 will-change-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-800 px-5">
          <div>
            <p className="font-display text-lg font-bold text-white">Daily Collection</p>
            <p className="text-xs text-slate-400">Finance operations</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition-colors duration-150 hover:bg-slate-800 lg:hidden"
            aria-label="Close navigation"
          >
            <IoClose size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {links.map((link) => {
            const Icon = link.icon
            return (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={onClose}
                onFocus={() => preloadRoute(link.to)}
                onMouseEnter={() => preloadRoute(link.to)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                    isActive
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                  }`
                }
              >
                <Icon size={18} />
                <span>{link.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition-colors duration-150 hover:bg-slate-800"
          >
            <FiLogOut size={17} />
            Logout
          </button>
        </div>
      </aside>
    </>
  )
}

export default memo(Sidebar)
