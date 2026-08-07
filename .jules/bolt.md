## 2024-08-07 - FlatList Data Optimization
**Learning:** In the Expo mobile app, `FlatList` components receiving data arrays computed synchronously during render (like filtering state) suffer from broken internal pure component optimizations. Even if the underlying state hasn't conceptually changed, the new array reference forces unnecessary full-list re-renders.
**Action:** Always memoize the data array fed to `FlatList` (using `useMemo` with proper dependencies) when it is derived from state, to maintain stable object references and prevent unnecessary re-renders.
