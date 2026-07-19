import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/context/AuthContext";
import { colors } from "@/src/theme/colors";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { user, loading } = useAuth();

  // Guard: if the user logs out from any screen inside the tabs, bounce them
  // back to onboarding immediately — no reload required.
  if (!loading && !user) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "800", marginBottom: 4 },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 64 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom,
        },
        tabBarItemStyle: { paddingVertical: 4 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Rynki",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "flame" : "flame-outline"} color={color} testID="tab-icon-markets" />
          ),
        }}
      />
      <Tabs.Screen
        name="my-bets"
        options={{
          title: "Moje",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "receipt" : "receipt-outline"} color={color} testID="tab-icon-my-bets" />
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "Ranking",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "trophy" : "trophy-outline"} color={color} testID="tab-icon-leaderboard" />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "person" : "person-outline"} color={color} testID="tab-icon-profile" />
          ),
        }}
      />
    </Tabs>
  );
}

function TabIcon({ name, color, testID }: { name: any; color: string; testID: string }) {
  return (
    <View testID={testID}>
      <Ionicons name={name} size={22} color={color} />
    </View>
  );
}
