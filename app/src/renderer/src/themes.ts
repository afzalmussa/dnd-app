// Colour themes, chosen in Settings. A theme is a set of CSS variables on the page; you can then change
// the main colours by hand (the overrides are kept on top of the theme). Remembered on this PC.

export interface Theme {
  label: string
  light?: boolean
  vars: Record<string, string>
}

function dark(page: string, panel: string, alt: string, field: string, bar: string, ink: string, muted: string, line: string, accent: string, bright: string, soft: string, dim: string): Theme['vars'] {
  return { '--page': page, '--panel': panel, '--panel-alt': alt, '--field': field, '--bar': bar, '--ink': ink, '--muted': muted, '--line': line, '--accent': accent, '--accent-bright': bright, '--accent-soft': soft, '--accent-dim': dim }
}

export const THEMES: Record<string, Theme> = {
  grey: { label: 'Dark grey (red accent)', vars: dark('#1e1e1e', '#262626', '#2e2e2e', '#1a1a1a', '#161616', '#dadada', '#9a9a9a', '#3c3c3c', '#c1121f', '#e5383b', '#3a2326', '#8b2a2a') },
  obsidian: { label: 'Obsidian (grey, purple accent)', vars: dark('#1e1e1e', '#262626', '#2e2e2e', '#1a1a1a', '#161616', '#dadada', '#9a9a9a', '#3c3c3c', '#7b6cd9', '#a99bf0', '#2f2b46', '#5b4fa8') },
  dragon: { label: 'Dragon (dark red)', vars: dark('#110d0e', '#1c1617', '#261d1e', '#140f10', '#0a0708', '#ece3da', '#a39389', '#3d2d2e', '#c1121f', '#e5383b', '#3b1418', '#8b2a2a') },
  midnight: { label: 'Midnight (blue-grey)', vars: dark('#161b22', '#1c232c', '#242d38', '#12171d', '#0e1217', '#d8dee6', '#8b97a5', '#303b48', '#3b82f6', '#6ea8fe', '#1d2b45', '#2f5fae') },
  forest: { label: 'Forest (green-grey)', vars: dark('#1a1f1c', '#222923', '#2a322b', '#161a17', '#111512', '#dbe3dc', '#93a095', '#36413a', '#4a9d5b', '#7fd08e', '#22372a', '#357243') },
  contrast: { label: 'High contrast', vars: dark('#000000', '#0d0d0d', '#1a1a1a', '#000000', '#000000', '#ffffff', '#cfcfcf', '#6a6a6a', '#ffcc00', '#ffe066', '#332900', '#b38f00') },
  parchment: { label: 'Parchment (light)', light: true, vars: dark('#f3ecdc', '#fbf7ec', '#efe6d2', '#ffffff', '#e4d9bf', '#2b2118', '#6f6250', '#cfc2a4', '#9b1c1c', '#b32424', '#f1d9d4', '#b36a6a') }
}

export const DEFAULT_THEME = 'grey'
export const EDITABLE: { variable: string; label: string }[] = [
  { variable: '--page', label: 'Background' }, { variable: '--panel', label: 'Panels' }, { variable: '--ink', label: 'Text' }, { variable: '--accent', label: 'Accent' }
]

export interface ThemeChoice {
  name: string
  overrides: Record<string, string>
}

const KEY = 'theme'

export function loadTheme(): ThemeChoice {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as ThemeChoice | null
    if (saved && THEMES[saved.name]) return { name: saved.name, overrides: saved.overrides ?? {} }
  } catch {
    // not remembered: use the default
  }
  return { name: DEFAULT_THEME, overrides: {} }
}

export function applyTheme(choice: ThemeChoice): void {
  const theme = THEMES[choice.name] ?? THEMES[DEFAULT_THEME]
  const root = document.documentElement
  for (const [k, v] of Object.entries({ ...theme.vars, ...choice.overrides })) root.style.setProperty(k, v)
  root.style.colorScheme = theme.light ? 'light' : 'dark'
  try { localStorage.setItem(KEY, JSON.stringify(choice)) } catch { /* not remembered */ }
}
