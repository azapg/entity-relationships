import { useSyncExternalStore } from 'react'
import type { DiagramFileResult } from './exportDiagram'

export type NotificationKind = 'success' | 'error' | 'info'

export type NotificationAction = {
  label: string
  onSelect: () => void | Promise<void>
}

export type AppNotificationInput = {
  title: string
  message?: string
  kind?: NotificationKind
  /** User-facing file location, shown prominently when present. */
  locationLabel?: string
  actions?: NotificationAction[]
  /** ms before auto-dismiss. 0 or null keeps it until dismissed. */
  durationMs?: number | null
}

export type AppNotification = {
  id: string
  title: string
  message?: string
  kind: NotificationKind
  locationLabel?: string
  actions: NotificationAction[]
  durationMs: number | null
  createdAt: number
}

type Listener = () => void

let notifications: AppNotification[] = []
const listeners = new Set<Listener>()
let counter = 0

function emit() {
  listeners.forEach((listener) => listener())
}

function defaultDuration(kind: NotificationKind, hasActions: boolean): number | null {
  if (kind === 'error') return null
  if (hasActions) return 9000
  return 4000
}

export function notify(input: AppNotificationInput | string): string {
  const normalized: AppNotificationInput = typeof input === 'string' ? { title: input } : input
  const kind = normalized.kind ?? 'success'
  const actions = normalized.actions ?? []
  const id = `notification-${Date.now()}-${(counter += 1)}`
  const notification: AppNotification = {
    id,
    title: normalized.title,
    message: normalized.message,
    kind,
    locationLabel: normalized.locationLabel,
    actions,
    durationMs: normalized.durationMs ?? defaultDuration(kind, actions.length > 0),
    createdAt: Date.now(),
  }
  // Newest first, cap the stack so the UI never overflows small screens.
  notifications = [notification, ...notifications].slice(0, 4)
  emit()
  return id
}

export function dismissNotification(id: string) {
  if (!notifications.some((item) => item.id === id)) return
  notifications = notifications.filter((item) => item.id !== id)
  emit()
}

export function clearNotifications() {
  if (notifications.length === 0) return
  notifications = []
  emit()
}

function snapshot(): AppNotification[] {
  return notifications
}

export function getNotifications(): AppNotification[] {
  return snapshot()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useNotifications(): AppNotification[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** Standard "file saved" notification with location + share action when possible. */
export function notifyFileSaved(
  result: DiagramFileResult,
  options: { title: string; message?: string },
): string {
  const shareAction: NotificationAction[] = result.uri
    ? [
        {
          label: 'Compartir',
          onSelect: async () => {
            const { shareExportedFile } = await import('./exportDiagram')
            await shareExportedFile(result, options.title)
          },
        },
      ]
    : []
  return notify({
    title: options.title,
    message: options.message,
    kind: 'success',
    locationLabel: result.destination === 'documents' ? result.locationLabel : undefined,
    actions: shareAction,
    durationMs: result.uri ? 9000 : 4000,
  })
}

export function notifyError(title: string, message?: string): string {
  return notify({ title, message, kind: 'error' })
}
