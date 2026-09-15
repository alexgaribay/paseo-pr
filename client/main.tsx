import { usePaseo, useRpc, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { FilterDropdown, selectedSummary, toggleSelectedId } from "./filter-dropdown";
import { CountBadge, isPersonFilter, isPullRequestState, repositoryLabel } from "./inbox-helpers";
import { openHttpsUrl } from "./open-url";
import { PrShowPanel } from "./pr-show";
import { PrTable, PrTableSkeleton } from "./pr-table";
import {
  prAttention,
  prList,
  prProjects,
  prStatus,
  type GithubProject,
  type PullRequest,
  type PullRequestPersonFilter,
  type PullRequestState,
} from "../shared/pr";
import { subscribeInboxFocus } from "./search-pr-request";
import {
  DEFAULT_REFRESH_INTERVAL_MINUTES,
  prSettingsGet,
  refreshIntervalMs,
} from "../shared/settings";
import { SettingsPanel } from "./settings-panel";
import { prWorkspaceLabelsApply } from "../shared/workspace-labels";
import {
  ensureSidebarBadgePolling,
  setSidebarBadgePollInterval,
  setSidebarBadgeTheme,
} from "./sidebar-badge";
import {
  createPullRequestWorkspace,
  createRepoWorkspace,
  findWorkspaceForPullRequest,
  indexWorkspacesByPullRequest,
  listActiveWorkspaces,
  pullRequestWorkspaceKey,
} from "./workspace-from-pr";

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


function pullRequestMatchesSearch(pullRequest: PullRequest, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (query.length === 0) return true;
  return (
    pullRequest.title.toLowerCase().includes(query) ||
    pullRequest.author.toLowerCase().includes(query) ||
    repositoryLabel(pullRequest).toLowerCase().includes(query) ||
    String(pullRequest.number).includes(query)
  );
}

function waitingInboxRows(input: {
  listed: PullRequest[];
  attention: PullRequest[];
  projectIds: readonly string[];
  states: readonly PullRequestState[];
  author: PullRequestPersonFilter;
  assignee: PullRequestPersonFilter;
  search: string;
}): PullRequest[] {
  const personFiltersActive = input.author === "me" || input.assignee === "me";
  const source =
    personFiltersActive || input.attention.length === 0
      ? input.listed.filter((pullRequest) => pullRequest.waitingOnViewer)
      : input.attention;
  const wantedProjects = new Set(input.projectIds);
  const filterStates = input.states.length > 0 && input.states.length < 3;
  return source.filter((pullRequest) => {
    if (wantedProjects.size > 0 && !wantedProjects.has(pullRequest.projectId)) return false;
    if (filterStates && (!isPullRequestState(pullRequest.state) || !input.states.includes(pullRequest.state))) {
      return false;
    }
    return pullRequestMatchesSearch(pullRequest, input.search);
  });
}

export function MainSurface({ theme, layout, navigation }: PluginSurfaceProps) {
  const paseo = usePaseo();
  const toast = useToast();
  const queryClient = useQueryClient();
  const fetchStatus = useRpc(prStatus);
  const fetchProjects = useRpc(prProjects);
  const fetchPullRequests = useRpc(prList);
  const fetchAttention = useRpc(prAttention);
  const fetchSettings = useRpc(prSettingsGet);
  const applyWorkspaceLabels = useRpc(prWorkspaceLabelsApply);

  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [states, setStates] = useState<PullRequestState[]>(["open"]);
  const [author, setAuthor] = useState<PullRequestPersonFilter>("anyone");
  const [assignee, setAssignee] = useState<PullRequestPersonFilter>("anyone");
  const [waiting, setWaiting] = useState<PullRequestPersonFilter>("anyone");
  const [search, setSearch] = useState("");
  const [openFilter, setOpenFilter] = useState<OpenFilter>(null);
  const [pane, setPane] = useState<Pane>("inbox");
  const [selectedPullRequest, setSelectedPullRequest] = useState<PullRequest | null>(null);
  const [searchFocusToken, setSearchFocusToken] = useState(0);
  const searchInputRef = useRef<TextInput>(null);

  useEffect(
    () =>
      subscribeInboxFocus(() => {
        setPane("inbox");
        setSelectedPullRequest(null);
        setOpenFilter(null);
        setSearchFocusToken((token) => token + 1);
      }),
    [],
  );
  useEffect(() => {
    if (searchFocusToken === 0 || pane !== "inbox") return;
    const frame = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [pane, searchFocusToken]);
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
  useEffect(() => {
    return paseo.workspaces.subscribe(() => {
      void queryClient.invalidateQueries({ queryKey: ["pr.workspaces"] });
    });
  }, [paseo, queryClient]);

  const statusQuery = useQuery({
    queryKey: ["pr.status"],
    queryFn: () => fetchStatus({}),
  });
  const projectsQuery = useQuery({
    queryKey: ["pr.projects"],
    queryFn: async () => (await fetchProjects({})).projects,
    refetchInterval: refreshMs,
  });
  const listQuery = useQuery({
    queryKey: ["pr.list", projectIds, states, author, assignee, search],
    queryFn: () =>
      fetchPullRequests({
        projectIds: projectIds.length > 0 ? projectIds : undefined,
        states,
        author,
        assignee,
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
  const workspacesQuery = useQuery({
    queryKey: ["pr.workspaces"],
    queryFn: () => listActiveWorkspaces(paseo),
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
        paddingBottom: compact ? 10 : 12,
        gap: compact ? 8 : 10,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
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
        gap: 6,
        overflow: "visible" as const,
      },
      searchWrap: compact
        ? { position: "relative" as const, width: "100%" as const, justifyContent: "center" as const }
        : {
            position: "relative" as const,
            flexGrow: 1,
            flexBasis: 180,
            minWidth: 160,
            justifyContent: "center" as const,
          },
      search: { ...searchField, width: "100%" as const, paddingVertical: compact ? 8 : 7, paddingLeft: 32 },
      searchIcon: {
        position: "absolute" as const,
        left: 10,
        top: 0,
        bottom: 0,
        justifyContent: "center" as const,
      },
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
      actionOutlined: {
        minHeight: 32,
        backgroundColor: theme.colors.surface2,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
      },
      actionQuietLabel: { color: theme.colors.foreground, fontSize: 14 },
      empty: { paddingHorizontal: compact ? 16 : 24, paddingVertical: compact ? 20 : 28 },
    };
  }, [layout.compact, theme]);

  const projects = projectsQuery.data ?? [];
  useEffect(() => {
    const available = new Set(projects.map((project) => project.projectId));
    setProjectIds((current) => {
      const next = current.filter((projectId) => available.has(projectId));
      return next.length === current.length ? current : next;
    });
  }, [projects]);
  const listResult = listQuery.data;
  const listed = listResult?.kind === "ok" ? listResult.pullRequests : [];
  const attentionPrs = attentionQuery.data?.kind === "ok" ? attentionQuery.data.pullRequests : [];
  const pullRequests =
    waiting === "me"
      ? waitingInboxRows({
          listed,
          attention: attentionPrs,
          projectIds,
          states,
          author,
          assignee,
          search,
        })
      : listed;
  const workspaceIds = useMemo(
    () => indexWorkspacesByPullRequest(workspacesQuery.data ?? [], pullRequests),
    [pullRequests, workspacesQuery.data],
  );
  const waitingCount = attentionQuery.data?.kind === "ok" ? attentionQuery.data.count : 0;
  const repositoryItems = projects.map((project) => ({
    id: project.projectId,
    label: `${project.owner}/${project.repo}`,
  }));
  const selectedProject =
    projectIds.length === 1 ? (projects.find((project) => project.projectId === projectIds[0]) ?? null) : null;

  async function applyConfiguredWorkspaceLabels(workspaceId: string) {
    const result = await applyWorkspaceLabels({ workspaceId });
    if (result.kind === "error") throw new Error(result.message);
  }


  const createPr = useMutation({
    mutationFn: async (pullRequest: PullRequest) => {
      const existing = findWorkspaceForPullRequest(await listActiveWorkspaces(paseo), pullRequest);
      if (existing) return { workspaceId: existing.id, created: false, labelsError: null };
      const project = projects.find((entry) => entry.projectId === pullRequest.projectId);
      if (!project) throw new Error("That GitHub project is no longer registered.");
      const created = await createPullRequestWorkspace({
        paseo,
        rootPath: project.rootPath,
        number: pullRequest.number,
        title: pullRequest.title,
        onCreated: applyConfiguredWorkspaceLabels,
      });
      return { workspaceId: created.workspaceId, created: true, labelsError: created.labelsError };
    },
    onSuccess: ({ workspaceId, created, labelsError }) => {
      if (created) {
        toast.show("Workspace created", { variant: "success" });
        void queryClient.invalidateQueries({ queryKey: ["pr.workspaces"] });
      }
      if (labelsError) toast.error(labelsError);
      if (!navigation?.openWorkspace) {
        toast.error("Could not open that workspace.");
        return;
      }
      navigation.openWorkspace({ workspaceId });
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
        onCreated: applyConfiguredWorkspaceLabels,
      }),
    onSuccess: ({ workspaceId, labelsError }) => {
      toast.show("Workspace created", { variant: "success" });
      if (labelsError) toast.error(labelsError);
      navigation?.openWorkspace({ workspaceId });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not create a workspace for that repository.");
    },
  });

  const unavailable = statusQuery.data?.kind === "unavailable" ? statusQuery.data : null;
  const listError = listResult?.kind === "unavailable" || listResult?.kind === "error" ? listResult : null;
  const listPending =
    waiting === "me"
      ? listed.length === 0 && attentionPrs.length === 0 && (listQuery.isLoading || attentionQuery.isLoading)
      : listQuery.isLoading;
  const refreshing =
    listQuery.isFetching || attentionQuery.isFetching || projectsQuery.isFetching || statusQuery.isFetching;
  const showTable =
    pane === "inbox" &&
    !statusQuery.isLoading &&
    !projectsQuery.isLoading &&
    !unavailable &&
    projects.length > 0 &&
    !listPending &&
    !listError;

  function refetchAll() {
    void statusQuery.refetch();
    void projectsQuery.refetch();
    void listQuery.refetch();
    void attentionQuery.refetch();
    void workspacesQuery.refetch();
    void settingsQuery.refetch();
  }

  return (
    <View style={styles.screen}>
      {openFilter ? <Pressable style={styles.overlay} onPress={() => setOpenFilter(null)} /> : null}
      <View style={styles.header}>
        <View style={styles.toolbar}>
          <View style={styles.actions}>
            {pane === "settings" || selectedPullRequest ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to pull requests"
                onPress={() => {
                  setPane("inbox");
                  setSelectedPullRequest(null);
                }}
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
              </>
            )}
            {selectedPullRequest && pane !== "settings" ? (
              <>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="View pull request on GitHub"
                  onPress={() => {
                    if (!openHttpsUrl(selectedPullRequest.url, selectedPullRequest.host)) {
                      toast.error("Could not open that pull request on GitHub.");
                    }
                  }}
                  style={styles.actionQuiet}
                >
                  <Icon name="ExternalLink" size={14} color={theme.colors.foreground} />
                  <Text style={styles.actionQuietLabel}>View on GitHub</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    workspaceIds.get(pullRequestWorkspaceKey(selectedPullRequest))
                      ? `Jump to workspace for pull request ${selectedPullRequest.number}`
                      : `Create workspace for pull request ${selectedPullRequest.number}`
                  }
                  onPress={() => createPr.mutate(selectedPullRequest)}
                  style={styles.actionQuiet}
                  disabled={createPr.isPending}
                >
                  <Text style={styles.actionQuietLabel}>
                    {workspaceIds.get(pullRequestWorkspaceKey(selectedPullRequest))
                      ? "Jump to Workspace"
                      : "Create Workspace"}
                  </Text>
                </Pressable>
              </>
            ) : null}
          </View>
          <View style={styles.actions}>
            {pane === "inbox" && !selectedPullRequest && waitingCount > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Reviews awaiting on me"
                onPress={() => setWaiting("me")}
                style={styles.actionOutlined}
              >
                <Text style={styles.actionQuietLabel}>Reviews Awaiting on Me</Text>
                <CountBadge
                  theme={theme}
                  count={waitingCount}
                  accessibilityLabel={`${waitingCount} pull requests waiting on you`}
                />
              </Pressable>
            ) : null}
            {pane !== "settings" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Refresh pull requests"
                onPress={refetchAll}
                disabled={refreshing}
                style={styles.actionQuiet}
              >
                <Icon
                  name="RefreshCw"
                  size={14}
                  color={refreshing ? theme.colors.foregroundMuted : theme.colors.foreground}
                />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={pane === "settings" ? "Close settings" : "Open settings"}
              onPress={() => {
                setOpenFilter(null);
                setSelectedPullRequest(null);
                setPane((current) => (current === "settings" ? "inbox" : "settings"));
              }}
              style={styles.actionQuiet}
            >
              <Icon name="Settings" size={14} color={theme.colors.foregroundMuted} />
              <Text style={styles.actionQuietLabel}>Settings</Text>
            </Pressable>
          </View>
        </View>
        {pane === "inbox" && !selectedPullRequest ? (
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
              label="Awaiting Review"
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
            <View style={styles.searchWrap}>
              <TextInput
                ref={searchInputRef}
                value={search}
                onChangeText={setSearch}
                placeholder="Search"
                placeholderTextColor={theme.colors.foregroundMuted}
                style={styles.search}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Search pull requests"
              />
              <View pointerEvents="none" style={styles.searchIcon}>
                <Icon name="Search" size={14} color={theme.colors.foregroundMuted} />
              </View>
            </View>
          </View>
        ) : null}
      </View>
      {pane === "settings" ? (
        <SettingsPanel theme={theme} compact={layout.compact} onSaved={refetchAll} />
      ) : selectedPullRequest ? (
        <PrShowPanel theme={theme} compact={layout.compact} platform={layout.platform} pullRequest={selectedPullRequest} />
      ) : statusQuery.isLoading || projectsQuery.isLoading ? (
        <PrTableSkeleton theme={theme} compact={layout.compact} />
      ) : unavailable ? (
        <View style={styles.empty}>
          <Text style={styles.danger}>
            {unavailable.reason === "missing"
              ? "GitHub CLI is not installed on this machine."
              : "GitHub CLI is not authenticated."}
          </Text>
          <Text style={styles.muted}>{unavailable.message}</Text>
        </View>
      ) : projectsQuery.isError ? (
        <View style={styles.empty}>
          <Text style={styles.danger}>Could not load GitHub projects.</Text>
          <Text style={styles.muted}>
            {projectsQuery.error instanceof Error ? projectsQuery.error.message : "The plugin failed to list registered projects."}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry loading GitHub projects" onPress={refetchAll} style={styles.actionQuiet}>
            <Text style={styles.actionQuietLabel}>Try again</Text>
          </Pressable>
        </View>
      ) : projects.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.muted}>
            No registered Paseo projects resolve to a GitHub remote. Add a GitHub checkout as a project, then reopen this
            surface.
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry loading GitHub projects" onPress={refetchAll} style={styles.actionQuiet}>
            <Text style={styles.actionQuietLabel}>Try again</Text>
          </Pressable>
        </View>
      ) : listPending ? (
        <PrTableSkeleton theme={theme} compact={layout.compact} />
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
          workspaceIdFor={(pullRequest) => workspaceIds.get(pullRequestWorkspaceKey(pullRequest)) ?? null}
          onShow={setSelectedPullRequest}
          onOpenWorkspace={(pullRequest) => createPr.mutate(pullRequest)}
        />
      ) : null}
    </View>
  );
}
