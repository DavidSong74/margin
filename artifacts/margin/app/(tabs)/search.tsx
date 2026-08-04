import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────

interface SearchResult {
  page_id: string;
  journal_id: string;
  journal_title: string;
  page_number: number;
  snippet: string;
}

// ── Snippet renderer ──────────────────────────────────────────
// ts_headline returns text with [[match]] markers.

function SnippetText({ snippet, colors }: { snippet: string; colors: ReturnType<typeof useColors> }) {
  const parts = snippet.split(/(\[\[.*?\]\])/g);
  return (
    <Text style={[styles.snippetText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]} numberOfLines={3}>
      {parts.map((part, i) => {
        if (part.startsWith("[[") && part.endsWith("]]")) {
          return (
            <Text key={i} style={[styles.snippetHighlight, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}

// ── Search Result Cell ────────────────────────────────────────

const SearchResultCell = React.memo(function SearchResultCell({
  item,
  colors,
}: {
  item: SearchResult;
  colors: ReturnType<typeof useColors>;
}) {
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

// ── Main screen ───────────────────────────────────────────────

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false); // true after first search fires

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  const pt = Platform.OS === "web" ? 67 : insets.top;
  const pb = Platform.OS === "web" ? 34 : insets.bottom;

  // ── Debounced search ─────────────────────────────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc("search_pages", { query: trimmed });
        if (error) throw error;
        setResults((data as SearchResult[]) ?? []);
      } catch (err) {
        console.error("[Search] search_pages error:", err);
        setResults([]);
      } finally {
        setLoading(false);
        setSearched(true);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // ── Render result row ─────────────────────────────────────────

  const renderResult = React.useCallback(
    ({ item }: { item: SearchResult }) => (
      <SearchResultCell item={item} colors={colors} />
    ),
    [colors]
  );

  // ── Empty / idle states ──────────────────────────────────────

  function ListEmpty() {
    if (loading) return null;
    if (!query.trim()) {
      return (
        <View style={styles.emptyWrap}>
          <Feather name="search" size={40} color={colors.mutedForeground} style={{ opacity: 0.4 }} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "PlayfairDisplay_600SemiBold" }]}>
            Search your journals
          </Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Every transcribed page is searchable.{"\n"}Type a word or phrase above.
          </Text>
        </View>
      );
    }
    if (searched && results.length === 0) {
      return (
        <View style={styles.emptyWrap}>
          <Feather name="file-text" size={40} color={colors.mutedForeground} style={{ opacity: 0.4 }} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "PlayfairDisplay_600SemiBold" }]}>
            No results
          </Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Nothing matched "{query.trim()}" in your transcriptions.
          </Text>
        </View>
      );
    }
    return null;
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Search bar */}
      <View style={[styles.searchHeader, { paddingTop: pt + 12 }]}>
        <Text
          style={[styles.screenTitle, { color: colors.foreground, fontFamily: "PlayfairDisplay_700Bold" }]}
        >
          Search
        </Text>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={17} color={colors.mutedForeground} />
          <TextInput
            ref={inputRef}
            style={[styles.searchInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
            value={query}
            onChangeText={setQuery}
            placeholder="Search transcriptions…"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
          />
          {loading && <ActivityIndicator size="small" color={colors.primary} />}
        </View>
        {results.length > 0 && !loading && (
          <Text style={[styles.resultCount, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {results.length} result{results.length === 1 ? "" : "s"}
          </Text>
        )}
      </View>

      {/* Results */}
      <FlatList
        data={results}
        keyExtractor={(item) => item.page_id}
        renderItem={renderResult}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={[
          styles.listContent,
          results.length === 0 && styles.listContentEmpty,
          { paddingBottom: pb + 80 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  searchHeader: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  screenTitle: {
    fontSize: 30,
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    height: 48,
  },
  resultCount: {
    fontSize: 12,
    letterSpacing: 0.3,
    marginBottom: 4,
  },

  listContent: { paddingHorizontal: 20 },
  listContentEmpty: { flex: 1 },

  resultRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  resultMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  resultJournal: {
    fontSize: 12,
    flex: 1,
  },
  resultDot: { fontSize: 12 },
  resultPage: { fontSize: 12 },
  snippetText: {
    fontSize: 15,
    lineHeight: 22,
  },
  snippetHighlight: {
    fontSize: 15,
  },

  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 80,
  },
  emptyTitle: {
    fontSize: 22,
    letterSpacing: -0.3,
    textAlign: "center",
  },
  emptySub: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    opacity: 0.8,
  },
});
