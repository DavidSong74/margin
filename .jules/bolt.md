## 2024-11-20 - [Hermes String Concatenation]
**Learning:** The `+=` operator for string concatenation causes significant string reallocation performance overhead when running on the mobile Hermes JavaScript engine.
**Action:** Use `.push()` on an array and `.join("")` to combine string fragments instead of `+=` when building large strings in a loop in React Native/Expo apps.
