## 2024-05-30 - Memoizing FlatList items in React Native
**Learning:** In React Native screens (like `LibraryScreen` in `index.tsx`), a `FlatList` with a `renderItem` function that uses inline component rendering will cause all list items to re-render whenever the parent component state changes (e.g., search bar focus `searchFocused`). This is a common performance bottleneck in React Native.
**Action:** Always extract list items into separate components wrapped in `React.memo()` and wrap the `renderItem` function in `useCallback` to prevent unnecessary full-list re-renders.
