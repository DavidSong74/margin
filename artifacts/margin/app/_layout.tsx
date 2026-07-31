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
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import React, { useEffect, useState } from "react";
import { AppState, type AppStateStatus, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { supabase } from "@/lib/supabase";
import { ThemeProvider } from "@/hooks/useTheme";
import { useColors } from "@/hooks/useColors";

SplashScreen.preventAutoHideAsync();

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
    const onAuthenticatedRoute = inTabs || segments[0] === "journal" || segments[0] === "capture";
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
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

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
              </AppLockGate>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
