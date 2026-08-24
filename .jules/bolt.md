## 2024-05-19 - [Hermes String Concatenation]
**Learning:** The Hermes JavaScript engine used in React Native has significant string reallocation performance overhead when building large strings in loops using the `+=` operator.
**Action:** For performance optimization in React Native/Expo apps, especially when building large strings in loops, always push string fragments to an array and combine them with `.join('')` instead of repeatedly using the `+=` operator.
