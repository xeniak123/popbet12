// Onboarding: 3 slides + signup/login. Shows +1000 coin reward animation
// on successful signup before redirecting to the main tabs.
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import ConfettiOverlay from "@/src/components/Confetti";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radii, shadow, spacing, themedStyles } from "@/src/theme/colors";
import { registerPush } from "@/src/utils/push";

import { useTheme } from "@/src/theme/ThemeContext";
type Slide = { emoji: string; title: string; body: string; bg: string };
const SLIDES: Slide[] = [
  {
    emoji: "🎬",
    title: "Rynek przewidywań popkultury",
    body: "Obstawiaj wyniki wydarzeń ze świata rozrywki, sportu i plotek.",
    bg: colors.categories.awards.bg,
  },
  {
    emoji: "🪙",
    title: "1000 coinów na start",
    body: "Fikcyjna waluta — bez ryzyka, tylko zabawa. Codziennie nowe zakłady.",
    bg: colors.categories.music.bg,
  },
  {
    emoji: "🏆",
    title: "Rywalizuj ze znajomymi",
    body: "Wspinaj się w globalnym rankingu i chwal się passą wygranych.",
    bg: colors.categories.reality_tv.bg,
  },
];

export default function Onboarding() {
  useTheme(); // subskrypcja motywu — wymusza re-render po przelaczeniu

  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<"slides" | "auth">("slides");
  const listRef = useRef<FlatList<Slide>>(null);

  const goNext = () => {
    if (index < SLIDES.length - 1) {
      const next = index + 1;
      setIndex(next);
      listRef.current?.scrollToIndex({ index: next, animated: true });
    } else {
      setStep("auth");
    }
  };

  if (step === "auth") {
    return <AuthScreen onBack={() => setStep("slides")} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(_, i) => `${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          setIndex(i);
        }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={[styles.slideEmoji, { backgroundColor: item.bg }]}>
              <Text style={styles.emojiText}>{item.emoji}</Text>
            </View>
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideBody}>{item.body}</Text>
          </View>
        )}
      />

      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === index ? { backgroundColor: colors.primary, width: 22 } : { backgroundColor: colors.primarySoft },
            ]}
          />
        ))}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          testID="onboarding-next-button"
          style={styles.primaryBtn}
          onPress={goNext}
        >
          <Text style={styles.primaryBtnText}>
            {index === SLIDES.length - 1 ? "Zaczynamy!" : "Dalej"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="onboarding-login-link"
          onPress={() => setStep("auth")}
          style={styles.secondaryBtn}
        >
          <Text style={styles.secondaryBtnText}>Mam już konto</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function AuthScreen({ onBack }: { onBack: () => void }) {
  const { signup, login } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reward, setReward] = useState(false);

  const rewardScale = useSharedValue(0);
  const rewardOpacity = useSharedValue(0);
  const rewardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: rewardScale.value }],
    opacity: rewardOpacity.value,
  }));

  const finishReward = () => {
    router.replace("/(tabs)");
  };

  const playReward = () => {
    setReward(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    rewardScale.value = withSequence(
      withSpring(1.1, { damping: 8, stiffness: 200 }),
      withSpring(1, { damping: 12, stiffness: 200 }),
    );
    rewardOpacity.value = withTiming(1, { duration: 250 });
    rewardOpacity.value = withDelay(
      2400,
      withTiming(0, { duration: 300 }, (finished) => {
        if (finished) runOnJS(finishReward)();
      }),
    );
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        await signup(email.trim(), password, username.trim(), phone.trim() || undefined, referralCode.trim() || undefined);
        registerPush().catch(() => {});
        playReward();
      } else {
        await login(email.trim(), password);
        registerPush().catch(() => {});
        router.replace("/(tabs)");
      }
    } catch (e) {
      setError((e as Error).message || "Coś poszło nie tak");
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    !!email && !!password && (mode === "login" || username.trim().length >= 2) && !busy;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity testID="auth-back" onPress={onBack} style={styles.backLink}>
            <Text style={styles.backText}>← Wstecz</Text>
          </TouchableOpacity>

          <Text style={styles.authTitle}>
            {mode === "signup" ? "Załóż konto" : "Witaj z powrotem"}
          </Text>
          <Text style={styles.authSub}>
            {mode === "signup" ? "Dostaniesz 1000 coinów startowych 🎁" : "Zaloguj się i graj dalej"}
          </Text>

          <View style={styles.tabsRow}>
            <TouchableOpacity
              testID="auth-tab-signup"
              onPress={() => setMode("signup")}
              style={[styles.tab, mode === "signup" && styles.tabActive]}
            >
              <Text style={[styles.tabText, mode === "signup" && styles.tabTextActive]}>Rejestracja</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="auth-tab-login"
              onPress={() => setMode("login")}
              style={[styles.tab, mode === "login" && styles.tabActive]}
            >
              <Text style={[styles.tabText, mode === "login" && styles.tabTextActive]}>Logowanie</Text>
            </TouchableOpacity>
          </View>

          {mode === "signup" && (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Nazwa użytkownika</Text>
                <TextInput
                  testID="auth-username-input"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="np. mkowal"
                  placeholderTextColor={colors.textMuted}
                  value={username}
                  onChangeText={setUsername}
                  style={styles.input}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Telefon (opcjonalnie — pomaga znaleźć znajomych)</Text>
                <TextInput
                  testID="auth-phone-input"
                  keyboardType="phone-pad"
                  placeholder="+48 500 000 000"
                  placeholderTextColor={colors.textMuted}
                  value={phone}
                  onChangeText={setPhone}
                  style={styles.input}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Kod polecający (opcjonalnie)</Text>
                <TextInput
                  testID="auth-referral-input"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="np. AB4K9C"
                  placeholderTextColor={colors.textMuted}
                  value={referralCode}
                  onChangeText={(t) => setReferralCode(t.toUpperCase())}
                  style={styles.input}
                />
              </View>
            </>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="auth-email-input"
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

          <View style={styles.field}>
            <Text style={styles.label}>Hasło</Text>
            <TextInput
              testID="auth-password-input"
              secureTextEntry
              placeholder="Min. 6 znaków"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              style={styles.input}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {mode === "login" && (
            <TouchableOpacity
              testID="forgot-password-link"
              onPress={() => router.push("/forgot-password" as any)}
              style={styles.forgotLink}
            >
              <Text style={styles.forgotText}>Zapomniałeś hasła?</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            testID="auth-submit-button"
            disabled={!canSubmit}
            onPress={submit}
            style={[styles.primaryBtn, { opacity: canSubmit ? 1 : 0.5, marginTop: spacing.md }]}
          >
            <Text style={styles.primaryBtnText}>
              {busy ? "Chwila…" : mode === "signup" ? "Załóż konto" : "Zaloguj"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {reward && (
        <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
          <View style={styles.rewardBackdrop} />
          <Animated.View style={[styles.rewardCard, rewardStyle]} testID="signup-reward-animation">
            <Text style={styles.rewardEmoji}>🪙</Text>
            <Text style={styles.rewardTitle}>+1000</Text>
            <Text style={styles.rewardSub}>coinów startowych!</Text>
          </Animated.View>
          <ConfettiOverlay visible={reward} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  slide: { flex: 1, paddingHorizontal: spacing.lg, alignItems: "flex-start", justifyContent: "center" },
  slideEmoji: {
    width: 120, height: 120, borderRadius: 32, alignItems: "center", justifyContent: "center",
    marginBottom: spacing.xl, ...shadow.softer,
  },
  emojiText: { fontSize: 60 },
  slideTitle: { fontSize: 30, fontWeight: "900", color: colors.text, lineHeight: 36 },
  slideBody: { marginTop: spacing.md, fontSize: 16, color: colors.textMuted, lineHeight: 24 },
  dotsRow: { flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: spacing.md },
  dot: { width: 8, height: 8, borderRadius: 4 },
  footer: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radii.pill,
    alignItems: "center",
    ...shadow.softer,
  },
  primaryBtnText: { color: "#FFF", fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  secondaryBtn: { paddingVertical: 12, alignItems: "center" },
  secondaryBtnText: { color: colors.textMuted, fontSize: 14, fontWeight: "700" },
  authTitle: { marginTop: spacing.md, fontSize: 28, fontWeight: "900", color: colors.text },
  authSub: { marginTop: 6, fontSize: 14, color: colors.textMuted },
  backLink: { paddingVertical: 8 },
  backText: { color: colors.textMuted, fontWeight: "700" },
  tabsRow: {
    flexDirection: "row",
    backgroundColor: colors.bgAlt,
    borderRadius: 999,
    padding: 4,
    marginTop: spacing.lg,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 999 },
  tabActive: { backgroundColor: colors.card, ...shadow.softer },
  tabText: { color: colors.textMuted, fontWeight: "700" },
  tabTextActive: { color: colors.text },
  field: { marginTop: spacing.md },
  label: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 6 },
  input: {
    backgroundColor: colors.bgAlt,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    fontSize: 15,
    color: colors.text,
    fontWeight: "600",
  },
  error: { marginTop: 8, color: colors.danger, fontSize: 13, fontWeight: "600" },
  forgotLink: { alignSelf: "flex-end", paddingVertical: 8, marginTop: 4 },
  forgotText: { color: colors.primary, fontWeight: "800", fontSize: 13 },
  rewardBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(45,55,72,0.45)" },
  rewardCard: {
    position: "absolute",
    top: "35%",
    alignSelf: "center",
    backgroundColor: colors.card,
    borderRadius: 32,
    paddingHorizontal: 36,
    paddingVertical: 28,
    alignItems: "center",
    ...shadow.soft,
  },
  rewardEmoji: { fontSize: 72 },
  rewardTitle: { fontSize: 56, fontWeight: "900", color: colors.primary, marginTop: 8 },
  rewardSub: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: 4 },
}));
