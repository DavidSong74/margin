import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemeOption = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: ThemeOption;
  setTheme: (t: ThemeOption) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => {},
});

const PREFS_KEY = "margin:settings";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeOption>("system");

  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY).then((raw) => {
      if (!raw) return;
      const stored = JSON.parse(raw);
      if (stored.theme) setThemeState(stored.theme);
    });
  }, []);

  const setTheme = useCallback((t: ThemeOption) => {
    setThemeState(t);
    AsyncStorage.getItem(PREFS_KEY).then((raw) => {
      const current = raw ? JSON.parse(raw) : {};
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ ...current, theme: t }));
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
