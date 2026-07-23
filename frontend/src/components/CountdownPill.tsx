// Animated countdown pill (pulses when < 1 hour left).
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";

import { colors, themedStyles } from "@/src/theme/colors";
import { formatCountdown } from "@/src/utils/time";

export function CountdownPill({ closesAt, testID }: { closesAt: string; testID?: string }) {
  const [now, setNow] = useState(() => Date.now());
  const scale = useSharedValue(1);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { text, expired, hoursLeft } = formatCountdown(closesAt, now);
  const urgent = !expired && hoursLeft < 1;

  useEffect(() => {
    if (urgent) {
      scale.value = withRepeat(withTiming(1.08, { duration: 700 }), -1, true);
    } else {
      cancelAnimation(scale);
      scale.value = withTiming(1, { duration: 200 });
    }
    return () => cancelAnimation(scale);
  }, [urgent, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const bg = expired ? "#EEEEEE" : urgent ? colors.primarySoft : colors.bgAlt;
  const color = expired ? colors.textMuted : urgent ? colors.primary : colors.text;

  return (
    <Animated.View style={[styles.pill, { backgroundColor: bg }, style]} testID={testID}>
      <Text style={[styles.text, { color }]}>⏱ {text}</Text>
    </Animated.View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  text: { fontSize: 13, fontWeight: "700" },
}));
