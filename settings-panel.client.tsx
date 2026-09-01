import { useRpc, type PluginTheme } from "@getpaseo/plugin";
import { useToast } from "@getpaseo/plugin/react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import {
  DEFAULT_REFRESH_INTERVAL_MINUTES,
  REFRESH_INTERVAL_MINUTES,
  prSettingsGet,
  prSettingsSet,
  refreshIntervalLabel,
  type RefreshIntervalMinutes,
} from "./settings.shared";

export function SettingsPanel(props: {
  theme: PluginTheme;
  compact: boolean;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const fetchSettings = useRpc(prSettingsGet);
  const saveSettings = useRpc(prSettingsSet);
  const [ghPath, setGhPath] = useState("");
  const [refreshIntervalMinutes, setRefreshIntervalMinutes] = useState<RefreshIntervalMinutes>(
    DEFAULT_REFRESH_INTERVAL_MINUTES,
  );

  const settingsQuery = useQuery({
    queryKey: ["pr.settings"],
    queryFn: () => fetchSettings({}),
  });

  useEffect(() => {
    if (settingsQuery.data?.kind === "ok" || settingsQuery.data?.kind === "error") {
      setGhPath(settingsQuery.data.ghPath);
      setRefreshIntervalMinutes(settingsQuery.data.refreshIntervalMinutes);
    }
  }, [settingsQuery.data]);

  const styles = useMemo(() => panelStyles(props.theme, props.compact), [props.compact, props.theme]);

  const save = useMutation({
    mutationFn: async (input: { ghPath: string; refreshIntervalMinutes: RefreshIntervalMinutes }) =>
      await saveSettings(input),
    onSuccess: (result, input) => {
      if (result.kind === "error") {
        toast.error(result.message);
        return;
      }
      setGhPath(result.ghPath);
      setRefreshIntervalMinutes(result.refreshIntervalMinutes);
      if (input.ghPath.trim() !== (settingsQuery.data?.ghPath ?? "").trim()) {
        toast.show(result.resolvedGhPath ? `Using ${result.resolvedGhPath}` : "Saved GitHub CLI path.", {
          variant: "success",
        });
      }
      void settingsQuery.refetch();
      props.onSaved?.();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not save settings.");
    },
  });

  const resolved = settingsQuery.data?.resolvedGhPath ?? null;
  const saveError = save.data?.kind === "error" ? save.data.message : null;

  return (
    <View style={styles.screen}>
      <View style={styles.section}>
        <Text style={styles.heading}>Refresh</Text>
        <Text style={styles.muted}>
          Update the pull request list and the sidebar waiting count in the background.
        </Text>
        <View style={styles.chips}>
          {REFRESH_INTERVAL_MINUTES.map((minutes) => {
            const selected = minutes === refreshIntervalMinutes;
            return (
              <Pressable
                key={minutes}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Refresh: ${refreshIntervalLabel(minutes)}`}
                onPress={() => {
                  setRefreshIntervalMinutes(minutes);
                  save.mutate({ ghPath, refreshIntervalMinutes: minutes });
                }}
                style={[styles.chip, selected ? styles.chipSelected : null]}
              >
                <Text style={selected ? styles.chipLabelSelected : styles.chipLabel}>
                  {refreshIntervalLabel(minutes)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>GitHub CLI</Text>
        <View style={styles.row}>
          <TextInput
            value={ghPath}
            onChangeText={setGhPath}
            placeholder="/opt/homebrew/bin/gh"
            placeholderTextColor={props.theme.colors.foregroundMuted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="GitHub CLI executable path"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save GitHub CLI path"
            onPress={() => save.mutate({ ghPath, refreshIntervalMinutes })}
            style={styles.action}
            disabled={save.isPending}
          >
            <Text style={styles.actionLabel}>{save.isPending ? "Saving…" : "Save"}</Text>
          </Pressable>
        </View>
        {saveError ? <Text style={styles.danger}>{saveError}</Text> : null}
        <Text style={styles.muted}>
          {ghPath.trim().length === 0
            ? resolved
              ? `Auto-detected ${resolved}. Leave blank to keep auto-detect, or enter an absolute path.`
              : "Leave blank to auto-detect, or enter the absolute path to gh."
            : resolved
              ? `Using ${resolved}`
              : "Enter the absolute path to the gh executable."}
        </Text>
      </View>
    </View>
  );
}

function panelStyles(theme: PluginTheme, compact: boolean) {
  return {
    screen: {
      flex: 1,
      paddingHorizontal: compact ? 16 : 24,
      paddingTop: compact ? 8 : 12,
      gap: compact ? 20 : 24,
    },
    section: { gap: 8 },
    heading: { color: theme.colors.foreground, fontSize: 14, fontWeight: "500" as const },
    muted: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 16 },
    danger: { color: theme.colors.statusDanger, fontSize: 12 },
    chips: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
    chip: {
      minHeight: 32,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: theme.colors.border,
      justifyContent: "center" as const,
    },
    chipSelected: { backgroundColor: theme.colors.surface2, borderColor: theme.colors.foregroundMuted },
    chipLabel: { color: theme.colors.foregroundMuted, fontSize: 14 },
    chipLabelSelected: { color: theme.colors.foreground, fontSize: 14 },
    row: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      alignItems: "center" as const,
      gap: 8,
    },
    input: compact
      ? {
          width: "100%" as const,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface2,
          color: theme.colors.foreground,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
          fontSize: 14,
        }
      : {
          flexGrow: 1,
          flexBasis: 280,
          minWidth: 220,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface2,
          color: theme.colors.foreground,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
          fontSize: 14,
        },
    action: {
      backgroundColor: theme.colors.surface2,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
    },
    actionLabel: { color: theme.colors.foreground, fontWeight: "500" as const, fontSize: 14 },
  };
}
