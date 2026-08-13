## 2024-08-13 - [String Concatenation Overhead in React Native]
**Learning:** The Hermes JavaScript engine (used in React Native) can suffer from significant performance overhead when repeatedly using the `+=` operator to build large strings inside loops, due to string reallocation.
**Action:** Always push string fragments to an array and combine them with `.join('')` instead of repeatedly using the `+=` operator, especially in loops where large outputs (like exports) are generated.
