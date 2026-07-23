// Profile - avatar, big coin balance, stats, story template chooser, share, settings.
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useCallback, useRef, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { captureRef } from "react-native-view-shot";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radii, shadow, spacing, themedStyles } from "@/src/theme/colors";

import { useTheme } from "@/src/theme/ThemeContext";
type ProfileData = {
  user: { user_id: string; username: string; email: string; coins: number; avatar: string };
  stats: {
    total_bets: number;
    wins: number;
    losses: number;
    hit_rate: number;
    best_streak: number;
    biggest_win?: number;
    biggest_win_question?: string;
    checkin_streak?: number;
    checkin_best?: number;
  };
};

type Template = "stats" | "streak" | "biggest";

export default function ProfileScreen() {
  useTheme(); // subskrypcja motywu — wymusza re-render po przelaczeniu

  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refresh } = useAuth();
  const [data, setData] = useState<ProfileData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [template, setTemplate] = useState<Template>("stats");
  const shareRef = useRef<View>(null);

  const load = useCallback(async () => {
    const p = await api.get<ProfileData>("/api/profile/me");
    setData(p);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    try { await Promise.all([load(), refresh()]); } finally { setRefreshing(false); }
  };

  const shareStory = async (t: Template) => {
    setTemplate(t);
    setPickerOpen(false);
    // give React a tick to render the chosen template before capture
    await new Promise((r) => setTimeout(r, 300));
    if (!shareRef.current || sharing) return;
    setSharing(true);
    setShareMsg(null);
    try {
      const uri = await captureRef(shareRef.current, { format: "png", quality: 1, result: "tmpfile" });
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Udostępnij wynik PopBet" });
      } else {
        setShareMsg("Udostępnianie niedostępne na tym urządzeniu.");
      }
    } catch (e) {
      setShareMsg((e as Error).message);
    } finally {
      setSharing(false);
    }
  };

  if (!data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.empty}><Text style={styles.emptyText}>Ładowanie profilu…</Text></View>
      </SafeAreaView>
    );
  }

  const { user, stats } = data;
  const currentStreak = stats.checkin_streak ?? 0;
  const bestStreak = stats.checkin_best ?? 0;
  const biggestWin = stats.biggest_win ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Profil</Text>
          <TouchableOpacity
            testID="settings-link"
            onPress={() => router.push("/settings" as any)}
            style={styles.settingsBtn}
          >
            <Ionicons name="settings-outline" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Share card — content varies by template */}
        <View collapsable={false} ref={shareRef} style={styles.shareCard} testID="profile-share-card">
          <View style={styles.shareTop}>
            {user.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft }]}>
                <Text style={{ fontSize: 28, fontWeight: "900", color: colors.primary }}>{user.username.slice(0, 1).toUpperCase()}</Text>
              </View>
            )}
            <View style={{ marginLeft: spacing.md, flex: 1 }}>
              <Text style={styles.username}>{user.username}</Text>
              <Text style={styles.emailText}>PopBet · rynek predykcji</Text>
            </View>
          </View>

          {template === "stats" && (
            <>
              <View style={styles.balanceBlock}>
                <Text style={styles.balanceLabel}>Saldo</Text>
                <Text style={styles.balanceValue}>🪙 {user.coins}</Text>
              </View>
              <View style={styles.statsGrid}>
                <StatBox label="Trafienia" value={`${stats.hit_rate}%`} color={colors.primary} />
                <StatBox label="Najdłuższa passa" value={`${stats.best_streak}`} color="#7BB77E" />
                <StatBox label="Wszystkich zakładów" value={`${stats.total_bets}`} color="#5B9BD5" />
              </View>
            </>
          )}

          {template === "streak" && (
            <View style={styles.storyStreakBlock}>
              <Text style={styles.storyEmoji}>🔥</Text>
              <Text style={styles.storyBigValue}>{currentStreak}</Text>
              <Text style={styles.storyCaption}>dni z rzędu odbieram bonus</Text>
              <Text style={styles.storySub}>Rekord osobisty: {bestStreak} dni</Text>
            </View>
          )}

          {template === "biggest" && (
            <View style={styles.storyStreakBlock}>
              <Text style={styles.storyEmoji}>🏆</Text>
              <Text style={styles.storyBigValue}>+{biggestWin}</Text>
              <Text style={styles.storyCaption}>coinów największej wygranej</Text>
              {stats.biggest_win_question ? (
                <Text style={styles.storySub} numberOfLines={2}>„{stats.biggest_win_question}”</Text>
              ) : (
                <Text style={styles.storySub}>Postaw pierwszy zakład i wygraj!</Text>
              )}
            </View>
          )}

          <View style={styles.footerBrand}>
            <Text style={styles.brandText}>@popbet · dołącz do przewidywań popkultury</Text>
          </View>
        </View>

        {/* Live stats section (not for sharing) */}
        <View style={styles.liveStatsCard}>
          <Text style={styles.sectionTitle}>Twoje statystyki</Text>
          <View style={styles.statsGrid}>
            <StatBox label="Passa (dni)" value={`${currentStreak}`} color={colors.primary} />
            <StatBox label="Największa wygrana" value={`+${biggestWin}`} color="#7BB77E" />
            <StatBox label="Wszystkich zakładów" value={`${stats.total_bets}`} color="#5B9BD5" />
          </View>
        </View>

        {/* Quick actions */}
        <View style={{ paddingHorizontal: spacing.md, gap: 10 }}>
          <TouchableOpacity
            testID="open-share-picker"
            onPress={() => setPickerOpen(true)}
            style={[styles.primaryBtn, { opacity: sharing ? 0.6 : 1 }]}
            disabled={sharing}
          >
            <Ionicons name="share-social" size={18} color="#FFF" />
            <Text style={styles.primaryBtnText}>{sharing ? "Przygotowuję…" : "Udostępnij do Stories"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="open-transfer"
            onPress={() => router.push("/transfer" as any)}
            style={styles.secondaryBtn}
          >
            <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
            <Text style={styles.secondaryBtnText}>Przelej coiny znajomemu</Text>
          </TouchableOpacity>
          {shareMsg && <Text style={styles.errorMsg}>{shareMsg}</Text>}
        </View>
      </ScrollView>

      {/* Template picker modal */}
      <Modal transparent visible={pickerOpen} animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Wybierz szablon</Text>
            <Text style={styles.modalSub}>Zdecyduj, czym się pochwalisz na Stories.</Text>
            <TemplateOption
              testID="template-stats"
              emoji="📊"
              title="Statystyki i saldo"
              subtitle={`Saldo ${user.coins} 🪙 + trafienia ${stats.hit_rate}%`}
              onPress={() => shareStory("stats")}
            />
            <TemplateOption
              testID="template-streak"
              emoji="🔥"
              title="Aktualna passa"
              subtitle={`${currentStreak} dni z rzędu`}
              disabled={currentStreak === 0}
              onPress={() => shareStory("streak")}
            />
            <TemplateOption
              testID="template-biggest"
              emoji="🏆"
              title="Największa wygrana"
              subtitle={biggestWin > 0 ? `+${biggestWin} coinów` : "Zdobądź pierwszą wygraną"}
              disabled={biggestWin === 0}
              onPress={() => shareStory("biggest")}
            />
            <TouchableOpacity onPress={() => setPickerOpen(false)} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>Anuluj</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TemplateOption({
  testID, emoji, title, subtitle, disabled, onPress,
}: { testID: string; emoji: string; title: string; subtitle: string; disabled?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={[styles.templateOption, disabled && { opacity: 0.45 }]}
    >
      <Text style={styles.templateEmoji}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.templateTitle}>{title}</Text>
        <Text style={styles.templateSub}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 6,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  title: { fontSize: 24, fontWeight: "900", color: colors.text },
  settingsBtn: { padding: 8, borderRadius: 999, backgroundColor: colors.bgAlt },
  shareCard: {
    margin: spacing.md, backgroundColor: colors.card, borderRadius: 28,
    padding: spacing.lg, ...shadow.soft,
  },
  shareTop: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  username: { fontSize: 22, fontWeight: "900", color: colors.text },
  emailText: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },
  balanceBlock: { marginTop: spacing.lg, alignItems: "flex-start" },
  balanceLabel: { fontSize: 12, fontWeight: "800", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.6 },
  balanceValue: { fontSize: 52, fontWeight: "900", color: colors.primary, marginTop: 4 },
  statsGrid: { marginTop: spacing.md, flexDirection: "row", gap: 8 },
  statBox: {
    flex: 1, padding: 14, borderRadius: 20,
    backgroundColor: colors.bgAlt, alignItems: "flex-start",
  },
  statValue: { fontSize: 22, fontWeight: "900" },
  statLabel: { marginTop: 4, fontSize: 11, color: colors.textMuted, fontWeight: "700" },
  storyStreakBlock: { alignItems: "center", paddingVertical: spacing.lg },
  storyEmoji: { fontSize: 72 },
  storyBigValue: { fontSize: 72, fontWeight: "900", color: colors.primary, marginTop: 4 },
  storyCaption: { marginTop: 4, fontSize: 16, fontWeight: "800", color: colors.text, textAlign: "center" },
  storySub: { marginTop: 6, fontSize: 13, color: colors.textMuted, fontWeight: "600", textAlign: "center", maxWidth: 280 },
  footerBrand: { marginTop: spacing.lg, alignItems: "center" },
  brandText: { fontSize: 11, color: colors.textMuted, fontWeight: "800" },
  liveStatsCard: {
    marginHorizontal: spacing.md, marginBottom: spacing.md,
    backgroundColor: colors.card, borderRadius: radii.card, padding: spacing.md, ...shadow.softer,
  },
  sectionTitle: { fontSize: 12, fontWeight: "900", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  primaryBtn: {
    backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 999,
    alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, ...shadow.softer,
  },
  primaryBtnText: { color: "#FFF", fontWeight: "900", fontSize: 15 },
  secondaryBtn: {
    backgroundColor: colors.primarySoft, paddingVertical: 12, borderRadius: 999,
    alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
  },
  secondaryBtnText: { color: colors.primary, fontWeight: "900", fontSize: 14 },
  errorMsg: { color: colors.danger, fontSize: 12, textAlign: "center" },
  empty: { padding: spacing.xl, alignItems: "center" },
  emptyText: { fontSize: 13, color: colors.textMuted },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(45,55,72,0.5)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: { width: "100%", backgroundColor: colors.card, borderRadius: 28, padding: spacing.lg, ...shadow.soft },
  modalTitle: { fontSize: 20, fontWeight: "900", color: colors.text },
  modalSub: { marginTop: 6, fontSize: 13, color: colors.textMuted, marginBottom: 12 },
  templateOption: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12, borderRadius: 20, backgroundColor: colors.bgAlt, marginBottom: 8,
  },
  templateEmoji: { fontSize: 30 },
  templateTitle: { fontSize: 15, fontWeight: "900", color: colors.text },
  templateSub: { fontSize: 12, color: colors.textMuted, fontWeight: "700", marginTop: 2 },
  modalCancel: { alignItems: "center", paddingVertical: 12 },
  modalCancelText: { fontSize: 14, fontWeight: "800", color: colors.textMuted },
}));
