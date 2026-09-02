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
import { workspaceLabelKey, type WorkspaceLabelDefinition } from "./workspace-labels.shared";

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
  const [workspaceLabelNames, setWorkspaceLabelNames] = useState<string[]>([]);

  const settingsQuery = useQuery({
    queryKey: ["pr.settings"],
    queryFn: () => fetchSettings({}),
  });

  useEffect(() => {
    if (settingsQuery.data?.kind === "ok" || settingsQuery.data?.kind === "error") {
      setGhPath(settingsQuery.data.ghPath);
      setRefreshIntervalMinutes(settingsQuery.data.refreshIntervalMinutes);
      setWorkspaceLabelNames(settingsQuery.data.workspaceLabelNames);
    }
  }, [settingsQuery.data]);

  const styles = useMemo(() => panelStyles(props.theme, props.compact), [props.compact, props.theme]);
  const catalog = settingsQuery.data?.workspaceLabels ?? [];
  const selectedLabelKeys = useMemo(
    () => new Set(workspaceLabelNames.map((name) => workspaceLabelKey(name))),
    [workspaceLabelNames],
  );

  const save = useMutation({
    mutationFn: async (input: {
      ghPath: string;
      refreshIntervalMinutes: RefreshIntervalMinutes;
      workspaceLabelNames: string[];
    }) => await saveSettings(input),
    onSuccess: (result, input) => {
      if (result.kind === "error") {
        toast.error(result.message);
        return;
      }
      setGhPath(result.ghPath);
      setRefreshIntervalMinutes(result.refreshIntervalMinutes);
      setWorkspaceLabelNames(result.workspaceLabelNames);
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

  function persist(next: {
    ghPath?: string;
    refreshIntervalMinutes?: RefreshIntervalMinutes;
    workspaceLabelNames?: string[];
  }) {
    save.mutate({
      ghPath: next.ghPath ?? ghPath,
      refreshIntervalMinutes: next.refreshIntervalMinutes ?? refreshIntervalMinutes,
      workspaceLabelNames: next.workspaceLabelNames ?? workspaceLabelNames,
    });
  }

  function toggleWorkspaceLabel(label: WorkspaceLabelDefinition) {
    const key = workspaceLabelKey(label.name);
    const selected = new Set(selectedLabelKeys);
    if (selected.has(key)) selected.delete(key);
    else selected.add(key);
    const next = catalog
      .filter((entry) => selected.has(workspaceLabelKey(entry.name)))
      .map((entry) => entry.name);
    setWorkspaceLabelNames(next);
    persist({ workspaceLabelNames: next });
  }

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
                  persist({ refreshIntervalMinutes: minutes });
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
        <Text style={styles.heading}>Workspace labels</Text>
        <Text style={styles.muted}>
          Apply these labels when this plugin creates a workspace. Jumping to an existing workspace
          does not change its labels. Create labels in Paseo first; this plugin will not add new
          ones.
        </Text>
        {catalog.length === 0 ? (
          <Text style={styles.muted}>No workspace labels yet.</Text>
        ) : (
          <View style={styles.chips}>
            {catalog.map((label) => {
              const selected = selectedLabelKeys.has(workspaceLabelKey(label.name));
              return (
                <Pressable
                  key={workspaceLabelKey(label.name)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Workspace label: ${label.name}`}
                  onPress={() => toggleWorkspaceLabel(label)}
                  style={[styles.chip, selected ? styles.chipSelected : null]}
                >
                  <Text style={selected ? styles.chipLabelSelected : styles.chipLabel}>{label.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
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
            onPress={() => persist({})}
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
