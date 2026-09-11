import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useMemo, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

export interface FilterDropdownItem {
  id: string;
  label: string;
}

export function FilterDropdown(props: {
  theme: PluginTheme;
  compact: boolean;
  label: string;
  items: FilterDropdownItem[];
  selectedIds: readonly string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (id: string) => void;
  summary?: string;
  trailing?: ReactNode;
}) {
  const styles = useMemo(() => dropdownStyles(props.theme, props.compact), [props.compact, props.theme]);
  const summary = props.summary?.trim() ?? "";
  const triggerLabel = summary.length > 0 ? `${props.label}: ${summary}` : props.label;
  const active = summary.length > 0 || props.open;

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={triggerLabel}
        accessibilityState={{ expanded: props.open }}
        onPress={() => props.onOpenChange(!props.open)}
        style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
          styles.trigger,
          (hovered || pressed || props.open) && styles.triggerHover,
          active ? styles.triggerActive : null,
        ]}
      >
        <Text style={[styles.triggerLabel, active ? styles.triggerLabelActive : null]} numberOfLines={1}>
          {triggerLabel}
        </Text>
        {props.trailing}
        <Icon
          name={props.open ? "ChevronUp" : "ChevronDown"}
          size={14}
          color={props.theme.colors.foregroundMuted}
        />
      </Pressable>
      {props.open ? (
        <View style={styles.menu} accessibilityRole="menu">
          <ScrollView style={styles.menuScroll} keyboardShouldPersistTaps="handled">
            {props.items.map((item) => {
              const checked = props.selectedIds.includes(item.id);
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="checkbox"
                  accessibilityLabel={item.label}
                  accessibilityState={{ checked }}
                  onPress={() => props.onToggle(item.id)}
                  style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
                    styles.item,
                    (hovered || pressed) && styles.itemHover,
                  ]}
                >
                  <View style={[styles.checkbox, checked ? styles.checkboxChecked : null]}>
                    {checked ? (
                      <Icon name="Check" size={12} color={props.theme.colors.accentForeground} />
                    ) : null}
                  </View>
                  <Text style={styles.itemLabel} numberOfLines={1}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

export function toggleSelectedId(selectedIds: readonly string[], id: string): string[] {
  return selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id];
}

export function selectedSummary(input: {
  items: FilterDropdownItem[];
  selectedIds: readonly string[];
  emptyMeansAll?: boolean;
}): string {
  if (input.items.length === 0) return "";
  if (input.emptyMeansAll && (input.selectedIds.length === 0 || input.selectedIds.length === input.items.length)) {
    return "";
  }
  const labels = input.items.filter((item) => input.selectedIds.includes(item.id)).map((item) => item.label);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]}, ${labels[1]}`;
  return `${labels.length} selected`;
}

function dropdownStyles(theme: PluginTheme, compact: boolean) {
  return {
    wrap: { position: "relative" as const, zIndex: 40 },
    trigger: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      maxWidth: compact ? undefined : 280,
      minHeight: 32,
      borderWidth: 1,
      borderColor: "transparent",
      backgroundColor: "transparent",
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: compact ? 6 : 7,
    },
    triggerHover: { backgroundColor: theme.colors.surface2 },
    triggerActive: { borderColor: theme.colors.border, backgroundColor: theme.colors.surface2 },
    triggerLabel: { color: theme.colors.foregroundMuted, fontSize: 14, flexShrink: 1 },
    triggerLabelActive: { color: theme.colors.foreground },
    menu: {
      position: "absolute" as const,
      top: compact ? 34 : 36,
      left: 0,
      minWidth: 220,
      maxWidth: 300,
      marginTop: 4,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface1,
      borderRadius: 8,
      overflow: "hidden" as const,
      zIndex: 50,
    },
    menuScroll: { maxHeight: compact ? 220 : 280 },
    item: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
      minHeight: 32,
      paddingHorizontal: 12,
      paddingVertical: compact ? 8 : 9,
    },
    itemHover: { backgroundColor: theme.colors.surface2 },
    checkbox: {
      width: 16,
      height: 16,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface2,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    checkboxChecked: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    itemLabel: { color: theme.colors.foreground, flex: 1, fontSize: 14 },
  };
}
