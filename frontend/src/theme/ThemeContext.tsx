// Motyw (jasny/ciemny) z zapisem wyboru i przełączaniem w locie.
//
// Dlaczego hook zamiast zwykłego importu kolorów: StyleSheet.create wykonuje się
// raz przy starcie modułu i "wypala" wartości kolorów. Żeby motyw dało się zmienić
// bez restartu, każdy ekran deklaruje fabrykę stylów (c: Colors) => StyleSheet.create(...)
// i pobiera gotowe style przez useThemedStyles(makeStyles).
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Appearance } from "react-native";

import { Colors, darkColors, lightColors, setRuntimeColors } from "@/src/theme/colors";
import { storage } from "@/src/utils/storage";

export type ThemeMode = "light" | "dark";

const THEME_KEY = "popbet_theme";

type ThemeState = {
  mode: ThemeMode;
  colors: Colors;
  isDark: boolean;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Przy pierwszym uruchomieniu idziemy za ustawieniem systemu, potem
  // decyduje zapisany wybór użytkownika.
  const [mode, setModeState] = useState<ThemeMode>(
    Appearance.getColorScheme() === "dark" ? "dark" : "light",
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = await storage.getItem<string>(THEME_KEY, "");
      if (alive && (saved === "light" || saved === "dark")) setModeState(saved);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    storage.setItem(THEME_KEY, m);
  }, []);

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next: ThemeMode = prev === "dark" ? "light" : "dark";
      storage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);

  const themeColors = mode === "dark" ? darkColors : lightColors;
  // Synchronicznie, PRZED renderem dzieci — inaczej pierwszy render po zmianie
  // motywu odczytałby jeszcze stare kolory z proxy w colors.ts.
  setRuntimeColors(themeColors);

  const value = useMemo<ThemeState>(
    () => ({
      mode,
      colors: themeColors,
      isDark: mode === "dark",
      setMode,
      toggle,
    }),
    [mode, themeColors, setMode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be inside <ThemeProvider>");
  return ctx;
}

/** Skrót, gdy potrzebujesz samych kolorów (np. do propsów ikon). */
export function useColors(): Colors {
  return useTheme().colors;
}

/**
 * Buduje style z fabryki i przelicza je tylko przy zmianie motywu.
 * Fabryka musi być zdefiniowana na poziomie modułu (stała referencja).
 */
export function useThemedStyles<T>(factory: (c: Colors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [factory, colors]);
}
