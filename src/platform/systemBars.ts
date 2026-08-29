import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'

export type SystemTheme = 'light' | 'dark'

/**
 * Keep Android system-bar icon contrast aligned with the app's actual theme.
 * The web/PWA implementation remains the source of truth; this is only the
 * small native side effect needed by the Capacitor shell.
 */
export function setSystemTheme(theme: SystemTheme): void {
  if (Capacitor.getPlatform() !== 'android') return

  void SystemBars.setStyle({
    style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
  }).catch(() => {
    // Native system-bar support is best effort and must never affect web UI.
  })
}
