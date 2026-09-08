import { useEffect } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { dismissNotification, useNotifications, type AppNotification } from '../platform/notifications'

const KIND_ICON = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
} as const

function NotificationCard({ notification }: { notification: AppNotification }) {
  const Icon = KIND_ICON[notification.kind]

  useEffect(() => {
    if (notification.durationMs === null) return
    const timer = window.setTimeout(() => dismissNotification(notification.id), notification.durationMs)
    return () => window.clearTimeout(timer)
  }, [notification.durationMs, notification.id])

  return (
    <div
      className={`notification notification--${notification.kind}`}
      role={notification.kind === 'error' ? 'alert' : 'status'}
    >
      <span className="notification-icon" aria-hidden="true">
        <Icon size={17} />
      </span>
      <div className="notification-copy">
        <strong>{notification.title}</strong>
        {notification.message && <span>{notification.message}</span>}
        {notification.locationLabel && (
          <small className="notification-location">Guardado en {notification.locationLabel}</small>
        )}
        {notification.actions.length > 0 && (
          <div className="notification-actions">
            {notification.actions.map((action) => (
              <button
                key={action.label}
                type="button"
                className="notification-action"
                onClick={() => {
                  void action.onSelect()
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        className="notification-close"
        aria-label="Descartar notificación"
        onClick={() => dismissNotification(notification.id)}
      >
        <X size={15} />
      </button>
    </div>
  )
}

export function NotificationStack() {
  const notifications = useNotifications()
  if (notifications.length === 0) return null
  return (
    <div className="notification-stack" aria-live="polite">
      {notifications.map((notification) => (
        <NotificationCard key={notification.id} notification={notification} />
      ))}
    </div>
  )
}
