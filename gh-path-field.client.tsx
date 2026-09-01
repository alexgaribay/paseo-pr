import { useRpc, type PluginTheme } from "@getpaseo/plugin";
import { Icon, useToast } from "@getpaseo/plugin/react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { prSettingsGet, prSettingsSet } from "./settings.shared";

export function GhPathField(props: {
  theme: PluginTheme;
  compact: boolean;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const fetchSettings = useRpc(prSettingsGet);
  const saveSettings = useRpc(prSettingsSet);
  const [ghPath, setGhPath] = useState("");
  const [open, setOpen] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["pr.settings"],
    queryFn: () => fetchSettings({}),
  });

  useEffect(() => {
    if (settingsQuery.data?.kind === "ok" || settingsQuery.data?.kind === "error") {
      setGhPath(settingsQuery.data.ghPath);
    }
  }, [settingsQuery.data]);

  const styles = useMemo(() => {
    const compact = props.compact;
    const theme = props.theme;
    return {
      wrap: { gap: 6 },
      toggle: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        alignSelf: "flex-start" as const,
        gap: 6,
        minHeight: 32,
        paddingHorizontal: 8,
        borderRadius: 8,
      },
      toggleLabel: { color: theme.colors.foregroundMuted, fontSize: 12, fontWeight: "500" as const },
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
        paddingVertical: compact ? 8 : 8,
        borderRadius: 8,
      },
      actionLabel: { color: theme.colors.foreground, fontWeight: "500" as const, fontSize: 14 },
      muted: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 16 },
      danger: { color: theme.colors.statusDanger, fontSize: 12 },
    };
  }, [props.compact, props.theme]);

  const save = useMutation({
    mutationFn: async () => await saveSettings({ ghPath }),
    onSuccess: (result) => {
      if (result.kind === "error") {
        toast.error(result.message);
        return;
      }
      setGhPath(result.ghPath);
      toast.show(result.resolvedGhPath ? `Using ${result.resolvedGhPath}` : "Saved GitHub CLI path.", {
        variant: "success",
      });
      void settingsQuery.refetch();
      props.onSaved?.();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not save the GitHub CLI path.");
    },
  });

  const resolved = settingsQuery.data?.resolvedGhPath ?? null;
  const saveError = save.data?.kind === "error" ? save.data.message : null;

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="GitHub CLI path"
        onPress={() => setOpen((current) => !current)}
        style={styles.toggle}
      >
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={14} color={props.theme.colors.foregroundMuted} />
        <Text style={styles.toggleLabel}>GitHub CLI</Text>
      </Pressable>
      {open ? (
        <>
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
              onPress={() => save.mutate()}
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
        </>
      ) : null}
    </View>
  );
}
