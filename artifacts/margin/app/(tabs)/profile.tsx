import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const pt = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: pt + 32 }]}>
      <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
        <Text style={[styles.avatarInitial, { fontFamily: "Inter_700Bold" }]}>S</Text>
      </View>
      <Text style={[styles.name, { color: colors.foreground, fontFamily: "PlayfairDisplay_700Bold" }]}>
        Sarah
      </Text>
      <Text style={[styles.sub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        sarah@example.com
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  avatarInitial: { color: "#fff", fontSize: 32 },
  name: { fontSize: 26, letterSpacing: -0.3, marginBottom: 6 },
  sub: { fontSize: 15, opacity: 0.75 },
});
