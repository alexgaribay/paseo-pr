import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { GithubProject } from "../shared/pr";

export function ProjectExclusionPicker(props: {
  theme: PluginTheme;
  compact: boolean;
  projects: readonly GithubProject[];
  selectedProjectIds: readonly string[];
  onChange: (projectIds: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const styles = useMemo(() => pickerStyles(props.theme, props.compact), [props.compact, props.theme]);
  const projectsById = useMemo(
    () => new Map(props.projects.map((project) => [project.projectId, project])),
    [props.projects],
  );
  const selected = useMemo(
    () => props.selectedProjectIds.flatMap((projectId) => {
      const project = projectsById.get(projectId);
      return project ? [project] : [];
    }),
    [projectsById, props.selectedProjectIds],
  );
  const selectedIds = useMemo(() => new Set(selected.map((project) => project.projectId)), [selected]);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return props.projects.filter((project) => {
      if (selectedIds.has(project.projectId)) return false;
      return needle.length === 0 || `${project.owner}/${project.repo} ${project.displayName}`.toLowerCase().includes(needle);
    });
  }, [props.projects, query, selectedIds]);

  function addProject(project: GithubProject) {
    if (selectedIds.has(project.projectId)) return;
    props.onChange([...selected.map((entry) => entry.projectId), project.projectId]);
    setQuery("");
    setOpen(true);
  }

  function removeProject(project: GithubProject) {
    props.onChange(selected.filter((entry) => entry.projectId !== project.projectId).map((entry) => entry.projectId));
  }

  if (props.projects.length === 0) {
    return <Text style={styles.muted}>No GitHub projects yet.</Text>;
  }

  return (
    <View style={styles.root}>
      {selected.length > 0 ? (
        <View style={styles.pills}>
          {selected.map((project) => (
            <View key={project.projectId} style={styles.pill}>
              <Text style={styles.pillName} numberOfLines={1}>
                {project.owner}/{project.repo}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Include ${project.owner}/${project.repo}`}
                hitSlop={6}
                onPress={() => removeProject(project)}
                style={styles.pillRemove}
              >
                <Icon name="X" size={12} color={props.theme.colors.foreground} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.combo}>
        <TextInput
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search projects to exclude"
          placeholderTextColor={props.theme.colors.foregroundMuted}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search projects to exclude"
        />
        <View pointerEvents="none" style={styles.chevron}>
          <Icon name={open ? "ChevronUp" : "ChevronDown"} size={14} color={props.theme.colors.foregroundMuted} />
        </View>
        {open ? (
          <View style={styles.menu} accessibilityRole="menu">
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.menuScroll}>
              {matches.length === 0 ? (
                <Text style={styles.empty}>No matching projects.</Text>
              ) : (
                matches.map((project) => (
                  <Pressable
                    key={project.projectId}
                    accessibilityRole="button"
                    accessibilityLabel={`Exclude ${project.owner}/${project.repo}`}
                    onPressIn={() => addProject(project)}
                    style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
                      styles.item,
                      (hovered || pressed) && styles.itemHover,
                    ]}
                  >
                    <Text style={styles.itemLabel} numberOfLines={1}>
                      {project.owner}/{project.repo}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function pickerStyles(theme: PluginTheme, compact: boolean) {
  return {
    root: { gap: 8, zIndex: 30 },
    muted: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 16 },
    pills: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6 },
    pill: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      maxWidth: "100%" as const,
      minHeight: 24,
      paddingLeft: 8,
      paddingRight: 4,
      paddingVertical: 2,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface2,
      borderRadius: 999,
      gap: 2,
    },
    pillName: { color: theme.colors.foreground, fontSize: 12, lineHeight: 16, flexShrink: 1 },
    pillRemove: {
      width: 20,
      height: 20,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: 999,
    },
    combo: { position: "relative" as const, zIndex: 40 },
    chevron: {
      position: "absolute" as const,
      right: 10,
      top: 0,
      bottom: 0,
      justifyContent: "center" as const,
    },
    search: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface2,
      color: theme.colors.foreground,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: compact ? 8 : 9,
      paddingRight: 32,
      fontSize: 14,
    },
    menu: {
      position: "absolute" as const,
      top: compact ? 38 : 42,
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
    menuScroll: { maxHeight: compact ? 220 : 280 },
    empty: {
      color: theme.colors.foregroundMuted,
      fontSize: 13,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    item: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      minHeight: 32,
      paddingHorizontal: 12,
      paddingVertical: compact ? 8 : 9,
    },
    itemHover: { backgroundColor: theme.colors.surface2 },
    itemLabel: { color: theme.colors.foreground, flex: 1, fontSize: 14 },
  };
}
