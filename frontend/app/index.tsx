// Entry route: sends user to onboarding when logged-out, to tabs when logged-in.
import { Redirect } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { HAS_BACKEND_URL } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radii, shadow, spacing, themedStyles } from "@/src/theme/colors";

import { useTheme } from "@/src/theme/ThemeContext";
export default function Index() {
  useTheme(); // subskrypcja motywu — wymusza re-render po przelaczeniu

  const { user, loading } = useAuth();

  if (!HAS_BACKEND_URL) {
    return (
      <SafeAreaView style={styles.errorScreen} testID="missing-backend-url-screen">
        <ScrollView contentContainerStyle={styles.errorContent}>
          <Text style={styles.errorEmoji}>🔌</Text>
          <Text style={styles.errorTitle}>Brak adresu backendu</Text>
          <Text style={styles.errorBody}>
            PopBet nie wie, gdzie stoi Twój backend. Aby uruchomić apkę lokalnie:
          </Text>
          <View style={styles.stepsCard}>
            <Text style={styles.step}>1. W katalogu <Text style={styles.mono}>frontend/</Text> skopiuj plik:</Text>
            <Text style={styles.cmd}>cp .env.example .env</Text>
            <Text style={styles.step}>2. Otwórz <Text style={styles.mono}>.env</Text> i ustaw:</Text>
            <Text style={styles.cmd}>EXPO_PUBLIC_BACKEND_URL=https://twoj-backend.emergent.host</Text>
            <Text style={styles.step}>3. Zrestartuj Expo:</Text>
            <Text style={styles.cmd}>npx expo start --clear</Text>
          </View>
          <Text style={styles.errorFoot}>
            Adres backendu znajdziesz w panelu Deployments w Emergent (po kliknięciu Publish).
            Pełna instrukcja: frontend/SETUP.md
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <View style={styles.center} testID="boot-loader">
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  return user ? <Redirect href="/(tabs)" /> : <Redirect href="/onboarding" />;
}

const styles = themedStyles(() => StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  errorScreen: { flex: 1, backgroundColor: colors.bg },
  errorContent: { padding: spacing.lg, alignItems: "stretch" },
  errorEmoji: { fontSize: 72, textAlign: "center", marginTop: spacing.xl },
  errorTitle: { fontSize: 24, fontWeight: "900", color: colors.text, textAlign: "center", marginTop: 12 },
  errorBody: { fontSize: 14, color: colors.textMuted, textAlign: "center", marginTop: 8, lineHeight: 20 },
  stepsCard: {
    marginTop: spacing.lg, backgroundColor: colors.card, borderRadius: radii.card,
    padding: spacing.md, ...shadow.softer,
  },
  step: { fontSize: 13, color: colors.text, fontWeight: "800", marginTop: 8 },
  cmd: {
    marginTop: 6, backgroundColor: colors.bgAlt, padding: 10, borderRadius: 12,
    fontFamily: "Menlo", fontSize: 11, color: colors.primary, fontWeight: "700",
  },
  mono: { fontFamily: "Menlo", color: colors.primary },
  errorFoot: { marginTop: spacing.lg, fontSize: 12, color: colors.textMuted, textAlign: "center", lineHeight: 18 },
}));
