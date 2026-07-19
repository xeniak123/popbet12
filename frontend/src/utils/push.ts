// Register a native push token with the backend. Silent on web / Expo Go limitations.
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { api } from "@/src/api/client";

export async function registerPush(): Promise<void> {
  if (Platform.OS === "web") return;
  if (!Device.isDevice) return;

  try {
    const settings = await Notifications.getPermissionsAsync();
    let status = settings.status;
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") return;

    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await api.post("/api/register-push", {
      platform: Platform.OS,
      device_token: tokenResp.data,
    });
  } catch (e) {
    // Push isn't available in Expo Go/simulator — never crash the app.
    console.log("[push] registration skipped:", (e as Error).message);
  }
}
