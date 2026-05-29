import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const pt = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: pt + 32 }]}>
      <View style={[styles.iconCircle, { backgroundColor: colors.muted }]}>
        <Feather name="search" size={32} color={colors.mutedForeground} />
      </View>
      <Text style={[styles.title, { color: colors.foreground, fontFamily: "PlayfairDisplay_600SemiBold" }]}>
        Search
      </Text>
      <Text style={[styles.sub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        Search across all your journal pages and entries — coming soon.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  iconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  title: { fontSize: 24, letterSpacing: -0.3, marginBottom: 8 },
  sub: { fontSize: 15, textAlign: "center", lineHeight: 22, opacity: 0.8 },
});
