## 2024-05-24 - [Mobile Auth Token Storage]
**Vulnerability:** Supabase auth tokens were stored insecurely using plain text 'AsyncStorage' on native platforms.
**Learning:** For the Expo mobile app, sensitive user preferences and auth tokens must be stored securely. AsyncStorage should only be used as a fallback for the web platform.
**Prevention:** Always use 'expo-secure-store' for storing sensitive data on native platforms.
