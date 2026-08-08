## 2024-05-24 - [React Native FlatList Optimization]
**Learning:** In React Native FlatList, keeping local text input state inside the list item component prevents the entire list from re-rendering on every keystroke.
**Action:** When implementing inline editing within FlatLists, always isolate the input state to the item component rather than the parent screen.
