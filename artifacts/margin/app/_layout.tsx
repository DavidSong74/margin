import { Feather } from "@expo/vector-icons";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_700Bold,
} from "@expo-google-fonts/playfair-display";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import Constants from "expo-constants";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import React, { useEffect, useState } from "react";
import { AppState, type AppStateStatus, View, LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { supabase } from "@/lib/supabase";
import { ThemeProvider } from "@/hooks/useTheme";
import { useColors } from "@/hooks/useColors";
import { processCaptureQueue } from "@/lib/captureQueue";
import { AnimatedSplashScreenV2 } from "@/components/AnimatedSplashScreenV2";

LogBox.ignoreLogs(["expo-notifications: Android Push notifications"]);

SplashScreen.preventAutoHideAsync();

// ── Push token registration ────────────────────────────────────────────────────
// Silently registers an Expo push token when the user has already granted
// notification permissions. Does not prompt — permission is requested by the
// user via the Notifications section in profile.tsx.

async function registerPushToken(userId: string) {
  try {
    // Expo Go dropped Android push support in SDK 53; skip to avoid the console error
    if (Constants.executionEnvironment === "storeClient") return;

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    if (!tokenData.data) return;

    await supabase.from("push_tokens").upsert(
      { user_id: userId, token: tokenData.data },
      { onConflict: "token" }
    );
  } catch {
    // Non-critical — never crash the app over a missing push token
  }
}

// ── §4: App lock gate — renders inside ThemeProvider so useColors works ───────

function AppLockGate({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    async function checkLock(nextState: AppStateStatus) {
      if (nextState !== "active") return;
      const raw = await AsyncStorage.getItem("margin:settings");
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (!prefs.appLock) return;
      setLocked(true);
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock Margin",
        disableDeviceFallback: false,
      });
      if (result.success) setLocked(false);
    }

    const sub = AppState.addEventListener("change", checkLock);
    checkLock("active");
    return () => sub.remove();
  }, []);

  if (locked) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return <>{children}</>;
}

const queryClient = new QueryClient();

function NavigationGuard({
  session,
  initialized,
}: {
  session: Session | null;
  initialized: boolean;
}) {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!initialized) return;
    const inTabs = segments[0] === "(tabs)";
    // Auth screen has no named segment. Any known authenticated route is NOT the auth screen.
    const onAuthenticatedRoute = inTabs || segments[0] === "journal" || segments[0] === "capture" || segments[0] === "glossary" || segments[0] === "deleted-pages" || segments[0] === "deleted-journals";
    if (session && !onAuthenticatedRoute) {
      router.replace("/(tabs)");
    } else if (!session && inTabs) {
      router.replace("/");
    }
  }, [session, initialized, segments, router]);

  return null;
}

function RootLayoutNav({
  session,
  initialized,
}: {
  session: Session | null;
  initialized: boolean;
}) {
  return (
    <>
      <NavigationGuard session={session} initialized={initialized} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="journal/[id]" />
        <Stack.Screen name="glossary" />
        <Stack.Screen name="deleted-pages" />
        <Stack.Screen name="deleted-journals" />
        <Stack.Screen
          name="journal/new"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="capture"
          options={{ presentation: "fullScreenModal", animation: "fade" }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ...Feather.font,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    PlayfairDisplay_400Regular,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
  });

  const [session, setSession] = useState<Session | null>(null);
  const [sessionInitialized, setSessionInitialized] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setSessionInitialized(true);
      if (session?.user) {
        registerPushToken(session.user.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      // Only register push token on explicit sign-in, not on every token refresh
      if (event === "SIGNED_IN" && session?.user) {
        registerPushToken(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // N7: Process offline capture queue whenever app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") {
        processCaptureQueue().catch(() => { });
      }
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView>
              <AppLockGate>
                <RootLayoutNav
                  session={session}
                  initialized={sessionInitialized}
                />
                <AnimatedSplashScreenV2 />
              </AppLockGate>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
