## 2026-07-30 - Replaced ScrollView with FlatList in Journal Reader
**Learning:** Mapping over arrays of views horizontally inside a `ScrollView` in React Native can cause severe performance issues (high memory, lagging rendering) for larger sets of data. Virtualized lists are necessary for such situations.
**Action:** When working on views with lists of dynamic length, favor using `FlatList` instead of `ScrollView.map`.
