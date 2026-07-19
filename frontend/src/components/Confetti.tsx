// Lightweight confetti overlay — no extra deps, uses Reanimated.
import React, { useEffect } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
} from "react-native-reanimated";

const COLORS = ["#FF8A65", "#7FD8BE", "#F4A6A6", "#FFD180", "#B39DDB", "#81D4FA"];
const PIECE_COUNT = 40;

type Piece = { id: number; color: string; x: number; delay: number; rotate: number };

function useConfettiPieces(width: number): Piece[] {
  return React.useMemo(
    () =>
      Array.from({ length: PIECE_COUNT }, (_, i) => ({
        id: i,
        color: COLORS[i % COLORS.length],
        x: Math.random() * width,
        delay: Math.random() * 250,
        rotate: (Math.random() - 0.5) * 720,
      })),
    [width],
  );
}

function Piece({ piece, height, onEnd }: { piece: Piece; height: number; onEnd?: () => void }) {
  const y = useSharedValue(-40);
  const rot = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    y.value = withDelay(
      piece.delay,
      withTiming(height + 40, { duration: 2200, easing: Easing.out(Easing.quad) }, (finished) => {
        if (finished && onEnd) runOnJS(onEnd)();
      }),
    );
    rot.value = withDelay(piece.delay, withTiming(piece.rotate, { duration: 2200 }));
    opacity.value = withDelay(1800, withTiming(0, { duration: 500 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { rotate: `${rot.value}deg` }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.piece,
        { left: piece.x, backgroundColor: piece.color, pointerEvents: "none" },
        style,
      ]}
    />
  );
}

export default function ConfettiOverlay({ visible, onDone }: { visible: boolean; onDone?: () => void }) {
  const { width, height } = useWindowDimensions();
  const pieces = useConfettiPieces(width);
  const [nonce, setNonce] = React.useState(0);

  useEffect(() => {
    if (visible) setNonce((n) => n + 1);
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
      {pieces.map((p) => (
        <Piece key={`${nonce}-${p.id}`} piece={p} height={height} onEnd={p.id === 0 ? onDone : undefined} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: {
    position: "absolute",
    top: 0,
    width: 10,
    height: 14,
    borderRadius: 2,
  },
});
