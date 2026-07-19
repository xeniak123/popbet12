// Forgot password — enter email → get a reset token (returned in-app for now).
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { colors, radii, shadow, spacing } from "@/src/theme/colors";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const res = await api.post<{ ok: boolean; delivery: string; token?: string | null }>(
        "/api/auth/forgot-password",
        { email: email.trim() },
      );
      if (res.token) {
        setToken(res.token);
        toast.success("Token gotowy — użyj go poniżej.");
      } else {
        toast.info("Jeśli konto istnieje, wysłaliśmy instrukcje.");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const proceed = () => {
    if (!token) return;
    router.replace({ pathname: "/reset-password", params: { token } });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity testID="forgot-back" onPress={() => router.back()} style={styles.backLink}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>

          <Text style={styles.title}>Zresetuj hasło</Text>
          <Text style={styles.sub}>
            Podaj email — wygenerujemy tymczasowy token, którym ustawisz nowe hasło.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="forgot-email-input"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              style={styles.input}
            />
          </View>

          <TouchableOpacity
            testID="forgot-submit"
            disabled={!email || busy}
            onPress={submit}
            style={[styles.primaryBtn, { opacity: !email || busy ? 0.5 : 1 }]}
          >
            <Text style={styles.primaryBtnText}>{busy ? "Wysyłam…" : "Wyślij token"}</Text>
          </TouchableOpacity>

          {token && (
            <View style={styles.tokenBox} testID="forgot-token-box">
              <Text style={styles.tokenLabel}>Twój tymczasowy token (wygasa za 60 min):</Text>
              <Text selectable style={styles.tokenValue} testID="forgot-token-value">{token}</Text>
              <TouchableOpacity
                testID="forgot-proceed"
                onPress={proceed}
                style={[styles.primaryBtn, { marginTop: spacing.md }]}
              >
                <Text style={styles.primaryBtnText}>Przejdź do ustawiania hasła</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  backLink: { padding: 6, alignSelf: "flex-start", marginBottom: 12 },
  title: { fontSize: 26, fontWeight: "900", color: colors.text },
  sub: { marginTop: 6, fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  field: { marginTop: spacing.lg },
  label: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 6 },
  input: {
    backgroundColor: colors.bgAlt, borderRadius: 16, paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 14 : 10, fontSize: 15, color: colors.text, fontWeight: "600",
  },
  primaryBtn: {
    backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 999,
    alignItems: "center", marginTop: spacing.md, ...shadow.softer,
  },
  primaryBtnText: { color: "#FFF", fontWeight: "900", fontSize: 15 },
  tokenBox: { marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.primarySoft, borderRadius: radii.card },
  tokenLabel: { fontSize: 12, fontWeight: "800", color: colors.primary, marginBottom: 6 },
  tokenValue: { fontSize: 12, fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }), color: colors.text, fontWeight: "700" },
});
