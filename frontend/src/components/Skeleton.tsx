// Skeleton loader with a shimmer animation.
import React, { useEffect } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

import { colors, themedStyles } from "@/src/theme/colors";

export function Skeleton({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.base, style as any, animatedStyle]} />;
}

export function BetCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Skeleton style={{ width: 90, height: 20 }} />
        <Skeleton style={{ width: 70, height: 20 }} />
      </View>
      <Skeleton style={{ width: "100%", height: 22, marginTop: 16 }} />
      <Skeleton style={{ width: "80%", height: 22, marginTop: 6 }} />
      <View style={[styles.row, { marginTop: 16, gap: 8 }]}>
        <Skeleton style={{ flex: 1, height: 80 }} />
        <Skeleton style={{ flex: 1, height: 80 }} />
      </View>
      <Skeleton style={{ width: "100%", height: 10, marginTop: 14 }} />
      <Skeleton style={{ width: "100%", height: 44, marginTop: 12 }} />
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  base: { backgroundColor: colors.bgAlt, borderRadius: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 24,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
}));
