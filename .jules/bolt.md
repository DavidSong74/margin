## 2024-08-04 - React Native FlatList Optimization
**Learning:** In React Native, defining `renderItem` as an inline function inside the component body creates a new function reference on every re-render. For `FlatList`, this causes all list items to re-render needlessly when parent state (like search input or scroll position) changes.
**Action:** Always extract list items into separate components wrapped in `React.memo()`, and use `useCallback` for the `renderItem` function itself to ensure stable function references and prevent unnecessary child re-renders.
