import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsRow, SettingsSection, SettingsSelect, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import {
  DEFAULT_REFRESH_INTERVAL_MINUTES,
  REFRESH_INTERVAL_MINUTES,
  prSettingsGet,
  prSettingsSet,
  refreshIntervalLabel,
  type RefreshIntervalMinutes,
} from "../shared/settings";
import { WorkspaceLabelPicker } from "./workspace-label-picker";

export function SettingsPanel(props: {
  theme: PluginTheme;
  compact: boolean;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const fetchSettings = useRpc(prSettingsGet);
  const saveSettings = useRpc(prSettingsSet);
  const paseo = usePaseo();
  const [ghPath, setGhPath] = useState("");
  const [refreshIntervalMinutes, setRefreshIntervalMinutes] = useState<RefreshIntervalMinutes>(
    DEFAULT_REFRESH_INTERVAL_MINUTES,
  );
  const [workspaceLabelNames, setWorkspaceLabelNames] = useState<string[]>([]);
  const [assignmentAutomation, setAssignmentAutomation] = useState({
    enabled: false,
    provider: "",
    prompt: "",
  });
  const [refreshOpen, setRefreshOpen] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["pr.settings"],
    queryFn: () => fetchSettings({}),
  });
  const providersQuery = useQuery({
    queryKey: ["paseo.providers"],
    queryFn: () => paseo.providers.waitForReady({ timeoutMs: 5_000 }),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (settingsQuery.data?.kind === "ok" || settingsQuery.data?.kind === "error") {
      setGhPath(settingsQuery.data.ghPath);
      setRefreshIntervalMinutes(settingsQuery.data.refreshIntervalMinutes);
      setWorkspaceLabelNames(settingsQuery.data.workspaceLabelNames);
      setAssignmentAutomation(settingsQuery.data.assignmentAutomation);
    }
  }, [settingsQuery.data]);

  const styles = useMemo(() => panelStyles(props.theme, props.compact), [props.compact, props.theme]);
  const catalog = settingsQuery.data?.workspaceLabels ?? [];
  const modelOptions = (providersQuery.data?.entries ?? []).flatMap((entry) =>
    entry.enabled && entry.status === "ready"
      ? (entry.models ?? [])
          .filter((model) => model.isSelectable !== false)
          .map((model) => ({ label: `${entry.provider} · ${model.label}`, value: `${entry.provider}/${model.id}` }))
      : [],
  );

  const save = useMutation({
    mutationFn: async (input: {
      ghPath: string;
      refreshIntervalMinutes: RefreshIntervalMinutes;
      workspaceLabelNames: string[];
      assignmentAutomation: { enabled: boolean; provider: string; prompt: string };
    }) => await saveSettings(input),
    onSuccess: (result, input) => {
      if (result.kind === "error") {
        toast.error(result.message);
        return;
      }
      setGhPath(result.ghPath);
      setRefreshIntervalMinutes(result.refreshIntervalMinutes);
      setWorkspaceLabelNames(result.workspaceLabelNames);
      setAssignmentAutomation(result.assignmentAutomation);
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
    assignmentAutomation?: { enabled: boolean; provider: string; prompt: string };
  }) {
    save.mutate({
      ghPath: next.ghPath ?? ghPath,
      refreshIntervalMinutes: next.refreshIntervalMinutes ?? refreshIntervalMinutes,
      workspaceLabelNames: next.workspaceLabelNames ?? workspaceLabelNames,
      assignmentAutomation: next.assignmentAutomation ?? assignmentAutomation,
    });
  }

  const ghStatus =
    ghPath.trim().length === 0
      ? resolved
        ? `Auto-detected ${resolved}.`
        : "Leave blank to auto-detect."
      : resolved
        ? `Using ${resolved}`
        : "Enter the absolute path to the gh executable.";

  return (
    <View style={styles.screen}>
      <SettingRow
        styles={styles}
        title="Refresh"
        description="Update the pull request list and the sidebar waiting count in the background."
        overlay="select"
      >
        <RefreshIntervalSelect
          theme={props.theme}
          styles={styles}
          value={refreshIntervalMinutes}
          open={refreshOpen}
          onOpenChange={setRefreshOpen}
          onChange={(minutes) => {
            setRefreshIntervalMinutes(minutes);
            persist({ refreshIntervalMinutes: minutes });
          }}
        />
      </SettingRow>
      <SettingRow
        styles={styles}
        title="Workspace labels"
        description="Apply these labels when this plugin creates a workspace. Jumping to an existing workspace does not change its labels. Create labels in Paseo first; this plugin will not add new ones."
        overlay
      >
        <WorkspaceLabelPicker
          theme={props.theme}
          compact={props.compact}
          catalog={catalog}
          selectedNames={workspaceLabelNames}
          onChange={(names) => {
            setWorkspaceLabelNames(names);
            persist({ workspaceLabelNames: names });
          }}
        />
      </SettingRow>
      <SettingsSection
        title="Assigned PR automation"
        info="For new PR assignments, create a labeled workspace and run this default prompt. Paseo notifies you when the agent completes."
      >
        <SettingsSwitch
          label="Automatically run"
          hint="Only assignments observed after this setting is enabled are automated."
          value={assignmentAutomation.enabled}
          onValueChange={(enabled) => setAssignmentAutomation((current) => ({ ...current, enabled }))}
        />
        <SettingsSelect
          label="Model"
          hint={providersQuery.isLoading ? "Loading available models…" : "Use the same provider/model catalog as Paseo."}
          value={assignmentAutomation.provider}
          options={modelOptions}
          onValueChange={(provider) => setAssignmentAutomation((current) => ({ ...current, provider }))}
          disabled={providersQuery.isLoading || modelOptions.length === 0}
        />
        <SettingsRow
          label="Default prompt"
          hint="Sent to the agent after its workspace and labels are ready."
        >
          <TextInput
            value={assignmentAutomation.prompt}
            onChangeText={(prompt) => setAssignmentAutomation((current) => ({ ...current, prompt }))}
            placeholder="Review this pull request and summarize the changes."
            placeholderTextColor={props.theme.colors.foregroundMuted}
            style={styles.promptInput}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Assigned PR automation default prompt"
          />
        </SettingsRow>
        <SettingsAction
          label="Save automation"
          actionLabel={save.isPending ? "Saving…" : "Save"}
          onPress={() => persist({ assignmentAutomation })}
          disabled={save.isPending}
        />
      </SettingsSection>
      <SettingRow
        styles={styles}
        title="GitHub CLI"
        last
        description="Path to gh on the daemon. Leave blank to auto-detect, or enter an absolute path."
      >
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
        <Text style={styles.muted}>{ghStatus}</Text>
      </SettingRow>
    </View>
  );
}

function RefreshIntervalSelect(props: {
  theme: PluginTheme;
  styles: ReturnType<typeof panelStyles>;
  value: RefreshIntervalMinutes;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (minutes: RefreshIntervalMinutes) => void;
}) {
  const { styles } = props;
  return (
    <View style={styles.select}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Refresh: ${refreshIntervalLabel(props.value)}`}
        accessibilityState={{ expanded: props.open }}
        onPress={() => props.onOpenChange(!props.open)}
        style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
          styles.selectTrigger,
          (hovered || pressed || props.open) && styles.selectTriggerHover,
        ]}
      >
        <Text style={styles.selectValue} numberOfLines={1}>
          {refreshIntervalLabel(props.value)}
        </Text>
        <Icon
          name={props.open ? "ChevronUp" : "ChevronDown"}
          size={14}
          color={props.theme.colors.foregroundMuted}
        />
      </Pressable>
      {props.open ? (
        <View style={styles.selectMenu} accessibilityRole="menu">
          {REFRESH_INTERVAL_MINUTES.map((minutes) => {
            const selected = minutes === props.value;
            return (
              <Pressable
                key={minutes}
                accessibilityRole="menuitem"
                accessibilityLabel={refreshIntervalLabel(minutes)}
                accessibilityState={{ selected }}
                onPress={() => {
                  props.onChange(minutes);
                  props.onOpenChange(false);
                }}
                style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
                  styles.selectItem,
                  (hovered || pressed) && styles.selectItemHover,
                ]}
              >
                <Text style={selected ? styles.selectItemLabelSelected : styles.selectItemLabel}>
                  {refreshIntervalLabel(minutes)}
                </Text>
                {selected ? (
                  <Icon name="Check" size={12} color={props.theme.colors.foreground} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function SettingRow(props: {
  styles: ReturnType<typeof panelStyles>;
  title: string;
  description: string;
  overlay?: boolean | "select";
  last?: boolean;
  children: ReactNode;
}) {
  const overlayStyle =
    props.overlay === "select"
      ? props.styles.selectSection
      : props.overlay
        ? props.styles.labelsSection
        : null;
  return (
    <View style={[props.styles.section, overlayStyle, props.last ? props.styles.sectionLast : null]}>
      <View style={props.styles.copy}>
        <Text style={props.styles.heading}>{props.title}</Text>
        <Text style={props.styles.muted}>{props.description}</Text>
      </View>
      <View style={props.styles.control}>{props.children}</View>
    </View>
  );
}

function panelStyles(theme: PluginTheme, compact: boolean) {
  return {
    screen: {
      flex: 1,
      paddingHorizontal: compact ? 16 : 24,
      paddingTop: compact ? 8 : 12,
      gap: compact ? 16 : 8,
    },
    section: {
      flexDirection: compact ? ("column" as const) : ("row" as const),
      alignItems: compact ? ("stretch" as const) : ("flex-start" as const),
      gap: compact ? 10 : 24,
      paddingVertical: compact ? 4 : 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    sectionLast: { borderBottomWidth: 0 },
    copy: compact
      ? { gap: 4 }
      : {
          gap: 4,
          flexGrow: 2,
          flexShrink: 1,
          flexBasis: 0,
        },
    control: compact
      ? { gap: 8 }
      : {
          gap: 8,
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
        },
    selectSection: { zIndex: 40, overflow: "visible" as const },
    labelsSection: { zIndex: 30, overflow: "visible" as const },
    heading: { color: theme.colors.foreground, fontSize: 14, fontWeight: "500" as const },
    muted: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 16 },
    danger: { color: theme.colors.statusDanger, fontSize: 12 },
    select: { position: "relative" as const, zIndex: 40 },
    selectTrigger: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: 8,
      minHeight: 36,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface2,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    selectTriggerHover: { backgroundColor: theme.colors.surface1 },
    selectValue: { color: theme.colors.foreground, fontSize: 14, flexShrink: 1 },
    selectMenu: {
      position: "absolute" as const,
      top: 40,
      left: 0,
      right: 0,
      marginTop: 4,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface1,
      borderRadius: 8,
      overflow: "hidden" as const,
      zIndex: 50,
    },
    selectItem: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: 8,
      minHeight: 32,
      paddingHorizontal: 12,
      paddingVertical: compact ? 8 : 9,
    },
    selectItemHover: { backgroundColor: theme.colors.surface2 },
    selectItemLabel: { color: theme.colors.foreground, fontSize: 14 },
    selectItemLabelSelected: { color: theme.colors.foreground, fontSize: 14, fontWeight: "500" as const },
    row: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      alignItems: "center" as const,
      gap: 8,
    },
    input: {
      flexGrow: 1,
      flexBasis: compact ? 1 : 180,
      minWidth: compact ? undefined : 160,
      minHeight: 36,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface2,
      color: theme.colors.foreground,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
    },
    promptInput: {
      minHeight: 128,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface2,
      color: theme.colors.foreground,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      lineHeight: 20,
    },
    action: {
      backgroundColor: theme.colors.accent,
      minHeight: 36,
      justifyContent: "center" as const,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
    },
    actionLabel: { color: theme.colors.accentForeground, fontWeight: "500" as const, fontSize: 14 },
  };
}
