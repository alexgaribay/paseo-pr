import { usePaseo, useRpc, type PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal, useToast } from "@getpaseo/plugin/react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { ChipRow } from "./inbox-helpers.client";
import { prProjects, prView } from "./pr.shared";
import { createPullRequestWorkspace } from "./workspace-from-pr.client";

export function OpenPrModal(props: {
  theme: PluginTheme;
  compact: boolean;
  open: boolean;
  initialNumber: number | null;
  autoSubmit: boolean;
  onOpenChange: (open: boolean) => void;
  openWorkspace?: (input: { workspaceId: string }) => void;
}) {
  const paseo = usePaseo();
  const toast = useToast();
  const fetchProjects = useRpc(prProjects);
  const fetchPullRequest = useRpc(prView);
  const [numberText, setNumberText] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const autoSubmitted = useRef(false);

  const projectsQuery = useQuery({
    queryKey: ["pr.projects"],
    queryFn: async () => (await fetchProjects({})).projects,
    enabled: props.open,
  });
  const projects = projectsQuery.data ?? [];
  const selectedProjectId = projectId ?? (projects.length === 1 ? projects[0].projectId : null);
  const selectedProject = projects.find((project) => project.projectId === selectedProjectId) ?? null;

  useEffect(() => {
    if (!props.open) {
      autoSubmitted.current = false;
      setNumberText("");
      setProjectId(null);
      return;
    }
    if (props.initialNumber !== null) setNumberText(String(props.initialNumber));
  }, [props.open, props.initialNumber]);

  const styles = useMemo(() => {
    const compact = props.compact;
    const theme = props.theme;
    return {
      body: { gap: compact ? 10 : 12 },
      muted: { color: theme.colors.foregroundMuted },
      danger: { color: theme.colors.statusDanger },
      label: { color: theme.colors.foregroundMuted },
      input: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface2,
        color: theme.colors.foreground,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: compact ? 8 : 10,
      },
      row: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
      chip: {
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: compact ? 6 : 8,
        backgroundColor: theme.colors.surface2,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      chipSelected: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
      chipLabel: { color: theme.colors.foreground },
      chipLabelSelected: { color: theme.colors.accentForeground },
      action: {
        alignSelf: "flex-start" as const,
        backgroundColor: theme.colors.accent,
        paddingHorizontal: 12,
        paddingVertical: compact ? 8 : 10,
        borderRadius: 8,
      },
      actionLabel: { color: theme.colors.accentForeground, fontWeight: "600" as const },
    };
  }, [props.compact, props.theme]);

  const create = useMutation({
    mutationFn: async () => {
      const number = Number.parseInt(numberText, 10);
      if (!Number.isInteger(number) || number <= 0) {
        throw new Error("Enter a pull request number.");
      }
      if (!selectedProject) {
        throw new Error("Choose a GitHub repository.");
      }
      const viewed = await fetchPullRequest({ projectId: selectedProject.projectId, number });
      if (viewed.kind === "unavailable" || viewed.kind === "error" || viewed.kind === "not_found") {
        throw new Error(viewed.message);
      }
      return await createPullRequestWorkspace({
        paseo,
        rootPath: selectedProject.rootPath,
        number: viewed.pullRequest.number,
        title: viewed.pullRequest.title,
      });
    },
    onSuccess: ({ workspaceId }) => {
      toast.show("Workspace created", { variant: "success" });
      props.onOpenChange(false);
      setNumberText("");
      props.openWorkspace?.({ workspaceId });
    },
  });

  useEffect(() => {
    if (!props.open || !props.autoSubmit || autoSubmitted.current || create.isPending) return;
    if (projectsQuery.isLoading || !selectedProject) return;
    const number = Number.parseInt(numberText, 10);
    if (!Number.isInteger(number) || number <= 0) return;
    if (projects.length !== 1) return;
    autoSubmitted.current = true;
    create.mutate();
  }, [
    create.isPending,
    create.mutate,
    numberText,
    projects.length,
    projectsQuery.isLoading,
    props.autoSubmit,
    props.open,
    selectedProject,
  ]);
  return (
    <Modal
      title="Open GitHub PR"
      icon={<Icon name="GitPullRequest" size={18} color={props.theme.colors.foreground} />}
      open={props.open}
      onOpenChange={(open) => {
        props.onOpenChange(open);
        if (!open) {
          create.reset();
          setNumberText("");
        }
      }}
    >
      <Modal.Content>
        <View style={styles.body}>
          {projects.length === 0 ? (
            <Text style={styles.muted}>No registered Paseo projects resolve to a GitHub remote.</Text>
          ) : (
            <>
              {projects.length > 1 ? (
                <>
                  <Text style={styles.label}>Repository</Text>
                  <ChipRow
                    styles={styles}
                    groupLabel="Repository"
                    items={projects.map((project) => ({
                      id: project.projectId,
                      label: `${project.owner}/${project.repo}`,
                    }))}
                    selected={selectedProjectId ?? ""}
                    onSelect={setProjectId}
                  />
                </>
              ) : (
                <Text style={styles.muted}>
                  {projects[0].owner}/{projects[0].repo}
                </Text>
              )}
              <Text style={styles.label}>Pull request number</Text>
              <TextInput
                value={numberText}
                onChangeText={setNumberText}
                placeholder="42"
                placeholderTextColor={props.theme.colors.foregroundMuted}
                style={styles.input}
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {create.error ? (
                <Text style={styles.danger}>
                  {create.error instanceof Error ? create.error.message : "Could not open that pull request."}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create workspace from pull request"
                onPress={() => create.mutate()}
                style={styles.action}
                disabled={create.isPending}
              >
                <Text style={styles.actionLabel}>{create.isPending ? "Opening…" : "Create workspace"}</Text>
              </Pressable>
            </>
          )}
        </View>
      </Modal.Content>
    </Modal>
  );
}
