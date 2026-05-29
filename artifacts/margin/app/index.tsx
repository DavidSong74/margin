import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";

type Mode = "login" | "signup";

export default function AuthScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const switchMode = useCallback(
    (newMode: Mode) => {
      if (newMode === mode) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 140,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
      setTimeout(() => {
        setMode(newMode);
        setErrors({});
        setName("");
        setPassword("");
        setConfirmPassword("");
        setShowPassword(false);
        setShowConfirm(false);
      }, 140);
    },
    [mode, fadeAnim],
  );

  const MOCK_EMAIL = "asdf@asdf.com";
  const MOCK_PASSWORD = "12341234";

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Please enter a valid email address.";
    }
    if (password.length < 8) {
      next.password = "Password must be at least 8 characters.";
    }
    if (mode === "login") {
      if (email === MOCK_EMAIL && password !== MOCK_PASSWORD) {
        next.password = "Incorrect password.";
      } else if (email !== MOCK_EMAIL && password.length >= 8) {
        next.email = "No account found for this email.";
      }
    }
    if (mode === "signup" && password !== confirmPassword) {
      next.confirmPassword = "Passwords don't match.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 900));
    setSubmitting(false);
    router.replace("/(tabs)");
  };

  const inputBorderColor = (field: string, hasError: boolean) => {
    if (hasError) return colors.destructive;
    if (focusedField === field) return colors.primary;
    return colors.border;
  };

  const pt =
    Platform.OS === "web" ? 67 : insets.top + 24;
  const pb =
    Platform.OS === "web" ? 34 : insets.bottom + 32;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: pt, paddingBottom: pb },
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={32}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Wordmark ── */}
        <View style={styles.wordmark}>
          <Text
            style={[
              styles.wordmarkText,
              { color: colors.foreground, fontFamily: "PlayfairDisplay_700Bold" },
            ]}
          >
            Margin
          </Text>
          <Text
            style={[
              styles.tagline,
              {
                color: colors.mutedForeground,
                fontFamily: "Inter_400Regular",
              },
            ]}
          >
            Every journal you've ever kept.
          </Text>
        </View>

        {/* ── Card ── */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* Heading */}
            <Text
              style={[
                styles.heading,
                {
                  color: colors.foreground,
                  fontFamily: "PlayfairDisplay_600SemiBold",
                },
              ]}
            >
              {mode === "login" ? "Welcome back" : "Start your archive"}
            </Text>
            <Text
              style={[
                styles.subheading,
                { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
              ]}
            >
              {mode === "login"
                ? "Sign in to your journals."
                : "Create an account to get started."}
            </Text>

            <View style={styles.fields}>
              {/* Name — signup only */}
              {mode === "signup" && (
                <View>
                  <Text
                    style={[
                      styles.label,
                      { color: colors.foreground, fontFamily: "Inter_500Medium" },
                    ]}
                  >
                    Name{" "}
                    <Text
                      style={{
                        color: colors.mutedForeground,
                        fontFamily: "Inter_400Regular",
                      }}
                    >
                      (optional)
                    </Text>
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        borderColor: inputBorderColor("name", false),
                        color: colors.foreground,
                        backgroundColor: colors.background,
                        fontFamily: "Inter_400Regular",
                      },
                    ]}
                    value={name}
                    onChangeText={setName}
                    placeholder="Your name"
                    placeholderTextColor={colors.mutedForeground}
                    autoComplete="name"
                    onFocus={() => setFocusedField("name")}
                    onBlur={() => setFocusedField(null)}
                    testID="input-name"
                  />
                </View>
              )}

              {/* Email */}
              <View>
                <Text
                  style={[
                    styles.label,
                    { color: colors.foreground, fontFamily: "Inter_500Medium" },
                  ]}
                >
                  Email
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      borderColor: inputBorderColor("email", !!errors.email),
                      color: colors.foreground,
                      backgroundColor: colors.background,
                      fontFamily: "Inter_400Regular",
                    },
                  ]}
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    setErrors((e) => ({ ...e, email: "" }));
                  }}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  testID="input-email"
                />
                {!!errors.email && (
                  <Text
                    style={[
                      styles.errorText,
                      {
                        color: colors.destructive,
                        fontFamily: "Inter_400Regular",
                      },
                    ]}
                  >
                    {errors.email}
                  </Text>
                )}
              </View>

              {/* Password */}
              <View>
                <View style={styles.labelRow}>
                  <Text
                    style={[
                      styles.label,
                      {
                        color: colors.foreground,
                        fontFamily: "Inter_500Medium",
                      },
                    ]}
                  >
                    Password
                  </Text>
                  {mode === "login" && (
                    <TouchableOpacity
                      onPress={() => Haptics.selectionAsync()}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text
                        style={[
                          styles.forgotText,
                          { color: colors.primary, fontFamily: "Inter_500Medium" },
                        ]}
                      >
                        Forgot password?
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.passwordWrap}>
                  <TextInput
                    style={[
                      styles.input,
                      styles.passwordInput,
                      {
                        borderColor: inputBorderColor(
                          "password",
                          !!errors.password,
                        ),
                        color: colors.foreground,
                        backgroundColor: colors.background,
                        fontFamily: "Inter_400Regular",
                      },
                    ]}
                    value={password}
                    onChangeText={(v) => {
                      setPassword(v);
                      setErrors((e) => ({ ...e, password: "" }));
                    }}
                    placeholder={
                      mode === "signup" ? "Min. 8 characters" : "••••••••"
                    }
                    placeholderTextColor={colors.mutedForeground}
                    secureTextEntry={!showPassword}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                    testID="input-password"
                  />
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setShowPassword((v) => !v)}
                    accessibilityLabel={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    <Feather
                      name={showPassword ? "eye" : "eye-off"}
                      size={18}
                      color={colors.mutedForeground}
                    />
                  </TouchableOpacity>
                </View>
                {mode === "signup" && !errors.password && (
                  <Text
                    style={[
                      styles.hint,
                      {
                        color: colors.mutedForeground,
                        fontFamily: "Inter_400Regular",
                      },
                    ]}
                  >
                    At least 8 characters required.
                  </Text>
                )}
                {!!errors.password && (
                  <Text
                    style={[
                      styles.errorText,
                      {
                        color: colors.destructive,
                        fontFamily: "Inter_400Regular",
                      },
                    ]}
                  >
                    {errors.password}
                  </Text>
                )}
              </View>

              {/* Confirm password — signup only */}
              {mode === "signup" && (
                <View>
                  <Text
                    style={[
                      styles.label,
                      {
                        color: colors.foreground,
                        fontFamily: "Inter_500Medium",
                      },
                    ]}
                  >
                    Confirm password
                  </Text>
                  <View style={styles.passwordWrap}>
                    <TextInput
                      style={[
                        styles.input,
                        styles.passwordInput,
                        {
                          borderColor: inputBorderColor(
                            "confirm",
                            !!errors.confirmPassword,
                          ),
                          color: colors.foreground,
                          backgroundColor: colors.background,
                          fontFamily: "Inter_400Regular",
                        },
                      ]}
                      value={confirmPassword}
                      onChangeText={(v) => {
                        setConfirmPassword(v);
                        setErrors((e) => ({ ...e, confirmPassword: "" }));
                      }}
                      placeholder="Re-enter password"
                      placeholderTextColor={colors.mutedForeground}
                      secureTextEntry={!showConfirm}
                      autoComplete="new-password"
                      onFocus={() => setFocusedField("confirm")}
                      onBlur={() => setFocusedField(null)}
                      testID="input-confirm"
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowConfirm((v) => !v)}
                      accessibilityLabel={
                        showConfirm
                          ? "Hide confirm password"
                          : "Show confirm password"
                      }
                    >
                      <Feather
                        name={showConfirm ? "eye" : "eye-off"}
                        size={18}
                        color={colors.mutedForeground}
                      />
                    </TouchableOpacity>
                  </View>
                  {!!errors.confirmPassword && (
                    <Text
                      style={[
                        styles.errorText,
                        {
                          color: colors.destructive,
                          fontFamily: "Inter_400Regular",
                        },
                      ]}
                    >
                      {errors.confirmPassword}
                    </Text>
                  )}
                </View>
              )}

              {/* Submit button */}
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  {
                    backgroundColor: submitting
                      ? "#a3b99e"
                      : colors.primary,
                  },
                  submitting && styles.disabledOpacity,
                ]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.82}
                testID="btn-submit"
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text
                    style={[
                      styles.submitText,
                      { fontFamily: "Inter_600SemiBold" },
                    ]}
                  >
                    {mode === "login" ? "Log in" : "Create account"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View
                style={[
                  styles.dividerLine,
                  { backgroundColor: colors.border },
                ]}
              />
              <Text
                style={[
                  styles.dividerLabel,
                  {
                    color: colors.mutedForeground,
                    fontFamily: "Inter_400Regular",
                  },
                ]}
              >
                or
              </Text>
              <View
                style={[
                  styles.dividerLine,
                  { backgroundColor: colors.border },
                ]}
              />
            </View>

            {/* Social buttons */}
            <View style={styles.socialGroup}>
              <TouchableOpacity
                style={[
                  styles.socialBtn,
                  { borderColor: colors.border, backgroundColor: colors.background },
                ]}
                onPress={() => Haptics.selectionAsync()}
                activeOpacity={0.75}
                testID="btn-google"
              >
                <MaterialCommunityIcons
                  name="google"
                  size={18}
                  color="#4285F4"
                />
                <Text
                  style={[
                    styles.socialText,
                    { color: colors.foreground, fontFamily: "Inter_500Medium" },
                  ]}
                >
                  Continue with Google
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.socialBtn,
                  { borderColor: colors.border, backgroundColor: colors.background },
                ]}
                onPress={() => Haptics.selectionAsync()}
                activeOpacity={0.75}
                testID="btn-apple"
              >
                <MaterialCommunityIcons
                  name="apple"
                  size={18}
                  color={colors.foreground}
                />
                <Text
                  style={[
                    styles.socialText,
                    { color: colors.foreground, fontFamily: "Inter_500Medium" },
                  ]}
                >
                  Continue with Apple
                </Text>
              </TouchableOpacity>
            </View>

            {/* Mode toggle */}
            <View style={styles.toggleRow}>
              <Text
                style={[
                  styles.toggleLabel,
                  {
                    color: colors.mutedForeground,
                    fontFamily: "Inter_400Regular",
                  },
                ]}
              >
                {mode === "login" ? "New here? " : "Already have an account? "}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  switchMode(mode === "login" ? "signup" : "login")
                }
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                testID="btn-toggle-mode"
              >
                <Text
                  style={[
                    styles.toggleLink,
                    { color: colors.primary, fontFamily: "Inter_600SemiBold" },
                  ]}
                >
                  {mode === "login" ? "Create an account" : "Log in"}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: {
    alignItems: "center",
    marginBottom: 28,
    width: "100%",
    maxWidth: 420,
  },
  wordmarkText: {
    fontSize: 44,
    letterSpacing: -0.5,
    lineHeight: 46,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 13,
    letterSpacing: 0.3,
    fontStyle: "italic",
    opacity: 0.75,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    shadowColor: "#4a3f35",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.09,
    shadowRadius: 24,
    elevation: 4,
  },
  heading: {
    fontSize: 24,
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  subheading: {
    fontSize: 14,
    marginBottom: 24,
    opacity: 0.8,
  },
  fields: { gap: 16 },
  label: {
    fontSize: 13,
    marginBottom: 7,
    letterSpacing: 0.1,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 7,
  },
  input: {
    minHeight: 52,
    borderWidth: 1.5,
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
  },
  passwordWrap: {
    position: "relative",
  },
  passwordInput: {
    paddingRight: 50,
  },
  eyeBtn: {
    position: "absolute",
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  errorText: {
    fontSize: 12,
    marginTop: 5,
    lineHeight: 16,
  },
  hint: {
    fontSize: 12,
    marginTop: 5,
    opacity: 0.8,
  },
  forgotText: { fontSize: 13 },
  submitBtn: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  disabledOpacity: { opacity: 0.75 },
  submitText: {
    color: "#ffffff",
    fontSize: 16,
    letterSpacing: 0.2,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
    gap: 12,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerLabel: { fontSize: 13, fontStyle: "italic", opacity: 0.8 },
  socialGroup: { gap: 10 },
  socialBtn: {
    minHeight: 52,
    borderWidth: 1.5,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  socialText: { fontSize: 14 },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 22,
    flexWrap: "wrap",
  },
  toggleLabel: { fontSize: 14 },
  toggleLink: { fontSize: 14 },
});
