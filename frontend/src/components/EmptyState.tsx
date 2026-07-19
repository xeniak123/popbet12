// Empty state — friendly illustration + copy + optional CTA.
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { colors, radii, shadow, spacing } from "@/src/theme/colors";

type Props = {
  emoji: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
  testID?: string;
};

export function EmptyState({ emoji, title, subtitle, ctaLabel, onCtaPress, testID }: Props) {
  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.emojiBox}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {ctaLabel && onCtaPress ? (
        <TouchableOpacity onPress={onCtaPress} style={styles.cta} testID={testID ? `${testID}-cta` : undefined}>
          <Ionicons name="sparkles" size={16} color="#FFF" />
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing.xl },
  emojiBox: {
    width: 96, height: 96, borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: "center", justifyContent: "center",
    marginBottom: spacing.md, ...shadow.softer,
  },
  emoji: { fontSize: 48 },
  title: { fontSize: 18, fontWeight: "900", color: colors.text, textAlign: "center" },
  subtitle: {
    marginTop: 8, fontSize: 13, color: colors.textMuted, fontWeight: "600",
    textAlign: "center", maxWidth: 300, lineHeight: 20,
  },
  cta: {
    marginTop: spacing.lg, flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.primary, paddingHorizontal: 22, paddingVertical: 12,
    borderRadius: radii.pill, ...shadow.softer,
  },
  ctaText: { color: "#FFF", fontWeight: "900", fontSize: 14 },
});
