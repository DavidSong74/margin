import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

export default function CaptureWebStub() {
  const colors = useColors();
  return (
    <View style={[styles.root, { backgroundColor: "#111" }]}>
      <Feather name="camera-off" size={48} color="#fff" style={{ opacity: 0.5 }} />
      <Text style={styles.title}>Camera not available on web</Text>
      <Text style={styles.sub}>Open the app on your iPhone to capture journal pages.</Text>
      <Pressable
        style={[styles.btn, { backgroundColor: colors.primary }]}
        onPress={() => router.back()}
      >
        <Text style={styles.btnText}>Go back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
  },
  sub: {
    fontSize: 15,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    lineHeight: 22,
  },
  btn: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
});
