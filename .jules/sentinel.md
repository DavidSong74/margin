## 2024-05-18 - [Fix insecure storage of Supabase Auth Token]
**Vulnerability:** Supabase auth tokens were stored in cleartext using `AsyncStorage` on mobile devices.
**Learning:** `AsyncStorage` is an unencrypted key-value store, and on mobile platforms (iOS/Android), this data can be easily accessed if the device is compromised or during backups, posing a significant security risk for sensitive tokens.
**Prevention:** Always use `expo-secure-store` (or an equivalent encrypted keystore) to store sensitive user credentials or tokens on native platforms. `AsyncStorage` should only be used as a fallback for the web platform where secure local storage APIs might not be available or are handled differently by the browser.
