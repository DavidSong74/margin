## 2024-08-06 - React Native FlatList Optimization
**Learning:** In React Native, inline `renderItem` functions and un-memoized item components within `FlatList` cause full-list re-renders whenever the parent component state changes (e.g., search text updates or input focus changes).
**Action:** Always extract list items into separate components wrapped in `React.memo()` and use `useCallback` for the `renderItem` function. Also, ensure the data array fed to `FlatList` is memoized (e.g., using `useMemo`) if it's derived from state, to maintain stable object references.
