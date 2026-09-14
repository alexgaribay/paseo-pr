import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { SettingsSwitch } from "@getpaseo/plugin/client/ui";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  DEFAULT_REFRESH_INTERVAL_MINUTES,
  REFRESH_INTERVAL_MINUTES,
  prSettingsGet,
  prSettingsSet,
  refreshIntervalLabel,
  type RefreshIntervalMinutes,
} from "../shared/settings";
import { prProjects, type GithubProject } from "../shared/pr";
import { WorkspaceLabelPicker } from "./workspace-label-picker";

interface AssignmentAutomation {
  enabled: boolean;
  profileId: string;
  prompt: string;
}

interface PickerOption {
  label: string;
  value: string;
  description?: string;
}

export function SettingsPanel(props: {
  theme: PluginTheme;
  compact: boolean;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const paseo = usePaseo();
  const fetchSettings = useRpc(prSettingsGet);
  const saveSettings = useRpc(prSettingsSet);
  const fetchProjects = useRpc(prProjects);
  const [ghPath, setGhPath] = useState("");
  const [refreshIntervalMinutes, setRefreshIntervalMinutes] = useState<RefreshIntervalMinutes>(
    DEFAULT_REFRESH_INTERVAL_MINUTES,
  );
  const [workspaceLabelNames, setWorkspaceLabelNames] = useState<string[]>([]);
  const [excludedProjectIds, setExcludedProjectIds] = useState<string[]>([]);
  const [assignmentAutomation, setAssignmentAutomation] = useState<AssignmentAutomation>({
    enabled: false,
    profileId: "",
    prompt: "",
  });
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSearch, setProfileSearch] = useState("");
  const [excludedProjectsOpen, setExcludedProjectsOpen] = useState(false);
  const [excludedProjectsSearch, setExcludedProjectsSearch] = useState("");

  const settingsQuery = useQuery({
    queryKey: ["pr.settings"],
    queryFn: () => fetchSettings({}),
  });
  const profilesQuery = useQuery({
    queryKey: ["paseo.agent-profiles"],
    queryFn: async () => (await paseo.config.get()).config.agentProfiles ?? [],
    staleTime: 60_000,
  });
  const projectsQuery = useQuery({
    queryKey: ["pr.projects"],
    queryFn: async () => (await fetchProjects({})).projects,
    staleTime: 60_000,
  });

  useEffect(() => {
    const settings = settingsQuery.data;
    if (settings?.kind !== "ok" && settings?.kind !== "error") return;
    setGhPath(settings.ghPath);
    setRefreshIntervalMinutes(settings.refreshIntervalMinutes);
    setExcludedProjectIds(settings.excludedProjectIds);
    setWorkspaceLabelNames(settings.workspaceLabelNames);
    setAssignmentAutomation(settings.assignmentAutomation);
  }, [settingsQuery.data]);

  const styles = useMemo(() => panelStyles(props.theme, props.compact), [props.compact, props.theme]);
  const save = useMutation({
    mutationFn: (input: {
      ghPath: string;
      refreshIntervalMinutes: RefreshIntervalMinutes;
      excludedProjectIds: string[];
      workspaceLabelNames: string[];
      assignmentAutomation: AssignmentAutomation;
    }) => saveSettings(input),
    onSuccess: (result, input) => {
      if (result.kind === "error") {
        toast.error(result.message);
        return;
      }
      setGhPath(result.ghPath);
      setRefreshIntervalMinutes(result.refreshIntervalMinutes);
      setExcludedProjectIds(result.excludedProjectIds);
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
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save settings."),
  });

  function persist(next: Partial<{
    ghPath: string;
    refreshIntervalMinutes: RefreshIntervalMinutes;
    excludedProjectIds: string[];
    workspaceLabelNames: string[];
    assignmentAutomation: AssignmentAutomation;
  }>) {
    save.mutate({
      ghPath: next.ghPath ?? ghPath,
      refreshIntervalMinutes: next.refreshIntervalMinutes ?? refreshIntervalMinutes,
      excludedProjectIds: next.excludedProjectIds ?? excludedProjectIds,
      workspaceLabelNames: next.workspaceLabelNames ?? workspaceLabelNames,
      assignmentAutomation: next.assignmentAutomation ?? assignmentAutomation,
    });
  }

  function updateAutomation(next: AssignmentAutomation) {
    setAssignmentAutomation(next);
    persist({ assignmentAutomation: next });
  }

  const profileOptions: PickerOption[] = (profilesQuery.data ?? [])
    .filter((profile) => profile.model)
    .map((profile) => ({
      label: profile.name,
      value: profile.id,
      description: [profile.provider, profile.model, profile.notes].filter(Boolean).join(" · "),
    }));
  const selectedProfile = profilesQuery.data?.find((profile) => profile.id === assignmentAutomation.profileId);
  const resolved = settingsQuery.data?.resolvedGhPath;

  return (
    <View style={styles.screen}>
      <SettingRow styles={styles} title="GitHub CLI" description={resolved ? `Using ${resolved}` : "Leave blank to auto-detect."}>
        <TextInput
          value={ghPath}
          onChangeText={setGhPath}
          onBlur={() => persist({ ghPath })}
          placeholder="Auto-detect"
          placeholderTextColor={props.theme.colors.foregroundMuted}
          style={styles.input}
        />
      </SettingRow>
      <SettingRow styles={styles} title="Refresh" description="Update pull requests and the sidebar waiting count in the background." overlay>
        <RefreshIntervalSelect theme={props.theme} styles={styles} value={refreshIntervalMinutes} open={refreshOpen} onOpenChange={setRefreshOpen} onChange={(minutes) => {
          setRefreshIntervalMinutes(minutes);
          persist({ refreshIntervalMinutes: minutes });
        }} />
      </SettingRow>
      <SettingRow styles={styles} title="Excluded projects" description="Excluded projects are hidden from pull-request lists, the waiting count, and assigned-PR automation." overlay>
        <ProjectExclusionPicker
          theme={props.theme}
          styles={styles}
          projects={projectsQuery.data ?? []}
          selectedProjectIds={excludedProjectIds}
          open={excludedProjectsOpen}
          query={excludedProjectsSearch}
          disabled={projectsQuery.isLoading}
          onOpenChange={setExcludedProjectsOpen}
          onQueryChange={setExcludedProjectsSearch}
          onChange={(projectIds) => {
            setExcludedProjectIds(projectIds);
            persist({ excludedProjectIds: projectIds });
          }}
        />
      </SettingRow>
      <SettingRow styles={styles} title="Workspace labels" description="Apply these labels when this plugin creates a workspace." overlay>
        <WorkspaceLabelPicker theme={props.theme} compact={props.compact} catalog={settingsQuery.data?.workspaceLabels ?? []} selectedNames={workspaceLabelNames} onChange={(names) => {
          setWorkspaceLabelNames(names);
          persist({ workspaceLabelNames: names });
        }} />
      </SettingRow>
      <View style={styles.automationHeader}>
        <Text style={styles.heading}>Assigned PR automation</Text>
        <Text style={styles.muted}>For new assignments, create a labeled workspace and run the selected profile. Paseo notifies you when the agent completes.</Text>
      </View>
      <SettingsSwitch
        label="Automatically run"
        hint="Only assignments observed after this setting is enabled are automated."
        value={assignmentAutomation.enabled}
        onValueChange={(enabled) => updateAutomation({ ...assignmentAutomation, enabled })}
      />
      <SettingRow styles={styles} title="Agent profile" description={profilesQuery.isLoading ? "Loading your Paseo profiles…" : selectedProfile ? "The profile supplies the provider, model, thinking level, and access mode." : "Choose an existing profile that includes a model."} overlay>
        <SearchablePicker theme={props.theme} styles={styles} value={assignmentAutomation.profileId} options={profileOptions} open={profileOpen} query={profileSearch} disabled={profilesQuery.isLoading || profileOptions.length === 0} emptyLabel="Select a profile" searchPlaceholder="Search profiles" onOpenChange={setProfileOpen} onQueryChange={setProfileSearch} onChange={(profileId) => {
          updateAutomation({ ...assignmentAutomation, profileId });
          setProfileOpen(false);
        }} />
      </SettingRow>
      <SettingRow styles={styles} title="Default prompt" description="Sent to the agent after its workspace and labels are ready." last>
        <TextInput value={assignmentAutomation.prompt} onChangeText={(prompt) => setAssignmentAutomation({ ...assignmentAutomation, prompt })} onBlur={() => persist({ assignmentAutomation })} multiline textAlignVertical="top" style={styles.promptInput} placeholder="Describe what the agent should do" placeholderTextColor={props.theme.colors.foregroundMuted} />
      </SettingRow>
    </View>
  );
}

function SearchablePicker(props: {
  theme: PluginTheme;
  styles: ReturnType<typeof panelStyles>;
  value: string;
  options: PickerOption[];
  open: boolean;
  query: string;
  emptyLabel: string;
  searchPlaceholder: string;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  onChange: (value: string) => void;
}) {
  const options = props.options.filter((option) => `${option.label} ${option.description ?? ""}`.toLowerCase().includes(props.query.toLowerCase()));
  const selected = props.options.find((option) => option.value === props.value);
  return <View style={props.styles.picker}>
    <Pressable disabled={props.disabled} accessibilityRole="button" accessibilityState={{ expanded: props.open, disabled: props.disabled }} onPress={() => props.onOpenChange(!props.open)} style={props.styles.pickerTrigger}>
      <Text style={props.styles.selectValue} numberOfLines={1}>{selected?.label ?? props.emptyLabel}</Text>
      <Icon name={props.open ? "ChevronUp" : "ChevronDown"} size={14} color={props.theme.colors.foregroundMuted} />
    </Pressable>
    {props.open ? <View style={props.styles.pickerMenu} accessibilityRole="menu">
      <TextInput value={props.query} onChangeText={props.onQueryChange} onBlur={() => setTimeout(() => props.onOpenChange(false), 200)} autoFocus placeholder={props.searchPlaceholder} placeholderTextColor={props.theme.colors.foregroundMuted} style={props.styles.pickerSearch} />
      <ScrollView style={props.styles.pickerOptions} nestedScrollEnabled>{options.map((option) => <Pressable key={option.value} accessibilityRole="menuitem" onPress={() => props.onChange(option.value)} style={props.styles.selectItem}>
        <View style={stylesForOption(props.styles)}><Text style={option.value === props.value ? props.styles.selectItemLabelSelected : props.styles.selectItemLabel}>{option.label}</Text>{option.description ? <Text style={props.styles.muted} numberOfLines={1}>{option.description}</Text> : null}</View>
      </Pressable>)}</ScrollView>
    </View> : null}
  </View>;
}

function ProjectExclusionPicker(props: {
  theme: PluginTheme;
  styles: ReturnType<typeof panelStyles>;
  projects: readonly GithubProject[];
  selectedProjectIds: readonly string[];
  open: boolean;
  query: string;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  onChange: (projectIds: string[]) => void;
}) {
  const selectedIds = new Set(props.selectedProjectIds);
  const projects = props.projects.filter((project) => {
    const needle = props.query.trim().toLowerCase();
    return needle.length === 0 || `${project.owner}/${project.repo} ${project.displayName}`.toLowerCase().includes(needle);
  });
  const selectedCount = props.selectedProjectIds.length;

  function toggle(projectId: string) {
    props.onChange(
      selectedIds.has(projectId)
        ? props.selectedProjectIds.filter((candidate) => candidate !== projectId)
        : [...props.selectedProjectIds, projectId],
    );
  }

  return <View style={props.styles.picker}>
    <Pressable disabled={props.disabled} accessibilityRole="button" accessibilityState={{ expanded: props.open, disabled: props.disabled }} onPress={() => props.onOpenChange(!props.open)} style={props.styles.pickerTrigger}>
      <Text style={props.styles.selectValue} numberOfLines={1}>{selectedCount === 0 ? "No excluded projects" : `${selectedCount} project${selectedCount === 1 ? "" : "s"} excluded`}</Text>
      <Icon name={props.open ? "ChevronUp" : "ChevronDown"} size={14} color={props.theme.colors.foregroundMuted} />
    </Pressable>
    {props.open ? <View style={props.styles.pickerMenu} accessibilityRole="menu">
      <TextInput value={props.query} onChangeText={props.onQueryChange} onBlur={() => setTimeout(() => props.onOpenChange(false), 200)} autoFocus placeholder="Search projects" placeholderTextColor={props.theme.colors.foregroundMuted} style={props.styles.pickerSearch} />
      <ScrollView keyboardShouldPersistTaps="handled" style={props.styles.pickerOptions} nestedScrollEnabled>
        {projects.length === 0 ? <Text style={props.styles.pickerEmpty}>No matching projects.</Text> : projects.map((project) => {
          const selected = selectedIds.has(project.projectId);
          return <Pressable key={project.projectId} accessibilityRole="menuitem" accessibilityState={{ selected }} onPressIn={() => toggle(project.projectId)} style={props.styles.selectItem}>
            <Text style={selected ? props.styles.selectItemLabelSelected : props.styles.selectItemLabel} numberOfLines={1}>{project.owner}/{project.repo}</Text>
            {selected ? <Icon name="Check" size={12} color={props.theme.colors.foreground} /> : null}
          </Pressable>;
        })}
      </ScrollView>
    </View> : null}
  </View>;
}

function stylesForOption(styles: ReturnType<typeof panelStyles>) { return { flex: 1, gap: 2, minWidth: 0 }; }

function RefreshIntervalSelect(props: { theme: PluginTheme; styles: ReturnType<typeof panelStyles>; value: RefreshIntervalMinutes; open: boolean; onOpenChange: (open: boolean) => void; onChange: (minutes: RefreshIntervalMinutes) => void }) {
  return <View style={props.styles.picker}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: props.open }} onPress={() => props.onOpenChange(!props.open)} style={props.styles.pickerTrigger}><Text style={props.styles.selectValue}>{refreshIntervalLabel(props.value)}</Text><Icon name={props.open ? "ChevronUp" : "ChevronDown"} size={14} color={props.theme.colors.foregroundMuted} /></Pressable>
    {props.open ? <View style={props.styles.pickerMenu} accessibilityRole="menu">{REFRESH_INTERVAL_MINUTES.map((minutes) => <Pressable key={minutes} accessibilityRole="menuitem" onPress={() => { props.onChange(minutes); props.onOpenChange(false); }} style={props.styles.selectItem}><Text style={minutes === props.value ? props.styles.selectItemLabelSelected : props.styles.selectItemLabel}>{refreshIntervalLabel(minutes)}</Text>{minutes === props.value ? <Icon name="Check" size={12} color={props.theme.colors.foreground} /> : null}</Pressable>)}</View> : null}
  </View>;
}

function SettingRow(props: { styles: ReturnType<typeof panelStyles>; title: string; description: string; children: ReactNode; overlay?: boolean; last?: boolean }) {
  return <View style={[props.styles.section, props.overlay ? props.styles.overlay : null, props.last ? props.styles.sectionLast : null]}><View style={props.styles.copy}><Text style={props.styles.heading}>{props.title}</Text><Text style={props.styles.muted}>{props.description}</Text></View><View style={props.styles.control}>{props.children}</View></View>;
}

function panelStyles(theme: PluginTheme, compact: boolean) {
  return {
    screen: { flex: 1, paddingHorizontal: compact ? 16 : 24, paddingTop: compact ? 8 : 12, gap: compact ? 16 : 8 },
    section: { flexDirection: compact ? "column" as const : "row" as const, alignItems: compact ? "stretch" as const : "flex-start" as const, gap: compact ? 10 : 24, paddingVertical: compact ? 4 : 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    sectionLast: { borderBottomWidth: 0 }, overlay: { zIndex: 20, overflow: "visible" as const },
    copy: compact ? { gap: 4 } : { gap: 4, flexGrow: 2, flexShrink: 1, flexBasis: 0 },
    control: compact ? { gap: 8 } : { gap: 8, flexGrow: 1, flexShrink: 1, flexBasis: 0 },
    automationHeader: { gap: 4, paddingTop: compact ? 4 : 16, paddingBottom: compact ? 2 : 8 },
    heading: { color: theme.colors.foreground, fontSize: 14, fontWeight: "500" as const }, muted: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 16 },
    input: { alignSelf: "stretch" as const, width: "100%" as const, minHeight: 36, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface2, color: theme.colors.foreground, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
    promptInput: { alignSelf: "stretch" as const, width: "100%" as const, minHeight: 128, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface2, color: theme.colors.foreground, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, lineHeight: 20 },
    picker: { alignSelf: "stretch" as const, width: "100%" as const, position: "relative" as const, zIndex: 30 },
    pickerTrigger: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, gap: 8, minHeight: 36, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }, selectValue: { color: theme.colors.foreground, fontSize: 14, flexShrink: 1 },
    pickerMenu: { position: "absolute" as const, top: 40, left: 0, right: 0, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface1, borderRadius: 8, overflow: "hidden" as const, shadowColor: "#000", shadowOpacity: 0.24, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8, zIndex: 40 }, pickerSearch: { minHeight: 36, borderBottomWidth: 1, borderBottomColor: theme.colors.border, color: theme.colors.foreground, paddingHorizontal: 12, fontSize: 14 }, pickerOptions: { maxHeight: 240 },
    pickerEmpty: { color: theme.colors.foregroundMuted, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
    selectItem: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, gap: 8, minHeight: 36, paddingHorizontal: 12, paddingVertical: compact ? 8 : 9 }, selectItemLabel: { color: theme.colors.foreground, fontSize: 14 }, selectItemLabelSelected: { color: theme.colors.foreground, fontSize: 14, fontWeight: "500" as const },
  };
}
