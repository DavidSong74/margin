## 2024-05-20 - [Hermes Engine] String Concatenation Bottleneck
**Learning:** In the React Native Hermes engine, using the `+=` operator for string concatenation within loops can cause severe O(n²) string reallocation performance overhead, which is particularly evident when re-assembling large chunks of data.
**Action:** Always prefer pushing string fragments into an array and joining them with `.join('')` at the end instead of using `+=` when building large strings in a loop.
