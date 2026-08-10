import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
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

interface Comment {
  comment_id: string;
  user_id: string;
  author_email: string;
  comment_text: string;
  created_at: string;
}

interface Props {
  entryId: string | null;
  onClose: () => void;
}

const CommentItem = React.memo(function CommentItem({
  item,
  colors,
}: {
  item: Comment;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.commentRow}>
      <Text
        style={[
          styles.commentAuthor,
          { color: colors.primary, fontFamily: "Inter_600SemiBold" },
        ]}
      >
        {item.author_email}
      </Text>
      <Text
        style={[
          styles.commentText,
          { color: colors.foreground, fontFamily: "Inter_400Regular" },
        ]}
      >
        {item.comment_text}
      </Text>
    </View>
  );
});

export function CommentsSheet({ entryId, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [comments, setComments] = useState<Comment[]>([]);
  const [newText, setNewText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!entryId) {
      setComments([]);
      setNewText("");
      return;
    }
    setLoading(true);
    supabase
      .rpc("get_comments", { p_entry_id: entryId })
      .then(({ data }) => {
        setComments((data as Comment[]) ?? []);
        setLoading(false);
      });
  }, [entryId]);

  // ⚡ Bolt Performance Optimization:
  // Extracted inline list item into React.memo() wrapped CommentItem and memoized renderItem.
  // This prevents all comment rows from re-rendering on every keystroke when typing a new comment.
  // Impact: Greatly improves text input responsiveness, especially on long comment threads.
  const renderItem = React.useCallback(
    ({ item }: { item: Comment }) => <CommentItem item={item} colors={colors} />,
    [colors]
  );

  async function handleSend() {
    const text = newText.trim();
    if (!text || !entryId) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    setSending(true);
    const { data, error } = await supabase
      .from("feed_comments")
      .insert({ user_id: session.user.id, entry_id: entryId, comment_text: text })
      .select("id, user_id, comment_text, created_at")
      .single();
    setSending(false);

    if (!error && data) {
      const newComment: Comment = {
        comment_id: data.id,
        user_id: data.user_id,
        author_email: session.user.email ?? "",
        comment_text: data.comment_text,
        created_at: data.created_at,
      };
      setComments((prev) => [...prev, newComment]);
      setNewText("");
    }
  }

  return (
    <Modal
      visible={!!entryId}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.avoidingView}
      >
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.card, paddingBottom: insets.bottom + 8 },
          ]}
        >
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Title row */}
          <View style={styles.titleRow}>
            <Text
              style={[
                styles.title,
                { color: colors.foreground, fontFamily: "Inter_600SemiBold" },
              ]}
            >
              Comments
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Comments list */}
          {loading ? (
            <ActivityIndicator
              color={colors.primary}
              style={{ marginVertical: 24 }}
            />
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(c) => c.comment_id}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <Text
                  style={[
                    styles.emptyText,
                    { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
                  ]}
                >
                  No comments yet. Be the first!
                </Text>
              }
              renderItem={renderItem}
            />
          )}

          {/* Input row */}
          <View
            style={[
              styles.inputRow,
              { borderTopColor: colors.border },
            ]}
          >
            <TextInput
              value={newText}
              onChangeText={setNewText}
              placeholder="Add a comment…"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  backgroundColor: colors.muted,
                  fontFamily: "Inter_400Regular",
                },
              ]}
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
            />
            {sending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <TouchableOpacity
                onPress={handleSend}
                disabled={!newText.trim()}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather
                  name="send"
                  size={20}
                  color={newText.trim() ? colors.primary : colors.mutedForeground}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  avoidingView: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingHorizontal: 20,
    maxHeight: "65%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: { fontSize: 17 },

  list: { flexGrow: 0 },
  listContent: { paddingBottom: 8 },

  emptyText: {
    textAlign: "center",
    fontSize: 14,
    paddingVertical: 20,
    opacity: 0.7,
  },

  commentRow: { paddingVertical: 10, gap: 3 },
  commentAuthor: { fontSize: 12 },
  commentText: { fontSize: 14, lineHeight: 20 },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    marginTop: 4,
  },
  input: {
    flex: 1,
    fontSize: 15,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
});
