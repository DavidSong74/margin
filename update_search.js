const fs = require('fs');

let content = fs.readFileSync('artifacts/margin/app/(tabs)/search.tsx', 'utf8');

content = content.replace(
  'import React, { useEffect, useRef, useState } from "react";',
  'import React, { useCallback, useEffect, useRef, useState } from "react";'
);

const searchResultComponentCode = `
// ── SearchResultItem (memoized) ──────────────────────────────
const SearchResultItem = React.memo(({ item, colors }: { item: SearchResult; colors: ReturnType<typeof useColors> }) => {
  return (
    <TouchableOpacity
      style={[styles.resultRow, { borderBottomColor: colors.border }]}
      onPress={() =>
        router.push({
          pathname: "/journal/[id]",
          params: {
            id: item.journal_id,
            title: item.journal_title,
            initial_page: String(item.page_number),
          },
        })
      }
      activeOpacity={0.7}
    >
      <View style={styles.resultMeta}>
        <Feather name="book-open" size={13} color={colors.mutedForeground} />
        <Text
          style={[styles.resultJournal, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}
          numberOfLines={1}
        >
          {item.journal_title}
        </Text>
        <Text style={[styles.resultDot, { color: colors.border }]}>·</Text>
        <Text style={[styles.resultPage, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          p. {item.page_number}
        </Text>
      </View>
      <SnippetText snippet={item.snippet} colors={colors} />
    </TouchableOpacity>
  );
});

`;

content = content.replace('// ── Main screen ───────────────────────────────────────────────', searchResultComponentCode + '// ── Main screen ───────────────────────────────────────────────');

content = content.replace(
  `  // ── Render result row ─────────────────────────────────────────

  function renderResult({ item }: { item: SearchResult }) {
    return (
      <TouchableOpacity
        style={[styles.resultRow, { borderBottomColor: colors.border }]}
        onPress={() =>
          router.push({
            pathname: "/journal/[id]",
            params: {
              id: item.journal_id,
              title: item.journal_title,
              initial_page: String(item.page_number),
            },
          })
        }
        activeOpacity={0.7}
      >
        <View style={styles.resultMeta}>
          <Feather name="book-open" size={13} color={colors.mutedForeground} />
          <Text
            style={[styles.resultJournal, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}
            numberOfLines={1}
          >
            {item.journal_title}
          </Text>
          <Text style={[styles.resultDot, { color: colors.border }]}>·</Text>
          <Text style={[styles.resultPage, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            p. {item.page_number}
          </Text>
        </View>
        <SnippetText snippet={item.snippet} colors={colors} />
      </TouchableOpacity>
    );
  }`,
  `  // ── Render result row ─────────────────────────────────────────

  const renderResult = useCallback(({ item }: { item: SearchResult }) => (
    <SearchResultItem item={item} colors={colors} />
  ), [colors]);`
);

fs.writeFileSync('artifacts/margin/app/(tabs)/search.tsx', content);
