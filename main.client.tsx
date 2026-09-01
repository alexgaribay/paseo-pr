import { usePaseo, useRpc, type PluginSurfaceProps } from "@getpaseo/plugin";
import { Icon, useToast } from "@getpaseo/plugin/react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { FilterDropdown, selectedSummary, toggleSelectedId } from "./filter-dropdown.client";
import { CountBadge, isPersonFilter, isPullRequestState } from "./inbox-helpers.client";
import { OpenPrModal } from "./open-pr-modal.client";
import { subscribeOpenPrModal } from "./open-pr-request.client";
import { PrTable } from "./pr-table.client";
import {
  prAttention,
  prList,
  prProjects,
  prStatus,
  type GithubProject,
  type PullRequest,
  type PullRequestPersonFilter,
  type PullRequestState,
} from "./pr.shared";
import {
  DEFAULT_REFRESH_INTERVAL_MINUTES,
  prSettingsGet,
  refreshIntervalMs,
} from "./settings.shared";
import { SettingsPanel } from "./settings-panel.client";
import {
  ensureSidebarBadgePolling,
  setSidebarBadgePollInterval,
  setSidebarBadgeTheme,
} from "./sidebar-badge.client";
import { createPullRequestWorkspace, createRepoWorkspace } from "./workspace-from-pr.client";

type OpenFilter = "repository" | "status" | "author" | "assignee" | "waiting" | null;
type Pane = "inbox" | "settings";

const STATES: { id: PullRequestState; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "closed", label: "Closed" },
  { id: "merged", label: "Merged" },
];

const PEOPLE: { id: PullRequestPersonFilter; label: string }[] = [
  { id: "anyone", label: "Anyone" },
  { id: "me", label: "Me" },
];

export function MainSurface({ theme, layout, navigation }: PluginSurfaceProps) {
  const paseo = usePaseo();
  const toast = useToast();
  const fetchStatus = useRpc(prStatus);
  const fetchProjects = useRpc(prProjects);
  const fetchPullRequests = useRpc(prList);
  const fetchAttention = useRpc(prAttention);
  const fetchSettings = useRpc(prSettingsGet);

  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [states, setStates] = useState<PullRequestState[]>(["open"]);
  const [author, setAuthor] = useState<PullRequestPersonFilter>("anyone");
  const [assignee, setAssignee] = useState<PullRequestPersonFilter>("anyone");
  const [waiting, setWaiting] = useState<PullRequestPersonFilter>("anyone");
  const [search, setSearch] = useState("");
  const [openFilter, setOpenFilter] = useState<OpenFilter>(null);
  const [pane, setPane] = useState<Pane>("inbox");
  const [openByNumber, setOpenByNumber] = useState(false);
  const [openPrNumber, setOpenPrNumber] = useState<number | null>(null);
  const [openPrAutoSubmit, setOpenPrAutoSubmit] = useState(false);

  useEffect(
    () =>
      subscribeOpenPrModal((request) => {
        setOpenPrNumber(request.number);
        setOpenPrAutoSubmit(request.autoSubmit);
        setOpenByNumber(true);
      }),
    [],
  );
  useEffect(() => {
    setSidebarBadgeTheme({
      foreground: theme.colors.foreground,
      background: theme.colors.surface2,
      border: theme.colors.border,
    });
  }, [theme.colors.border, theme.colors.foreground, theme.colors.surface2]);
  useEffect(() => {
    return ensureSidebarBadgePolling(async () => {
      const result = await fetchAttention({});
      return result.kind === "ok" ? result.count : 0;
    });
  }, [fetchAttention]);

  const settingsQuery = useQuery({
    queryKey: ["pr.settings"],
    queryFn: () => fetchSettings({}),
  });
  const refreshMinutes = settingsQuery.data?.refreshIntervalMinutes ?? DEFAULT_REFRESH_INTERVAL_MINUTES;
  const refreshMs = refreshIntervalMs(refreshMinutes);

  useEffect(() => {
    setSidebarBadgePollInterval(refreshMs);
  }, [refreshMs]);

  const statusQuery = useQuery({
    queryKey: ["pr.status"],
    queryFn: () => fetchStatus({}),
  });
  const projectsQuery = useQuery({
    queryKey: ["pr.projects"],
    queryFn: async () => (await fetchProjects({})).projects,
  });
  const listQuery = useQuery({
    queryKey: ["pr.list", projectIds, states, author, assignee, waiting, search],
    queryFn: () =>
      fetchPullRequests({
        projectIds: projectIds.length > 0 ? projectIds : undefined,
        states,
        author,
        assignee,
        waiting,
        search: search.trim() || undefined,
      }),
    enabled: statusQuery.data?.kind === "ok",
    refetchInterval: refreshMs,
  });
  const attentionQuery = useQuery({
    queryKey: ["pr.attention"],
    queryFn: () => fetchAttention({}),
    enabled: statusQuery.data?.kind === "ok",
    refetchInterval: refreshMs,
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
      fontSize: 14,
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
        paddingTop: compact ? 12 : 16,
        paddingBottom: compact ? 8 : 12,
        gap: compact ? 8 : 10,
      },
      toolbar: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        gap: 8,
      },
      actions: { flexDirection: "row" as const, flexWrap: "wrap" as const, alignItems: "center" as const, gap: 8 },
      muted: { color: theme.colors.foregroundMuted, fontSize: 14 },
      danger: { color: theme.colors.statusDanger, fontSize: 14 },
      filters: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        alignItems: "center" as const,
        gap: 4,
        overflow: "visible" as const,
      },
      search: compact
        ? { ...searchField, width: "100%" as const, paddingVertical: 8 }
        : { ...searchField, flexGrow: 1, flexBasis: 180, minWidth: 160, paddingVertical: 7 },
      actionQuiet: {
        minHeight: 32,
        backgroundColor: "transparent",
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 8,
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
      },
      actionQuietLabel: { color: theme.colors.foreground, fontSize: 14 },
      empty: { paddingHorizontal: compact ? 16 : 24, paddingVertical: compact ? 20 : 28 },
    };
  }, [layout.compact, theme]);

  const projects = projectsQuery.data ?? [];
  const listResult = listQuery.data;
  const pullRequests = listResult?.kind === "ok" ? listResult.pullRequests : [];
  const waitingCount = attentionQuery.data?.kind === "ok" ? attentionQuery.data.count : 0;
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
    pane === "inbox" &&
    !statusQuery.isLoading &&
    !projectsQuery.isLoading &&
    !unavailable &&
    projects.length > 0 &&
    !listQuery.isLoading &&
    !listError;

  function refetchAll() {
    void statusQuery.refetch();
    void listQuery.refetch();
    void attentionQuery.refetch();
    void settingsQuery.refetch();
  }

  return (
    <View style={styles.screen}>
      {openFilter ? <Pressable style={styles.overlay} onPress={() => setOpenFilter(null)} /> : null}
      <View style={styles.header}>
        <View style={styles.toolbar}>
          <View style={styles.actions}>
            {pane === "settings" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to pull requests"
                onPress={() => setPane("inbox")}
                style={styles.actionQuiet}
              >
                <Icon name="ChevronLeft" size={14} color={theme.colors.foreground} />
                <Text style={styles.actionQuietLabel}>Inbox</Text>
              </Pressable>
            ) : (
              <>
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
                  onPress={() => {
                    setOpenPrNumber(null);
                    setOpenPrAutoSubmit(false);
                    setOpenByNumber(true);
                  }}
                  style={styles.actionQuiet}
                >
                  <Text style={styles.actionQuietLabel}>Open by number</Text>
                </Pressable>
              </>
            )}
          </View>
          <View style={styles.actions}>
            {pane === "inbox" ? (
              <CountBadge
                theme={theme}
                count={waitingCount}
                accessibilityLabel={`${waitingCount} pull requests waiting on you`}
                onPress={() => setWaiting("me")}
              />
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={pane === "settings" ? "Close settings" : "Open settings"}
              onPress={() => {
                setOpenFilter(null);
                setPane((current) => (current === "settings" ? "inbox" : "settings"));
              }}
              style={styles.actionQuiet}
            >
              <Icon name="Settings" size={14} color={theme.colors.foregroundMuted} />
              <Text style={styles.actionQuietLabel}>Settings</Text>
            </Pressable>
          </View>
        </View>
        {pane === "inbox" ? (
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
              items={PEOPLE}
              selectedIds={[author]}
              open={openFilter === "author"}
              onOpenChange={(open) => setOpenFilter(open ? "author" : null)}
              onToggle={(id) => {
                if (isPersonFilter(id)) setAuthor(id);
              }}
              summary={author === "me" ? "Me" : ""}
            />
            <FilterDropdown
              theme={theme}
              compact={layout.compact}
              label="Assignee"
              items={PEOPLE}
              selectedIds={[assignee]}
              open={openFilter === "assignee"}
              onOpenChange={(open) => setOpenFilter(open ? "assignee" : null)}
              onToggle={(id) => {
                if (isPersonFilter(id)) setAssignee(id);
              }}
              summary={assignee === "me" ? "Me" : ""}
            />
            <FilterDropdown
              theme={theme}
              compact={layout.compact}
              label="Waiting"
              items={PEOPLE}
              selectedIds={[waiting]}
              open={openFilter === "waiting"}
              onOpenChange={(open) => setOpenFilter(open ? "waiting" : null)}
              onToggle={(id) => {
                if (isPersonFilter(id)) setWaiting(id);
              }}
              summary={waiting === "me" ? "Me" : ""}
              trailing={
                <CountBadge
                  theme={theme}
                  count={waitingCount}
                  accessibilityLabel={`${waitingCount} pull requests waiting on you`}
                />
              }
            />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search"
              placeholderTextColor={theme.colors.foregroundMuted}
              style={styles.search}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Search pull requests"
            />
          </View>
        ) : null}
      </View>
      {pane === "settings" ? (
        <SettingsPanel theme={theme} compact={layout.compact} onSaved={refetchAll} />
      ) : statusQuery.isLoading || projectsQuery.isLoading ? (
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
        initialNumber={openPrNumber}
        autoSubmit={openPrAutoSubmit}
        onOpenChange={(open) => {
          setOpenByNumber(open);
          if (!open) {
            setOpenPrNumber(null);
            setOpenPrAutoSubmit(false);
          }
        }}
        openWorkspace={navigation?.openWorkspace}
      />
    </View>
  );
}
