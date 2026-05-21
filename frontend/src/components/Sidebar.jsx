import { memo, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  FiBell,
  FiChevronDown,
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
    {
      type: 'group',
      id: 'bachat',
      label: 'Bachat',
      icon: MdOutlineAccountBalanceWallet,
      activePrefixes: ['/bachat', '/dashboard/bachat'],
      children: [
        {
          to: '/bachat/dashboard',
          label: 'Bachat Dashboard',
          icon: FiGrid,
          activePaths: ['/bachat/dashboard', '/dashboard/bachat'],
        },
        { to: '/bachat/enroll', label: 'Add Customer To Bachat', icon: FiPlusCircle, refreshOnClick: true },
        {
          to: '/bachat/collections',
          label: 'Bachat Daily Collections',
          icon: MdOutlinePayments,
          activePaths: ['/bachat/collections', '/bachat/collect'],
        },
      ],
    },
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
    {
      type: 'group',
      id: 'bachat',
      label: 'Bachat',
      icon: MdOutlineAccountBalanceWallet,
      activePrefixes: ['/bachat', '/dashboard/bachat'],
      children: [
        {
          to: '/bachat/dashboard',
          label: 'Bachat Dashboard',
          icon: FiGrid,
          activePaths: ['/bachat/dashboard', '/dashboard/bachat'],
        },
        { to: '/bachat/enroll', label: 'Add Customer To Bachat', icon: FiPlusCircle, refreshOnClick: true },
        {
          to: '/bachat/collections',
          label: 'Bachat Daily Collections',
          icon: MdOutlinePayments,
          activePaths: ['/bachat/collections', '/bachat/collect'],
        },
      ],
    },
    { to: '/collections', label: 'Daily Collections', icon: MdOutlinePayments },
    { to: '/pending-customers', label: 'Pending Customers', icon: FiAlertTriangle },
    { to: '/emi-payments', label: 'EMI Payments', icon: FiCreditCard },
    { to: '/emi-overdue', label: 'EMI Overdue', icon: FiAlertTriangle },
    { to: '/penalties', label: 'Penalties', icon: MdOutlineAccountBalanceWallet },
    { to: '/my-customers', label: 'My Customers', icon: FiUsers },
    { to: '/notifications', label: 'Notifications', icon: FiBell },
  ],
}

const isRouteActive = (pathname, item) => {
  if (item.activePaths?.includes(pathname)) return true
  return pathname === item.to
}

const isGroupActive = (pathname, group) =>
  group.activePrefixes?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
  group.children?.some((child) => isRouteActive(pathname, child))

function Sidebar({ open, onClose }) {
  const { logout, user } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const links = navigation[user?.role] || navigation.collector
  const [expandedGroups, setExpandedGroups] = useState({})
  const refreshCounter = useRef(0)

  useEffect(() => {
    links.forEach((link) => {
      if (link.type === 'group' && isGroupActive(pathname, link)) {
        setExpandedGroups((previous) => ({ ...previous, [link.id]: true }))
      }
    })
  }, [links, pathname])

  const toggleGroup = (groupId) => {
    setExpandedGroups((previous) => ({ ...previous, [groupId]: !previous[groupId] }))
  }

  const handleChildClick = (event, child) => {
    if (child.refreshOnClick) {
      event.preventDefault()
      refreshCounter.current += 1
      navigate(`${child.to}?open=${refreshCounter.current}`)
    }
    onClose()
  }

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
            <p className="font-display text-lg font-bold text-white">SAIBACHATGAT</p>
            <p className="text-xs text-slate-400">Finance</p>
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
            if (link.type === 'group') {
              const expanded = Boolean(expandedGroups[link.id])
              const active = isGroupActive(pathname, link)

              return (
                <div key={link.id} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => toggleGroup(link.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                      active
                        ? 'bg-cyan-500 text-slate-950'
                        : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                    }`}
                    aria-expanded={expanded}
                  >
                    <span className="flex items-center gap-3">
                      <Icon size={18} />
                      <span>{link.label}</span>
                    </span>
                    <FiChevronDown
                      size={16}
                      className={`transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {expanded && (
                    <div className="ml-4 space-y-1 border-l border-slate-800 pl-3">
                      {link.children.map((child) => {
                        const ChildIcon = child.icon
                        const childActive = isRouteActive(pathname, child)
                        return (
                          <Link
                            key={child.to}
                            to={child.to}
                            onClick={(event) => handleChildClick(event, child)}
                            onFocus={() => preloadRoute(child.to)}
                            onMouseEnter={() => preloadRoute(child.to)}
                            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                              childActive
                                ? 'bg-slate-800 text-cyan-200 ring-1 ring-cyan-400/20'
                                : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                            }`}
                          >
                            <ChildIcon size={16} />
                            <span>{child.label}</span>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/dashboard'}
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
