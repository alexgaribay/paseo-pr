import type { PluginTheme } from "@getpaseo/plugin";
import { useState } from "react";
import { Image, Text, View } from "react-native";
import { githubAvatarUrl } from "../shared/github-avatar";

export function UserAvatar(props: {
  theme: PluginTheme;
  host: string;
  login: string;
  size?: number;
}) {
  const size = props.size ?? 20;
  const url = githubAvatarUrl(props.host, props.login);
  const [failed, setFailed] = useState(false);
  const initial = props.login.trim().slice(0, 1).toUpperCase() || "?";

  if (!url || failed) {
    return (
      <View
        accessibilityLabel={`${props.login} avatar`}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: props.theme.colors.surface2,
          borderWidth: 1,
          borderColor: props.theme.colors.border,
        }}
      >
        <Text style={{ color: props.theme.colors.foregroundMuted, fontSize: Math.max(10, size * 0.45), fontWeight: "500" }}>
          {initial}
        </Text>
      </View>
    );
  }

  return (
    <Image
      accessibilityLabel={`${props.login} avatar`}
      source={{ uri: url }}
      onError={() => setFailed(true)}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: props.theme.colors.surface2,
        borderWidth: 1,
        borderColor: props.theme.colors.border,
      }}
    />
  );
}
