// Reset password — accepts token (from URL param or manual paste) + new password.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, TOKEN_KEY } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { useAuth, type User } from "@/src/context/AuthContext";
import { colors, radii, shadow, spacing, themedStyles } from "@/src/theme/colors";
import { storage } from "@/src/utils/storage";

import { useTheme } from "@/src/theme/ThemeContext";
export default function ResetPasswordScreen() {
  useTheme(); // subskrypcja motywu — wymusza re-render po przelaczeniu

  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const toast = useToast();
  const { refresh } = useAuth();
  const [token, setToken] = useState(params.token ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!token || !password) return;
    if (password !== confirm) {
      toast.error("Hasła się nie zgadzają.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ token: string; user: User }>("/api/auth/reset-password", {
        token, new_password: password,
      });
      await storage.secureSet(TOKEN_KEY, res.token);
      await refresh();
      toast.success("Hasło zmienione — jesteś zalogowany.");
      router.replace("/(tabs)");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = !!token && password.length >= 6 && password === confirm && !busy;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity testID="reset-back" onPress={() => router.back()} style={styles.backLink}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>

          <Text style={styles.title}>Nowe hasło</Text>
          <Text style={styles.sub}>Wklej token i ustaw nowe hasło (min. 6 znaków).</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Token</Text>
            <TextInput
              testID="reset-token-input"
              autoCapitalize="none"
              autoCorrect={false}
              value={token}
              onChangeText={setToken}
              placeholder="Wklej otrzymany token"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Nowe hasło</Text>
            <TextInput
              testID="reset-password-input"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="Min. 6 znaków"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Potwierdź hasło</Text>
            <TextInput
              testID="reset-confirm-input"
              secureTextEntry
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Powtórz nowe hasło"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>

          <TouchableOpacity
            testID="reset-submit"
            disabled={!canSubmit}
            onPress={submit}
            style={[styles.primaryBtn, { opacity: canSubmit ? 1 : 0.5 }]}
          >
            <Text style={styles.primaryBtnText}>{busy ? "Zmieniam…" : "Zmień hasło i zaloguj"}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  backLink: { padding: 6, alignSelf: "flex-start", marginBottom: 12 },
  title: { fontSize: 26, fontWeight: "900", color: colors.text },
  sub: { marginTop: 6, fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  field: { marginTop: spacing.md },
  label: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 6 },
  input: {
    backgroundColor: colors.bgAlt, borderRadius: 16, paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 14 : 10, fontSize: 15, color: colors.text, fontWeight: "600",
  },
  primaryBtn: {
    backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 999,
    alignItems: "center", marginTop: spacing.lg, ...shadow.softer,
  },
  primaryBtnText: { color: "#FFF", fontWeight: "900", fontSize: 15 },
}));
