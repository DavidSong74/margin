## 2024-05-29 - [Optimize ChunkedSecureStore] Hermes Engine String Concatenation Overhead
**Learning:** In the React Native Hermes engine, using the `+=` operator for string concatenation within loops (such as reconstructing large chunked strings from SecureStore) introduces performance overhead due to repeated memory reallocation.
**Action:** Always prefer pushing string fragments to an array and using `.join('')` to combine them when dealing with loops or large strings in mobile environments to mitigate this engine-specific bottleneck.
