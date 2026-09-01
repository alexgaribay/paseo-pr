import { Icon } from "@getpaseo/plugin/react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useMemo } from "react";
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
}) {
  const styles = useMemo(() => dropdownStyles(props.theme, props.compact), [props.compact, props.theme]);
  const summary = props.summary?.trim() ?? "";
  const triggerLabel = summary.length > 0 ? `${props.label}: ${summary}` : props.label;

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={triggerLabel}
        accessibilityState={{ expanded: props.open }}
        onPress={() => props.onOpenChange(!props.open)}
        style={[styles.trigger, props.open ? styles.triggerOpen : null]}
      >
        <Text style={styles.triggerLabel} numberOfLines={1}>
          {triggerLabel}
        </Text>
        <Icon
          name={props.open ? "ChevronUp" : "ChevronDown"}
          size={16}
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
                  style={styles.item}
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
      gap: 8,
      maxWidth: compact ? undefined : 280,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface2,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: compact ? 8 : 9,
    },
    triggerOpen: { borderColor: theme.colors.accent },
    triggerLabel: { color: theme.colors.foreground, fontWeight: "600" as const, flexShrink: 1 },
    menu: {
      position: "absolute" as const,
      top: compact ? 38 : 42,
      left: 0,
      minWidth: 240,
      maxWidth: 320,
      marginTop: 4,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface1,
      borderRadius: 10,
      overflow: "hidden" as const,
      zIndex: 50,
      elevation: 8,
      shadowColor: theme.colors.foreground,
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
    },
    menuScroll: { maxHeight: compact ? 220 : 280 },
    item: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: compact ? 10 : 11,
    },
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
    itemLabel: { color: theme.colors.foreground, flex: 1 },
  };
}
