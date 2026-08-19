## 2026-08-19 - [ChunkedSecureStore String Concatenation]
**Learning:** `ChunkedSecureStore` in `supabase.ts` uses repeated string concatenation (`result += chunk`) in a loop to combine items from `expo-secure-store`. As per memory, string concatenation in loops with `+=` can have performance overhead in Hermes/React Native, and should be replaced with array push and `.join('')`.
**Action:** Replace string concatenation in `getItem` with array accumulation and `join('')`.
