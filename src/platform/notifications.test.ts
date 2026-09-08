import { beforeEach, describe, expect, it } from 'vitest'
import { NATIVE_EXPORT_DIR, nativeLocationLabel } from './nativeFiles'
import {
  clearNotifications,
  dismissNotification,
  getNotifications,
  notify,
  notifyError,
  notifyFileSaved,
} from './notifications'

describe('nativeLocationLabel', () => {
  it('points inside the public Documents folder', () => {
    expect(nativeLocationLabel('diagrama.png')).toBe(`Documentos/${NATIVE_EXPORT_DIR}/diagrama.png`)
  })
})

describe('notifications store', () => {
  beforeEach(() => clearNotifications())

  it('queues a simple toast', () => {
    const id = notify('Hola')
    expect(getNotifications()).toHaveLength(1)
    expect(getNotifications()[0].id).toBe(id)
    expect(getNotifications()[0].title).toBe('Hola')
  })

  it('dismisses notifications by id', () => {
    const id = notify('Hola')
    dismissNotification(id)
    expect(getNotifications()).toHaveLength(0)
  })

  it('keeps error notifications until dismissed', () => {
    notifyError('Fallo', 'detalle')
    const [item] = getNotifications()
    expect(item.kind).toBe('error')
    expect(item.durationMs).toBeNull()
  })

  it('builds a share action for native saved files', () => {
    const id = notifyFileSaved(
      {
        fileName: 'diagrama.png',
        destination: 'documents',
        locationLabel: nativeLocationLabel('diagrama.png'),
        uri: 'content://example/diagrama.png',
        shared: false,
      },
      { title: 'PNG guardado' },
    )
    const [item] = getNotifications()
    expect(item.id).toBe(id)
    expect(item.locationLabel).toBe(nativeLocationLabel('diagrama.png'))
    expect(item.actions.map((action) => action.label)).toContain('Compartir')
  })

  it('omits the share action for web downloads without a uri', () => {
    notifyFileSaved(
      { fileName: 'diagrama.png', destination: 'download', locationLabel: 'Descargas', shared: false },
      { title: 'PNG exportado' },
    )
    expect(getNotifications()[0].actions).toHaveLength(0)
  })
})
