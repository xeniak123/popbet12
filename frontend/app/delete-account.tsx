// Delete account — GDPR/App Store requirement.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, TOKEN_KEY } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radii, shadow, spacing } from "@/src/theme/colors";
import { storage } from "@/src/utils/storage";

export default function DeleteAccountScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user, logout } = useAuth();
  const [password, setPassword] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!ack) return toast.error("Potwierdź, że rozumiesz konsekwencje.");
    setBusy(true);
    try {
      await api.request<{ ok: boolean }>("DELETE", "/api/account", { password: password || undefined });
      await storage.secureRemove(TOKEN_KEY);
      await logout();
      toast.success("Konto usunięte. Do zobaczenia!");
      router.replace("/onboarding");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity testID="delete-back" onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.title}>Usuń konto</Text>
            <View style={{ width: 32 }} />
          </View>

          <View style={styles.warnBox}>
            <Ionicons name="warning" size={22} color="#C0392B" />
            <Text style={styles.warnTitle}>To działanie jest nieodwracalne</Text>
            <Text style={styles.warnBody}>
              Twoje konto ({user?.email}), wszystkie zakłady, coiny, znajomi i statystyki
              zostaną trwale usunięte. Nie ma możliwości odzyskania danych.
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Potwierdź hasłem</Text>
            <TextInput
              testID="delete-password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="Aktualne hasło"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <Text style={styles.hint}>Jeśli logujesz się przez Google — zostaw puste.</Text>
          </View>

          <TouchableOpacity
            testID="delete-ack"
            onPress={() => setAck(!ack)}
            style={styles.ackRow}
          >
            <View style={[styles.checkbox, ack && { backgroundColor: "#C0392B", borderColor: "#C0392B" }]}>
              {ack && <Ionicons name="checkmark" size={16} color="#FFF" />}
            </View>
            <Text style={styles.ackText}>
              Rozumiem, że wszystkie moje dane zostaną usunięte i akceptuję to.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="delete-submit"
            disabled={!ack || busy}
            onPress={submit}
            style={[styles.dangerBtn, { opacity: !ack || busy ? 0.5 : 1 }]}
          >
            <Text style={styles.dangerBtnText}>{busy ? "Usuwam…" : "Usuń moje konto"}</Text>
          </TouchableOpacity>

          <TouchableOpacity testID="delete-cancel" onPress={() => router.back()} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Anuluj</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  backBtn: { padding: 6, borderRadius: 999, backgroundColor: colors.bgAlt },
  title: { fontSize: 20, fontWeight: "900", color: colors.text },
  warnBox: {
    backgroundColor: colors.lossSoft, borderRadius: radii.card, padding: spacing.md,
    alignItems: "flex-start", gap: 6, marginTop: spacing.md,
  },
  warnTitle: { fontWeight: "900", fontSize: 15, color: "#8E3A3A" },
  warnBody: { fontSize: 13, color: colors.text, lineHeight: 19, fontWeight: "600" },
  field: { marginTop: spacing.md },
  label: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 6 },
  input: {
    backgroundColor: colors.bgAlt, borderRadius: 16, paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 14 : 10, fontSize: 15, color: colors.text, fontWeight: "600",
  },
  hint: { marginTop: 6, fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  ackRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: spacing.md },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  ackText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "700" },
  dangerBtn: { backgroundColor: "#C0392B", paddingVertical: 14, borderRadius: 999, alignItems: "center", marginTop: spacing.lg, ...shadow.softer },
  dangerBtnText: { color: "#FFF", fontWeight: "900", fontSize: 15 },
  cancelBtn: { alignItems: "center", paddingVertical: 12, marginTop: 8 },
  cancelText: { color: colors.textMuted, fontWeight: "800", fontSize: 14 },
});
