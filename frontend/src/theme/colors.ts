// PopBet color palette and design tokens.
//
// Motyw jest przełączalny w locie: kolory NIE są już importowane bezpośrednio
// do StyleSheet.create na poziomie modułu (bo wtedy wartości zostają "wypalone"
// przy starcie i nie da się ich zmienić). Zamiast tego każdy ekran buduje style
// przez `useThemedStyles(makeStyles)` — patrz src/theme/ThemeContext.tsx.

export const lightColors = {
  bg: "#FAFAF7",
  bgAlt: "#F5F3ED",
  card: "#FFFFFF",
  primary: "#FF8A65",
  primarySoft: "#FFE0D6",
  win: "#7FD8BE",
  winSoft: "#E4F7EF",
  loss: "#F4A6A6",
  lossSoft: "#FBE5E5",
  text: "#2D3748",
  textMuted: "#718096",
  border: "rgba(45, 55, 72, 0.06)",
  shadow: "rgba(45, 55, 72, 0.08)",
  // tekst na kolorowym tle (przyciski primary itp.) — stały w obu motywach
  onPrimary: "#FFFFFF",
  // semantyka akcji destrukcyjnych i wyników — osobno, bo muszą być czytelne
  // na tle karty w obu motywach (w ciemnym ciemna czerwień znika)
  danger: "#C0392B",
  dangerSoft: "#FBE5E5",
  onWin: "#2E856E",
  onLoss: "#8E3A3A",
  categories: {
    sport: { bg: "#E3F2FD", accent: "#5B9BD5", emoji: "⚽" },
    awards: { bg: "#FFF9C4", accent: "#E0B84E", emoji: "🏆" },
    reality_tv: { bg: "#FCE4EC", accent: "#E38FB0", emoji: "📺" },
    gossip: { bg: "#F3E5F5", accent: "#B47EBB", emoji: "💬" },
    music: { bg: "#E8F5E9", accent: "#7BB77E", emoji: "🎤" },
  },
};

export const darkColors: typeof lightColors = {
  bg: "#14161A",
  bgAlt: "#1C1F25",
  card: "#21252C",
  primary: "#FF8A65",
  primarySoft: "#3B2A23",
  win: "#7FD8BE",
  winSoft: "#1B3A31",
  loss: "#F4A6A6",
  lossSoft: "#3B2626",
  text: "#ECEFF4",
  textMuted: "#9AA3B2",
  border: "rgba(255, 255, 255, 0.10)",
  shadow: "rgba(0, 0, 0, 0.50)",
  onPrimary: "#FFFFFF",
  danger: "#F4A6A6",
  dangerSoft: "#3B2626",
  onWin: "#7FD8BE",
  onLoss: "#F4A6A6",
  categories: {
    sport: { bg: "#1B2A38", accent: "#5B9BD5", emoji: "⚽" },
    awards: { bg: "#33301A", accent: "#E0B84E", emoji: "🏆" },
    reality_tv: { bg: "#33202A", accent: "#E38FB0", emoji: "📺" },
    gossip: { bg: "#2A2033", accent: "#B47EBB", emoji: "💬" },
    music: { bg: "#1D2E20", accent: "#7BB77E", emoji: "🎤" },
  },
};

export type Colors = typeof lightColors;
export type CategoryKey = keyof Colors["categories"];

// ---------------------------------------------------------------------------
// Runtime motywu.
//
// `colors` jest proxy: każdy odczyt colors.X zwraca wartość z AKTUALNEGO motywu,
// więc istniejący kod (`colors.text` w JSX itd.) działa bez zmian i sam się
// przełącza. Wartość ustawia ThemeProvider przez setRuntimeColors().
// ---------------------------------------------------------------------------
let runtimeColors: Colors = lightColors;

export function setRuntimeColors(c: Colors): void {
  runtimeColors = c;
}

export function getRuntimeColors(): Colors {
  return runtimeColors;
}

export const colors: Colors = new Proxy({} as Colors, {
  get: (_t, p) => (getRuntimeColors() as any)[p],
  has: (_t, p) => p in (getRuntimeColors() as any),
  ownKeys: () => Reflect.ownKeys(getRuntimeColors() as any),
  getOwnPropertyDescriptor: (_t, p) => {
    const d = Object.getOwnPropertyDescriptor(getRuntimeColors() as any, p);
    return d ? { ...d, configurable: true } : undefined;
  },
});

/**
 * Odracza StyleSheet.create do momentu użycia i przelicza style po zmianie
 * motywu. Dzięki temu `const styles = themedStyles(() => StyleSheet.create({...}))`
 * zachowuje się jak zwykły obiekt stylów, ale nie "wypala" kolorów przy starcie.
 */
export function themedStyles<T extends Record<string, unknown>>(factory: () => T): T {
  let key: Colors | null = null;
  let cached: T | null = null;
  return new Proxy({} as T, {
    get: (_t, p) => {
      const c = getRuntimeColors();
      if (cached === null || key !== c) {
        cached = factory();
        key = c;
      }
      return (cached as any)[p];
    },
  });
}

export const categoryList: { key: CategoryKey | "all"; label: string }[] = [
  { key: "all", label: "Wszystkie" },
  { key: "sport", label: "Sport" },
  { key: "awards", label: "Nagrody" },
  { key: "reality_tv", label: "Reality TV" },
  { key: "gossip", label: "Plotki" },
  { key: "music", label: "Muzyka" },
];

export const shadow = {
  soft: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  softer: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
};

export const radii = { card: 24, pill: 999, button: 20 };
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
