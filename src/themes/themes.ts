import type { CustomTheme, Diagram } from '../domain/types'

/** Visual presets deliberately live outside the semantic diagram model. */
export const THEME_PRESETS: Record<Exclude<Diagram['view']['theme'], 'custom'>, CustomTheme> = {
  academic: { background: '#fbf9f4', entity: '#ffffff', relationship: '#f6e3da', ink: '#1c1915', font: 'serif' },
  warm: { background: '#fbf9f4', entity: '#ffd9cb', relationship: '#f6e3da', ink: '#1c1915', font: 'serif' },
  modern: { background: '#14120f', entity: '#1d1a16', relationship: '#2e1c15', ink: '#f2ede3', font: 'sans' },
}

export const themeLabel: Record<Diagram['view']['theme'], string> = {
  academic: 'Académico', warm: 'Cálido', modern: 'Moderno', custom: 'Personalizado',
}
