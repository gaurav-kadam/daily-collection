import { useState } from 'react'
import { IoNotificationsOutline } from 'react-icons/io5'

function NotificationDropdown({ notifications = [] }) {
  const [open, setOpen] = useState(false)
  const unreadCount = notifications.filter((item) => !item.isRead).length

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
        aria-label="Open notifications"
      >
        <IoNotificationsOutline size={21} />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-500" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-30 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-slate-500">No notifications</p>
            )}
            {notifications.map((notification) => (
              <div
                key={notification.notificationId}
                className="border-b border-slate-100 px-4 py-3 last:border-b-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-900">{notification.title}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] uppercase text-slate-500">
                    {notification.type}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">{notification.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationDropdown
