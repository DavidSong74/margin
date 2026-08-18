import { BlurView } from "expo-blur";
import { Tabs, usePathname } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React, { useState, useEffect, useCallback } from "react";
import { Platform, StyleSheet, View, useColorScheme, AppState, AppStateStatus, DeviceEventEmitter } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";

export default function TabLayout() {
  const colors = useColors();
  const { theme } = useTheme();
  const systemScheme = useColorScheme();
  const isDark = theme === "system" ? systemScheme === "dark" : theme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const insets = useSafeAreaInsets();

  const [hasReview, setHasReview] = useState(false);
  const pathname = usePathname();

  const checkReview = useCallback(async () => {
    try {
      const { data } = await supabase.rpc("get_resurface_page");
      setHasReview(Array.isArray(data) && data.length > 0);
    } catch {
      setHasReview(false);
    }
  }, []);

  // Dismiss red dot if user focuses the Review tab
  useEffect(() => {
    if (pathname === "/review") {
      setHasReview(false);
    }
  }, [pathname]);

  useEffect(() => {
    // Don't show dot if they are already on the Review tab
    if (pathname !== "/review") {
      checkReview();
    }
    
    const appStateSub = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      if (nextAppState === "active" && pathname !== "/review") checkReview();
    });
    
    const eventSub = DeviceEventEmitter.addListener("review_queue_updated", (hasItems: boolean) => {
      if (pathname !== "/review") setHasReview(hasItems);
    });

    return () => {
      appStateSub.remove();
      eventSub.remove();
    };
  }, [checkReview, pathname]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          paddingBottom: insets.bottom,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            // @ts-ignore React 19 typing issue
            <BlurView
              intensity={90}
              tint={isDark ? "dark" : "extraLight"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.background },
              ]}
            />
          ) : null,
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 11,
          marginBottom: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Library",
          tabBarIcon: ({ color }) => (
            <Feather name="book" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color }) => (
            <Feather name="search" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: "Review",
          tabBarIcon: ({ color }) => (
            <View>
              <Feather name="star" size={20} color={color} />
              {hasReview && (
                <View
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -4,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.destructive || "#ef4444",
                    borderWidth: 1.5,
                    borderColor: isIOS ? "transparent" : colors.background,
                  }}
                />
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: "Feed",
          tabBarIcon: ({ color }) => (
            <Feather name="users" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <Feather name="user" size={20} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
