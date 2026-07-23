// Edit profile — change username, phone, avatar (base64 from gallery).
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Image, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { useAuth, type User } from "@/src/context/AuthContext";
import { colors, shadow, spacing, themedStyles } from "@/src/theme/colors";

import { useTheme } from "@/src/theme/ThemeContext";
export default function EditProfileScreen() {
  useTheme(); // subskrypcja motywu — wymusza re-render po przelaczeniu

  const router = useRouter();
  const toast = useToast();
  const { user, refresh } = useAuth();
  const [username, setUsername] = useState(user?.username ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [avatar, setAvatar] = useState<string | null>(user?.avatar ?? null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pickImage = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    let canAskAgain = perm.canAskAgain;
    if (status !== "granted") {
      const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
      status = req.status;
      canAskAgain = req.canAskAgain;
    }
    if (status !== "granted") {
      if (!canAskAgain) {
        toast.error("Dostęp do galerii zablokowany. Otwórz Ustawienia, żeby go włączyć.");
        Linking.openSettings().catch(() => {});
      } else {
        toast.info("Zdjęcie profilowe wymaga dostępu do galerii.");
      }
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      toast.error("Nie udało się wczytać zdjęcia.");
      return;
    }
    const mime = asset.mimeType || "image/jpeg";
    const dataUri = `data:${mime};base64,${asset.base64}`;
    setAvatar(dataUri);
    setAvatarBase64(dataUri);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {};
      if (username && username !== user?.username) body.username = username;
      if (phone !== (user?.phone ?? "")) body.phone = phone;
      if (avatarBase64) body.avatar_base64 = avatarBase64;
      if (Object.keys(body).length === 0) {
        toast.info("Brak zmian do zapisania.");
        return;
      }
      await api.patch<User>("/api/profile", body);
      await refresh();
      toast.success("Profil zaktualizowany ✅");
      router.back();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity testID="edit-back" onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.title}>Edytuj profil</Text>
            <View style={{ width: 32 }} />
          </View>

          <TouchableOpacity testID="edit-avatar-picker" onPress={pickImage} style={styles.avatarWrap}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={{ fontSize: 32, fontWeight: "900", color: colors.primary }}>
                  {(user?.username ?? "?").slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.editBadge}>
              <Ionicons name="camera" size={14} color="#FFF" />
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarHint}>Dotknij, żeby zmienić zdjęcie</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Nazwa użytkownika</Text>
            <TextInput
              testID="edit-username-input"
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
              placeholder="np. mkowal"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Telefon (opcjonalnie)</Text>
            <TextInput
              testID="edit-phone-input"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              placeholder="+48 500 000 000"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>

          <TouchableOpacity
            testID="edit-submit"
            disabled={busy}
            onPress={submit}
            style={[styles.primaryBtn, { opacity: busy ? 0.6 : 1 }]}
          >
            <Text style={styles.primaryBtnText}>{busy ? "Zapisuję…" : "Zapisz zmiany"}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  backBtn: { padding: 6, borderRadius: 999, backgroundColor: colors.bgAlt },
  title: { fontSize: 20, fontWeight: "900", color: colors.text },
  avatarWrap: { alignSelf: "center", marginTop: spacing.md },
  avatar: { width: 120, height: 120, borderRadius: 60 },
  avatarFallback: { backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  editBadge: {
    position: "absolute", bottom: 4, right: 4,
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center", ...shadow.softer,
  },
  avatarHint: { alignSelf: "center", marginTop: 8, color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  field: { marginTop: spacing.md },
  label: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 6 },
  input: {
    backgroundColor: colors.bgAlt, borderRadius: 16, paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 14 : 10, fontSize: 15, color: colors.text, fontWeight: "600",
  },
  primaryBtn: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 999, alignItems: "center", marginTop: spacing.lg, ...shadow.softer },
  primaryBtnText: { color: "#FFF", fontWeight: "900", fontSize: 15 },
}));
