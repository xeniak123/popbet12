// Galeria odznak — czysty status, bez wpływu na ekonomię gry.
// Świeżo zdobyte odznaki backend zwraca w polu `new`; świętujemy je konfetti + toastem.
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { colors, radii, shadow, spacing, themedStyles } from "@/src/theme/colors";

type Tier = { tier: string; threshold: number; earned: boolean };
type Badge = {
  code: string;
  name: string;
  emoji: string;
  desc: string;
  value: number;
  tiers: Tier[];
  highest: string | null;
  next: { tier: string; threshold: number; remaining: number } | null;
};
type Title = { season: number; place: number; label: string };
type BadgesResp = {
  badges: Badge[];
  earned_count: number;
  total_count: number;
  new: string[];
  titles: Title[];
};

const TIER_COLOR: Record<string, string> = {
  "brąz": "#C08457",
  "srebro": "#9AA6B2",
  "złoto": "#E0B84E",
};

export function BadgeShelf({ onCelebrate }: { onCelebrate?: () => void }) {
  const [data, setData] = useState<BadgesResp | null>(null);
  const [open, setOpen] = useState<Badge | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const res = await api.get<BadgesResp>("/api/badges");
      setData(res);
      if (res.new?.length) {
        const first = res.new[0].split(":");
        const def = res.badges.find((b) => b.code === first[0]);
        toast.success(`Nowa odznaka: ${def?.emoji ?? "🏅"} ${def?.name ?? ""} (${first[1]})`);
        onCelebrate?.();
      }
    } catch { /* cicho */ }
  }, [toast, onCelebrate]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!data) return null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>Odznaki</Text>
        <Text style={styles.count}>
          {data.earned_count}/{data.total_count}
        </Text>
      </View>

      {data.titles.length > 0 && (
        <View style={styles.titleRow}>
          {data.titles.map((t) => (
            <View key={`${t.season}-${t.place}`} style={styles.titlePill}>
              <Text style={styles.titleText}>👑 {t.label}</Text>
            </View>
          ))}
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {data.badges.map((b) => {
          const tint = b.highest ? TIER_COLOR[b.highest] ?? colors.primary : colors.border;
          return (
            <Pressable
              key={b.code}
              testID={`badge-${b.code}`}
              onPress={() => setOpen(b)}
              style={[styles.badge, { borderColor: tint }, !b.highest && styles.badgeLocked]}
            >
              <Text style={[styles.badgeEmoji, !b.highest && styles.dim]}>{b.emoji}</Text>
              <Text style={styles.badgeName} numberOfLines={1}>{b.name}</Text>
              <Text style={[styles.badgeTier, { color: b.highest ? tint : colors.textMuted }]}>
                {b.highest ?? (b.next ? `${b.value}/${b.next.threshold}` : "—")}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            {open && (
              <>
                <Text style={styles.sheetEmoji}>{open.emoji}</Text>
                <Text style={styles.sheetTitle}>{open.name}</Text>
                <Text style={styles.sheetDesc}>{open.desc}</Text>
                <Text style={styles.sheetValue}>Twój wynik: {open.value}</Text>
                {open.tiers.map((t) => (
                  <View key={t.tier} style={styles.tierRow}>
                    <Ionicons
                      name={t.earned ? "checkmark-circle" : "ellipse-outline"}
                      size={18}
                      color={t.earned ? (TIER_COLOR[t.tier] ?? colors.primary) : colors.textMuted}
                    />
                    <Text style={[styles.tierName, t.earned && { color: colors.text, fontWeight: "800" }]}>
                      {t.tier}
                    </Text>
                    <Text style={styles.tierThr}>{t.threshold}</Text>
                  </View>
                ))}
                <Pressable onPress={() => setOpen(null)} style={styles.close}>
                  <Text style={styles.closeText}>Zamknij</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: radii.card, padding: spacing.md,
    marginHorizontal: spacing.md, marginTop: spacing.md, ...shadow.softer,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  title: { fontSize: 16, fontWeight: "900", color: colors.text },
  count: { fontFamily: undefined, fontSize: 14, fontWeight: "800", color: colors.primary },
  titleRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing.sm },
  titlePill: {
    backgroundColor: colors.primarySoft, borderRadius: radii.pill,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  titleText: { fontSize: 12, fontWeight: "800", color: colors.primary },
  strip: { gap: 10, paddingRight: 4 },
  badge: {
    width: 92, borderRadius: 16, borderWidth: 2, backgroundColor: colors.bgAlt,
    paddingVertical: 12, paddingHorizontal: 8, alignItems: "center",
  },
  badgeLocked: { opacity: 0.55 },
  badgeEmoji: { fontSize: 26 },
  dim: { opacity: 0.5 },
  badgeName: { fontSize: 11, fontWeight: "800", color: colors.text, marginTop: 5, textAlign: "center" },
  badgeTier: { fontSize: 11, fontWeight: "700", marginTop: 2 },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  sheet: {
    backgroundColor: colors.card, borderRadius: radii.card, padding: spacing.lg,
    width: "100%", maxWidth: 340, alignItems: "center",
  },
  sheetEmoji: { fontSize: 44 },
  sheetTitle: { fontSize: 19, fontWeight: "900", color: colors.text, marginTop: 6 },
  sheetDesc: { fontSize: 14, color: colors.textMuted, textAlign: "center", marginTop: 4 },
  sheetValue: { fontSize: 15, fontWeight: "800", color: colors.primary, marginVertical: 12 },
  tierRow: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "stretch", paddingVertical: 7 },
  tierName: { flex: 1, fontSize: 14, color: colors.textMuted, textTransform: "capitalize" },
  tierThr: { fontSize: 13, fontWeight: "800", color: colors.textMuted },
  close: {
    marginTop: spacing.md, backgroundColor: colors.primary, borderRadius: radii.button,
    paddingVertical: 12, paddingHorizontal: 28,
  },
  closeText: { color: "#FFF", fontWeight: "900", fontSize: 15 },
}));
