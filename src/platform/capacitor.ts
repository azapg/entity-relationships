import { Capacitor } from '@capacitor/core'

/**
 * True when running inside the Capacitor native shell (Android / iOS).
 * On the web this is always false, even if the Capacitor runtime is bundled.
 */
export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export function nativePlatformName(): 'android' | 'ios' | 'web' {
  try {
    return Capacitor.getPlatform() as 'android' | 'ios' | 'web'
  } catch {
    return 'web'
  }
}
