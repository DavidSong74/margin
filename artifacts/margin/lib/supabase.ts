import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

import type { Database } from "./database.types";

const CHUNK_SIZE = 2000;

const ChunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") return AsyncStorage.getItem(key);
    try {
      const countStr = await SecureStore.getItemAsync(`${key}_chunks`);
      if (!countStr) return SecureStore.getItemAsync(key);

      const count = parseInt(countStr, 10);
      const chunks: string[] = [];
      for (let i = 0; i < count; i++) {
        const chunk = await SecureStore.getItemAsync(`${key}_chunk_${i}`);
        if (!chunk) return null;
        // Optimization: push to array and join instead of string concatenation (+=)
        // to avoid string reallocation overhead in Hermes engine.
        chunks.push(chunk);
      }
      return chunks.join("");
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") return AsyncStorage.setItem(key, value);
    try {
      if (value.length <= CHUNK_SIZE) {
        await ChunkedSecureStore.removeItem(key);
        await SecureStore.setItemAsync(key, value);
        return;
      }
      await SecureStore.deleteItemAsync(key);
      const count = Math.ceil(value.length / CHUNK_SIZE);
      await SecureStore.setItemAsync(`${key}_chunks`, String(count));
      for (let i = 0; i < count; i++) {
        const chunk = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        await SecureStore.setItemAsync(`${key}_chunk_${i}`, chunk);
      }
    } catch (err) {
      console.error("[SecureStore] Chunked setItem error:", err);
    }
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") return AsyncStorage.removeItem(key);
    try {
      const countStr = await SecureStore.getItemAsync(`${key}_chunks`);
      if (countStr) {
        const count = parseInt(countStr, 10);
        for (let i = 0; i < count; i++) {
          await SecureStore.deleteItemAsync(`${key}_chunk_${i}`);
        }
        await SecureStore.deleteItemAsync(`${key}_chunks`);
      }
      await SecureStore.deleteItemAsync(key);
    } catch (err) {
      console.error("[SecureStore] Chunked removeItem error:", err);
    }
  },
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your .env file."
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ChunkedSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
