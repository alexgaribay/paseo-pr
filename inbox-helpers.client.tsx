import { Pressable, Text, View } from "react-native";
import type { PullRequest, PullRequestAuthorFilter, PullRequestState } from "./pr.shared";

export function ChipRow(props: {
  styles: {
    row: object;
    chip: object;
    chipSelected: object;
    chipLabel: object;
    chipLabelSelected: object;
  };
  items: { id: string; label: string }[];
  selected: string;
  onSelect: (id: string) => void;
  groupLabel?: string;
}) {
  return (
    <View style={props.styles.row}>
      {props.items.map((item) => {
        const selected = item.id === props.selected;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={props.groupLabel ? `${props.groupLabel}: ${item.label}` : item.label}
            onPress={() => props.onSelect(item.id)}
            style={[props.styles.chip, selected ? props.styles.chipSelected : null]}
          >
            <Text style={selected ? props.styles.chipLabelSelected : props.styles.chipLabel}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function isAuthorFilter(value: string): value is PullRequestAuthorFilter {
  return value === "anyone" || value === "me";
}

export function isPullRequestState(value: string): value is PullRequestState {
  return value === "open" || value === "closed" || value === "merged";
}

export function formatPullRequestStatus(pullRequest: PullRequest): string {
  if (pullRequest.isDraft && pullRequest.state === "open") return "Draft";
  if (pullRequest.state === "open") return "Open";
  if (pullRequest.state === "closed") return "Closed";
  if (pullRequest.state === "merged") return "Merged";
  return pullRequest.state;
}

export function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function repositoryLabel(pullRequest: PullRequest): string {
  return `${pullRequest.owner}/${pullRequest.repo}`;
}
