export const studioTitleDefaults = {
  text: '#fff4e6',
  effect: '#100c08',
} as const

export const studioTitlePalette = [
  '#fff4e6', '#ffffff', '#ffd230', '#ff6a00',
  '#ff4778', '#7cf4ff', '#b6f27c', '#17100a',
] as const

export const studioTitlePresets = [
  { id: 'pop', label: 'Pop', sample: 'Aa', font: 'montserrat', casing: 'upper', color: '#fff4e6', effect: 'outline', effectColor: '#17100a' },
  { id: 'clean', label: 'Clean', sample: 'Aa', font: 'inter', casing: 'title', color: '#fff4e6', effect: 'shadow', effectColor: '#100c08' },
  { id: 'editorial', label: 'Editorial', sample: 'Aa', font: 'inter', casing: 'upper', color: '#f3d8b5', effect: 'box', effectColor: '#21150d' },
  { id: 'neon', label: 'Neon', sample: 'Aa', font: 'montserrat', casing: 'upper', color: '#7cf4ff', effect: 'glow', effectColor: '#00b8d4' },
] as const

export const studioSubtitleDefaults = {
  text: '#ffd230',
  effect: '#17100a',
  karaoke: '#ffffff',
  font: 'montserrat' as const,
  animationDurationMs: 280,
}

export const studioSubtitlePresets = [
  { id: 'viral_pop', label: 'Viral Pop', color: '#ffd230', effectColor: '#17100a', font: 'montserrat', weight: 800, effect: 'outline' },
  { id: 'beast_punch', label: 'Beast Punch', color: '#55ec9a', effectColor: '#101010', font: 'montserrat', weight: 900, effect: 'outline' },
  { id: 'cyber_violet', label: 'Cyber', color: '#dc8cff', effectColor: '#160a20', font: 'inter', weight: 800, effect: 'outline' },
  { id: 'fire_crimson', label: 'Fire Crimson', color: '#ff635e', effectColor: '#240b09', font: 'montserrat', weight: 900, effect: 'outline' },
  { id: 'electric_cyan', label: 'Electric', color: '#53eaff', effectColor: '#062029', font: 'inter', weight: 800, effect: 'shadow' },
  { id: 'golden_aura', label: 'Golden Aura', color: '#ffc247', effectColor: '#261607', font: 'montserrat', weight: 800, effect: 'shadow' },
  { id: 'clean_minimal', label: 'Clean Minimal', color: '#ffffff', effectColor: '#17100a', font: 'inter', weight: 500, effect: 'shadow' },
] as const

export const studioSubtitlePalette = [
  '#ffffff', '#ffd230', '#ff6a00', '#ff635e',
  '#dc8cff', '#53eaff', '#55ec9a', '#17100a',
] as const
