import { useMemo } from "react";
import { useColorScheme } from "react-native";

import colors from "@/constants/colors";
import { useTheme } from "@/hooks/useTheme";

export function useColors() {
  const { theme } = useTheme();
  const systemScheme = useColorScheme();

  const resolved = theme === "system" ? systemScheme : theme;
  
  return useMemo(() => {
    const palette = resolved === "dark" && colors.dark ? colors.dark : colors.light;
    return { ...palette, radius: colors.radius };
  }, [resolved]);
}

