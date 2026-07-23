// Change password (authenticated user).
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { colors, radii, shadow, spacing, themedStyles } from "@/src/theme/colors";

import { useTheme } from "@/src/theme/ThemeContext";
export default function ChangePasswordScreen() {
  useTheme(); // subskrypcja motywu — wymusza re-render po przelaczeniu

  const router = useRouter();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!current || !next) return;
    if (next !== confirm) return toast.error("Nowe hasła się nie zgadzają.");
    setBusy(true);
    try {
      await api.post("/api/auth/change-password", { current_password: current, new_password: next });
      toast.success("Hasło zmienione ✅");
      router.back();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = !!current && next.length >= 6 && next === confirm && !busy;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity testID="chg-back" onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.title}>Zmień hasło</Text>
            <View style={{ width: 32 }} />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Aktualne hasło</Text>
            <TextInput testID="chg-current" secureTextEntry value={current} onChangeText={setCurrent} placeholder="Aktualne hasło" placeholderTextColor={colors.textMuted} style={styles.input} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Nowe hasło</Text>
            <TextInput testID="chg-new" secureTextEntry value={next} onChangeText={setNext} placeholder="Min. 6 znaków" placeholderTextColor={colors.textMuted} style={styles.input} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Potwierdź nowe hasło</Text>
            <TextInput testID="chg-confirm" secureTextEntry value={confirm} onChangeText={setConfirm} placeholder="Powtórz" placeholderTextColor={colors.textMuted} style={styles.input} />
          </View>

          <TouchableOpacity
            testID="chg-submit"
            disabled={!canSubmit}
            onPress={submit}
            style={[styles.primaryBtn, { opacity: canSubmit ? 1 : 0.5 }]}
          >
            <Text style={styles.primaryBtnText}>{busy ? "Zmieniam…" : "Zapisz nowe hasło"}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  backBtn: { padding: 6, borderRadius: 999, backgroundColor: colors.bgAlt },
  title: { fontSize: 20, fontWeight: "900", color: colors.text },
  field: { marginTop: spacing.md },
  label: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 6 },
  input: {
    backgroundColor: colors.bgAlt, borderRadius: 16, paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 14 : 10, fontSize: 15, color: colors.text, fontWeight: "600",
  },
  primaryBtn: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 999, alignItems: "center", marginTop: spacing.lg, ...shadow.softer },
  primaryBtnText: { color: "#FFF", fontWeight: "900", fontSize: 15 },
}));
