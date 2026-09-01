import { usePaseo, useRpc, type PluginSurfaceProps } from "@getpaseo/plugin";
import { useToast } from "@getpaseo/plugin/react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { FilterDropdown, selectedSummary, toggleSelectedId } from "./filter-dropdown.client";
import { GhPathField } from "./gh-path-field.client";
import { isAuthorFilter, isPullRequestState } from "./inbox-helpers.client";
import { OpenPrModal } from "./open-pr-modal.client";
import { subscribeOpenPrModal } from "./open-pr-request.client";
import { PrTable } from "./pr-table.client";
import {
  prList,
  prProjects,
  prStatus,
  type GithubProject,
  type PullRequest,
  type PullRequestAuthorFilter,
  type PullRequestState,
} from "./pr.shared";
import { createPullRequestWorkspace, createRepoWorkspace } from "./workspace-from-pr.client";

type OpenFilter = "repository" | "status" | "author" | null;

const STATES: { id: PullRequestState; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "closed", label: "Closed" },
  { id: "merged", label: "Merged" },
];

const AUTHORS: { id: PullRequestAuthorFilter; label: string }[] = [
  { id: "anyone", label: "Anyone" },
  { id: "me", label: "Me" },
];

export function MainSurface({ theme, layout, navigation }: PluginSurfaceProps) {
  const paseo = usePaseo();
  const toast = useToast();
  const fetchStatus = useRpc(prStatus);
  const fetchProjects = useRpc(prProjects);
  const fetchPullRequests = useRpc(prList);

  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [states, setStates] = useState<PullRequestState[]>(["open"]);
  const [author, setAuthor] = useState<PullRequestAuthorFilter>("anyone");
  const [search, setSearch] = useState("");
  const [openFilter, setOpenFilter] = useState<OpenFilter>(null);
  const [openByNumber, setOpenByNumber] = useState(false);

  useEffect(() => subscribeOpenPrModal(() => setOpenByNumber(true)), []);

  const statusQuery = useQuery({
    queryKey: ["pr.status"],
    queryFn: () => fetchStatus({}),
  });
  const projectsQuery = useQuery({
    queryKey: ["pr.projects"],
    queryFn: async () => (await fetchProjects({})).projects,
  });
  const listQuery = useQuery({
    queryKey: ["pr.list", projectIds, states, author, search],
    queryFn: () =>
      fetchPullRequests({
        projectIds: projectIds.length > 0 ? projectIds : undefined,
        states,
        author,
        search: search.trim() || undefined,
      }),
    enabled: statusQuery.data?.kind === "ok",
  });

  const styles = useMemo(() => {
    const compact = layout.compact;
    const searchField = {
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface2,
      color: theme.colors.foreground,
      borderRadius: 8,
      paddingHorizontal: 12,
    };
    return {
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      overlay: {
        position: "absolute" as const,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 20,
      },
      header: {
        zIndex: 30,
        paddingHorizontal: compact ? 16 : 24,
        paddingTop: compact ? 16 : 24,
        paddingBottom: compact ? 12 : 16,
        gap: compact ? 12 : 16,
      },
      titleRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        gap: 12,
      },
      title: { color: theme.colors.foreground, fontSize: compact ? 20 : 24, fontWeight: "600" as const, flex: 1 },
      actions: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
      muted: { color: theme.colors.foregroundMuted },
      danger: { color: theme.colors.statusDanger },
      filters: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        alignItems: "flex-start" as const,
        gap: 8,
        overflow: "visible" as const,
      },
      search: compact
        ? { ...searchField, width: "100%" as const, paddingVertical: 8 }
        : { ...searchField, flexGrow: 1, flexBasis: 220, minWidth: 180, paddingVertical: 10 },
      actionQuiet: {
        backgroundColor: theme.colors.surface2,
        borderWidth: 1,
        borderColor: theme.colors.border,
        paddingHorizontal: 12,
        paddingVertical: compact ? 6 : 8,
        borderRadius: 8,
      },
      actionQuietLabel: { color: theme.colors.foreground, fontWeight: "600" as const },
      empty: { paddingHorizontal: compact ? 16 : 24, paddingVertical: compact ? 20 : 28 },
    };
  }, [layout.compact, theme]);

  const projects = projectsQuery.data ?? [];
  const listResult = listQuery.data;
  const pullRequests = listResult?.kind === "ok" ? listResult.pullRequests : [];
  const repositoryItems = projects.map((project) => ({
    id: project.projectId,
    label: `${project.owner}/${project.repo}`,
  }));
  const selectedProject =
    projectIds.length === 1 ? (projects.find((project) => project.projectId === projectIds[0]) ?? null) : null;

  const createPr = useMutation({
    mutationFn: async (pullRequest: PullRequest) => {
      const project = projects.find((entry) => entry.projectId === pullRequest.projectId);
      if (!project) throw new Error("That GitHub project is no longer registered.");
      return await createPullRequestWorkspace({
        paseo,
        rootPath: project.rootPath,
        number: pullRequest.number,
        title: pullRequest.title,
      });
    },
    onSuccess: ({ workspaceId }) => {
      toast.show("Workspace created", { variant: "success" });
      navigation?.openWorkspace({ workspaceId });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not create a workspace for that pull request.");
    },
  });

  const createRepo = useMutation({
    mutationFn: async (project: GithubProject) =>
      await createRepoWorkspace({
        paseo,
        rootPath: project.rootPath,
        title: project.displayName,
      }),
    onSuccess: ({ workspaceId }) => {
      toast.show("Workspace created", { variant: "success" });
      navigation?.openWorkspace({ workspaceId });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not create a workspace for that repository.");
    },
  });

  const unavailable = statusQuery.data?.kind === "unavailable" ? statusQuery.data : null;
  const listError = listResult?.kind === "unavailable" || listResult?.kind === "error" ? listResult : null;
  const showTable =
    !statusQuery.isLoading &&
    !projectsQuery.isLoading &&
    !unavailable &&
    projects.length > 0 &&
    !listQuery.isLoading &&
    !listError;

  return (
    <View style={styles.screen}>
      {openFilter ? <Pressable style={styles.overlay} onPress={() => setOpenFilter(null)} /> : null}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Pull requests</Text>
          <View style={styles.actions}>
            {selectedProject ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Create workspace for ${selectedProject.displayName}`}
                onPress={() => createRepo.mutate(selectedProject)}
                style={styles.actionQuiet}
                disabled={createRepo.isPending}
              >
                <Text style={styles.actionQuietLabel}>New workspace</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open pull request by number"
              onPress={() => setOpenByNumber(true)}
              style={styles.actionQuiet}
            >
              <Text style={styles.actionQuietLabel}>Open by number</Text>
            </Pressable>
          </View>
        </View>
        <GhPathField
          theme={theme}
          compact={layout.compact}
          onSaved={() => {
            void statusQuery.refetch();
            void listQuery.refetch();
          }}
        />
        <View style={styles.filters}>
          <FilterDropdown
            theme={theme}
            compact={layout.compact}
            label="Repository"
            items={repositoryItems}
            selectedIds={projectIds}
            open={openFilter === "repository"}
            onOpenChange={(open) => setOpenFilter(open ? "repository" : null)}
            onToggle={(id) => setProjectIds((current) => toggleSelectedId(current, id))}
            summary={selectedSummary({ items: repositoryItems, selectedIds: projectIds, emptyMeansAll: true })}
          />
          <FilterDropdown
            theme={theme}
            compact={layout.compact}
            label="Status"
            items={STATES}
            selectedIds={states}
            open={openFilter === "status"}
            onOpenChange={(open) => setOpenFilter(open ? "status" : null)}
            onToggle={(id) => {
              if (!isPullRequestState(id)) return;
              setStates((current) => {
                const next = toggleSelectedId(current, id);
                return next.filter(isPullRequestState);
              });
            }}
            summary={selectedSummary({ items: STATES, selectedIds: states, emptyMeansAll: true })}
          />
          <FilterDropdown
            theme={theme}
            compact={layout.compact}
            label="Author"
            items={AUTHORS}
            selectedIds={[author]}
            open={openFilter === "author"}
            onOpenChange={(open) => setOpenFilter(open ? "author" : null)}
            onToggle={(id) => {
              if (isAuthorFilter(id)) setAuthor(id);
            }}
            summary={author === "me" ? "Me" : ""}
          />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search pull requests"
            placeholderTextColor={theme.colors.foregroundMuted}
            style={styles.search}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search pull requests"
          />
        </View>
      </View>
      {statusQuery.isLoading || projectsQuery.isLoading ? (
        <View style={styles.empty}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : unavailable ? (
        <View style={styles.empty}>
          <Text style={styles.danger}>
            {unavailable.reason === "missing"
              ? "GitHub CLI is not installed on this machine."
              : "GitHub CLI is not authenticated."}
          </Text>
          <Text style={styles.muted}>{unavailable.message}</Text>
        </View>
      ) : projects.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.muted}>
            No registered Paseo projects resolve to a GitHub remote. Add a GitHub checkout as a project, then reopen this
            surface.
          </Text>
        </View>
      ) : listQuery.isLoading ? (
        <View style={styles.empty}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : listError ? (
        <View style={styles.empty}>
          <Text style={styles.danger}>{listError.message}</Text>
        </View>
      ) : showTable ? (
        <PrTable
          theme={theme}
          compact={layout.compact}
          pullRequests={pullRequests}
          opening={createPr.isPending}
          onOpenWorkspace={(pullRequest) => createPr.mutate(pullRequest)}
        />
      ) : null}
      <OpenPrModal
        theme={theme}
        compact={layout.compact}
        open={openByNumber}
        onOpenChange={setOpenByNumber}
        openWorkspace={navigation?.openWorkspace}
      />
    </View>
  );
}
