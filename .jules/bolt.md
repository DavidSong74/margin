## 2026-08-09 - FlatList inline rendering anti-pattern
**Learning:** Inline renderItem functions in FlatLists inside components that contain TextInput fields (like CommentsSheet and InboxOverlay) cause the entire list to re-render on every keystroke, causing significant input lag.
**Action:** Always extract list items into React.memo components and wrap renderItem with useCallback, especially when the parent component has rapidly changing state like text inputs.
