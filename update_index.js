const fs = require('fs');

let content = fs.readFileSync('artifacts/margin/app/(tabs)/index.tsx', 'utf8');

content = content.replace(
  'import React, { useCallback, useState } from "react";',
  'import React, { useCallback, useMemo, useState } from "react";'
);

// We want to extract `GridItemComponent` and wrap it in React.memo()
const gridItemComponentCode = `
// ── GridItemComponent (memoized) ─────────────────────────────
const GridItemComponent = React.memo(({ item, cardW, cardH, colors }: { item: GridItem; cardW: number; cardH: number; colors: ReturnType<typeof useColors> }) => {
  return (
    <View style={{ marginBottom: COL_GAP }}>
      {item.type === "new" ? (
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/journal/new");
          }}
          activeOpacity={0.7}
        >
          <NewJournalTile cardW={cardW} cardH={cardH} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push({
              pathname: "/journal/[id]",
              params: {
                id: item.journal.id,
                title: item.journal.title,
              },
            });
          }}
          activeOpacity={0.82}
        >
          <JournalCover
            journal={item.journal}
            cardW={cardW}
            cardH={cardH}
          />
          <Text
            style={[
              styles.journalName,
              {
                color: colors.foreground,
                fontFamily: "Inter_600SemiBold",
              },
            ]}
            numberOfLines={1}
          >
            {item.journal.title}
          </Text>
          <Text
            style={[
              styles.journalMeta,
              {
                color: colors.mutedForeground,
                fontFamily: "Inter_400Regular",
              },
            ]}
          >
            {item.journal.pageCount}{" "}
            {item.journal.pageCount === 1 ? "page" : "pages"} ·{" "}
            {formatDate(item.journal.createdAt)}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

`;

content = content.replace('// ── Main screen ──────────────────────────────────────────────', gridItemComponentCode + '// ── Main screen ──────────────────────────────────────────────');

// Replace the useMemo for filtered and gridData
content = content.replace(
  `  // ── Filtering ──────────────────────────────────────────────

  const filtered = searchText.trim()
    ? journals.filter((j) =>
        j.title.toLowerCase().includes(searchText.toLowerCase())
      )
    : journals;

  const isEmpty = !loading && filtered.length === 0;

  const gridData: GridItem[] = [
    { type: "new" },
    ...filtered.map((j) => ({ type: "journal" as const, journal: j })),
  ];`,
  `  // ── Filtering ──────────────────────────────────────────────

  const filtered = useMemo(() =>
    searchText.trim()
      ? journals.filter((j) =>
          j.title.toLowerCase().includes(searchText.toLowerCase())
        )
      : journals
  , [journals, searchText]);

  const isEmpty = !loading && filtered.length === 0;

  const gridData: GridItem[] = useMemo(() => [
    { type: "new" },
    ...filtered.map((j) => ({ type: "journal" as const, journal: j })),
  ], [filtered]);`
);


// Replace renderItem function with useCallback
content = content.replace(
  `  // ── Render helpers ─────────────────────────────────────────

  function renderItem({ item }: { item: GridItem }) {
    return (
      <View style={{ marginBottom: COL_GAP }}>
        {item.type === "new" ? (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/journal/new");
            }}
            activeOpacity={0.7}
          >
            <NewJournalTile cardW={cardW} cardH={cardH} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({
                pathname: "/journal/[id]",
                params: {
                  id: item.journal.id,
                  title: item.journal.title,
                },
              });
            }}
            activeOpacity={0.82}
          >
            <JournalCover
              journal={item.journal}
              cardW={cardW}
              cardH={cardH}
            />
            <Text
              style={[
                styles.journalName,
                {
                  color: colors.foreground,
                  fontFamily: "Inter_600SemiBold",
                },
              ]}
              numberOfLines={1}
            >
              {item.journal.title}
            </Text>
            <Text
              style={[
                styles.journalMeta,
                {
                  color: colors.mutedForeground,
                  fontFamily: "Inter_400Regular",
                },
              ]}
            >
              {item.journal.pageCount}{" "}
              {item.journal.pageCount === 1 ? "page" : "pages"} ·{" "}
              {formatDate(item.journal.createdAt)}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }`,
  `  // ── Render helpers ─────────────────────────────────────────

  const renderItem = useCallback(({ item }: { item: GridItem }) => (
    <GridItemComponent item={item} cardW={cardW} cardH={cardH} colors={colors} />
  ), [cardW, cardH, colors]);`
);

fs.writeFileSync('artifacts/margin/app/(tabs)/index.tsx', content);
