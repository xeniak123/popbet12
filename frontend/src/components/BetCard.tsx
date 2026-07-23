// Bet card — question, two large option buttons, animated vote percentage bar,
// stake slider, place-bet CTA. Locks visually once user has voted.
import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { CountdownPill } from "@/src/components/CountdownPill";
import { colors, radii, shadow, spacing, CategoryKey, themedStyles } from "@/src/theme/colors";

export type BetOption = { key: string; label: string; stake_total: number; voters: number };
export type Bet = {
  bet_id: string;
  category: string;
  question: string;
  subtitle?: string | null;
  options: BetOption[];
  closes_at: string;
  resolved: boolean;
  winning_option?: string | null;
  total_pool: number;
  user_choice?: string | null;
  user_stake?: number;
};

function categoryTheme(key: string) {
  const c = colors.categories[key as CategoryKey];
  return c ?? { bg: colors.bgAlt, accent: colors.primary, emoji: "✨" };
}

function categoryLabel(key: string) {
  switch (key) {
    case "sport": return "Sport";
    case "awards": return "Nagrody";
    case "reality_tv": return "Reality TV";
    case "gossip": return "Plotki";
    case "music": return "Muzyka";
    default: return key;
  }
}

type Props = {
  bet: Bet;
  userCoins: number;
  onPlace: (betId: string, option: string, stake: number) => Promise<void>;
};

export function BetCard({ bet, userCoins, onPlace }: Props) {
  const cat = categoryTheme(bet.category);
  const locked = !!bet.user_choice;
  const totalStake = bet.options.reduce((s, o) => s + o.stake_total, 0);
  const pctA = totalStake === 0 ? 50 : Math.round((bet.options[0].stake_total / totalStake) * 100);
  const pctB = 100 - pctA;

  const [selected, setSelected] = useState<string | null>(bet.user_choice ?? null);
  const [stake, setStake] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scaleA = useSharedValue(1);
  const scaleB = useSharedValue(1);

  const styleA = useAnimatedStyle(() => ({ transform: [{ scale: scaleA.value }] }));
  const styleB = useAnimatedStyle(() => ({ transform: [{ scale: scaleB.value }] }));

  const barA = useAnimatedStyle(() => ({
    width: withTiming(`${pctA}%`, { duration: 600 }),
  }));

  const onSelect = (key: string) => {
    if (locked) return;
    setError(null);
    setSelected(key);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const sv = key === "a" ? scaleA : scaleB;
    sv.value = withSpring(0.94, { damping: 8, stiffness: 300 }, () => {
      sv.value = withSpring(1, { damping: 10, stiffness: 200 });
    });
  };

  // Backend przyjmuje do 100 000 — suwak ograniczamy do 10 000, żeby dało się nim celować.
  const maxStake = Math.min(userCoins, 10000);
  const stakeStep = maxStake > 2000 ? 100 : 10;
  const canPlace = !locked && !!selected && stake >= 10 && userCoins >= stake && !submitting;

  const submit = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onPlace(bet.bet_id, selected, stake);
    } catch (e) {
      setError((e as Error).message || "Coś poszło nie tak");
    } finally {
      setSubmitting(false);
    }
  };

  const winKey = bet.winning_option;
  const optionButton = (opt: BetOption, animStyle: any) => {
    const isSelected = selected === opt.key;
    const isUserChoice = bet.user_choice === opt.key;
    const isWinner = bet.resolved && winKey === opt.key;
    const isLoser = bet.resolved && winKey && winKey !== opt.key;

    const baseBg = colors.bgAlt;
    let bg = baseBg;
    let borderColor: string = "transparent";
    if (isWinner) { bg = colors.winSoft; borderColor = colors.win; }
    else if (isLoser) { bg = colors.lossSoft; borderColor = colors.loss; }
    else if (isUserChoice) { bg = colors.primarySoft; borderColor = colors.primary; }
    else if (isSelected) { bg = colors.primarySoft; borderColor = colors.primary; }

    return (
      <Animated.View style={[styles.optionWrap, animStyle]}>
        <TouchableOpacity
          testID={`bet-option-${opt.key}-${bet.bet_id}`}
          activeOpacity={0.85}
          disabled={locked}
          onPress={() => onSelect(opt.key)}
          style={[styles.option, { backgroundColor: bg, borderColor, borderWidth: borderColor === "transparent" ? 0 : 2 }]}
        >
          <Text style={styles.optionLabel} numberOfLines={2}>{opt.label}</Text>
          <Text style={styles.optionMeta}>{totalStake === 0 ? "—" : `${opt.key === "a" ? pctA : pctB}%`}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={styles.card} testID={`bet-card-${bet.bet_id}`}>
      <View style={styles.header}>
        <View style={[styles.categoryChip, { backgroundColor: cat.bg }]}>
          <Text style={styles.categoryText}>{cat.emoji}  {categoryLabel(bet.category)}</Text>
        </View>
        <CountdownPill closesAt={bet.closes_at} testID={`bet-countdown-${bet.bet_id}`} />
      </View>

      {bet.subtitle ? <Text style={styles.subtitle}>{bet.subtitle}</Text> : null}
      <Text style={styles.question}>{bet.question}</Text>

      <View style={styles.optionsRow}>
        {optionButton(bet.options[0], styleA)}
        {optionButton(bet.options[1], styleB)}
      </View>

      <View style={styles.percentBarTrack}>
        <Animated.View style={[styles.percentBarFill, { backgroundColor: colors.primary }, barA]} />
      </View>
      <View style={styles.percentLabels}>
        <Text style={styles.percentTextLeft}>{pctA}%</Text>
        <Text style={styles.percentTextRight}>{pctB}%</Text>
      </View>

      {locked ? (
        <View style={styles.lockedBox} testID={`bet-locked-${bet.bet_id}`}>
          <Text style={styles.lockedTitle}>🔒 Obstawione</Text>
          <Text style={styles.lockedDesc}>
            Wybór: {bet.user_choice === "a" ? bet.options[0].label : bet.options[1].label} • Stawka: {bet.user_stake} coinów
          </Text>
        </View>
      ) : (
        <View style={styles.stakeBox}>
          <View style={styles.stakeHeader}>
            <Text style={styles.stakeLabel}>Twoja stawka</Text>
            <Text style={styles.stakeValue} testID={`bet-stake-value-${bet.bet_id}`}>{stake} coinów</Text>
          </View>
          <Slider
            testID={`bet-stake-slider-${bet.bet_id}`}
            minimumValue={10}
            maximumValue={Math.max(20, maxStake)}
            step={stakeStep}
            value={stake}
            onValueChange={(v) => setStake(Math.round(v))}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.primarySoft}
            thumbTintColor={colors.primary}
          />
          <View style={styles.presetRow}>
            {[100, 500, 1000, 5000].filter((v) => v <= maxStake).map((v) => (
              <TouchableOpacity
                key={v}
                testID={`bet-stake-preset-${bet.bet_id}-${v}`}
                onPress={() => setStake(v)}
                style={[styles.preset, stake === v && styles.presetActive]}
              >
                <Text style={[styles.presetText, stake === v && styles.presetTextActive]}>{v}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              testID={`bet-stake-preset-${bet.bet_id}-max`}
              onPress={() => setStake(maxStake)}
              style={[styles.preset, stake === maxStake && styles.presetActive]}
            >
              <Text style={[styles.presetText, stake === maxStake && styles.presetTextActive]}>max</Text>
            </TouchableOpacity>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity
            testID={`bet-place-button-${bet.bet_id}`}
            style={[styles.cta, { backgroundColor: canPlace ? colors.primary : "#E9E4DC" }]}
            disabled={!canPlace}
            onPress={submit}
          >
            <Text style={[styles.ctaText, { color: canPlace ? "#FFF" : colors.textMuted }]}>
              {submitting ? "Wysyłam…" : selected ? "Obstaw" : "Wybierz opcję"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...shadow.soft,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  categoryText: { fontSize: 12, fontWeight: "700", color: colors.text },
  subtitle: { marginTop: spacing.md, color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  question: {
    marginTop: 6,
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 26,
  },
  optionsRow: { flexDirection: "row", marginTop: spacing.md, gap: spacing.sm },
  optionWrap: { flex: 1 },
  option: {
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 14,
    minHeight: 88,
    justifyContent: "space-between",
  },
  optionLabel: { fontSize: 15, fontWeight: "800", color: colors.text },
  optionMeta: { marginTop: 8, fontSize: 12, fontWeight: "700", color: colors.textMuted },
  percentBarTrack: {
    height: 10,
    backgroundColor: colors.bgAlt,
    borderRadius: 999,
    marginTop: spacing.md,
    overflow: "hidden",
  },
  percentBarFill: { height: "100%", borderRadius: 999 },
  percentLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  percentTextLeft: { fontSize: 12, fontWeight: "700", color: colors.primary },
  percentTextRight: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  stakeBox: { marginTop: spacing.md },
  stakeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stakeLabel: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },
  stakeValue: { fontSize: 15, color: colors.text, fontWeight: "800" },
  presetRow: { flexDirection: "row", gap: 6, marginTop: 4 },
  preset: {
    flex: 1, paddingVertical: 7, borderRadius: radii.pill, backgroundColor: colors.bgAlt,
    alignItems: "center", borderWidth: 1.5, borderColor: "transparent",
  },
  presetActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  presetText: { fontSize: 12, fontWeight: "800", color: colors.textMuted },
  presetTextActive: { color: colors.primary },
  cta: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: "center",
  },
  ctaText: { fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },
  error: { color: colors.danger, fontSize: 12, marginTop: 4 },
  lockedBox: {
    marginTop: spacing.md,
    backgroundColor: colors.bgAlt,
    padding: 14,
    borderRadius: 16,
  },
  lockedTitle: { fontSize: 14, fontWeight: "800", color: colors.text },
  lockedDesc: { marginTop: 4, fontSize: 13, color: colors.textMuted, fontWeight: "600" },
}));
