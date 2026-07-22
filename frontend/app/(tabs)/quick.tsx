// Szybkie zakłady — gra w kartę. 3 rozdania dziennie.
// Obstawiasz kolor (×1.5), opcjonalnie znak (×3) i numer (×10) — hierarchicznie.
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";
import { colors, radii, shadow, spacing } from "@/src/theme/colors";

const SUITS = [
  { key: "hearts", symbol: "♥", label: "Kier", color: "red" },
  { key: "diamonds", symbol: "♦", label: "Karo", color: "red" },
  { key: "clubs", symbol: "♣", label: "Trefl", color: "black" },
  { key: "spades", symbol: "♠", label: "Pik", color: "black" },
] as const;
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const STAKES = [10, 50, 100, 250];

const SUIT_SYMBOL: Record<string, string> = {
  hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠",
};
const RED = "#E4572E";
const BLACK = "#2D3748";

type Leg = { type: string; guess: string; stake: number; win: boolean; payout: number };
type PlayResult = {
  card: { suit: string; color: string; rank: string; label: string };
  legs: Leg[];
  total_stake: number;
  total_payout: number;
  net: number;
  coins: number;
  plays_left: number;
};
type Status = { plays_left: number; max_per_day: number; min_stake: number };

export default function QuickScreen() {
  const { user, refresh } = useAuth();
  const toast = useToast();

  const [status, setStatus] = useState<Status | null>(null);
  const [colorGuess, setColorGuess] = useState<"red" | "black" | null>(null);
  const [colorStake, setColorStake] = useState(50);
  const [suitOn, setSuitOn] = useState(false);
  const [suitGuess, setSuitGuess] = useState<string | null>(null);
  const [suitStake, setSuitStake] = useState(50);
  const [rankOn, setRankOn] = useState(false);
  const [rankGuess, setRankGuess] = useState<string | null>(null);
  const [rankStake, setRankStake] = useState(50);

  const [result, setResult] = useState<PlayResult | null>(null);
  const [busy, setBusy] = useState(false);

  const flip = useRef(new Animated.Value(0)).current; // 0 = tył, 1 = odkryta

  const loadStatus = useCallback(async () => {
    try {
      const s = await api.get<Status>("/api/quick/status");
      setStatus(s);
    } catch { /* cicho */ }
  }, []);

  useFocusEffect(useCallback(() => { loadStatus(); refresh(); }, [loadStatus, refresh]));

  const totalStake =
    colorStake + (suitOn ? suitStake : 0) + (rankOn ? rankStake : 0);
  const coins = user?.coins ?? 0;

  const resetForNext = () => {
    setResult(null);
    flip.setValue(0);
  };

  // Wybór barwy: kolor (kier/karo/trefl/pik) musi się mieścić w barwie,
  // więc przy zmianie barwy czyścimy niepasujący kolor i wartość.
  const pickColor = (c: "red" | "black") => {
    if (c === colorGuess) return;
    setColorGuess(c);
    const suitColor = SUITS.find((s) => s.key === suitGuess)?.color;
    if (suitGuess && suitColor !== c) {
      setSuitGuess(null);
      setRankGuess(null);
    }
  };

  const play = async () => {
    if (!colorGuess) return toast.error("Wybierz barwę (czerwona/czarna)");
    if (suitOn && !suitGuess) return toast.error("Wybierz kolor (kier/karo/trefl/pik)");
    if (rankOn && !rankGuess) return toast.error("Wybierz wartość karty");
    if (totalStake > coins) return toast.error("Za mało monet na tę stawkę");

    const body: Record<string, unknown> = { color: colorGuess, color_stake: colorStake };
    if (suitOn) { body.suit = suitGuess; body.suit_stake = suitStake; }
    if (rankOn && suitOn) { body.rank = rankGuess; body.rank_stake = rankStake; }

    setBusy(true);
    try {
      const res = await api.post<PlayResult>("/api/quick/play", body);
      setResult(res);
      setStatus((s) => (s ? { ...s, plays_left: res.plays_left } : s));
      // animacja odkrycia karty
      flip.setValue(0);
      Animated.timing(flip, { toValue: 1, duration: 650, useNativeDriver: true }).start();
      Haptics.notificationAsync(
        res.net >= 0
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      ).catch(() => {});
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Nie udało się zagrać");
    } finally {
      setBusy(false);
    }
  };

  const frontRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });
  const backRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const frontOpacity = flip.interpolate({ inputRange: [0, 0.5, 0.5, 1], outputRange: [0, 0, 1, 1] });
  const backOpacity = flip.interpolate({ inputRange: [0, 0.5, 0.5, 1], outputRange: [1, 1, 0, 0] });

  const playsLeft = status?.plays_left ?? 0;
  const noPlays = playsLeft <= 0 && !result;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>⚡ Szybki zakład</Text>
          <Text style={styles.sub}>
            {result ? "Wynik rozdania" : `Zostało dziś: ${playsLeft}/${status?.max_per_day ?? 3}`}
          </Text>
        </View>
        <View style={styles.coinPill}>
          <Text style={styles.coinEmoji}>🪙</Text>
          <Text style={styles.coinText}>{coins}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 48 }}>
        {/* KARTA */}
        <View style={styles.cardStage}>
          <Animated.View
            style={[styles.card, styles.cardBack, { opacity: backOpacity, transform: [{ rotateY: backRotate }] }]}
          >
            <Text style={styles.cardBackMark}>?</Text>
            <Text style={styles.cardBackBrand}>PopBet</Text>
          </Animated.View>
          <Animated.View
            style={[
              styles.card, styles.cardFront,
              { opacity: frontOpacity, transform: [{ rotateY: frontRotate }] },
            ]}
          >
            {result && (
              <>
                <Text style={[styles.cardCorner, { color: result.card.color === "red" ? RED : BLACK }]}>
                  {result.card.rank}
                </Text>
                <Text style={[styles.cardBig, { color: result.card.color === "red" ? RED : BLACK }]}>
                  {SUIT_SYMBOL[result.card.suit]}
                </Text>
              </>
            )}
          </Animated.View>
        </View>

        {result ? (
          <ResultPanel result={result} onAgain={resetForNext} playsLeft={playsLeft} />
        ) : (
          <>
            {/* BARWA */}
            <Section title="1 · Barwa" hint="×1.5">
              <View style={styles.row}>
                <Choice
                  active={colorGuess === "red"}
                  onPress={() => pickColor("red")}
                  label="Czerwona"
                  bg="#FBE7E1"
                  border={RED}
                  emoji="🔴"
                />
                <Choice
                  active={colorGuess === "black"}
                  onPress={() => pickColor("black")}
                  label="Czarna"
                  bg="#E7EAF0"
                  border={BLACK}
                  emoji="⚫"
                />
              </View>
              <StakeRow value={colorStake} onChange={setColorStake} max={coins} />
            </Section>

            {/* KOLOR (kier/karo/trefl/pik) */}
            <Section
              title="2 · Kolor"
              hint="×3"
              toggle={{ on: suitOn, onToggle: () => setSuitOn((v) => !v), disabled: !colorGuess }}
              locked={!colorGuess ? "Najpierw wybierz barwę" : undefined}
            >
              {suitOn && colorGuess && (
                <>
                  <View style={styles.suitRow}>
                    {SUITS.filter((s) => s.color === colorGuess).map((s) => (
                      <Pressable
                        key={s.key}
                        onPress={() => setSuitGuess(s.key)}
                        style={[styles.suitBtn, suitGuess === s.key && styles.suitBtnActive]}
                      >
                        <Text style={[styles.suitSym, { color: s.color === "red" ? RED : BLACK }]}>
                          {s.symbol}
                        </Text>
                        <Text style={styles.suitLbl}>{s.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <StakeRow value={suitStake} onChange={setSuitStake} max={coins} />
                </>
              )}
            </Section>

            {/* WARTOŚĆ */}
            <Section
              title="3 · Wartość"
              hint="×10"
              toggle={{ on: rankOn, onToggle: () => setRankOn((v) => !v), disabled: !suitOn || !suitGuess }}
              locked={!suitOn || !suitGuess ? "Najpierw wybierz kolor" : undefined}
            >
              {rankOn && suitOn && (
                <>
                  <View style={styles.rankWrap}>
                    {RANKS.map((r) => (
                      <Pressable
                        key={r}
                        onPress={() => setRankGuess(r)}
                        style={[styles.rankBtn, rankGuess === r && styles.rankBtnActive]}
                      >
                        <Text style={[styles.rankTxt, rankGuess === r && styles.rankTxtActive]}>{r}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <StakeRow value={rankStake} onChange={setRankStake} max={coins} />
                </>
              )}
            </Section>

            <View style={styles.summary}>
              <Text style={styles.summaryTxt}>Łączna stawka</Text>
              <Text style={styles.summaryVal}>{totalStake} 🪙</Text>
            </View>

            <Pressable
              onPress={play}
              disabled={busy || noPlays || totalStake > coins || !colorGuess}
              style={[
                styles.playBtn,
                (busy || noPlays || totalStake > coins || !colorGuess) && styles.playBtnOff,
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : noPlays ? (
                <Text style={styles.playTxt}>Na dziś koniec — wróć jutro 🌙</Text>
              ) : (
                <Text style={styles.playTxt}>Obstaw i odkryj kartę 🃏</Text>
              )}
            </Pressable>

            <Text style={styles.disclaimer}>
              Barwa: 1/2 szansy · Kolor: 1/4 · Wartość: 1/13. Kolor musi pasować do barwy,
              a wartość dodasz tylko razem z kolorem. Każdą część rozliczamy osobno.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ResultPanel({ result, onAgain, playsLeft }: { result: PlayResult; onAgain: () => void; playsLeft: number }) {
  const win = result.net >= 0;
  return (
    <View>
      <View style={[styles.netBanner, { backgroundColor: win ? colors.winSoft : colors.lossSoft, borderColor: win ? colors.win : colors.loss }]}>
        <Text style={styles.netTitle}>{win ? "🎉 Wygrałeś!" : "😔 Tym razem nie"}</Text>
        <Text style={[styles.netVal, { color: win ? "#2f9e77" : "#c0504a" }]}>
          {result.net >= 0 ? "+" : ""}{result.net} 🪙
        </Text>
      </View>
      {result.legs.map((leg) => (
        <View key={leg.type} style={styles.legRow}>
          <Ionicons
            name={leg.win ? "checkmark-circle" : "close-circle"}
            size={22}
            color={leg.win ? colors.win : colors.loss}
          />
          <Text style={styles.legLabel}>
            {leg.type === "color" ? "Barwa" : leg.type === "suit" ? "Kolor" : "Wartość"}
            {"  "}
            <Text style={styles.legGuess}>
              ({leg.type === "color" ? (leg.guess === "red" ? "czerwona" : "czarna")
                : leg.type === "suit" ? SUIT_SYMBOL[leg.guess]
                : leg.guess})
            </Text>
          </Text>
          <Text style={[styles.legPay, { color: leg.win ? "#2f9e77" : colors.textMuted }]}>
            {leg.win ? `+${leg.payout - leg.stake}` : `-${leg.stake}`}
          </Text>
        </View>
      ))}
      <Pressable
        onPress={onAgain}
        disabled={playsLeft <= 0}
        style={[styles.playBtn, { marginTop: spacing.md }, playsLeft <= 0 && styles.playBtnOff]}
      >
        <Text style={styles.playTxt}>
          {playsLeft > 0 ? `Zagraj ponownie (${playsLeft} left)` : "Na dziś koniec 🌙"}
        </Text>
      </Pressable>
    </View>
  );
}

function Section({
  title, hint, children, toggle, locked,
}: {
  title: string;
  hint: string;
  children?: React.ReactNode;
  toggle?: { on: boolean; onToggle: () => void; disabled: boolean };
  locked?: string;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionHint}>{hint}</Text>
        <View style={{ flex: 1 }} />
        {toggle && (
          <Pressable
            onPress={toggle.disabled ? undefined : toggle.onToggle}
            style={[styles.toggle, toggle.on && styles.toggleOn, toggle.disabled && styles.toggleDisabled]}
          >
            <Text style={[styles.toggleTxt, toggle.on && styles.toggleTxtOn]}>
              {toggle.on ? "✓ dodane" : "+ dodaj"}
            </Text>
          </Pressable>
        )}
      </View>
      {locked && <Text style={styles.locked}>{locked}</Text>}
      {children}
    </View>
  );
}

function Choice({
  active, onPress, label, bg, border, emoji,
}: {
  active: boolean; onPress: () => void; label: string; bg: string; border: string; emoji: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.choice, { backgroundColor: bg }, active && { borderColor: border, borderWidth: 3 }]}
    >
      <Text style={styles.choiceEmoji}>{emoji}</Text>
      <Text style={styles.choiceLabel}>{label}</Text>
    </Pressable>
  );
}

function StakeRow({ value, onChange, max }: { value: number; onChange: (v: number) => void; max: number }) {
  return (
    <View style={styles.stakeRow}>
      {STAKES.map((s) => (
        <Pressable
          key={s}
          onPress={() => onChange(s)}
          disabled={s > max}
          style={[styles.stakeChip, value === s && styles.stakeChipActive, s > max && styles.stakeChipOff]}
        >
          <Text style={[styles.stakeTxt, value === s && styles.stakeTxtActive]}>{s}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  title: { fontSize: 22, fontWeight: "900", color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 2, fontWeight: "600" },
  coinPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: radii.pill, ...shadow.softer,
  },
  coinEmoji: { fontSize: 16 },
  coinText: { fontSize: 16, fontWeight: "900", color: colors.text },

  cardStage: { alignItems: "center", justifyContent: "center", height: 220, marginBottom: spacing.md },
  card: {
    position: "absolute", width: 150, height: 210, borderRadius: 18,
    alignItems: "center", justifyContent: "center", backfaceVisibility: "hidden", ...shadow.soft,
  },
  cardBack: { backgroundColor: colors.primary },
  cardBackMark: { fontSize: 72, fontWeight: "900", color: "#fff", opacity: 0.9 },
  cardBackBrand: { position: "absolute", bottom: 14, color: "#fff", fontWeight: "800", opacity: 0.85 },
  cardFront: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border },
  cardCorner: { position: "absolute", top: 12, left: 14, fontSize: 26, fontWeight: "900" },
  cardBig: { fontSize: 96, fontWeight: "900" },

  section: {
    backgroundColor: colors.card, borderRadius: radii.card, padding: spacing.md,
    marginBottom: spacing.md, ...shadow.softer,
  },
  sectionHead: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: colors.text },
  sectionHint: { marginLeft: 8, fontSize: 13, fontWeight: "800", color: colors.primary },
  locked: { fontSize: 13, color: colors.textMuted, fontStyle: "italic", marginBottom: 4 },
  toggle: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill,
    backgroundColor: colors.bgAlt, borderWidth: 1, borderColor: colors.border,
  },
  toggleOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  toggleDisabled: { opacity: 0.4 },
  toggleTxt: { fontSize: 13, fontWeight: "800", color: colors.textMuted },
  toggleTxtOn: { color: colors.primary },

  row: { flexDirection: "row", gap: spacing.sm },
  choice: {
    flex: 1, borderRadius: radii.button, paddingVertical: 16, alignItems: "center",
    borderWidth: 3, borderColor: "transparent",
  },
  choiceEmoji: { fontSize: 26 },
  choiceLabel: { fontSize: 15, fontWeight: "800", color: colors.text, marginTop: 4 },

  suitRow: { flexDirection: "row", gap: spacing.sm },
  suitBtn: {
    flex: 1, backgroundColor: colors.bgAlt, borderRadius: radii.button, paddingVertical: 12,
    alignItems: "center", borderWidth: 3, borderColor: "transparent",
  },
  suitBtnActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  suitSym: { fontSize: 26, fontWeight: "900" },
  suitLbl: { fontSize: 12, fontWeight: "700", color: colors.text, marginTop: 2 },

  rankWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  rankBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: colors.bgAlt,
    alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent",
  },
  rankBtnActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  rankTxt: { fontSize: 16, fontWeight: "800", color: colors.text },
  rankTxtActive: { color: colors.primary },

  stakeRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  stakeChip: {
    flex: 1, backgroundColor: colors.bgAlt, borderRadius: radii.pill, paddingVertical: 10,
    alignItems: "center", borderWidth: 2, borderColor: "transparent",
  },
  stakeChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  stakeChipOff: { opacity: 0.35 },
  stakeTxt: { fontSize: 14, fontWeight: "800", color: colors.textMuted },
  stakeTxtActive: { color: colors.primary },

  summary: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.sm, marginBottom: spacing.sm,
  },
  summaryTxt: { fontSize: 15, fontWeight: "700", color: colors.textMuted },
  summaryVal: { fontSize: 18, fontWeight: "900", color: colors.text },

  playBtn: {
    backgroundColor: colors.primary, borderRadius: radii.button, paddingVertical: 16,
    alignItems: "center", ...shadow.soft,
  },
  playBtnOff: { backgroundColor: colors.textMuted, opacity: 0.6 },
  playTxt: { color: "#fff", fontSize: 16, fontWeight: "900" },
  disclaimer: { fontSize: 12, color: colors.textMuted, textAlign: "center", marginTop: spacing.md, lineHeight: 17 },

  netBanner: {
    borderRadius: radii.card, borderWidth: 2, padding: spacing.md, alignItems: "center",
    marginBottom: spacing.md,
  },
  netTitle: { fontSize: 18, fontWeight: "900", color: colors.text },
  netVal: { fontSize: 30, fontWeight: "900", marginTop: 4 },
  legRow: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  legLabel: { fontSize: 15, fontWeight: "800", color: colors.text, flex: 1 },
  legGuess: { fontWeight: "600", color: colors.textMuted },
  legPay: { fontSize: 15, fontWeight: "900" },
});
