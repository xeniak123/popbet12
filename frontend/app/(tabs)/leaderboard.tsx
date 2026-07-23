// Leaderboard - Global / Friends with sticky "your position". Includes friend
// request send/accept/reject and phone-based contacts import.
import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { EmptyState } from "@/src/components/EmptyState";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radii, shadow, spacing, themedStyles } from "@/src/theme/colors";

import { useTheme } from "@/src/theme/ThemeContext";
type Row = { user_id: string; username: string; avatar: string; coins: number; rank: number };
type Board = { rows: Row[]; me: Row };
type PendingReq = { request_id: string; from_id: string; from_username: string; to_id: string; created_at: string };
type Pending = { incoming: PendingReq[]; outgoing: PendingReq[] };
type PhoneMatch = { user_id: string; username: string; avatar: string; phone?: string | null };
type SeasonRow = { user_id: string; username: string; avatar: string; pnl: number; rank: number; league: string };
type SeasonBoard = {
  season: number;
  days_left: number;
  players: number;
  rows: SeasonRow[];
  me: SeasonRow & { played: boolean };
  titles: { season: number; place: number; label: string }[];
};

export default function LeaderboardScreen() {
  useTheme(); // subskrypcja motywu — wymusza re-render po przelaczeniu

  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [tab, setTab] = useState<"global" | "friends" | "season">("global");
  const [season, setSeason] = useState<SeasonBoard | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [pending, setPending] = useState<Pending>({ incoming: [], outgoing: [] });
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async (which: "global" | "friends" | "season") => {
    const p = await api.get<Pending>("/api/friends/pending");
    setPending(p);
    if (which === "season") {
      setSeason(await api.get<SeasonBoard>("/api/leaderboard/season"));
    } else {
      setBoard(await api.get<Board>(`/api/leaderboard/${which}`));
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load(tab).finally(() => setLoading(false));
  }, [tab, load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(tab); } finally { setRefreshing(false); }
  }, [tab, load]);

  const accept = async (id: string) => {
    try { await api.post("/api/friends/accept", { request_id: id }); await load(tab); } catch { /* silent */ }
  };
  const reject = async (id: string) => {
    try { await api.post("/api/friends/reject", { request_id: id }); await load(tab); } catch { /* silent */ }
  };

  const meInList = board?.rows.some((r) => r.user_id === user?.user_id) ?? false;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Ranking</Text>
        {tab === "friends" && (
          <TouchableOpacity testID="add-friend-button" onPress={() => setShowAdd(true)} style={styles.addBtn}>
            <Ionicons name="person-add" size={18} color={colors.primary} />
            <Text style={styles.addText}>Zaproś</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.tabsRow}>
        <TouchableOpacity
          testID="leaderboard-tab-global"
          onPress={() => setTab("global")}
          style={[styles.tab, tab === "global" && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === "global" && styles.tabTextActive]}>🌍 Globalny</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="leaderboard-tab-friends"
          onPress={() => setTab("friends")}
          style={[styles.tab, tab === "friends" && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === "friends" && styles.tabTextActive]}>👥 Znajomi</Text>
          {pending.incoming.length > 0 && (
            <View style={styles.notifDot}>
              <Text style={styles.notifDotText}>{pending.incoming.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          testID="leaderboard-tab-season"
          onPress={() => setTab("season")}
          style={[styles.tab, tab === "season" && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === "season" && styles.tabTextActive]}>🏅 Sezon</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.empty}><Text style={styles.emptyText}>Ładowanie…</Text></View>
      ) : tab === "season" ? (
        <FlatList
          data={season?.rows ?? []}
          keyExtractor={(r) => r.user_id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 + insets.bottom }}
          ListHeaderComponent={
            <View style={styles.seasonHead} testID="season-header">
              <View style={styles.seasonTop}>
                <Text style={styles.seasonTitle}>Sezon {season?.season ?? 1}</Text>
                <View style={styles.leaguePill}>
                  <Text style={styles.leagueText}>{season?.me.league ?? "Brąz"}</Text>
                </View>
              </View>
              <Text style={styles.seasonSub}>
                Liczy się tylko zysk z tego sezonu — co {28} dni wszyscy startują od zera.
                {season ? ` Zostało ${season.days_left} dni.` : ""}
              </Text>
              <View style={styles.seasonMine}>
                <Text style={styles.seasonMineLabel}>Twój wynik sezonowy</Text>
                <Text
                  style={[
                    styles.seasonMineValue,
                    { color: (season?.me.pnl ?? 0) >= 0 ? colors.win : colors.loss },
                  ]}
                >
                  {(season?.me.pnl ?? 0) >= 0 ? "+" : ""}{season?.me.pnl ?? 0} 🪙
                </Text>
              </View>
              {season?.titles?.length ? (
                <View style={styles.titlesWrap}>
                  {season.titles.map((t) => (
                    <View key={`${t.season}-${t.place}`} style={styles.titleChip}>
                      <Text style={styles.titleChipText}>👑 {t.label}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={[styles.row, item.user_id === user?.user_id && styles.rowHighlight]}
              testID={`season-row-${item.user_id}`}
            >
              <Text style={styles.rank}>{item.rank}</Text>
              <Text style={styles.username} numberOfLines={1}>{item.username}</Text>
              <View style={styles.leaguePillSmall}>
                <Text style={styles.leagueTextSmall}>{item.league}</Text>
              </View>
              <Text style={[styles.coins, { color: item.pnl >= 0 ? colors.win : colors.loss }]}>
                {item.pnl >= 0 ? "+" : ""}{item.pnl}
              </Text>
            </View>
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <EmptyState
              testID="season-empty"
              emoji="🏅"
              title="Sezon dopiero się rozkręca"
              subtitle="Nikt jeszcze nie rozstrzygnął zakładu w tym sezonie. Postaw pierwszy i obejmij prowadzenie."
            />
          }
          testID="season-list"
        />
      ) : (
        <FlatList
          data={board?.rows ?? []}
          keyExtractor={(r) => r.user_id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 + insets.bottom }}
          ListHeaderComponent={
            tab === "friends" && pending.incoming.length > 0 ? (
              <View style={styles.pendingCard} testID="pending-requests-card">
                <Text style={styles.pendingTitle}>Zaproszenia do znajomych ({pending.incoming.length})</Text>
                {pending.incoming.map((r) => (
                  <View key={r.request_id} style={styles.pendingRow} testID={`pending-row-${r.request_id}`}>
                    <View style={styles.pendingAvatar}>
                      <Text style={{ color: colors.primary, fontWeight: "900" }}>
                        {r.from_username.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.pendingUsername}>{r.from_username}</Text>
                    <TouchableOpacity
                      testID={`pending-accept-${r.request_id}`}
                      onPress={() => accept(r.request_id)}
                      style={[styles.smallBtn, { backgroundColor: colors.win }]}
                    >
                      <Text style={styles.smallBtnText}>Akceptuj</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`pending-reject-${r.request_id}`}
                      onPress={() => reject(r.request_id)}
                      style={[styles.smallBtn, { backgroundColor: colors.bgAlt }]}
                    >
                      <Text style={[styles.smallBtnText, { color: colors.text }]}>Odrzuć</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <LeaderRow row={item} highlight={item.user_id === user?.user_id} />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <EmptyState
              testID="leaderboard-empty"
              emoji={tab === "friends" ? "👥" : "🏆"}
              title={tab === "friends" ? "Brak znajomych" : "Ranking jest pusty"}
              subtitle={
                tab === "friends"
                  ? "Zaproś znajomych, żeby razem rywalizować o coiny."
                  : "Bądź pierwszy na szczycie! Zacznij od kilku zakładów."
              }
            />
          }
          testID="leaderboard-list"
        />
      )}

      {board?.me && !meInList && (
        <View style={[styles.myFooter, { paddingBottom: insets.bottom + 8 }]} testID="my-rank-footer">
          <LeaderRow row={board.me} highlight compact />
        </View>
      )}

      <AddFriendModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSent={() => load(tab)}
      />
    </SafeAreaView>
  );
}

function LeaderRow({ row, highlight, compact }: { row: Row; highlight?: boolean; compact?: boolean }) {
  return (
    <View
      style={[styles.row, highlight && styles.rowHighlight, compact && { marginBottom: 0 }]}
      testID={`leader-row-${row.user_id}`}
    >
      <Text style={styles.rank}>#{row.rank}</Text>
      {row.avatar ? (
        <Image source={{ uri: row.avatar }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={{ fontWeight: "800", color: colors.primary }}>{row.username.slice(0, 1).toUpperCase()}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.username}>{row.username}{highlight ? "  (Ty)" : ""}</Text>
      </View>
      <Text style={styles.coins}>🪙 {row.coins}</Text>
    </View>
  );
}

function AddFriendModal({ visible, onClose, onSent }: { visible: boolean; onClose: () => void; onSent: () => void }) {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [matches, setMatches] = useState<PhoneMatch[] | null>(null);
  const [contactsBusy, setContactsBusy] = useState(false);
  const [ref, setRef] = useState<{ code: string; referrals: number; bonus: number; message: string; milestone_every: number; milestone_bonus: number; to_next_milestone: number } | null>(null);

  useEffect(() => {
    if (visible && !ref) {
      api.get<{ code: string; referrals: number; bonus: number; message: string; milestone_every: number; milestone_bonus: number; to_next_milestone: number }>("/api/referral/me")
        .then(setRef)
        .catch(() => {});
    }
  }, [visible, ref]);

  const shareInvite = async () => {
    if (!ref) return;
    try {
      await Share.share({ message: ref.message });
    } catch { /* anulowane */ }
  };

  const importContacts = async () => {
    setMsg(null);
    setMatches(null);
    setContactsBusy(true);
    try {
      const perm = await Contacts.getPermissionsAsync();
      let status = perm.status;
      let canAskAgain = perm.canAskAgain;
      if (status !== "granted") {
        const req = await Contacts.requestPermissionsAsync();
        status = req.status;
        canAskAgain = req.canAskAgain;
      }
      if (status !== "granted") {
        setMsg(
          canAskAgain
            ? "Dostęp do kontaktów odrzucony — możesz zaprosić po nazwie."
            : "Dostęp do kontaktów zablokowany. Otwórz Ustawienia, żeby go włączyć.",
        );
        if (!canAskAgain) {
          setMsg((m) => (m ?? "") + " ");
        }
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
      });
      const phones = Array.from(
        new Set(
          data.flatMap((c) => (c.phoneNumbers ?? []).map((p) => p.number || "")).filter(Boolean),
        ),
      );
      if (phones.length === 0) {
        setMsg("Nie znaleziono kontaktów z numerem telefonu.");
        return;
      }
      const res = await api.post<{ matches: PhoneMatch[] }>("/api/friends/find-by-phones", { phones });
      setMatches(res.matches);
      setMsg(res.matches.length === 0 ? "Nikt z Twoich kontaktów nie jest jeszcze na PopBet." : null);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setContactsBusy(false);
    }
  };

  const openSettings = () => {
    Linking.openSettings().catch(() => {});
  };

  const invite = async (name: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{ ok: boolean; status: string }>("/api/friends/request", { username: name.trim() });
      setMsg(res.status === "accepted"
        ? `Jesteście już znajomymi z ${name}! 🎉`
        : `Zaproszenie wysłane do ${name} — czeka na akceptację.`);
      setUsername("");
      onSent();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Zaproś znajomego</Text>
          <Text style={styles.modalSub}>Wpisz nazwę użytkownika lub znajdź znajomych z Twoich kontaktów.</Text>

          {ref && (
            <View style={styles.refCard}>
              <Text style={styles.refTitle}>📨 Zaproś do PopBet i zgarnij +{ref.bonus} 🪙</Text>
              <Text style={styles.refDesc}>
                Za każdego, kto zainstaluje apkę i wpisze Twój kod przy rejestracji.
              </Text>
              <View style={styles.refCodeRow}>
                <Text style={styles.refCodeLabel}>Twój kod:</Text>
                <Text style={styles.refCode}>{ref.code}</Text>
                <Text style={styles.refCount}>· zaproszeni: {ref.referrals}</Text>
              </View>
              {ref.milestone_every ? (
                <View style={styles.progWrap} testID="referral-progress">
                  <View style={styles.progTrack}>
                    <View
                      style={[
                        styles.progFill,
                        {
                          width: `${Math.min(100, ((ref.milestone_every - ref.to_next_milestone) /
                            ref.milestone_every) * 100)}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.progText}>
                    {ref.to_next_milestone === 0
                      ? `Próg osiągnięty — premia +${ref.milestone_bonus} 🪙 przyznana!`
                      : `Jeszcze ${ref.to_next_milestone} do premii +${ref.milestone_bonus} 🪙 (co ${ref.milestone_every} zaproszeń)`}
                  </Text>
                </View>
              ) : null}
              <TouchableOpacity testID="invite-share-button" onPress={shareInvite} style={styles.inviteBtn}>
                <Ionicons name="share-social-outline" size={18} color="#FFF" />
                <Text style={styles.inviteBtnText}>Zaproś z kontaktów</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            testID="contacts-import-button"
            onPress={importContacts}
            style={styles.contactsBtn}
            disabled={contactsBusy}
          >
            <Ionicons name="phone-portrait-outline" size={18} color={colors.primary} />
            <Text style={styles.contactsBtnText}>
              {contactsBusy ? "Szukam…" : "Znajdź w kontaktach"}
            </Text>
          </TouchableOpacity>

          {matches && matches.length > 0 && (
            <ScrollView style={{ maxHeight: 180, marginTop: 8 }}>
              {matches.map((m) => (
                <View key={m.user_id} style={styles.matchRow} testID={`match-${m.user_id}`}>
                  <View style={styles.matchAvatar}>
                    <Text style={{ color: colors.primary, fontWeight: "900" }}>
                      {m.username.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.matchUsername}>{m.username}</Text>
                  <TouchableOpacity
                    testID={`match-invite-${m.user_id}`}
                    onPress={() => invite(m.username)}
                    style={[styles.smallBtn, { backgroundColor: colors.primary }]}
                    disabled={busy}
                  >
                    <Text style={[styles.smallBtnText, { color: "#FFF" }]}>Zaproś</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          <TextInput
            testID="add-friend-username-input"
            value={username}
            onChangeText={setUsername}
            placeholder="np. mkowal"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.modalInput}
          />
          {msg ? <Text style={styles.modalMsg}>{msg}</Text> : null}
          {msg?.includes("zablokowany") && (
            <TouchableOpacity onPress={openSettings} style={styles.settingsLink}>
              <Text style={styles.settingsLinkText}>Otwórz Ustawienia</Text>
            </TouchableOpacity>
          )}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <TouchableOpacity onPress={onClose} style={[styles.modalBtn, { backgroundColor: colors.bgAlt, flex: 1 }]}>
              <Text style={[styles.modalBtnText, { color: colors.text }]}>Zamknij</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="add-friend-submit"
              onPress={() => username && invite(username)}
              disabled={busy || !username}
              style={[styles.modalBtn, { backgroundColor: colors.primary, flex: 1, opacity: busy || !username ? 0.5 : 1 }]}
            >
              <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Zaproś</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 6,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  title: { fontSize: 24, fontWeight: "900", color: colors.text },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999,
    backgroundColor: colors.primarySoft,
  },
  addText: { color: colors.primary, fontWeight: "800", fontSize: 12 },
  tabsRow: {
    marginHorizontal: spacing.lg,
    flexDirection: "row",
    backgroundColor: colors.bgAlt,
    borderRadius: 999,
    padding: 4,
    marginBottom: spacing.md,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 },
  tabActive: { backgroundColor: colors.card, ...shadow.softer },
  tabText: { fontWeight: "700", color: colors.textMuted, fontSize: 13 },
  tabTextActive: { color: colors.text },
  notifDot: {
    minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  notifDotText: { color: "#FFF", fontSize: 10, fontWeight: "900" },
  seasonHead: {
    backgroundColor: colors.card, borderRadius: radii.card, padding: spacing.md,
    marginBottom: spacing.md, ...shadow.softer,
  },
  seasonTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  seasonTitle: { fontSize: 18, fontWeight: "900", color: colors.text },
  seasonSub: { fontSize: 13, color: colors.textMuted, marginTop: 4, lineHeight: 18 },
  leaguePill: {
    backgroundColor: colors.primarySoft, borderRadius: radii.pill,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  leagueText: { fontSize: 12, fontWeight: "900", color: colors.primary },
  leaguePillSmall: {
    backgroundColor: colors.bgAlt, borderRadius: radii.pill,
    paddingHorizontal: 8, paddingVertical: 3, marginRight: 8,
  },
  leagueTextSmall: { fontSize: 10, fontWeight: "800", color: colors.textMuted },
  seasonMine: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  seasonMineLabel: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  seasonMineValue: { fontSize: 20, fontWeight: "900" },
  titlesWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
  titleChip: {
    backgroundColor: colors.primarySoft, borderRadius: radii.pill,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  titleChipText: { fontSize: 11, fontWeight: "800", color: colors.primary },
  pendingCard: {
    backgroundColor: colors.primarySoft, borderRadius: radii.card,
    padding: spacing.md, marginBottom: spacing.md,
  },
  pendingTitle: { fontSize: 13, fontWeight: "900", color: colors.primary, marginBottom: 8 },
  pendingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  pendingAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  pendingUsername: { flex: 1, fontSize: 14, fontWeight: "800", color: colors.text },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  smallBtnText: { fontSize: 12, fontWeight: "800", color: "#FFF" },
  row: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.card,
    borderRadius: radii.card, padding: 12, marginBottom: 8, gap: 12, ...shadow.softer,
  },
  rowHighlight: { borderWidth: 2, borderColor: colors.primary },
  rank: { width: 42, fontSize: 14, fontWeight: "900", color: colors.textMuted },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  username: { fontSize: 15, fontWeight: "800", color: colors.text },
  coins: { fontSize: 14, fontWeight: "900", color: colors.primary },
  myFooter: {
    position: "absolute", left: spacing.md, right: spacing.md, bottom: 0,
    paddingTop: 6, backgroundColor: "transparent",
  },
  empty: { padding: spacing.xl, alignItems: "center" },
  emptyTitle: { fontSize: 16, fontWeight: "900", color: colors.text, marginBottom: 6 },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(45,55,72,0.5)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: { width: "100%", backgroundColor: colors.card, borderRadius: 28, padding: spacing.lg, ...shadow.soft },
  modalTitle: { fontSize: 20, fontWeight: "900", color: colors.text },
  modalSub: { marginTop: 6, fontSize: 13, color: colors.textMuted },
  modalInput: {
    marginTop: spacing.md, backgroundColor: colors.bgAlt, borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, fontWeight: "600",
  },
  contactsBtn: {
    marginTop: spacing.md, flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, backgroundColor: colors.primarySoft,
  },
  contactsBtnText: { color: colors.primary, fontWeight: "800" },
  refCard: {
    marginTop: spacing.md, padding: 14, borderRadius: 18, backgroundColor: colors.winSoft,
    borderWidth: 1, borderColor: colors.win,
  },
  refTitle: { fontSize: 15, fontWeight: "900", color: colors.text },
  refDesc: { marginTop: 4, fontSize: 12.5, color: colors.textMuted, lineHeight: 17 },
  refCodeRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 8 },
  refCodeLabel: { fontSize: 13, color: colors.textMuted, fontWeight: "700" },
  refCode: {
    fontSize: 16, fontWeight: "900", color: colors.text, letterSpacing: 2,
    backgroundColor: colors.card, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8,
  },
  progWrap: { marginTop: 10 },
  progTrack: { height: 6, borderRadius: 999, backgroundColor: colors.bgAlt, overflow: 'hidden' },
  progFill: { height: '100%', borderRadius: 999, backgroundColor: colors.primary },
  progText: { fontSize: 11, fontWeight: '700', color: colors.textMuted, marginTop: 6 },
  refCount: { fontSize: 12.5, color: colors.textMuted, fontWeight: "700" },
  inviteBtn: {
    marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 12, borderRadius: 14, backgroundColor: colors.primary,
  },
  inviteBtnText: { color: "#FFF", fontWeight: "900", fontSize: 15 },
  matchRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 8,
  },
  matchAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  matchUsername: { flex: 1, fontSize: 14, fontWeight: "800", color: colors.text },
  modalMsg: { marginTop: 8, fontSize: 13, color: colors.textMuted, fontWeight: "600" },
  settingsLink: { alignSelf: "flex-start", paddingVertical: 8 },
  settingsLinkText: { color: colors.primary, fontWeight: "800", fontSize: 13 },
  modalBtn: { paddingVertical: 14, borderRadius: 999, alignItems: "center" },
  modalBtnText: { fontWeight: "800", fontSize: 15 },
}));
