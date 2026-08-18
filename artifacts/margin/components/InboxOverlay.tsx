import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS } from "react-native-reanimated";
import {
  Alert,
  FlatList,
  Modal,
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

interface Friend {
  friend_id: string;
  friendship_id: string;
  friend_email: string;
  since: string;
}

interface PendingRequest {
  friendship_id: string;
  from_user_id: string;
  from_user_email: string;
  created_at: string;
}

interface AppNotification {
  id: string;
  type: string;
  data: Record<string, string>;
  read: boolean;
  created_at: string;
}

interface SearchResult {
  user_id: string;
  user_email: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onNotificationsRead: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function InboxOverlay({ visible, onClose, onNotificationsRead }: Props) {
  const [renderModal, setRenderModal] = useState(visible);
  const translateX = useSharedValue(400);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setRenderModal(true);
      translateX.value = withSpring(0, { damping: 24, stiffness: 220, mass: 0.8 });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    } else {
      translateX.value = withSpring(400, { damping: 24, stiffness: 220, mass: 0.8 });
      backdropOpacity.value = withTiming(0, { duration: 250 });
      const t = setTimeout(() => setRenderModal(false), 300);
      return () => clearTimeout(t);
    }
  }, [visible]);
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [searchEmail, setSearchEmail] = useState("");
  const [searchResult, setSearchResult] = useState<SearchResult | "not_found" | null>(null);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const fetchAll = useCallback(async () => {
    const [{ data: friendsData }, { data: pendingData }, { data: notifData }] =
      await Promise.all([
        supabase.rpc("get_friends"),
        supabase.rpc("get_pending_friend_requests"),
        supabase
          .from("notifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
    setFriends((friendsData as unknown as Friend[]) ?? []);
    setPendingRequests((pendingData as unknown as PendingRequest[]) ?? []);
    setNotifications((notifData as AppNotification[]) ?? []);
  }, []);

  useEffect(() => {
    if (!visible) return;
    fetchAll();
    supabase
      .from("notifications")
      .update({ read: true })
      .eq("read", false)
      .then(() => onNotificationsRead());
  }, [visible, fetchAll, onNotificationsRead]);

  const handleSearch = useCallback(async () => {
    const email = searchEmail.trim().toLowerCase();
    if (!email) return;
    setSearching(true);
    const { data } = await supabase.rpc("find_user_by_email", { p_email: email });
    setSearching(false);
    const results = (data as unknown as SearchResult[]) ?? [];
    setSearchResult(results.length > 0 ? results[0] : "not_found");
  }, [searchEmail]);

  const handleSendRequest = useCallback(
    async (addresseeId: string) => {
      setSending(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setSending(false);
        return;
      }
      const { error } = await supabase
        .from("friendships")
        .insert({ requester_id: session.user.id, addressee_id: addresseeId });
      setSending(false);
      if (error) {
        if (error.code === "23505") {
          Alert.alert("Already sent", "A friend request with this person already exists.");
        } else {
          Alert.alert("Error", error.message);
        }
      } else {
        setSearchResult(null);
        setSearchEmail("");
        Alert.alert("Request sent!", "They'll see it in their inbox.");
      }
    },
    []
  );

  const handleAccept = useCallback(
    async (friendshipId: string) => {
      await supabase
        .from("friendships")
        .update({ status: "accepted" })
        .eq("id", friendshipId);
      await fetchAll();
      onNotificationsRead();
    },
    [fetchAll, onNotificationsRead]
  );

  const handleDecline = useCallback(
    async (friendshipId: string) => {
      await supabase
        .from("friendships")
        .update({ status: "declined" })
        .eq("id", friendshipId);
      await fetchAll();
    },
    [fetchAll]
  );

  const nonRequestNotifs = notifications.filter((n) => n.type !== "friend_request");

  return (
    <Modal
      visible={renderModal}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <AnimatedPressable style={[styles.backdrop, { opacity: backdropOpacity }]} onPress={onClose} />

      <Animated.View
        style={[
          styles.panel,
          { backgroundColor: colors.card, paddingTop: insets.top + 16 },
          { transform: [{ translateX }] }
        ]}
      >
        {/* Header */}
        <View style={styles.panelHeader}>
          <Text
            style={[
              styles.panelTitle,
              { color: colors.foreground, fontFamily: "PlayfairDisplay_700Bold" },
            ]}
          >
            Inbox
          </Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Friend search */}
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionLabel,
              { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" },
            ]}
          >
            ADD A FRIEND
          </Text>
          <View
            style={[
              styles.searchRow,
              { backgroundColor: colors.input ?? colors.muted, borderColor: colors.border },
            ]}
          >
            <TextInput
              style={[
                styles.searchInput,
                { color: colors.foreground, fontFamily: "Inter_400Regular" },
              ]}
              placeholder="Search by email"
              placeholderTextColor={colors.mutedForeground}
              value={searchEmail}
              onChangeText={(t) => {
                setSearchEmail(t);
                setSearchResult(null);
              }}
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="search"
              onSubmitEditing={handleSearch}
            />
            <TouchableOpacity
              onPress={handleSearch}
              disabled={searching || !searchEmail.trim()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather
                name={searching ? "loader" : "search"}
                size={17}
                color={searchEmail.trim() ? colors.primary : colors.mutedForeground}
              />
            </TouchableOpacity>
          </View>

          {searchResult === "not_found" && (
            <Text
              style={[
                styles.helperText,
                { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
              ]}
            >
              No user found with that email.
            </Text>
          )}

          {searchResult && searchResult !== "not_found" && (
            <View style={[styles.resultRow, { borderColor: colors.border }]}>
              <View
                style={[styles.resultAvatar, { backgroundColor: colors.primary + "22" }]}
              >
                <Text
                  style={[
                    styles.resultInitial,
                    { color: colors.primary, fontFamily: "Inter_700Bold" },
                  ]}
                >
                  {(searchResult as SearchResult).user_email[0].toUpperCase()}
                </Text>
              </View>
              <Text
                style={[
                  styles.resultEmail,
                  { color: colors.foreground, fontFamily: "Inter_500Medium" },
                ]}
                numberOfLines={1}
              >
                {(searchResult as SearchResult).user_email}
              </Text>
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
                onPress={() =>
                  handleSendRequest((searchResult as SearchResult).user_id)
                }
                disabled={sending}
              >
                <Text style={[styles.addBtnText, { fontFamily: "Inter_600SemiBold" }]}>
                  Add
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Pending friend requests */}
        {pendingRequests.length > 0 && (
          <View style={styles.section}>
            <Text
              style={[
                styles.sectionLabel,
                { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" },
              ]}
            >
              FRIEND REQUESTS
            </Text>
            {pendingRequests.map((req) => (
              <View
                key={req.friendship_id}
                style={[styles.requestCard, { backgroundColor: colors.muted, borderColor: colors.border }]}
              >
                <View style={styles.requestTop}>
                  <Feather name="user-plus" size={15} color={colors.primary} />
                  <Text
                    style={[
                      styles.requestText,
                      { color: colors.foreground, fontFamily: "Inter_400Regular" },
                    ]}
                    numberOfLines={2}
                  >
                    <Text style={{ fontFamily: "Inter_600SemiBold" }}>
                      {req.from_user_email}
                    </Text>
                    {" "}wants to be friends
                  </Text>
                </View>
                <View style={styles.requestActions}>
                  <TouchableOpacity
                    style={[styles.declineBtn, { borderColor: colors.border }]}
                    onPress={() => handleDecline(req.friendship_id)}
                  >
                    <Text
                      style={[
                        styles.declineBtnText,
                        { color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
                      ]}
                    >
                      Decline
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.acceptBtn, { backgroundColor: colors.primary }]}
                    onPress={() => handleAccept(req.friendship_id)}
                  >
                    <Text style={[styles.acceptBtnText, { fontFamily: "Inter_600SemiBold" }]}>
                      Accept
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Other notifications */}
        {nonRequestNotifs.length > 0 && (
          <View style={styles.section}>
            <Text
              style={[
                styles.sectionLabel,
                { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" },
              ]}
            >
              NOTIFICATIONS
            </Text>
            {nonRequestNotifs.map((notif) => (
              <View
                key={notif.id}
                style={[styles.notifRow, { borderColor: colors.border }]}
              >
                <Feather
                  name={notif.type === "friend_accepted" ? "user-check" : "bell"}
                  size={15}
                  color={colors.primary}
                />
                <Text
                  style={[
                    styles.notifText,
                    { color: colors.foreground, fontFamily: "Inter_400Regular" },
                  ]}
                  numberOfLines={2}
                >
                  {notif.type === "friend_accepted"
                    ? "A friend accepted your request"
                    : notif.data?.message ?? "New notification"}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Friends list */}
        <View style={[styles.section, { flex: 1 }]}>
          <Text
            style={[
              styles.sectionLabel,
              { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" },
            ]}
          >
            FRIENDS ({friends.length})
          </Text>
          {friends.length === 0 ? (
            <Text
              style={[
                styles.helperText,
                { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
              ]}
            >
              No friends yet. Search by email above to add someone.
            </Text>
          ) : (
            <FlatList
              data={friends}
              keyExtractor={(f) => f.friend_id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={[styles.friendRow, { borderColor: colors.border }]}>
                  <View
                    style={[
                      styles.friendAvatar,
                      { backgroundColor: colors.primary + "22" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.friendInitial,
                        { color: colors.primary, fontFamily: "Inter_700Bold" },
                      ]}
                    >
                      {item.friend_email[0].toUpperCase()}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.friendEmail,
                      { color: colors.foreground, fontFamily: "Inter_400Regular" },
                    ]}
                    numberOfLines={1}
                  >
                    {item.friend_email}
                  </Text>
                </View>
              )}
            />
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  panel: {
    position: "absolute",
    top: 0,
    right: 0,
    width: "82%",
    maxWidth: 340,
    height: "100%",
    paddingHorizontal: 20,
    paddingBottom: 32,
    shadowColor: "#000",
    shadowOffset: { width: -3, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 16,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  panelTitle: { fontSize: 22, letterSpacing: -0.3 },

  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 10, letterSpacing: 1, marginBottom: 10 },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 2 },

  helperText: { fontSize: 13, marginTop: 6, opacity: 0.8, lineHeight: 18 },

  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 10,
  },
  resultAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  resultInitial: { fontSize: 13 },
  resultEmail: { flex: 1, fontSize: 13 },
  addBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addBtnText: { color: "#fff", fontSize: 13 },

  requestCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  requestTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  requestText: { flex: 1, fontSize: 13, lineHeight: 18 },
  requestActions: {
    flexDirection: "row",
    gap: 8,
    alignSelf: "flex-end",
  },
  declineBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
  },
  declineBtnText: { fontSize: 12 },
  acceptBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 7,
  },
  acceptBtnText: { color: "#fff", fontSize: 12 },

  notifRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  notifText: { flex: 1, fontSize: 13, lineHeight: 18 },

  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  friendAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  friendInitial: { fontSize: 14 },
  friendEmail: { flex: 1, fontSize: 13 },
});
