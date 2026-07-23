// Regulamin + Polityka prywatności (statyczne treści, wymagane do publikacji).
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radii, shadow, spacing, themedStyles } from "@/src/theme/colors";

import { useTheme } from "@/src/theme/ThemeContext";
export default function LegalScreen() {
  useTheme(); // subskrypcja motywu — wymusza re-render po przelaczeniu

  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="legal-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Regulamin i prywatność</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}>
        <Section title="Regulamin PopBet">
          <P>Korzystając z aplikacji PopBet akceptujesz poniższy regulamin.</P>
          <P>1. Waluta w aplikacji („coiny”) jest fikcyjna. Coinów nie da się kupić za prawdziwe pieniądze ani wymienić na jakiekolwiek środki finansowe. PopBet nie jest zakładem bukmacherskim, kasynem ani grą hazardową.</P>
          <P>2. Aplikacja przeznaczona jest wyłącznie do celów rozrywkowych. Zakłady i wyniki nie mają wartości poza kontekstem aplikacji.</P>
          <P>3. Zakłady są generowane centralnie przez zespół PopBet; użytkownik nie tworzy zakładów.</P>
          <P>4. Konto może zostać usunięte przez użytkownika w każdej chwili (Ustawienia → Usuń konto). Możemy zablokować konto łamiące regulamin.</P>
          <P>5. Aby dołączyć do serwisu musisz mieć co najmniej 13 lat.</P>
        </Section>

        <Section title="Polityka prywatności">
          <P>Poniżej opisujemy, jakie dane zbieramy i jak z nich korzystamy.</P>
          <P>• Dane konta (email, nazwa użytkownika, opcjonalny telefon, hasło zahaszowane bcryptem) — używane wyłącznie do logowania i identyfikacji.</P>
          <P>• Dane aktywności (postawione zakłady, saldo coinów, statystyki) — używane do wyświetlania Twojego profilu i rankingów.</P>
          <P>• Kontakty (opcjonalnie) — pobieramy numery telefonów tylko na Twoje wyraźne polecenie, żeby znaleźć Twoich znajomych korzystających z PopBet. Numery nie są przechowywane po zapytaniu.</P>
          <P>• Push notifications — służą wyłącznie do powiadomień o rozstrzygnięciach zakładów, zaproszeniach do znajomych i przelewach coinów.</P>
          <P>• Nie sprzedajemy Twoich danych stronom trzecim.</P>
          <P>• Możesz usunąć swoje konto i wszystkie dane w każdej chwili z poziomu Ustawień.</P>
        </Section>

        <Section title="Kontakt">
          <P>Masz pytania? Napisz na: hello@popbet.app</P>
        </Section>

        <Text style={styles.footer}>Ostatnia aktualizacja: 2026-07-18</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.p}>{children}</Text>;
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 6,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  backBtn: { padding: 6, borderRadius: 999, backgroundColor: colors.bgAlt },
  title: { fontSize: 20, fontWeight: "900", color: colors.text },
  section: {
    backgroundColor: colors.card, borderRadius: radii.card,
    padding: spacing.md, marginBottom: spacing.md, ...shadow.softer,
  },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: colors.text, marginBottom: 10 },
  p: { fontSize: 13, color: colors.text, lineHeight: 20, fontWeight: "600", marginBottom: 8 },
  footer: { textAlign: "center", color: colors.textMuted, fontSize: 12, marginTop: 8 },
}));
