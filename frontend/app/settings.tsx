// Settings screen — logout, notification toggle, delete account, about.
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/context/AuthContext";
import { colors, radii, shadow, spacing, themedStyles } from "@/src/theme/colors";

import { useTheme } from "@/src/theme/ThemeContext";
export default function SettingsScreen() {
  const { isDark, toggle } = useTheme();

  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const readPerm = useCallback(async () => {
    if (Platform.OS === "web") return setPushEnabled(false);
    try {
      const s = await Notifications.getPermissionsAsync();
      setPushEnabled(s.status === "granted");
    } catch { /* silent */ }
  }, []);

  useEffect(() => { readPerm(); }, [readPerm]);

  const togglePush = async (val: boolean) => {
    if (Platform.OS === "web") return;
    if (!val) {
      setPushEnabled(false);
      return;
    }
    try {
      const req = await Notifications.requestPermissionsAsync();
      setPushEnabled(req.status === "granted");
    } catch { /* silent */ }
  };

  const doLogout = async () => {
    setConfirmLogout(false);
    await logout();
    router.replace("/onboarding");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="settings-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Ustawienia</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 + insets.bottom }}>
        <View style={styles.card} testID="settings-account-card">
          <Text style={styles.sectionTitle}>Konto</Text>
          <Row label="Nazwa użytkownika" value={user?.username ?? "—"} />
          <Row label="Email" value={user?.email ?? "—"} />
          <Row label="Telefon" value={user?.phone || "Nie ustawiono"} />
          <Row label="Saldo" value={`🪙 ${user?.coins ?? 0}`} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Konto — edycja</Text>
          <TouchableOpacity
            testID="settings-edit-profile"
            style={styles.actionRow}
            onPress={() => router.push("/edit-profile" as any)}
          >
            <Ionicons name="person-circle-outline" size={20} color={colors.primary} />
            <Text style={styles.actionLabel}>Edytuj profil (nazwa, zdjęcie)</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="settings-change-password"
            style={styles.actionRow}
            onPress={() => router.push("/change-password" as any)}
          >
            <Ionicons name="key-outline" size={20} color={colors.primary} />
            <Text style={styles.actionLabel}>Zmień hasło</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Wygląd</Text>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Tryb ciemny</Text>
              <Text style={styles.toggleSub}>
                {isDark
                  ? "Włączony — ciemne tło, łagodniejsze dla oczu wieczorem."
                  : "Wyłączony — jasny motyw aplikacji."}
              </Text>
            </View>
            <Switch
              testID="settings-dark-mode-toggle"
              value={isDark}
              onValueChange={toggle}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Powiadomienia</Text>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Push o rozstrzygnięciach zakładów</Text>
              <Text style={styles.toggleSub}>
                {Platform.OS === "web"
                  ? "Dostępne po wygenerowaniu builda mobilnego."
                  : pushEnabled
                  ? "Włączone — dostaniesz powiadomienie o wygranej/przegranej."
                  : "Wyłączone — aktywuj, aby otrzymać alerty."}
              </Text>
            </View>
            <Switch
              testID="settings-push-toggle"
              value={pushEnabled}
              onValueChange={togglePush}
              trackColor={{ true: colors.primary, false: colors.border }}
              disabled={Platform.OS === "web"}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Waluta i społeczność</Text>
          <TouchableOpacity
            testID="settings-transfer-link"
            style={styles.actionRow}
            onPress={() => router.push("/transfer" as any)}
          >
            <Ionicons name="swap-horizontal" size={20} color={colors.primary} />
            <Text style={styles.actionLabel}>Przelej coiny znajomemu</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="settings-friends-link"
            style={styles.actionRow}
            onPress={() => router.push("/(tabs)/leaderboard" as any)}
          >
            <Ionicons name="people" size={20} color={colors.primary} />
            <Text style={styles.actionLabel}>Znajomi i zaproszenia</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>O aplikacji</Text>
          <TouchableOpacity
            testID="settings-legal-link"
            style={styles.actionRow}
            onPress={() => router.push("/legal" as any)}
          >
            <Ionicons name="document-text-outline" size={20} color={colors.primary} />
            <Text style={styles.actionLabel}>Regulamin i prywatność</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
          <Row label="Wersja" value={Constants.expoConfig?.version ?? "—"} />
          <Row label="Waluta" value="Fikcyjna — bez wypłat" />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Strefa niebezpieczna</Text>
          <TouchableOpacity
            testID="settings-delete-account"
            style={styles.actionRow}
            onPress={() => router.push("/delete-account" as any)}
          >
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
            <Text style={[styles.actionLabel, { color: colors.danger }]}>Usuń konto</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          testID="settings-logout-button"
          style={[styles.card, styles.logoutRow]}
          onPress={() => setConfirmLogout(true)}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.logoutText}>Wyloguj się</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal transparent visible={confirmLogout} animationType="fade" onRequestClose={() => setConfirmLogout(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setConfirmLogout(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Wylogować się?</Text>
            <Text style={styles.modalSub}>Twoje coiny i zakłady pozostaną zapisane. Zaloguj się ponownie w każdej chwili.</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: spacing.md }}>
              <TouchableOpacity
                testID="settings-logout-cancel"
                onPress={() => setConfirmLogout(false)}
                style={[styles.modalBtn, { backgroundColor: colors.bgAlt, flex: 1 }]}
              >
                <Text style={[styles.modalBtnText, { color: colors.text }]}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="settings-logout-confirm"
                onPress={doLogout}
                style={[styles.modalBtn, { backgroundColor: colors.danger, flex: 1 }]}
              >
                <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Wyloguj</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={styles.dataValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: { padding: 6, borderRadius: 999, backgroundColor: colors.bgAlt },
  title: { fontSize: 20, fontWeight: "900", color: colors.text },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.softer,
  },
  sectionTitle: {
    fontSize: 12, fontWeight: "900", color: colors.textMuted,
    textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8,
  },
  dataRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 8,
  },
  dataLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  dataValue: { color: colors.text, fontSize: 13, fontWeight: "800", maxWidth: "60%" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  toggleLabel: { color: colors.text, fontSize: 14, fontWeight: "800" },
  toggleSub: { color: colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  actionRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  actionLabel: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "800" },
  logoutRow: {
    flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "center",
    backgroundColor: colors.dangerSoft,
  },
  logoutText: { color: colors.danger, fontSize: 15, fontWeight: "900" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(45,55,72,0.5)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: { width: "100%", backgroundColor: colors.card, borderRadius: 28, padding: spacing.lg, ...shadow.soft },
  modalTitle: { fontSize: 20, fontWeight: "900", color: colors.text },
  modalSub: { marginTop: 6, fontSize: 13, color: colors.textMuted },
  modalBtn: { paddingVertical: 14, borderRadius: 999, alignItems: "center" },
  modalBtnText: { fontWeight: "800", fontSize: 15 },
}));
