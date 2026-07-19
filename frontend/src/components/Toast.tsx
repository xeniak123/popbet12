// Toast provider — global success / error banners at the top of the screen.
import { Ionicons } from "@expo/vector-icons";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radii, shadow, spacing } from "@/src/theme/colors";

type ToastType = "success" | "error" | "info";
type ToastItem = { id: number; type: ToastType; message: string };

type ToastState = {
  show: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastState | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const seq = useRef(0);
  const insets = useSafeAreaInsets();

  const translateY = useSharedValue(-80);
  const opacity = useSharedValue(0);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const hide = useCallback(() => {
    translateY.value = withTiming(-80, { duration: 220 });
    opacity.value = withTiming(0, { duration: 220 });
    setTimeout(() => setToast(null), 260);
  }, [translateY, opacity]);

  const show = useCallback(
    (message: string, type: ToastType = "info") => {
      seq.current += 1;
      setToast({ id: seq.current, type, message });
      translateY.value = withSpring(insets.top + 8, { damping: 14, stiffness: 180 });
      opacity.value = withTiming(1, { duration: 200 });
    },
    [insets.top, opacity, translateY],
  );

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(hide, 3200);
    return () => clearTimeout(id);
  }, [toast, hide]);

  const value = useMemo<ToastState>(
    () => ({
      show,
      success: (m) => show(m, "success"),
      error: (m) => show(m, "error"),
      info: (m) => show(m, "info"),
    }),
    [show],
  );

  const bg =
    toast?.type === "success" ? colors.winSoft
    : toast?.type === "error" ? colors.lossSoft
    : colors.primarySoft;
  const border =
    toast?.type === "success" ? colors.win
    : toast?.type === "error" ? colors.loss
    : colors.primary;
  const icon =
    toast?.type === "success" ? "checkmark-circle"
    : toast?.type === "error" ? "close-circle"
    : "information-circle";
  const iconColor =
    toast?.type === "success" ? "#2E856E"
    : toast?.type === "error" ? "#8E3A3A"
    : colors.primary;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.wrap,
            { top: 0, left: spacing.md, right: spacing.md },
            style,
            Platform.OS === "web" ? { position: "fixed" as any } : null,
          ]}
          testID={`toast-${toast.type}`}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={hide}
            style={[styles.card, { backgroundColor: bg, borderColor: border }]}
          >
            <Ionicons name={icon as any} size={20} color={iconColor} />
            <Text style={styles.text} numberOfLines={3}>{toast.message}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside <ToastProvider>");
  return ctx;
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", zIndex: 1000 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.card,
    borderWidth: 1,
    ...shadow.soft,
  },
  text: { flex: 1, fontSize: 13, fontWeight: "800", color: colors.text },
});
