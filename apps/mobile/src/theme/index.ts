/**
 * Design tokens from the "UI kit" board of the Shagun Register design.
 * Received is always blue with ↙, given is always orange with ↗ — never colour alone.
 */
export const colors = {
  sindoor: '#7A1C2E',
  sindoorDark: '#5C1322',
  sindoorTint: '#F6E8EA',
  onSindoorMuted: '#F3DADF',
  marigold: '#F4A51C',
  marigoldDeep: '#D9830B',
  marigoldTint: '#FEF3DC',
  marigoldInk: '#8A5300',
  onMarigold: '#3D2600',
  received: '#0E5AA7',
  receivedTint: '#E7F0FA',
  given: '#A4480A',
  givenTint: '#FCEEE3',
  success: '#1E6B45',
  successTint: '#E5F3EC',
  danger: '#B42318',
  dangerTint: '#FDECEA',
  ink: '#171A21',
  inkMuted: '#4B5262',
  inkSubtle: '#6B7180',
  placeholder: '#9AA0AC',
  line: '#E2E4E9',
  lineStrong: '#D5D8DF',
  ground: '#F3F4F6',
  surface: '#FFFFFF',
  disabled: '#E9EBEF',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = { input: 12, button: 14, card: 18, pill: 999 } as const;

/** Minimum touch target; primary actions are taller. */
export const touch = { min: 44, primary: 56 } as const;

/**
 * Mukta covers Latin and Devanagari. Android needs a separate family per weight,
 * so text styles set fontFamily instead of fontWeight.
 */
export const fonts = {
  regular: 'Mukta_400Regular',
  medium: 'Mukta_500Medium',
  semibold: 'Mukta_600SemiBold',
  bold: 'Mukta_700Bold',
  extrabold: 'Mukta_800ExtraBold',
  wordmark: 'RozhaOne_400Regular',
} as const;

export const type = {
  amountXL: { fontFamily: fonts.extrabold, fontSize: 34, lineHeight: 42 },
  title: { fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 34 },
  section: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 25 },
  rowTitle: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 23 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  meta: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  tiny: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16 },
  /** Small-caps label over a heading, e.g. "FAMILY LEDGER". */
  eyebrow: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, letterSpacing: 1.2, textTransform: 'uppercase' },
} as const;

export type TypeVariant = keyof typeof type;

export const directionColors = {
  received: { fg: colors.received, bg: colors.receivedTint, icon: 'arrow-down-left' },
  given: { fg: colors.given, bg: colors.givenTint, icon: 'arrow-up-right' },
} as const;
