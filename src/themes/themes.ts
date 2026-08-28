import type { CustomTheme, Diagram } from '../domain/types'

/** Visual presets deliberately live outside the semantic diagram model. */
export const THEME_PRESETS: Record<Exclude<Diagram['view']['theme'], 'custom'>, CustomTheme> = {
  academic: { background: '#f7f5ef', entity: '#fffdf8', relationship: '#f1ece2', ink: '#292722', font: 'serif' },
  warm: { background: '#fbf3e9', entity: '#ffe5cc', relationship: '#f5c7c3', ink: '#3d2924', font: 'serif' },
  modern: { background: '#101518', entity: '#1c2829', relationship: '#2c2537', ink: '#e7ece8', font: 'sans' },
}

export const themeLabel: Record<Diagram['view']['theme'], string> = {
  academic: 'Académico', warm: 'Cálido', modern: 'Moderno', custom: 'Personalizado',
}
