// Rynki - Markets screen. Sticky header with coin balance and horizontal category
// chip row; below is a vertically scrolling list of bet cards.
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { BetCard, type Bet } from "@/src/components/BetCard";
import ConfettiOverlay from "@/src/components/Confetti";
import { EmptyState } from "@/src/components/EmptyState";
import { BetCardSkeleton } from "@/src/components/Skeleton";
import StreakCard from "@/src/components/StreakCard";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { categoryList, colors, spacing, themedStyles } from "@/src/theme/colors";

import { useTheme } from "@/src/theme/ThemeContext";
export default function MarketsScreen() {
  useTheme(); // subskrypcja motywu — wymusza re-render po przelaczeniu

  const { user, refresh } = useAuth();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [bets, setBets] = useState<Bet[]>([]);
  const [category, setCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confetti, setConfetti] = useState(false);

  const load = useCallback(async (cat: string) => {
    const res = await api.get<Bet[]>(`/api/bets${cat && cat !== "all" ? `?category=${cat}` : ""}`);
    setBets(res);
  }, []);

  useEffect(() => {
    setLoading(true);
    load(category).finally(() => setLoading(false));
  }, [category, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([load(category), refresh()]);
    } finally {
      setRefreshing(false);
    }
  }, [category, load, refresh]);

  const onPlace = useCallback(
    async (betId: string, option: string, stake: number) => {
      const updated = await api.post<Bet>(`/api/bets/${betId}/place`, { option, stake });
      setBets((prev) => prev.map((b) => (b.bet_id === betId ? updated : b)));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success(`Postawiono ${stake} coinów! 🎉`);
      setConfetti(false);
      setTimeout(() => setConfetti(true), 30);
      await refresh();
    },
    [refresh, toast],
  );

  const headerHeight = 148; // coin bar + chips

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.stickyHeader}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.greeting}>Cześć, {user?.username ?? "gracz"} 👋</Text>
            <Text style={styles.subheading}>Wybierz zakład i typuj!</Text>
          </View>
          <View style={styles.coinPill} testID="header-coin-balance">
            <Text style={styles.coinEmoji}>🪙</Text>
            <Text style={styles.coinText}>{user?.coins ?? 0}</Text>
          </View>
        </View>
        <ChipRow value={category} onChange={setCategory} />
      </View>

      {loading && bets.length === 0 ? (
        <View style={{ paddingTop: 8 }}>
          <StreakCard onClaimed={refresh} />
          <BetCardSkeleton />
          <BetCardSkeleton />
        </View>
      ) : (
        <FlatList
          data={bets}
          keyExtractor={(b) => b.bet_id}
          ListHeaderComponent={<StreakCard onClaimed={refresh} />}
          renderItem={({ item }) => (
            <BetCard bet={item} userCoins={user?.coins ?? 0} onPlace={onPlace} />
          )}
          contentContainerStyle={{
            paddingTop: 8,
            paddingBottom: 32 + insets.bottom,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <EmptyState
              testID="markets-empty"
              emoji="🎬"
              title="Nic tu jeszcze nie ma"
              subtitle="W tej kategorii jest cisza. Sprawdź inną albo wróć jutro po świeżą porcję zakładów."
              ctaLabel="Zobacz wszystkie"
              onCtaPress={() => setCategory("all")}
            />
          }
          testID="markets-list"
        />
      )}

      <ConfettiOverlay visible={confetti} onDone={() => setConfetti(false)} />
    </SafeAreaView>
  );
}

function ChipRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
      testID="category-chip-row"
    >
      {categoryList.map((c) => {
        const active = value === c.key;
        const themed = c.key !== "all" && colors.categories[c.key as keyof typeof colors.categories];
        const bg = active ? colors.primary : themed ? themed.bg : colors.bgAlt;
        const textColor = active ? "#FFF" : colors.text;
        return (
          <TouchableOpacity
            key={c.key}
            testID={`chip-${c.key}`}
            onPress={() => onChange(c.key)}
            activeOpacity={0.85}
            style={[styles.chip, { backgroundColor: bg }]}
          >
            <Text style={[styles.chipText, { color: textColor }]}>{c.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  stickyHeader: {
    paddingBottom: 6,
    backgroundColor: colors.bg,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  greeting: { fontSize: 20, fontWeight: "900", color: colors.text },
  subheading: { marginTop: 2, fontSize: 13, color: colors.textMuted, fontWeight: "600" },
  coinPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  coinEmoji: { fontSize: 16 },
  coinText: { fontSize: 15, fontWeight: "900", color: colors.primary },
  chipRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 8,
  },
  chip: {
    flexShrink: 0,
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: { fontSize: 13, fontWeight: "800" },
  emptyBox: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 16, fontWeight: "900", color: colors.text, marginBottom: 6 },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
}));
