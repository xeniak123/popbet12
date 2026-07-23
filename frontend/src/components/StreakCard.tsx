// Daily streak check-in card. Shown at the top of the Markets screen.
// Tap "Odbierz bonus" once per day to grow your streak; skipping a day resets it.
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from "react-native-reanimated";

import { api } from "@/src/api/client";
import { colors, radii, shadow, spacing, themedStyles } from "@/src/theme/colors";

type StreakStatus = { current: number; best: number; can_checkin: boolean; next_bonus: number };

export default function StreakCard({ onClaimed }: { onClaimed: () => void }) {
  const [status, setStatus] = useState<StreakStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const load = useCallback(async () => {
    try {
      const s = await api.get<StreakStatus>("/api/streak/status");
      setStatus(s);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const claim = async () => {
    if (!status || !status.can_checkin || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{ bonus: number; current: number; best: number }>("/api/streak/checkin");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      scale.value = withSequence(
        withSpring(1.06, { damping: 8, stiffness: 300 }),
        withSpring(1, { damping: 10, stiffness: 200 }),
      );
      setStatus({
        current: res.current,
        best: res.best,
        can_checkin: false,
        next_bonus: Math.min(50 * (res.current + 1), 500),
      });
      setMsg(`+${res.bonus} coinów! Dzień #${res.current}`);
      onClaimed();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  const days = Array.from({ length: 7 }, (_, i) => i + 1);

  return (
    <Animated.View style={[styles.card, style]} testID="streak-card">
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Dzienna passa 🔥</Text>
          <Text style={styles.subtitle}>
            {status.can_checkin
              ? `Odbierz +${status.next_bonus} coinów za dzień #${status.current + 1}`
              : `Wróć jutro po kolejny bonus (dzień #${status.current + 1})`}
          </Text>
        </View>
        <View style={styles.bestPill}>
          <Ionicons name="trophy" size={12} color={colors.primary} />
          <Text style={styles.bestText}>Rekord: {status.best}</Text>
        </View>
      </View>

      <View style={styles.dotsRow}>
        {days.map((d) => {
          const filled = d <= status.current;
          return (
            <View
              key={d}
              style={[
                styles.dot,
                { backgroundColor: filled ? colors.primary : colors.bgAlt },
              ]}
              testID={`streak-day-${d}`}
            >
              <Text style={[styles.dotText, { color: filled ? "#FFF" : colors.textMuted }]}>{d}</Text>
            </View>
          );
        })}
      </View>

      <TouchableOpacity
        testID="streak-claim-button"
        disabled={!status.can_checkin || busy}
        onPress={claim}
        style={[
          styles.cta,
          { backgroundColor: status.can_checkin ? colors.primary : colors.bgAlt },
        ]}
      >
        <Ionicons
          name={status.can_checkin ? "gift" : "checkmark-circle"}
          size={16}
          color={status.can_checkin ? "#FFF" : colors.textMuted}
        />
        <Text
          style={[
            styles.ctaText,
            { color: status.can_checkin ? "#FFF" : colors.textMuted },
          ]}
        >
          {busy ? "Odbieram…" : status.can_checkin ? "Odbierz bonus" : "Odebrano dzisiaj ✓"}
        </Text>
      </TouchableOpacity>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}
    </Animated.View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...shadow.soft,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 16, fontWeight: "900", color: colors.text },
  subtitle: { fontSize: 12, fontWeight: "600", color: colors.textMuted, marginTop: 2 },
  bestPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.primarySoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
  },
  bestText: { fontSize: 11, fontWeight: "800", color: colors.primary },
  dotsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 12, gap: 4 },
  dot: {
    flex: 1, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center",
  },
  dotText: { fontSize: 12, fontWeight: "800" },
  cta: {
    marginTop: 12, paddingVertical: 12, borderRadius: 999,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
  },
  ctaText: { fontSize: 14, fontWeight: "800" },
  msg: { marginTop: 6, fontSize: 12, fontWeight: "700", color: colors.primary, textAlign: "center" },
}));
