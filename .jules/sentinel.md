## 2025-02-14 - Use SecureStore for Supabase Auth in Expo
**Vulnerability:** Supabase Auth tokens were being stored in unencrypted `AsyncStorage` in the React Native/Expo app, leading to potential cleartext exposure of sensitive session data.
**Learning:** `AsyncStorage` lacks encryption by default and is insecure for storing sensitive tokens on mobile platforms.
**Prevention:** Always use `expo-secure-store` (or an equivalent secure storage mechanism) as the storage adapter when initializing the Supabase client in React Native apps.
