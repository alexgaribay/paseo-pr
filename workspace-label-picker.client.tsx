import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  themeColorScheme,
  workspaceLabelForeground,
  workspaceLabelKey,
  WORKSPACE_LABEL_IDENTITY,
  workspaceLabelTint,
  type WorkspaceLabelDefinition,
} from "./workspace-labels.shared";

export function WorkspaceLabelPicker(props: {
  theme: PluginTheme;
  compact: boolean;
  catalog: readonly WorkspaceLabelDefinition[];
  selectedNames: readonly string[];
  onChange: (names: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const styles = useMemo(() => pickerStyles(props.theme, props.compact), [props.compact, props.theme]);
  const scheme = themeColorScheme(props.theme.colors.surface0);
  const selected = useMemo(
    () => resolveSelectedLabels(props.selectedNames, props.catalog),
    [props.catalog, props.selectedNames],
  );
  const selectedKeys = useMemo(
    () => new Set(selected.map((label) => workspaceLabelKey(label.name))),
    [selected],
  );
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return props.catalog.filter((label) => {
      if (selectedKeys.has(workspaceLabelKey(label.name))) return false;
      return needle.length === 0 || label.name.toLowerCase().includes(needle);
    });
  }, [props.catalog, query, selectedKeys]);

  function addLabel(label: WorkspaceLabelDefinition) {
    if (selectedKeys.has(workspaceLabelKey(label.name))) return;
    props.onChange([...selected.map((entry) => entry.name), label.name]);
    setQuery("");
    setOpen(true);
  }

  function removeLabel(label: WorkspaceLabelDefinition) {
    const key = workspaceLabelKey(label.name);
    props.onChange(selected.filter((entry) => workspaceLabelKey(entry.name) !== key).map((entry) => entry.name));
  }

  if (props.catalog.length === 0) {
    return <Text style={styles.muted}>No workspace labels yet.</Text>;
  }

  return (
    <View style={styles.root}>
      {selected.length > 0 ? (
        <View style={styles.pills}>
          {selected.map((label) => {
            const foreground = workspaceLabelForeground(label.color, scheme);
            return (
              <View
                key={workspaceLabelKey(label.name)}
                style={[styles.pill, { backgroundColor: workspaceLabelTint(label.color) }]}
              >
                <Text style={[styles.pillName, { color: foreground }]} numberOfLines={1}>
                  {label.name}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${label.name}`}
                  hitSlop={6}
                  onPress={() => removeLabel(label)}
                  style={styles.pillRemove}
                >
                  <Icon name="X" size={12} color={foreground} />
                </Pressable>
              </View>
            );
          })}
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
          onBlur={() => {
            setTimeout(() => setOpen(false), 150);
          }}
          placeholder="Search labels"
          placeholderTextColor={props.theme.colors.foregroundMuted}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search workspace labels"
        />
        <View pointerEvents="none" style={styles.chevron}>
          <Icon name={open ? "ChevronUp" : "ChevronDown"} size={14} color={props.theme.colors.foregroundMuted} />
        </View>
        {open ? (
          <View style={styles.menu} accessibilityRole="menu">
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.menuScroll}>
              {matches.length === 0 ? (
                <Text style={styles.empty}>No matching labels.</Text>
              ) : (
                matches.map((label) => (
                  <Pressable
                    key={workspaceLabelKey(label.name)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${label.name}`}
                    onPressIn={() => addLabel(label)}
                    style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
                      styles.item,
                      (hovered || pressed) && styles.itemHover,
                    ]}
                  >
                    <View
                      style={[
                        styles.swatch,
                        { backgroundColor: WORKSPACE_LABEL_IDENTITY[label.color] },
                      ]}
                    />
                    <Text style={styles.itemLabel} numberOfLines={1}>
                      {label.name}
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

function resolveSelectedLabels(
  names: readonly string[],
  catalog: readonly WorkspaceLabelDefinition[],
): WorkspaceLabelDefinition[] {
  const byKey = new Map(catalog.map((label) => [workspaceLabelKey(label.name), label]));
  const seen = new Set<string>();
  const result: WorkspaceLabelDefinition[] = [];
  for (const name of names) {
    const found = byKey.get(workspaceLabelKey(name));
    if (!found) continue;
    const key = workspaceLabelKey(found.name);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(found);
  }
  return result;
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
      borderRadius: 999,
      gap: 2,
    },
    pillName: { fontSize: 12, lineHeight: 16, flexShrink: 1 },
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
      gap: 10,
      minHeight: 32,
      paddingHorizontal: 12,
      paddingVertical: compact ? 8 : 9,
    },
    itemHover: { backgroundColor: theme.colors.surface2 },
    swatch: {
      width: 10,
      height: 10,
      borderRadius: 999,
    },
    itemLabel: { color: theme.colors.foreground, flex: 1, fontSize: 14 },
  };
}
