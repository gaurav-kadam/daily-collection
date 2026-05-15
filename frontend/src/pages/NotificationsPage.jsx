import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { FiCheck, FiBell } from 'react-icons/fi'
import Loader from '../components/Loader'
import useAuth from '../hooks/useAuth'
import {
  listenNotifications,
  markNotificationRead,
} from '../services/notificationService'

function NotificationsPage() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.userId) return undefined
    return listenNotifications(
      user.userId,
      (items) => {
        setNotifications(items)
        setLoading(false)
      },
      (error) => {
        toast.error(error.message)
        setLoading(false)
      },
    )
  }, [user?.userId])

  const handleRead = async (notificationId) => {
    try {
      await markNotificationRead(notificationId)
    } catch (error) {
      toast.error(error.message)
    }
  }

  if (loading) {
    return <Loader text="Loading notifications..." />
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="page-title">Notifications</h2>
        <p className="mt-1 text-sm text-slate-500">{notifications.length} messages</p>
      </div>

      <section className="space-y-3">
        {notifications.map((notification) => (
          <article
            key={notification.notificationId || notification.id}
            className={`card flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between ${
              notification.isRead ? 'opacity-75' : ''
            }`}
          >
            <div className="flex gap-3">
              <span className="mt-1 rounded-lg bg-cyan-50 p-2 text-cyan-700">
                <FiBell size={18} />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-slate-950">{notification.title}</h3>
                  <span className="badge bg-slate-100 text-slate-600">
                    {notification.type || 'general'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{notification.message}</p>
              </div>
            </div>
            {!notification.isRead && (
              <button
                type="button"
                className="btn-secondary gap-2"
                onClick={() => handleRead(notification.notificationId || notification.id)}
              >
                <FiCheck />
                Mark read
              </button>
            )}
          </article>
        ))}

        {notifications.length === 0 && (
          <div className="card p-8 text-center text-sm text-slate-500">
            No notifications
          </div>
        )}
      </section>
    </div>
  )
}

export default NotificationsPage
