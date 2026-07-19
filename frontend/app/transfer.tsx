// Coin transfer screen. Pick recipient (from friends or by username) + amount.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radii, shadow, spacing } from "@/src/theme/colors";

type Friend = { user_id: string; username: string; avatar: string; coins: number };

export default function TransferScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [amount, setAmount] = useState("50");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api.get<Friend[]>("/api/friends/list");
      setFriends(list);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!selected.trim()) {
      setErr("Wybierz odbiorcę.");
      return;
    }
    const amt = parseInt(amount, 10);
    if (isNaN(amt) || amt < 10) {
      setErr("Minimalna kwota to 10 coinów.");
      return;
    }
    if ((user?.coins ?? 0) < amt) {
      setErr("Za mało coinów.");
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await api.post<{ ok: boolean; amount: number; to_username: string }>(
        "/api/coins/transfer",
        { to_username: selected.trim(), amount: amt },
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setMsg(`Wysłano ${res.amount} coinów do ${res.to_username}! ✅`);
      setAmount("50");
      setSelected("");
      await refresh();
      setTimeout(() => router.back(), 900);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="transfer-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Przelej coiny</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.balancePill}>
          <Text style={styles.balanceLabel}>Twoje saldo</Text>
          <Text style={styles.balanceValue}>🪙 {user?.coins ?? 0}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Odbiorca</Text>
          <TextInput
            testID="transfer-username-input"
            value={selected}
            onChangeText={setSelected}
            placeholder="Nazwa użytkownika"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={styles.input}
          />
          {friends.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.friendsTitle}>Albo wybierz znajomego</Text>
              <FlatList
                horizontal
                data={friends}
                keyExtractor={(f) => f.user_id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    testID={`transfer-friend-${item.user_id}`}
                    onPress={() => setSelected(item.username)}
                    style={[
                      styles.friendPill,
                      selected === item.username && { borderColor: colors.primary, borderWidth: 2 },
                    ]}
                  >
                    {item.avatar
                      ? <Image source={{ uri: item.avatar }} style={styles.friendAvatar} />
                      : <View style={[styles.friendAvatar, { backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }]}>
                          <Text style={{ fontWeight: "900", color: colors.primary }}>{item.username.slice(0, 1).toUpperCase()}</Text>
                        </View>}
                    <Text style={styles.friendName}>{item.username}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Kwota</Text>
          <View style={styles.amountRow}>
            <TextInput
              testID="transfer-amount-input"
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
              style={styles.amountInput}
              placeholder="50"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.amountEmoji}>🪙</Text>
          </View>
          <View style={styles.amountChips}>
            {[50, 100, 250, 500].map((v) => (
              <TouchableOpacity
                key={v}
                testID={`transfer-quick-${v}`}
                style={styles.amountChip}
                onPress={() => setAmount(String(v))}
              >
                <Text style={styles.amountChipText}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {err ? <Text style={styles.err}>{err}</Text> : null}
        {msg ? <Text style={styles.msg}>{msg}</Text> : null}
      </KeyboardAvoidingView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          testID="transfer-submit"
          disabled={busy}
          onPress={submit}
          style={[styles.cta, { opacity: busy ? 0.6 : 1 }]}
        >
          <Ionicons name="send" size={16} color="#FFF" />
          <Text style={styles.ctaText}>{busy ? "Wysyłam…" : "Wyślij coiny"}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 6,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  backBtn: { padding: 6, borderRadius: 999, backgroundColor: colors.bgAlt },
  title: { fontSize: 20, fontWeight: "900", color: colors.text },
  balancePill: {
    marginHorizontal: spacing.md, marginTop: spacing.sm, marginBottom: spacing.md,
    backgroundColor: colors.primarySoft, borderRadius: radii.card,
    padding: spacing.md, alignItems: "center",
  },
  balanceLabel: { fontSize: 12, fontWeight: "800", color: colors.primary, textTransform: "uppercase" },
  balanceValue: { fontSize: 40, fontWeight: "900", color: colors.primary, marginTop: 4 },
  card: {
    backgroundColor: colors.card, borderRadius: radii.card, padding: spacing.md,
    marginHorizontal: spacing.md, marginBottom: spacing.md, ...shadow.softer,
  },
  sectionTitle: { fontSize: 12, fontWeight: "900", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  input: { backgroundColor: colors.bgAlt, borderRadius: 16, paddingHorizontal: 14, paddingVertical: Platform.OS === "ios" ? 14 : 10, fontSize: 15, color: colors.text, fontWeight: "700" },
  friendsTitle: { fontSize: 12, color: colors.textMuted, fontWeight: "700" },
  friendPill: { alignItems: "center", padding: 8, borderRadius: 16, backgroundColor: colors.bgAlt, minWidth: 64 },
  friendAvatar: { width: 44, height: 44, borderRadius: 22 },
  friendName: { marginTop: 4, fontSize: 12, fontWeight: "800", color: colors.text },
  amountRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  amountInput: {
    flex: 1, backgroundColor: colors.bgAlt, borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: Platform.OS === "ios" ? 16 : 10,
    fontSize: 24, color: colors.text, fontWeight: "900",
  },
  amountEmoji: { fontSize: 26 },
  amountChips: { flexDirection: "row", gap: 8, marginTop: 10 },
  amountChip: { flex: 1, backgroundColor: colors.primarySoft, paddingVertical: 8, borderRadius: 999, alignItems: "center" },
  amountChipText: { color: colors.primary, fontWeight: "900" },
  err: { color: "#C0392B", textAlign: "center", fontSize: 13, fontWeight: "700", marginTop: 4 },
  msg: { color: colors.primary, textAlign: "center", fontSize: 14, fontWeight: "800", marginTop: 4 },
  footer: { paddingHorizontal: spacing.md, paddingTop: 8 },
  cta: {
    backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 999,
    alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, ...shadow.softer,
  },
  ctaText: { color: "#FFF", fontWeight: "900", fontSize: 16 },
});
