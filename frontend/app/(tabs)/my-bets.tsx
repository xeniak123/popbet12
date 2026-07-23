// My Bets - Active / Resolved tabs, win/loss chips.
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { storage } from "@/src/utils/storage";
import { EmptyState } from "@/src/components/EmptyState";
import { colors, radii, shadow, spacing, themedStyles } from "@/src/theme/colors";

import { useTheme } from "@/src/theme/ThemeContext";
type MyBet = {
  bet_id: string;
  category: string;
  question: string;
  choice: string;
  stake: number;
  placed_at: string;
  resolved: boolean;
  won?: boolean | null;
  payout: number;
  winning_option?: string | null;
  closes_at: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  sport: "Sport",
  awards: "Nagrody",
  reality_tv: "Reality TV",
  gossip: "Plotki",
  music: "Muzyka",
};

const BIG_WIN_MIN = 500;              // od jakiego zysku proponujemy pochwalenie sie
const LAST_SHARED_KEY = "popbet_last_shared_win";

export default function MyBetsScreen() {
  useTheme(); // subskrypcja motywu — wymusza re-render po przelaczeniu

  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"active" | "resolved">("active");
  const [bigWin, setBigWin] = useState<MyBet | null>(null);
  const [items, setItems] = useState<MyBet[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (status: "active" | "resolved") => {
    const res = await api.get<MyBet[]>(`/api/my-bets?status=${status}`);
    setItems(res);
    if (status === "resolved") {
      // najswiezsza duza wygrana, ktorej jeszcze nie proponowalismy udostepnic
      const win = res.find((b) => b.won && b.payout - b.stake >= BIG_WIN_MIN);
      if (win) {
        const seen = await storage.getItem<string>(LAST_SHARED_KEY, "");
        if (seen !== win.bet_id) setBigWin(win);
      }
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(tab).finally(() => setLoading(false));
  }, [tab, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(tab); } finally { setRefreshing(false); }
  }, [tab, load]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Moje zakłady</Text>
      </View>
      <View style={styles.tabsRow}>
        <TouchableOpacity
          testID="mybets-tab-active"
          onPress={() => setTab("active")}
          style={[styles.tab, tab === "active" && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === "active" && styles.tabTextActive]}>Aktywne</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="mybets-tab-resolved"
          onPress={() => setTab("resolved")}
          style={[styles.tab, tab === "resolved" && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === "resolved" && styles.tabTextActive]}>Rozstrzygnięte</Text>
        </TouchableOpacity>
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.empty}><Text style={styles.emptyText}>Ładowanie…</Text></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.bet_id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 32 + insets.bottom }}
          renderItem={({ item }) => <Row item={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <EmptyState
              testID={`mybets-empty-${tab}`}
              emoji={tab === "active" ? "🎯" : "📜"}
              title={tab === "active" ? "Brak aktywnych zakładów" : "Brak rozstrzygniętych"}
              subtitle={
                tab === "active"
                  ? "Wejdź w zakładkę Rynki i postaw pierwszy zakład!"
                  : "Twoje rozstrzygnięcia pojawią się tutaj gdy zakłady się zakończą."
              }
            />
          }
          testID="mybets-list"
        />
      )}

      {/* Moment największych emocji — proponujemy pochwalenie się od razu */}
      <Modal visible={!!bigWin} transparent animationType="fade" onRequestClose={() => setBigWin(null)}>
        <Pressable style={styles.winBackdrop} onPress={() => setBigWin(null)}>
          <Pressable style={styles.winCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.winEmoji}>🎉</Text>
            <Text style={styles.winTitle}>
              +{bigWin ? bigWin.payout - bigWin.stake : 0} monet!
            </Text>
            <Text style={styles.winQuestion} numberOfLines={3}>
              {bigWin?.question}
            </Text>
            <TouchableOpacity
              testID="bigwin-share"
              style={styles.winShare}
              onPress={async () => {
                const w = bigWin;
                setBigWin(null);
                if (!w) return;
                await storage.setItem(LAST_SHARED_KEY, w.bet_id);
                Share.share({
                  message:
                    `Wytypowałem to na PopBet i zgarnąłem +${w.payout - w.stake} monet 🪙\n` +
                    `„${w.question}"\n\nZagraj ze mną: https://github.com/xeniak123/popbet12/releases/latest`,
                }).catch(() => {});
              }}
            >
              <Text style={styles.winShareText}>Pochwal się wynikiem</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="bigwin-later"
              onPress={async () => {
                if (bigWin) await storage.setItem(LAST_SHARED_KEY, bigWin.bet_id);
                setBigWin(null);
              }}
            >
              <Text style={styles.winLater}>Może później</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Row({ item }: { item: MyBet }) {
  const won = item.resolved && item.won === true;
  const lost = item.resolved && item.won === false;

  const badge = item.resolved
    ? won
      ? { bg: colors.winSoft, color: colors.onWin, label: `+${item.payout - item.stake}` }
      : { bg: colors.lossSoft, color: colors.onLoss, label: `-${item.stake}` }
    : { bg: colors.primarySoft, color: colors.primary, label: `Aktywny` };

  return (
    <View style={styles.card} testID={`mybet-row-${item.bet_id}`}>
      <View style={styles.rowTop}>
        <Text style={styles.category}>{CATEGORY_LABEL[item.category] ?? item.category}</Text>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
        </View>
      </View>
      <Text style={styles.question} numberOfLines={2}>{item.question}</Text>
      <View style={styles.rowBottom}>
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>Twój wybór</Text>
          <Text style={styles.metaValue}>{item.choice === "a" ? "Opcja A" : "Opcja B"}</Text>
        </View>
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>Stawka</Text>
          <Text style={styles.metaValue}>{item.stake} 🪙</Text>
        </View>
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>{item.resolved ? "Wypłata" : "Zamknięcie"}</Text>
          <Text style={styles.metaValue}>
            {item.resolved
              ? item.payout > 0 ? `${item.payout} 🪙` : "—"
              : new Date(item.closes_at).toLocaleString("pl-PL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
      </View>
      {item.resolved && (
        <View style={styles.resultRow}>
          <Ionicons
            name={won ? "checkmark-circle" : "close-circle"}
            size={18}
            color={won ? colors.win : colors.loss}
          />
          <Text style={[styles.resultText, { color: won ? colors.onWin : colors.onLoss }]}>
            {won ? "Wygrałeś!" : "Niestety, przegrana"}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  winBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  winCard: { backgroundColor: colors.card, borderRadius: radii.card, padding: spacing.lg, alignItems: 'center', width: '100%', maxWidth: 330 },
  winEmoji: { fontSize: 46 },
  winTitle: { fontSize: 26, fontWeight: '900', color: colors.win, marginTop: 4 },
  winQuestion: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 19 },
  winShare: { backgroundColor: colors.primary, borderRadius: radii.button, paddingVertical: 13, paddingHorizontal: 28, marginTop: spacing.md },
  winShareText: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  winLater: { color: colors.textMuted, fontWeight: '700', fontSize: 13, marginTop: 12 },
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 6 },
  title: { fontSize: 24, fontWeight: "900", color: colors.text },
  tabsRow: {
    marginHorizontal: spacing.lg,
    flexDirection: "row",
    backgroundColor: colors.bgAlt,
    borderRadius: 999,
    padding: 4,
    marginBottom: spacing.md,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center" },
  tabActive: { backgroundColor: colors.card, ...shadow.softer },
  tabText: { fontWeight: "700", color: colors.textMuted, fontSize: 13 },
  tabTextActive: { color: colors.text },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.softer,
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  category: { fontSize: 12, fontWeight: "800", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: "800" },
  question: { marginTop: 8, fontSize: 16, fontWeight: "800", color: colors.text },
  rowBottom: { flexDirection: "row", marginTop: 12, gap: 12 },
  metaBlock: { flex: 1 },
  metaLabel: { fontSize: 11, color: colors.textMuted, fontWeight: "700" },
  metaValue: { fontSize: 13, color: colors.text, fontWeight: "800", marginTop: 2 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  resultText: { fontSize: 13, fontWeight: "800" },
  empty: { padding: spacing.xl, alignItems: "center" },
  emptyTitle: { fontSize: 16, fontWeight: "900", color: colors.text, marginBottom: 6 },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
}));
