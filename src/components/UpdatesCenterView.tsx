import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  ArrowUpCircle, 
  Check, 
  RefreshCw, 
  ArrowRight, 
  Sparkles, 
  Server, 
  Boxes, 
  AlertCircle, 
  Loader2, 
  Download,
  Search,
  CheckCircle2,
  ExternalLink,
  Bot,
  Info,
  History,
  FileCode,
  Trash2,
  Clock,
  Code2,
  LayoutGrid,
  List as ListIcon,
  X,
} from 'lucide-react';
import { AgentCapabilitiesPayload, SupportedAgent } from '../types/agent';
import { CatalogSkill, CatalogMcpServer, CatalogPlugin } from '../types/catalog';
import { useActivityStream } from '../services/activityLogger';
import { useToast } from '../context/ToastContext';
import { useModalTransition } from '../hooks/useModalTransition';
import { isVersionNewer, isMcpUpdateAvailable } from '../utils/versionUtils';
import { computeLineDiff, DiffResult } from '../utils/diffUtils';
import { 
  getUpdateHistory, 
  saveUpdateRecord, 
  clearUpdateHistory, 
  UpdateHistoryRecord 
} from '../services/updateHistory';

export interface DetailedUpdateItem {
  id: string;
  name: string;
  type: 'SKILL' | 'MCP' | 'PLUGIN';
  category?: string;
  description?: string;
  currentVersion: string;
  newVersion: string;
  size?: string;
  sourceRegistry?: string;
  status: 'pending' | 'updating' | 'updated' | 'error';
  errorMessage?: string;
  targetAgents: SupportedAgent[];
  skillPayload?: {
    skillId: string;
    rawUrl: string;
  };
  mcpPayload?: {
    serverKey: string;
    serverConfig: any;
  };
  pluginPayload?: {
    pluginId: string;
    name?: string;
    version?: string;
    description?: string;
    author?: string;
    bundledSkills?: string[];
    bundledMcps?: string[];
  };
}

export interface UpdatesCenterViewProps {
  capabilities?: AgentCapabilitiesPayload;
  agents?: SupportedAgent[];
  selectedAgents?: SupportedAgent[];
  skillsCatalog?: CatalogSkill[];
  mcpCatalog?: CatalogMcpServer[];
  pluginsCatalog?: CatalogPlugin[];
  onRefreshCapabilities?: () => Promise<void>;
  onSyncCatalog?: () => Promise<void>;
  catalogSyncedAt?: string | null;
}

type TypeFilter = 'all' | 'skill' | 'mcp' | 'plugin';

export const UpdatesCenterView: React.FC<UpdatesCenterViewProps> = ({
  capabilities,
  agents = [],
  selectedAgents = [],
  skillsCatalog = [],
  mcpCatalog = [],
  pluginsCatalog = [],
  onRefreshCapabilities,
  onSyncCatalog,
  catalogSyncedAt,
}) => {
  const { logActivity } = useActivityStream();
  const toast = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<TypeFilter>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('agentforge_view_mode_updates') as 'grid' | 'list') || 'list';
  });

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('agentforge_view_mode_updates', mode);
  };
  const [isChecking, setIsChecking] = useState(false);
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const [activeItemUpdatingId, setActiveItemUpdatingId] = useState<string | null>(null);
  const [currentUpdatingIndex, setCurrentUpdatingIndex] = useState(0);
  const [inspectedTarget, setInspectedTarget] = useState<
    | { type: 'pending'; item: DetailedUpdateItem }
    | { type: 'history'; item: UpdateHistoryRecord }
    | null
  >(null);

  const {
    isRendered: isInspectModalRendered,
    isClosing: isInspectModalClosing,
    handleClose: handleCloseInspectModal,
  } = useModalTransition(
    Boolean(inspectedTarget),
    () => setInspectedTarget(null),
    180
  );

  const lastInspectedTargetRef = useRef<typeof inspectedTarget>(null);
  if (inspectedTarget) {
    lastInspectedTargetRef.current = inspectedTarget;
  }
  const activeInspectedTarget = inspectedTarget || lastInspectedTargetRef.current;

  // Close inspect modal smoothly on Escape key press
  useEffect(() => {
    if (!isInspectModalRendered) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseInspectModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isInspectModalRendered, handleCloseInspectModal]);

  const [activeSection, setActiveSection] = useState<'available' | 'history'>('available');
  const [historyRecords, setHistoryRecords] = useState<UpdateHistoryRecord[]>(() => getUpdateHistory());
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set());
  const [failedItems, setFailedItems] = useState<Map<string, string>>(new Map());

  // Interactive line diff viewer states
  const [activeInspectTab, setActiveInspectTab] = useState<'diff' | 'details'>('diff');
  const [diffFiles, setDiffFiles] = useState<Array<{
    filename: string;
    badge: string;
    diff: DiffResult;
    oldContent: string;
    newContent: string;
  }>>([]);
  const [selectedDiffIndex, setSelectedDiffIndex] = useState(0);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [diffOnlyChanges, setDiffOnlyChanges] = useState(false);

  // Load file-level line diff whenever inspectedTarget opens
  useEffect(() => {
    if (!activeInspectedTarget || !isInspectModalRendered) {
      setDiffFiles([]);
      setSelectedDiffIndex(0);
      setIsLoadingDiff(false);
      return;
    }

    if (!inspectedTarget) {
      // It is currently closing - preserve diffFiles so exit animation is completely seamless
      return;
    }

    let isMounted = true;
    setIsLoadingDiff(true);
    setActiveInspectTab('diff');
    setDiffOnlyChanges(false);

    const loadDiffs = async () => {
      const results: Array<{
        filename: string;
        badge: string;
        diff: DiffResult;
        oldContent: string;
        newContent: string;
      }> = [];

      try {
        if (inspectedTarget.type === 'pending') {
          const item = inspectedTarget.item;
          const primaryAgent = item.targetAgents[0] || (agents && agents[0]);

          if (item.type === 'SKILL' && item.skillPayload) {
            const skillId = item.skillPayload.skillId;
            let localText = '';

            // Read local skill content
            if (primaryAgent && window.electronAPI?.readSkill) {
              try {
                const res = await window.electronAPI.readSkill({
                  skillsDir: primaryAgent.paths.skillsDir,
                  skillId,
                });
                if (res.success && res.content) {
                  localText = res.content;
                }
              } catch {
                // fallback
              }
            }
            if (!localText && primaryAgent && window.electronAPI?.getFileContent) {
              try {
                const filePath = `${primaryAgent.paths.skillsDir}/${skillId}/SKILL.md`;
                const fileRes = await window.electronAPI.getFileContent(filePath);
                if (fileRes.success && fileRes.content) {
                  localText = fileRes.content;
                }
              } catch {
                // ignore
              }
            }

            // Fetch upstream remote skill playbook
            let remoteText = '';
            if (item.skillPayload.rawUrl) {
              try {
                const resp = await fetch(item.skillPayload.rawUrl);
                if (resp.ok) {
                  remoteText = await resp.text();
                }
              } catch (e) {
                console.warn('Failed fetching upstream skill raw content:', e);
              }
            }

            if (!remoteText && !localText) {
              remoteText = `---\nname: ${item.name}\ndescription: ${item.description || 'Skill playbook instructions'}\n---\n\n# ${item.name}\n\n${item.description || 'Instructions and guidelines'}`;
            }

            const diff = computeLineDiff(localText, remoteText);
            results.push({
              filename: `skills/${item.name}/SKILL.md`,
              badge: 'SKILL SPEC',
              diff,
              oldContent: localText,
              newContent: remoteText,
            });
          } else if (item.type === 'MCP' && item.mcpPayload) {
            const serverKey = item.mcpPayload.serverKey;
            let localJson = '';
            let existingConfig: any = null;

            if (primaryAgent && window.electronAPI?.getFileContent) {
              try {
                const res = await window.electronAPI.getFileContent(primaryAgent.paths.mcpConfigPath);
                if (res.success && res.content) {
                  try {
                    const parsed = JSON.parse(res.content);
                    existingConfig = parsed.mcpServers?.[serverKey] || parsed.servers?.[serverKey] || parsed.disabledMcpServers?.[serverKey] || parsed.disabledServers?.[serverKey];
                    if (existingConfig) {
                      localJson = JSON.stringify({ [serverKey]: existingConfig }, null, 2);
                    }
                  } catch {
                    localJson = res.content;
                  }
                }
              } catch {
                // ignore
              }
            }

            // Upstream preview: preserve existing user's env tokens and Windows command wrapper
            // so private credentials are never shown as deleted or missing!
            const upstreamConfig = { ...item.mcpPayload.serverConfig };
            if (existingConfig) {
              if (existingConfig.env || upstreamConfig.env) {
                const previewEnv: Record<string, string> = { ...(upstreamConfig.env || {}) };
                if (existingConfig.env && typeof existingConfig.env === 'object') {
                  for (const [k, v] of Object.entries(existingConfig.env)) {
                    if (v !== undefined && v !== null && (v !== '' || !previewEnv[k])) {
                      previewEnv[k] = v as string;
                    }
                  }
                }
                upstreamConfig.env = previewEnv;
              }
              if (existingConfig.command && upstreamConfig.command) {
                const normOld = existingConfig.command.toLowerCase().replace(/\.(cmd|exe|bat)$/i, '').trim();
                const normNew = upstreamConfig.command.toLowerCase().replace(/\.(cmd|exe|bat)$/i, '').trim();
                if (normOld === normNew) {
                  upstreamConfig.command = existingConfig.command;
                }
              }
            }

            const upstreamJson = JSON.stringify({ [serverKey]: upstreamConfig }, null, 2);
            const diff = computeLineDiff(localJson, upstreamJson);
            results.push({
              filename: 'mcp_config.json',
              badge: 'SERVER CONFIG',
              diff,
              oldContent: localJson,
              newContent: upstreamJson,
            });
          } else if (item.type === 'PLUGIN' && item.pluginPayload) {
            const pluginId = item.pluginPayload.pluginId;

            // 1. plugin.json
            let localManifest = '';
            if (primaryAgent && window.electronAPI?.getFileContent) {
              try {
                const pPath = `${primaryAgent.paths.pluginsDir}/${pluginId}/plugin.json`;
                const res = await window.electronAPI.getFileContent(pPath);
                if (res.success && res.content) {
                  localManifest = res.content;
                }
              } catch {
                // ignore
              }
            }

            const upstreamManifest = JSON.stringify({
              name: item.pluginPayload.name,
              version: item.pluginPayload.version,
              description: item.pluginPayload.description,
              author: item.pluginPayload.author,
              bundledSkills: item.pluginPayload.bundledSkills,
              bundledMcps: item.pluginPayload.bundledMcps,
            }, null, 2);

            results.push({
              filename: 'plugin.json',
              badge: 'MANIFEST',
              diff: computeLineDiff(localManifest, upstreamManifest),
              oldContent: localManifest,
              newContent: upstreamManifest,
            });

            // 2. Bundled skills
            for (const sId of (item.pluginPayload.bundledSkills || []).slice(0, 5)) {
              let localSkill = '';
              if (primaryAgent && window.electronAPI?.getFileContent) {
                try {
                  const sPath = `${primaryAgent.paths.skillsDir}/${sId}/SKILL.md`;
                  const sRes = await window.electronAPI.getFileContent(sPath);
                  if (sRes.success && sRes.content) {
                    localSkill = sRes.content;
                  }
                } catch {}
              }

              const catSkill = skillsCatalog.find(
                (cs) => cs.id.toLowerCase() === sId.toLowerCase() || cs.name.toLowerCase() === sId.toLowerCase()
              );
              let remoteSkill = '';
              if (catSkill?.rawUrl) {
                try {
                  const resp = await fetch(catSkill.rawUrl);
                  if (resp.ok) {
                    remoteSkill = await resp.text();
                  }
                } catch {}
              }
              if (!remoteSkill) {
                remoteSkill = `# ${sId}\n\nBundled skill playbook for ${item.pluginPayload.name}`;
              }

              results.push({
                filename: `skills/${sId}/SKILL.md`,
                badge: 'BUNDLED SKILL',
                diff: computeLineDiff(localSkill, remoteSkill),
                oldContent: localSkill,
                newContent: remoteSkill,
              });
            }
          }
        } else if (inspectedTarget.type === 'history') {
          const rec = inspectedTarget.item;
          for (const filePath of rec.changedFiles.slice(0, 5)) {
            let content = '';
            if (window.electronAPI?.getFileContent) {
              try {
                const res = await window.electronAPI.getFileContent(filePath);
                if (res.success && res.content) {
                  content = res.content;
                }
              } catch {}
            }

            const basename = filePath.split(/[/\\]/).pop() || filePath;
            results.push({
              filename: basename,
              badge: 'APPLIED FILE',
              diff: computeLineDiff('', content),
              oldContent: '',
              newContent: content,
            });
          }
        }
      } catch (err) {
        console.warn('Error computing diffs for inspected target:', err);
      }

      if (isMounted) {
        setDiffFiles(results);
        setSelectedDiffIndex(0);
        setIsLoadingDiff(false);
      }
    };

    loadDiffs();

    return () => {
      isMounted = false;
    };
  }, [inspectedTarget, activeInspectedTarget, isInspectModalRendered, skillsCatalog, mcpCatalog, agents]);

  // Compile updatable items mapped from installed capabilities to catalogs
  const allCandidates = useMemo((): DetailedUpdateItem[] => {
    if (!capabilities || !selectedAgents || selectedAgents.length === 0) return [];

    const effectiveAgents = selectedAgents;

    const candidateMap = new Map<string, DetailedUpdateItem>();

    // 1. Process Skills
    for (const skill of capabilities.skills || []) {
      if (skill.pluginName) continue; // Bundled with plugin
      const agent = effectiveAgents.find((a) => a.id === skill.sourceAgentId);
      if (!agent) continue;

      const normName = (skill.folderName || skill.name || skill.id).toLowerCase().trim();
      const catMatch = skillsCatalog.find((c) =>
        c.id.toLowerCase() === normName || c.name.toLowerCase() === normName
      );

      if (catMatch && catMatch.rawUrl) {
        const itemKey = `skill-${catMatch.id}`;
        let existing = candidateMap.get(itemKey);
        if (!existing) {
          existing = {
            id: itemKey,
            name: catMatch.name,
            type: 'SKILL',
            category: catMatch.category || 'Agent Skill',
            description: catMatch.description,
            currentVersion: skill.disabled ? 'Disabled' : 'Installed',
            newVersion: catMatch.author === 'Addy Osmani' ? 'vLatest (Addy)' : 'vLatest',
            size: catMatch.category || 'Skill Playbook',
            sourceRegistry: catMatch.sourceRegistry || (catMatch.author === 'Addy Osmani' ? 'Addy Osmani' : 'AAS'),
            status: 'pending',
            targetAgents: [],
            skillPayload: {
              skillId: catMatch.id,
              rawUrl: catMatch.rawUrl,
            },
          };
          candidateMap.set(itemKey, existing);
        }
        if (!existing.targetAgents.some((a) => a.id === agent.id)) {
          existing.targetAgents.push(agent);
        }
      }
    }

    // 2. Process MCP Servers
    for (const mcp of capabilities.mcpServers || []) {
      if (mcp.pluginName) continue;
      const agent = effectiveAgents.find((a) => a.id === mcp.sourceAgentId);
      if (!agent) continue;

      const normName = mcp.name.toLowerCase().trim();
      const catMatch = mcpCatalog.find((c) =>
        c.id.toLowerCase() === normName || c.name.toLowerCase() === normName
      );

      if (catMatch && isMcpUpdateAvailable(mcp, catMatch)) {
        const itemKey = `mcp-${catMatch.id}`;
        let existing = candidateMap.get(itemKey);
        if (!existing) {
          existing = {
            id: itemKey,
            name: catMatch.name,
            type: 'MCP',
            category: catMatch.category || 'MCP Server',
            description: catMatch.description,
            currentVersion: mcp.disabled ? 'Disabled' : 'Configured',
            newVersion: 'vLatest',
            size: (catMatch.transport || 'stdio').toUpperCase(),
            sourceRegistry: catMatch.sourceRegistry || 'MCP Catalog',
            status: 'pending',
            targetAgents: [],
            mcpPayload: {
              serverKey: mcp.name,
              serverConfig: {
                command: catMatch.command,
                args: catMatch.args,
                url: catMatch.url,
                transport: catMatch.transport,
                env: catMatch.env,
              },
            },
          };
          candidateMap.set(itemKey, existing);
        }
        if (!existing.targetAgents.some((a) => a.id === agent.id)) {
          existing.targetAgents.push(agent);
        }
      }
    }

    // 3. Process Plugins
    for (const plugin of capabilities.plugins || []) {
      const agent = effectiveAgents.find((a) => a.id === plugin.sourceAgentId);
      if (!agent) continue;

      const normName = (plugin.folderName || plugin.name || plugin.id).toLowerCase().trim();
      const catMatch = pluginsCatalog.find((c) =>
        c.id.toLowerCase() === normName || c.name.toLowerCase() === normName
      );

      // Guard: only treat as an update candidate if catalog version is strictly newer!
      if (catMatch && isVersionNewer(plugin.version, catMatch.version)) {

        const itemKey = `plugin-${catMatch.id}`;
        let existing = candidateMap.get(itemKey);
        if (!existing) {
          existing = {
            id: itemKey,
            name: catMatch.name,
            type: 'PLUGIN',
            category: catMatch.category || 'Plugin Kit',
            description: catMatch.description,
            currentVersion: plugin.version ? `v${plugin.version}` : 'v1.0.0',
            newVersion: catMatch.version ? `v${catMatch.version}` : 'vLatest',
            size: `${(catMatch.bundledSkills || []).length} bundled skills`,
            sourceRegistry: catMatch.sourceRegistry || 'AAS Bundles',
            status: 'pending',
            targetAgents: [],
            pluginPayload: {
              pluginId: catMatch.id,
              name: catMatch.name,
              version: catMatch.version,
              description: catMatch.description,
              author: catMatch.author,
              bundledSkills: catMatch.bundledSkills,
              bundledMcps: catMatch.bundledMcps,
            },
          };
          candidateMap.set(itemKey, existing);
        }
        if (!existing.targetAgents.some((a) => a.id === agent.id)) {
          existing.targetAgents.push(agent);
        }
      }
    }

    return Array.from(candidateMap.values());
  }, [capabilities, selectedAgents, agents, skillsCatalog, mcpCatalog, pluginsCatalog]);

  // Execute update on an individual item
  const executeUpdate = useCallback(async (item: DetailedUpdateItem): Promise<boolean> => {
    try {
      if (item.type === 'SKILL' && item.skillPayload && window.electronAPI?.installSkill) {
        const targets = item.targetAgents.map((a) => ({
          agentId: a.id,
          skillsDir: a.paths.skillsDir,
        }));
        const res = await window.electronAPI.installSkill({
          skillId: item.skillPayload.skillId,
          rawUrl: item.skillPayload.rawUrl,
          targets,
        });
        return Boolean(res.success);
      }

      if (item.type === 'MCP' && item.mcpPayload && window.electronAPI?.installMcp) {
        const targets = item.targetAgents.map((a) => ({
          agentId: a.id,
          mcpConfigPath: a.paths.mcpConfigPath,
        }));
        const res = await window.electronAPI.installMcp({
          serverKey: item.mcpPayload.serverKey,
          serverConfig: item.mcpPayload.serverConfig,
          targets,
        });
        return Boolean(res.success);
      }

      if (item.type === 'PLUGIN' && item.pluginPayload && window.electronAPI?.installPlugin) {
        const targets = item.targetAgents.map((a) => ({
          agentId: a.id,
          pluginsDir: a.paths.pluginsDir,
          skillsDir: a.paths.skillsDir,
          mcpConfigPath: a.paths.mcpConfigPath,
        }));

        const mcpConfigs: Record<string, any> = {};
        for (const mId of item.pluginPayload.bundledMcps || []) {
          const matchedMcp = mcpCatalog.find((m) => m.id === mId || m.name.toLowerCase() === mId.toLowerCase());
          if (matchedMcp) {
            mcpConfigs[matchedMcp.id] = {
              command: matchedMcp.command,
              args: matchedMcp.args,
              url: matchedMcp.url,
              transport: matchedMcp.transport,
              env: matchedMcp.env,
            };
          }
        }

        const skillsToDownload = (item.pluginPayload.bundledSkills || []).map((sId) => {
          const found = skillsCatalog.find((cs) => cs.id === sId || cs.name.toLowerCase() === sId.toLowerCase());
          return {
            skillId: sId,
            rawUrl: found?.rawUrl || '',
          };
        });

        const res = await window.electronAPI.installPlugin({
          pluginId: item.pluginPayload.pluginId,
          name: item.pluginPayload.name,
          version: item.pluginPayload.version,
          description: item.pluginPayload.description,
          author: item.pluginPayload.author,
          bundledSkills: item.pluginPayload.bundledSkills,
          bundledMcps: item.pluginPayload.bundledMcps,
          mcpConfigs,
          skills: skillsToDownload,
          targets,
        });
        return Boolean(res.success);
      }

      return false;
    } catch (err: any) {
      console.warn(`Failed updating ${item.name}:`, err);
      return false;
    }
  }, [mcpCatalog, skillsCatalog]);

  // Helper to record successful updates into persistent localStorage history
  const recordUpdateSuccess = useCallback((item: DetailedUpdateItem) => {
    saveUpdateRecord({
      packageId: item.id,
      packageName: item.name,
      packageType: item.type,
      category: item.category,
      previousVersion: item.currentVersion,
      newVersion: item.newVersion,
      targetAgents: item.targetAgents.map((a) => ({
        id: a.id,
        name: a.name,
        color: a.color,
        path: item.type === 'SKILL' ? a.paths.skillsDir : item.type === 'MCP' ? a.paths.mcpConfigPath : a.paths.pluginsDir,
      })),
      changedFiles: item.type === 'SKILL' 
        ? [`skills/${item.name}/SKILL.md`]
        : item.type === 'MCP'
        ? ['mcp_config.json']
        : ['plugin.json', ...(item.pluginPayload?.bundledSkills || []).map((s) => `skills/${s}/SKILL.md`)],
      summary: `Updated ${item.name} from ${item.currentVersion} to ${item.newVersion}`,
      sourceRegistry: item.sourceRegistry,
      sourceUrl: item.skillPayload?.rawUrl,
      status: 'success',
    });
    setHistoryRecords(getUpdateHistory());
  }, []);

  // Update single item
  const handleUpdateItem = async (item: DetailedUpdateItem) => {
    setActiveItemUpdatingId(item.id);
    const success = await executeUpdate(item);
    setActiveItemUpdatingId(null);

    if (success) {
      setCompletedItems((prev) => new Set(prev).add(item.id));
      setFailedItems((prev) => {
        const next = new Map(prev);
        next.delete(item.id);
        return next;
      });
      recordUpdateSuccess(item);
      toast.success(`Updated "${item.name}" on ${item.targetAgents.map((a) => a.name).join(', ')}`);
      logActivity({
        type: item.type === 'SKILL' ? 'SKILL' : item.type === 'MCP' ? 'MCP' : 'PLUGIN',
        title: 'Package Updated',
        description: `Updated "${item.name}" across ${item.targetAgents.map((a) => a.name).join(', ')}`,
        status: 'success',
      });
      if (onRefreshCapabilities) {
        await onRefreshCapabilities();
      }
    } else {
      setFailedItems((prev) => new Map(prev).set(item.id, 'Update failed'));
      toast.error(`Failed updating "${item.name}"`);
      logActivity({
        type: 'SYSTEM',
        title: 'Update Failed',
        description: `Failed to update "${item.name}" from upstream repository`,
        status: 'error',
      });
    }
  };

  // Fetch / Check Registries
  const handleFetchRegistries = async () => {
    if (selectedAgents.length === 0) {
      toast.info('Select an agent from the top bar to check for updates');
      return;
    }
    setIsChecking(true);
    try {
      if (onSyncCatalog) {
        await onSyncCatalog();
      }
      toast.success(`Ecosystem registries checked · ${allCandidates.length} installed packages verified for ${selectedAgents.map((a) => a.name).join(', ')}`);
    } catch (err: any) {
      toast.error(`Registry sync failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsChecking(false);
    }
  };

  // Update All Packages
  const handleUpdateAll = async () => {
    if (selectedAgents.length === 0) {
      toast.info('Select an agent from the top bar to update');
      return;
    }
    if (allCandidates.length === 0) {
      toast.info('No installed packages to update for the selected agent');
      return;
    }

    setIsUpdatingAll(true);
    setCurrentUpdatingIndex(0);

    let successCount = 0;
    try {
      if (onSyncCatalog) {
        await onSyncCatalog();
      }

      for (let i = 0; i < allCandidates.length; i++) {
        const item = allCandidates[i];
        setCurrentUpdatingIndex(i + 1);
        setActiveItemUpdatingId(item.id);

        const ok = await executeUpdate(item);
        if (ok) {
          successCount++;
          setCompletedItems((prev) => new Set(prev).add(item.id));
          setFailedItems((prev) => {
            const next = new Map(prev);
            next.delete(item.id);
            return next;
          });
          recordUpdateSuccess(item);
        } else {
          setFailedItems((prev) => new Map(prev).set(item.id, 'Update failed'));
        }
      }

      toast.success(`Successfully updated ${successCount} of ${allCandidates.length} packages!`);
      logActivity({
        type: 'SYSTEM',
        title: 'All Packages Upgraded',
        description: `Batch verified and updated ${successCount} packages across active agents`,
        status: 'success',
      });

      if (onRefreshCapabilities) {
        await onRefreshCapabilities();
      }
    } catch (err: any) {
      toast.error(`Batch update encountered an issue: ${err.message || 'Unknown error'}`);
    } finally {
      setIsUpdatingAll(false);
      setActiveItemUpdatingId(null);
    }
  };


  // Filtered & Searched Display List
  const displayedCandidates = useMemo(() => {
    return allCandidates.filter((item) => {
      if (selectedType !== 'all') {
        if (selectedType === 'skill' && item.type !== 'SKILL') return false;
        if (selectedType === 'mcp' && item.type !== 'MCP') return false;
        if (selectedType === 'plugin' && item.type !== 'PLUGIN') return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesCat = item.category?.toLowerCase().includes(q) || false;
        const matchesDesc = item.description?.toLowerCase().includes(q) || false;
        const matchesAgent = item.targetAgents.some((a) => a.name.toLowerCase().includes(q));
        if (!matchesName && !matchesCat && !matchesDesc && !matchesAgent) return false;
      }

      return true;
    });
  }, [allCandidates, selectedType, searchQuery]);

  const skillsCount = allCandidates.filter((c) => c.type === 'SKILL').length;
  const mcpsCount = allCandidates.filter((c) => c.type === 'MCP').length;
  const pluginsCount = allCandidates.filter((c) => c.type === 'PLUGIN').length;
  const pendingCount = allCandidates.filter((c) => !completedItems.has(c.id)).length;

  // Filtered History Records
  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return historyRecords;
    const q = searchQuery.toLowerCase().trim();
    return historyRecords.filter((rec) => {
      const matchName = rec.packageName.toLowerCase().includes(q);
      const matchType = rec.packageType.toLowerCase().includes(q);
      const matchSummary = (rec.summary || '').toLowerCase().includes(q);
      const matchAgent = rec.targetAgents.some((a) => a.name.toLowerCase().includes(q));
      const matchFile = rec.changedFiles.some((f) => f.toLowerCase().includes(q));
      return matchName || matchType || matchSummary || matchAgent || matchFile;
    });
  }, [historyRecords, searchQuery]);

  const historySuccessCount = historyRecords.filter((r) => r.status === 'success').length;
  const historyFailedCount = historyRecords.filter((r) => r.status === 'failed').length;
  const historyAgentsCount = new Set(historyRecords.flatMap((r) => r.targetAgents.map((a) => a.name))).size;

  const renderAvailableCandidateGrid = (item: DetailedUpdateItem) => {
    const ItemIcon = item.type === 'SKILL' ? Sparkles : item.type === 'MCP' ? Server : Boxes;
    const isItemUpdating = activeItemUpdatingId === item.id;
    const isCompleted = completedItems.has(item.id);
    const isFailed = failedItems.has(item.id);

    return (
      <div 
        key={item.id} 
        className={`update-grid-card available-grid-card ${isCompleted ? 'is-completed' : ''} ${isItemUpdating ? 'is-updating' : ''}`}
      >
        <div className="grid-card-header">
          <div className="grid-header-left">
            <div className={`icon-avatar type-${item.type.toLowerCase()}`}>
              <ItemIcon size={16} />
            </div>
            <div className="identity-text-wrap">
              <span className="package-title" title={item.name}>{item.name}</span>
              <div className="meta-badges-row">
                <span className={`type-badge tag-${item.type.toLowerCase()} font-mono`}>
                  {item.type}
                </span>
                {item.sourceRegistry && (
                  <span className="registry-pill font-mono">{item.sourceRegistry}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <p className={`grid-desc-text ${!item.description ? 'empty-desc' : ''}`} title={item.description || 'No update changelog provided.'}>
          {item.description || 'No update changelog provided.'}
        </p>

        <div className="grid-section">
          <span className="col-label font-mono">VERSION DELTA:</span>
          <div className="version-badges-row">
            <span className="ver-pill from font-mono" title={item.currentVersion}>{item.currentVersion}</span>
            <ArrowRight size={11} className="arrow-icon" />
            <span className="ver-pill to font-mono" title={item.newVersion}>{item.newVersion}</span>
          </div>
        </div>

        <div className="grid-section">
          <span className="col-label font-mono">EQUIPPED IN:</span>
          <div className="equipped-agents-list">
            {item.targetAgents.map((ag) => (
              <span
                key={ag.id}
                className="agent-bubble font-mono"
                style={{ color: ag.color, borderColor: `${ag.color}45`, background: `${ag.color}15` }}
                title={ag.name}
              >
                <span className="agent-bubble-name">{ag.name}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="grid-card-footer">
          <button
            type="button"
            className="inspect-btn font-mono"
            onClick={() => setInspectedTarget({ type: 'pending', item })}
            title="Inspect update details and file paths"
          >
            <Info size={12} />
            <span>Inspect</span>
          </button>

          <button
            type="button"
            className={`execute-update-btn ${isCompleted ? 'completed' : isFailed ? 'failed' : ''} font-mono`}
            disabled={isItemUpdating || isCompleted || isUpdatingAll}
            onClick={() => handleUpdateItem(item)}
          >
            {isItemUpdating ? (
              <>
                <Loader2 size={12} className="spin-icon" />
                <span>Updating...</span>
              </>
            ) : isCompleted ? (
              <>
                <Check size={12} />
                <span>Up to Date</span>
              </>
            ) : isFailed ? (
              <>
                <AlertCircle size={12} />
                <span>Retry</span>
              </>
            ) : (
              <>
                <Download size={12} />
                <span>Update</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  const renderHistoryRecordGrid = (rec: UpdateHistoryRecord) => {
    const ItemIcon = rec.packageType === 'SKILL' ? Sparkles : rec.packageType === 'MCP' ? Server : Boxes;

    return (
      <div key={rec.id} className="update-grid-card history-grid-card is-completed">
        <div className="grid-card-header">
          <div className="grid-header-left">
            <div className={`icon-avatar type-${rec.packageType.toLowerCase()}`}>
              <ItemIcon size={16} />
            </div>
            <div className="identity-text-wrap">
              <span className="package-title" title={rec.packageName}>{rec.packageName}</span>
              <div className="meta-badges-row">
                <span className={`type-badge tag-${rec.packageType.toLowerCase()} font-mono`}>
                  {rec.packageType}
                </span>
                <span className={`history-status-badge ${rec.status === 'success' ? 'success' : 'failed'} font-mono`}>
                  {rec.status === 'success' ? 'SUCCESS' : 'FAILED'}
                </span>
              </div>
            </div>
          </div>
          <span className="history-timestamp font-mono">
            <Clock size={10} />
            <span>{rec.timestampFormatted}</span>
          </span>
        </div>

        <p className={`grid-desc-text ${!rec.summary ? 'empty-desc' : ''}`} title={rec.summary || 'Update completed successfully.'}>
          {rec.summary || 'Update completed successfully.'}
        </p>

        <div className="grid-section">
          <span className="col-label font-mono">VERSION DELTA:</span>
          <div className="version-badges-row">
            <span className="ver-pill from font-mono" title={rec.previousVersion}>{rec.previousVersion}</span>
            <ArrowRight size={11} className="arrow-icon" />
            <span className="ver-pill to font-mono" title={rec.newVersion}>{rec.newVersion}</span>
          </div>
        </div>

        <div className="grid-section">
          <span className="col-label font-mono">TARGET AGENTS:</span>
          <div className="equipped-agents-list">
            {rec.targetAgents.map((ag) => (
              <span
                key={ag.id}
                className="agent-bubble font-mono"
                style={{ color: ag.color, borderColor: `${ag.color}45`, background: `${ag.color}15` }}
                title={ag.name}
              >
                <span className="agent-bubble-name">{ag.name}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="grid-section">
          <span className="col-label font-mono">CHANGED FILES ({rec.changedFiles.length}):</span>
          <div className="history-files-chips">
            {rec.changedFiles.slice(0, 2).map((f) => (
              <span key={f} className="history-file-tag font-mono" title={f}>
                <FileCode size={9} />
                <span>{f.length > 28 ? f.slice(0, 26) + '...' : f}</span>
              </span>
            ))}
            {rec.changedFiles.length > 2 && (
              <span className="history-file-tag more font-mono">
                +{rec.changedFiles.length - 2} more
              </span>
            )}
          </div>
        </div>

        <div className="grid-card-footer">
          <button
            type="button"
            className="inspect-btn font-mono"
            onClick={() => setInspectedTarget({ type: 'history', item: rec })}
            title="Inspect detailed files and destination paths"
          >
            <FileCode size={12} />
            <span>Inspect Changes</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="updates-center-container">
      {/* View Header */}
      <div className="updates-center-header">
        <div className="header-identity">
          <div className="header-icon-badge">
            <ArrowUpCircle size={22} className="header-icon" />
          </div>
          <div>
            <div className="title-row">
              <h1 className="header-title">Updates Center</h1>
              <span className={`status-pill ${
                activeSection === 'history'
                  ? 'all-clear'
                  : selectedAgents.length === 0
                  ? 'no-agent'
                  : pendingCount === 0
                  ? 'all-clear'
                  : 'has-pending'
              } font-mono`}>
                {activeSection === 'history'
                  ? `${historyRecords.length} UPDATES LOGGED`
                  : selectedAgents.length === 0
                  ? 'NO AGENT SELECTED'
                  : pendingCount === 0
                  ? 'ALL PACKAGES UP TO DATE'
                  : `${pendingCount} UPDATES AVAILABLE`}
              </span>
            </div>
            <p className="header-subtitle">
              {activeSection === 'history'
                ? 'Audit trail and file-level inspection of package upgrades and synchronizations'
                : selectedAgents.length === 0
                ? 'Select an agent from the top bar to inspect and update its installed capabilities'
                : `Synchronizing capabilities for ${selectedAgents.map((a) => a.name).join(', ')}`}
            </p>
          </div>
        </div>

        <div className="header-action-group">
          {activeSection === 'available' ? (
            <>
              <button
                type="button"
                className="header-btn secondary font-mono"
                onClick={handleFetchRegistries}
                disabled={isChecking || isUpdatingAll}
                title="Sync latest upstream catalog definitions"
              >
                <RefreshCw size={12} className={isChecking ? 'spin-icon' : ''} />
                <span>{isChecking ? 'Checking...' : 'Fetch Registries'}</span>
              </button>

              <button
                type="button"
                className="header-btn primary font-mono"
                onClick={handleUpdateAll}
                disabled={isUpdatingAll || isChecking || allCandidates.length === 0}
                title="Download and update all installed packages from upstream"
              >
                {isUpdatingAll ? (
                  <>
                    <Loader2 size={13} className="spin-icon" />
                    <span>Updating ({currentUpdatingIndex}/{allCandidates.length})</span>
                  </>
                ) : (
                  <>
                    <Download size={13} />
                    <span>Update All Packages ({allCandidates.length})</span>
                  </>
                )}
              </button>
            </>
          ) : (
            historyRecords.length > 0 && (
              <button
                type="button"
                className="header-btn secondary font-mono"
                onClick={() => {
                  clearUpdateHistory();
                  setHistoryRecords([]);
                  toast.info('Update history cleared');
                }}
                title="Clear all recorded update history"
              >
                <Trash2 size={12} />
                <span>Clear History</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Section Switcher Tabs: Available Updates vs Update History */}
      <div className="updates-view-tabs">
        <button
          type="button"
          className={`updates-view-tab ${activeSection === 'available' ? 'active' : ''}`}
          onClick={() => setActiveSection('available')}
        >
          <ArrowUpCircle size={14} />
          <span>Available Updates</span>
          <span className="tab-pill font-mono">{allCandidates.length}</span>
        </button>
        <button
          type="button"
          className={`updates-view-tab ${activeSection === 'history' ? 'active' : ''}`}
          onClick={() => {
            setHistoryRecords(getUpdateHistory());
            setActiveSection('history');
          }}
        >
          <History size={14} />
          <span>Update History & Changes</span>
          <span className="tab-pill font-mono">{historyRecords.length}</span>
        </button>
      </div>

      {activeSection === 'available' ? (
        <>
          {/* Progress Bar when Updating All */}
          {isUpdatingAll && (
            <div className="batch-progress-banner">
              <div className="progress-info-row font-mono">
                <span>Updating package {currentUpdatingIndex} of {allCandidates.length}...</span>
                <span>{Math.round((currentUpdatingIndex / allCandidates.length) * 100)}%</span>
              </div>
              <div className="progress-track">
                <div 
                  className="progress-fill" 
                  style={{ width: `${(currentUpdatingIndex / allCandidates.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Metrics Strip */}
          <div className="updates-metrics-grid">
            <div className="metric-box">
              <span className="metric-label font-mono">PACKAGES MONITORED</span>
              <div className="metric-value font-mono text-cyan">{allCandidates.length}</div>
              <span className="metric-sub font-mono">Skills, MCPs & Plugins</span>
            </div>
            <div className="metric-box">
              <span className="metric-label font-mono">READY TO UPDATE</span>
              <div className="metric-value font-mono text-cyan">{pendingCount}</div>
              <span className="metric-sub font-mono">{completedItems.size} updated this session</span>
            </div>
            <div className="metric-box">
              <span className="metric-label font-mono">ACTIVE TARGET AGENTS</span>
              <div className="metric-value font-mono text-purple">
                {selectedAgents.length}
              </div>
              <span className="metric-sub font-mono">
                {selectedAgents.length === 0
                  ? 'None selected'
                  : selectedAgents.length === 1
                  ? selectedAgents[0].name
                  : `${selectedAgents.length} selected`}
              </span>
            </div>
            <div className="metric-box">
              <span className="metric-label font-mono">REGISTRY STATUS</span>
              <div className="metric-value font-mono text-emerald" style={{ fontSize: '15px', marginTop: '6px' }}>
                Synchronized
              </div>
              <span className="metric-sub font-mono">
                {catalogSyncedAt ? `Synced ${catalogSyncedAt}` : 'Live GitHub Raw'}
              </span>
            </div>
          </div>

          {/* Filter and Search Bar */}
          <div className="updates-toolbar">
            <div className="type-filter-group">
              <button
                type="button"
                className={`type-tab ${selectedType === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedType('all')}
              >
                <span>All Updates</span>
                <span className="tab-count font-mono">{allCandidates.length}</span>
              </button>
              <button
                type="button"
                className={`type-tab ${selectedType === 'skill' ? 'active' : ''}`}
                onClick={() => setSelectedType('skill')}
              >
                <Sparkles size={11} className="tab-icon" style={{ color: '#c084fc' }} />
                <span>Skills</span>
                <span className="tab-count font-mono">{skillsCount}</span>
              </button>
              <button
                type="button"
                className={`type-tab ${selectedType === 'mcp' ? 'active' : ''}`}
                onClick={() => setSelectedType('mcp')}
              >
                <Server size={11} className="tab-icon" style={{ color: '#38bdf8' }} />
                <span>MCP Servers</span>
                <span className="tab-count font-mono">{mcpsCount}</span>
              </button>
              <button
                type="button"
                className={`type-tab ${selectedType === 'plugin' ? 'active' : ''}`}
                onClick={() => setSelectedType('plugin')}
              >
                <Boxes size={11} className="tab-icon" style={{ color: '#818cf8' }} />
                <span>Plugins</span>
                <span className="tab-count font-mono">{pluginsCount}</span>
              </button>
            </div>

            <div className="search-input-wrap">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                className="updates-search-input"
                placeholder="Filter updates by package name, category, or agent..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="view-mode-toggle font-mono" role="group" aria-label="View mode">
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => handleViewModeChange('grid')}
                title="Grid View"
                aria-label="Grid View"
              >
                <LayoutGrid size={13} />
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => handleViewModeChange('list')}
                title="List View"
                aria-label="List View"
              >
                <ListIcon size={13} />
              </button>
            </div>
          </div>

          {/* Updates Cards Container */}
          {displayedCandidates.length > 0 ? (
            viewMode === 'grid' ? (
              <div className="updates-cards-grid">
                {displayedCandidates.map(renderAvailableCandidateGrid)}
              </div>
            ) : (
              <div className="updates-cards-list">
                <div className="updates-list-header available-header font-mono">
                  <span className="list-header-col">PACKAGE & REGISTRY</span>
                  <span className="list-header-col">EQUIPPED IN</span>
                  <span className="list-header-col">VERSION DELTA</span>
                  <span className="list-header-col right">ACTIONS</span>
                </div>
                {displayedCandidates.map((item) => {
                const ItemIcon = item.type === 'SKILL' ? Sparkles : item.type === 'MCP' ? Server : Boxes;
                const isItemUpdating = activeItemUpdatingId === item.id;
                const isCompleted = completedItems.has(item.id);
                const isFailed = failedItems.has(item.id);

                return (
                  <div 
                    key={item.id} 
                    className={`update-row-card available-card ${isCompleted ? 'is-completed' : ''} ${isItemUpdating ? 'is-updating' : ''}`}
                  >
                    {/* Left Identity */}
                    <div className="card-left-identity">
                      <div className={`icon-avatar type-${item.type.toLowerCase()}`}>
                        <ItemIcon size={16} />
                      </div>
                      <div className="identity-text-wrap">
                        <div className="name-row">
                          <span className="package-title" title={item.name}>{item.name}</span>
                          <span className={`type-badge tag-${item.type.toLowerCase()} font-mono`}>
                            {item.type}
                          </span>
                          {item.sourceRegistry && (
                            <span className="registry-pill font-mono">{item.sourceRegistry}</span>
                          )}
                        </div>
                        {item.description && (
                          <p className="package-desc-snippet" title={item.description}>
                            {item.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Center: Agents Equipped */}
                    <div className="card-center-agents">
                      <span className="col-label font-mono">EQUIPPED IN:</span>
                      <div className="equipped-agents-list">
                        {item.targetAgents.map((ag) => (
                          <span
                            key={ag.id}
                            className="agent-bubble font-mono"
                            style={{ color: ag.color, borderColor: `${ag.color}45`, background: `${ag.color}15` }}
                            title={ag.name}
                          >
                            <span className="agent-bubble-name">{ag.name}</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Version Transition */}
                    <div className="card-version-delta">
                      <span className="col-label font-mono">VERSION DELTA:</span>
                      <div className="version-badges-row">
                        <span className="ver-pill from font-mono" title={item.currentVersion}>{item.currentVersion}</span>
                        <ArrowRight size={11} className="arrow-icon" />
                        <span className="ver-pill to font-mono" title={item.newVersion}>{item.newVersion}</span>
                      </div>
                    </div>

                    {/* Right Action */}
                    <div className="card-right-actions">
                      <button
                        type="button"
                        className="inspect-btn font-mono"
                        onClick={() => setInspectedTarget({ type: 'pending', item })}
                        title="Inspect update details and file paths"
                      >
                        <Info size={12} />
                        <span>Inspect</span>
                      </button>

                      <button
                        type="button"
                        className={`execute-update-btn ${isCompleted ? 'completed' : isFailed ? 'failed' : ''} font-mono`}
                        disabled={isItemUpdating || isCompleted || isUpdatingAll}
                        onClick={() => handleUpdateItem(item)}
                      >
                        {isItemUpdating ? (
                          <>
                            <Loader2 size={12} className="spin-icon" />
                            <span>Updating...</span>
                          </>
                        ) : isCompleted ? (
                          <>
                            <Check size={12} />
                            <span>Up to Date</span>
                          </>
                        ) : isFailed ? (
                          <>
                            <AlertCircle size={12} />
                            <span>Retry</span>
                          </>
                        ) : (
                          <>
                            <Download size={12} />
                            <span>Update</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div className="empty-updates-state">
            {selectedAgents.length === 0 ? (
              <>
                <Bot size={36} className="empty-icon text-purple" />
                <h3 className="empty-title">No Agent Selected</h3>
                <p className="empty-subtitle">
                  Select an agent (such as Antigravity, Cursor, Windsurf, or Claude) in the top bar to inspect and update its installed packages.
                </p>
              </>
            ) : (
              <>
                <CheckCircle2 size={36} className="empty-icon text-emerald" />
                <h3 className="empty-title">All Packages Up to Date</h3>
                <p className="empty-subtitle">
                  {searchQuery.trim()
                    ? `No packages match "${searchQuery}". Try adjusting your search query.`
                    : `Every installed skill, MCP server, and plugin kit for ${selectedAgents.map((a) => a.name).join(', ')} is synchronized with its upstream registry source.`}
                </p>
                <button
                  type="button"
                  className="recheck-btn font-mono"
                  onClick={handleFetchRegistries}
                  disabled={isChecking}
                >
                  <RefreshCw size={12} className={isChecking ? 'spin-icon' : ''} />
                  <span>Re-check Registries</span>
                </button>
              </>
            )}
          </div>
        )}
        </>
      ) : (
        /* History & Inspected Changes Section */
        <>
          {/* History Metrics Strip */}
          <div className="updates-metrics-grid">
            <div className="metric-box">
              <span className="metric-label font-mono">TOTAL UPDATES LOGGED</span>
              <div className="metric-value font-mono text-cyan">{historyRecords.length}</div>
              <span className="metric-sub font-mono">Tracked file events</span>
            </div>
            <div className="metric-box">
              <span className="metric-label font-mono">SUCCESSFUL</span>
              <div className="metric-value font-mono text-emerald">{historySuccessCount}</div>
              <span className="metric-sub font-mono">Verified upgrades</span>
            </div>
            <div className="metric-box">
              <span className="metric-label font-mono">FAILED</span>
              <div className="metric-value font-mono" style={{ color: '#f87171' }}>{historyFailedCount}</div>
              <span className="metric-sub font-mono">Encountered errors</span>
            </div>
            <div className="metric-box">
              <span className="metric-label font-mono">AGENTS TOUCHED</span>
              <div className="metric-value font-mono text-purple">{historyAgentsCount}</div>
              <span className="metric-sub font-mono">Integrated agents</span>
            </div>
          </div>

          {/* History Search & Toolbar */}
          <div className="updates-toolbar">
            <div className="search-input-wrap" style={{ flex: 1 }}>
              <Search size={14} className="search-icon" />
              <input
                type="text"
                className="updates-search-input"
                placeholder="Search history by package, agent, or file path..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="view-mode-toggle font-mono" role="group" aria-label="View mode">
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => handleViewModeChange('grid')}
                title="Grid View"
                aria-label="Grid View"
              >
                <LayoutGrid size={13} />
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => handleViewModeChange('list')}
                title="List View"
                aria-label="List View"
              >
                <ListIcon size={13} />
              </button>
            </div>
          </div>

          {/* History Cards List */}
          {filteredHistory.length > 0 ? (
            viewMode === 'grid' ? (
              <div className="updates-cards-grid">
                {filteredHistory.map(renderHistoryRecordGrid)}
              </div>
            ) : (
              <div className="updates-cards-list">
                <div className="updates-list-header history-header font-mono">
                  <span className="list-header-col">PACKAGE & TIMESTAMP</span>
                  <span className="list-header-col">TARGET AGENTS</span>
                  <span className="list-header-col">VERSION DELTA</span>
                  <span className="list-header-col">CHANGED FILES</span>
                  <span className="list-header-col right">AUDIT</span>
                </div>
                {filteredHistory.map((rec) => {
                const ItemIcon = rec.packageType === 'SKILL' ? Sparkles : rec.packageType === 'MCP' ? Server : Boxes;
                return (
                  <div key={rec.id} className="update-row-card history-card is-completed">
                    {/* Left Identity */}
                    <div className="card-left-identity">
                      <div className={`icon-avatar type-${rec.packageType.toLowerCase()}`}>
                        <ItemIcon size={16} />
                      </div>
                      <div className="identity-text-wrap">
                        <div className="name-row">
                          <span className="package-title" title={rec.packageName}>{rec.packageName}</span>
                          <span className={`type-badge tag-${rec.packageType.toLowerCase()} font-mono`}>
                            {rec.packageType}
                          </span>
                          <span className={`history-status-badge ${rec.status === 'success' ? 'success' : 'failed'} font-mono`}>
                            {rec.status === 'success' ? 'SUCCESS' : 'FAILED'}
                          </span>
                          <span className="history-timestamp font-mono">
                            <Clock size={10} />
                            <span>{rec.timestampFormatted}</span>
                          </span>
                        </div>
                        <p className="package-desc-snippet" title={rec.summary}>
                          {rec.summary}
                        </p>
                      </div>
                    </div>

                    {/* Center: Agents Equipped */}
                    <div className="card-center-agents">
                      <span className="col-label font-mono">TARGET AGENTS:</span>
                      <div className="equipped-agents-list">
                        {rec.targetAgents.map((ag) => (
                          <span
                            key={ag.id}
                            className="agent-bubble font-mono"
                            style={{ color: ag.color, borderColor: `${ag.color}45`, background: `${ag.color}15` }}
                            title={ag.name}
                          >
                            <span className="agent-bubble-name">{ag.name}</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Version Transition */}
                    <div className="card-version-delta">
                      <span className="col-label font-mono">VERSION DELTA:</span>
                      <div className="version-badges-row">
                        <span className="ver-pill from font-mono" title={rec.previousVersion}>{rec.previousVersion}</span>
                        <ArrowRight size={11} className="arrow-icon" />
                        <span className="ver-pill to font-mono" title={rec.newVersion}>{rec.newVersion}</span>
                      </div>
                    </div>

                    {/* Changed Files Summary */}
                    <div className="card-files-summary">
                      <span className="col-label font-mono">CHANGED FILES ({rec.changedFiles.length}):</span>
                      <div className="history-files-chips">
                        {rec.changedFiles.slice(0, 2).map((f) => (
                          <span key={f} className="history-file-tag font-mono" title={f}>
                            <FileCode size={9} />
                            <span>{f.length > 28 ? f.slice(0, 26) + '...' : f}</span>
                          </span>
                        ))}
                        {rec.changedFiles.length > 2 && (
                          <span className="history-file-tag more font-mono">
                            +{rec.changedFiles.length - 2} more
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right Action */}
                    <div className="card-right-actions">
                      <button
                        type="button"
                        className="inspect-btn font-mono"
                        onClick={() => setInspectedTarget({ type: 'history', item: rec })}
                        title="Inspect detailed files and destination paths"
                      >
                        <FileCode size={12} />
                        <span>Inspect Changes</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div className="empty-updates-state">
            <History size={36} className="empty-icon text-cyan" />
            <h3 className="empty-title">No Update History Found</h3>
            <p className="empty-subtitle">
              {searchQuery.trim()
                ? `No update history records match "${searchQuery}".`
                : 'Whenever packages are updated from the Updates Center or quick panel, the file diffs, destination paths, and version transitions will appear here for audit inspection.'}
            </p>
          </div>
        )}
        </>
      )}

      {/* Inspect Details Modal (Pending Update or History Record) */}
      {isInspectModalRendered && activeInspectedTarget && createPortal(
        <div
          className={`inspect-modal-overlay ${isInspectModalClosing ? 'is-closing' : ''}`}
          onClick={handleCloseInspectModal}
        >
          <div
            className={`inspect-modal-card ${isInspectModalClosing ? 'is-closing' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title-group">
                <span
                  className={`type-badge tag-${(activeInspectedTarget.type === 'pending'
                    ? activeInspectedTarget.item.type
                    : activeInspectedTarget.item.packageType
                  ).toLowerCase()} font-mono`}
                >
                  {activeInspectedTarget.type === 'pending'
                    ? activeInspectedTarget.item.type
                    : activeInspectedTarget.item.packageType}
                </span>
                <span
                  className={`status-pill ${
                    activeInspectedTarget.type === 'pending'
                      ? 'has-pending'
                      : activeInspectedTarget.item.status === 'success'
                      ? 'all-clear'
                      : 'error'
                  } font-mono`}
                >
                  {activeInspectedTarget.type === 'pending'
                    ? 'PENDING UPGRADE'
                    : activeInspectedTarget.item.status === 'success'
                    ? 'VERIFIED & APPLIED'
                    : 'UPDATE FAILED'}
                </span>
                <h3 className="modal-title font-mono">
                  {activeInspectedTarget.type === 'pending'
                    ? activeInspectedTarget.item.name
                    : activeInspectedTarget.item.packageName}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={handleCloseInspectModal}
                title="Close (Esc)"
                aria-label="Close modal"
              >
                <X size={15} strokeWidth={2} />
              </button>
            </div>

            {/* Modal Navigation Tabs: Changed Lines Diff vs Details */}
            <div className="modal-nav-tabs">
              <button
                type="button"
                className={`modal-nav-tab font-mono ${activeInspectTab === 'diff' ? 'active' : ''}`}
                onClick={() => setActiveInspectTab('diff')}
              >
                <Code2 size={13} />
                <span>Changed Lines & Diff</span>
                {diffFiles.length > 0 && (
                  <span className="tab-diff-count font-mono">
                    {diffFiles.reduce((acc, f) => acc + f.diff.additions + f.diff.deletions, 0)} changes
                  </span>
                )}
              </button>
              <button
                type="button"
                className={`modal-nav-tab font-mono ${activeInspectTab === 'details' ? 'active' : ''}`}
                onClick={() => setActiveInspectTab('details')}
              >
                <Info size={13} />
                <span>Package Info & Paths</span>
              </button>
            </div>

            <div className="modal-body">
              {activeInspectTab === 'diff' ? (
                /* Interactive Line-by-Line Diff Viewer */
                <div className="diff-viewer-container">
                  {isLoadingDiff ? (
                    <div className="diff-loading-box">
                      <Loader2 size={24} className="spin-icon text-cyan" />
                      <span className="diff-loading-text font-mono">
                        Comparing local installation against upstream changes...
                      </span>
                    </div>
                  ) : diffFiles.length === 0 ? (
                    <div className="diff-empty-box font-mono">
                      <FileCode size={24} className="text-muted" />
                      <span>No source diff available for this package</span>
                    </div>
                  ) : (
                    <>
                      {/* Multi-file tab selector if package has multiple files */}
                      {diffFiles.length > 1 && (
                        <div className="diff-file-tabs">
                          {diffFiles.map((file, idx) => (
                            <button
                              key={file.filename}
                              type="button"
                              className={`diff-file-tab font-mono ${selectedDiffIndex === idx ? 'active' : ''}`}
                              onClick={() => setSelectedDiffIndex(idx)}
                            >
                              <FileCode size={11} />
                              <span className="tab-filename">{file.filename}</span>
                              <span className="tab-stats">
                                {file.diff.additions > 0 && (
                                  <span className="stat-add">+{file.diff.additions}</span>
                                )}
                                {file.diff.deletions > 0 && (
                                  <span className="stat-del">-{file.diff.deletions}</span>
                                )}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Diff Toolbar: stats, file path, changes filter */}
                      <div className="diff-controls-bar">
                        <div className="diff-file-meta font-mono">
                          <span className="current-file-badge font-mono">
                            {diffFiles[selectedDiffIndex]?.badge}
                          </span>
                          <span className="current-file-name">
                            {diffFiles[selectedDiffIndex]?.filename}
                          </span>
                        </div>

                        <div className="diff-stats-group font-mono">
                          <span className="diff-stat-pill add">
                            +{diffFiles[selectedDiffIndex]?.diff.additions || 0} additions
                          </span>
                          <span className="diff-stat-pill del">
                            -{diffFiles[selectedDiffIndex]?.diff.deletions || 0} deletions
                          </span>
                          <span className="diff-stat-pill same">
                            {diffFiles[selectedDiffIndex]?.diff.same || 0} unchanged
                          </span>

                          <button
                            type="button"
                            className={`diff-filter-toggle font-mono ${diffOnlyChanges ? 'active' : ''}`}
                            onClick={() => setDiffOnlyChanges((prev) => !prev)}
                            title="Filter out unchanged lines to see only modifications"
                          >
                            <span>{diffOnlyChanges ? 'Showing Changed Only' : 'Show All Lines'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Lines Viewer */}
                      <div className="diff-lines-wrapper font-mono">
                        {(() => {
                          const currentDiff = diffFiles[selectedDiffIndex]?.diff;
                          if (!currentDiff || currentDiff.lines.length === 0) {
                            return (
                              <div className="diff-identical-message">
                                <span>✓ Local installation and upstream target are identical. No lines changed.</span>
                              </div>
                            );
                          }

                          const visibleLines = diffOnlyChanges
                            ? currentDiff.lines.filter((l) => l.type !== 'same')
                            : currentDiff.lines;

                          if (visibleLines.length === 0) {
                            return (
                              <div className="diff-identical-message">
                                <span>No modified lines to display under the current filter.</span>
                              </div>
                            );
                          }

                          return (
                            <div className="diff-lines-table">
                              {visibleLines.map((line, lIdx) => (
                                <div key={lIdx} className={`diff-line-row diff-${line.type}`}>
                                  <span className="line-num old font-mono">
                                    {line.type === 'added' ? '' : line.oldLineNumber || ''}
                                  </span>
                                  <span className="line-num new font-mono">
                                    {line.type === 'removed' ? '' : line.newLineNumber || ''}
                                  </span>
                                  <span className="line-sign font-mono">
                                    {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                                  </span>
                                  <span className="line-content font-mono">{line.content || ' '}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                /* Manifest, Target Agents & File Paths Tab */
                <div className="modal-details-view">
                  {/* Version Transition Box */}
                  <div className="modal-ver-delta-box font-mono">
                    <div className="ver-box-col">
                      <span className="ver-box-sub">
                        {activeInspectedTarget.type === 'pending' ? 'INSTALLED VERSION' : 'PREVIOUS VERSION'}
                      </span>
                      <span className="ver-box-val from">
                        {activeInspectedTarget.type === 'pending'
                          ? activeInspectedTarget.item.currentVersion
                          : activeInspectedTarget.item.previousVersion}
                      </span>
                    </div>
                    <ArrowRight size={14} className="ver-box-arrow" />
                    <div className="ver-box-col">
                      <span className="ver-box-sub">
                        {activeInspectedTarget.type === 'pending' ? 'UPSTREAM TARGET' : 'NEW VERSION'}
                      </span>
                      <span className="ver-box-val to">
                        {activeInspectedTarget.type === 'pending'
                          ? activeInspectedTarget.item.newVersion
                          : activeInspectedTarget.item.newVersion}
                      </span>
                    </div>
                  </div>

                  {/* Timestamp if from history */}
                  {activeInspectedTarget.type === 'history' && (
                    <div className="modal-field">
                      <span className="field-label font-mono">EXECUTION TIMESTAMP:</span>
                      <div className="modal-timestamp font-mono">
                        <Clock size={12} className="text-cyan" />
                        <span>{activeInspectedTarget.item.timestampFormatted}</span>
                      </div>
                    </div>
                  )}

                  {/* Description / Summary */}
                  <div className="modal-field">
                    <span className="field-label font-mono">
                      {activeInspectedTarget.type === 'pending' ? 'DESCRIPTION:' : 'CHANGE SUMMARY:'}
                    </span>
                    <p className="field-value">
                      {activeInspectedTarget.type === 'pending'
                        ? activeInspectedTarget.item.description || 'No description provided'
                        : activeInspectedTarget.item.summary}
                    </p>
                  </div>

                  {/* Exact Files Touched / Modified */}
                  <div className="modal-field">
                    <span className="field-label font-mono">EXACT FILES TOUCHED & PACKAGES:</span>
                    <div className="modal-files-list">
                      {activeInspectedTarget.type === 'pending' ? (
                        <>
                          {activeInspectedTarget.item.type === 'SKILL' && (
                            <div className="modal-file-item font-mono">
                              <FileCode size={13} className="text-purple" />
                              <span className="file-name">skills/{activeInspectedTarget.item.name}/SKILL.md</span>
                              <span className="file-badge font-mono">PLAYBOOK SPEC</span>
                            </div>
                          )}
                          {activeInspectedTarget.item.type === 'MCP' && (
                            <div className="modal-file-item font-mono">
                              <Server size={13} className="text-cyan" />
                              <span className="file-name">mcp_config.json</span>
                              <span className="file-badge font-mono">SERVER CONFIG</span>
                            </div>
                          )}
                          {activeInspectedTarget.item.type === 'PLUGIN' && (
                            <>
                              <div className="modal-file-item font-mono">
                                <Boxes size={13} className="text-indigo" />
                                <span className="file-name">plugin.json</span>
                                <span className="file-badge font-mono">PLUGIN MANIFEST</span>
                              </div>
                              {(activeInspectedTarget.item.pluginPayload?.bundledSkills || []).map((bs) => (
                                <div key={bs} className="modal-file-item font-mono">
                                  <FileCode size={13} className="text-purple" />
                                  <span className="file-name">skills/{bs}/SKILL.md</span>
                                  <span className="file-badge font-mono">BUNDLED SKILL</span>
                                </div>
                              ))}
                              {(activeInspectedTarget.item.pluginPayload?.bundledMcps || []).map((bm) => (
                                <div key={bm} className="modal-file-item font-mono">
                                  <Server size={13} className="text-cyan" />
                                  <span className="file-name">mcp_config.json</span>
                                  <span className="file-badge font-mono">BUNDLED MCP</span>
                                </div>
                              ))}
                            </>
                          )}
                        </>
                      ) : (
                        activeInspectedTarget.item.changedFiles.map((f) => (
                          <div key={f} className="modal-file-item font-mono">
                            <FileCode size={13} className="text-cyan" />
                            <span className="file-name">{f}</span>
                            <span className="file-badge font-mono">MODIFIED</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Target Agents & Real Filepaths on Disk */}
                  <div className="modal-field">
                    <span className="field-label font-mono">TARGET AGENTS & DISK DESTINATIONS:</span>
                    <div className="modal-agent-chips">
                      {activeInspectedTarget.type === 'pending'
                        ? activeInspectedTarget.item.targetAgents.map((ag) => (
                            <div
                              key={ag.id}
                              className="agent-chip-box font-mono"
                              style={{ borderColor: `${ag.color}40` }}
                            >
                              <div className="chip-header">
                                <span className="chip-name" style={{ color: ag.color }}>
                                  {ag.name}
                                </span>
                                <span className="chip-type font-mono">{activeInspectedTarget.item.type}</span>
                              </div>
                              <span className="chip-path font-mono">
                                {activeInspectedTarget.item.type === 'SKILL' && ag.paths.skillsDir}
                                {activeInspectedTarget.item.type === 'MCP' && ag.paths.mcpConfigPath}
                                {activeInspectedTarget.item.type === 'PLUGIN' && ag.paths.pluginsDir}
                              </span>
                            </div>
                          ))
                        : activeInspectedTarget.item.targetAgents.map((ag) => (
                            <div
                              key={ag.id}
                              className="agent-chip-box font-mono"
                              style={{ borderColor: `${ag.color}40` }}
                            >
                              <div className="chip-header">
                                <span className="chip-name" style={{ color: ag.color }}>
                                  {ag.name}
                                </span>
                                <span className="chip-type font-mono">
                                  {activeInspectedTarget.item.packageType}
                                </span>
                              </div>
                              <span className="chip-path font-mono">{ag.path}</span>
                            </div>
                          ))}
                    </div>
                  </div>

                  {/* Upstream Source URL */}
                  {((activeInspectedTarget.type === 'pending' && activeInspectedTarget.item.skillPayload?.rawUrl) ||
                    (activeInspectedTarget.type === 'history' && activeInspectedTarget.item.sourceUrl)) && (
                    <div className="modal-field">
                      <span className="field-label font-mono">UPSTREAM REPOSITORY SOURCE:</span>
                      <a
                        href={
                          activeInspectedTarget.type === 'pending'
                            ? activeInspectedTarget.item.skillPayload?.rawUrl
                            : activeInspectedTarget.item.sourceUrl
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="source-url-link font-mono"
                      >
                        <span>
                          {activeInspectedTarget.type === 'pending'
                            ? activeInspectedTarget.item.skillPayload?.rawUrl
                            : activeInspectedTarget.item.sourceUrl}
                        </span>
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="modal-action-btn secondary font-mono"
                onClick={handleCloseInspectModal}
              >
                Close
              </button>
              {activeInspectedTarget.type === 'pending' && (
                <button
                  type="button"
                  className="modal-action-btn primary font-mono"
                  onClick={() => {
                    const target = activeInspectedTarget.item;
                    handleCloseInspectModal();
                    handleUpdateItem(target);
                  }}
                >
                  Update Now
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}


      <style>{`
        .updates-center-container {
          padding: 24px 28px;
          height: calc(100vh - 48px);
          overflow-y: auto;
          background: #0d111a;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        /* Header */
        .updates-center-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 18px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
          gap: 16px;
          flex-wrap: wrap;
        }

        .header-identity {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .header-icon-badge {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.16), rgba(99, 102, 241, 0.12));
          border: 1px solid rgba(56, 189, 248, 0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 16px rgba(56, 189, 248, 0.15);
          flex-shrink: 0;
        }

        .header-icon {
          color: #38bdf8;
        }

        .title-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .header-title {
          font-size: 20px;
          font-weight: 800;
          color: #f8fafc;
          margin: 0;
          letter-spacing: -0.02em;
        }

        .status-pill {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 4px;
          letter-spacing: 0.04em;
        }

        .status-pill.all-clear {
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.35);
          color: #34d399;
        }

        .status-pill.has-pending {
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.35);
          color: #38bdf8;
        }

        .status-pill.no-agent {
          background: rgba(100, 116, 139, 0.12);
          border: 1px solid rgba(100, 116, 139, 0.3);
          color: #94a3b8;
        }

        .header-subtitle {
          font-size: 12px;
          color: #718298;
          margin: 3px 0 0 0;
        }

        .header-action-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .header-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 7px;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .header-btn.secondary {
          background: #141b2a;
          border: 1px solid #223048;
          color: #94a3b8;
        }

        .header-btn.secondary:hover:not(:disabled) {
          background: #1c273c;
          border-color: #384b6c;
          color: #ffffff;
        }

        .header-btn.primary {
          background: linear-gradient(135deg, #0284c7, #2563eb);
          border: 1px solid rgba(56, 189, 248, 0.45);
          color: #ffffff;
          box-shadow: 0 4px 14px rgba(2, 132, 199, 0.25);
        }

        .header-btn.primary:hover:not(:disabled) {
          background: linear-gradient(135deg, #0369a1, #1d4ed8);
          transform: translateY(-0.5px);
          box-shadow: 0 6px 18px rgba(2, 132, 199, 0.35);
        }

        .header-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Progress Banner */
        .batch-progress-banner {
          background: rgba(56, 189, 248, 0.08);
          border: 1px solid rgba(56, 189, 248, 0.25);
          border-radius: 8px;
          padding: 10px 14px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .progress-info-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
          color: #38bdf8;
          font-weight: 600;
        }

        .progress-track {
          width: 100%;
          height: 6px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 3px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #38bdf8, #6366f1);
          transition: width 0.25s ease;
        }

        /* Metrics Grid */
        .updates-metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }

        .metric-box {
          background: #111726;
          border: 1px solid #1c273e;
          border-radius: 8px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .metric-label {
          font-size: 9.5px;
          color: #64748b;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        .metric-value {
          font-size: 22px;
          font-weight: 800;
          line-height: 1.1;
          margin-top: 2px;
        }

        .metric-sub {
          font-size: 10px;
          color: #55677d;
          margin-top: 2px;
        }

        .text-cyan { color: #38bdf8; }
        .text-purple { color: #c084fc; }
        .text-emerald { color: #34d399; }
        .text-indigo { color: #818cf8; }
        .text-blue { color: #60a5fa; }
        .text-muted { color: #64748b; }

        /* Toolbar */
        .updates-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .type-filter-group {
          display: flex;
          align-items: center;
          gap: 4px;
          background: #101624;
          border: 1px solid #1c263c;
          padding: 3px;
          border-radius: 7px;
        }

        .type-tab {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 10px;
          border-radius: 5px;
          background: transparent;
          border: none;
          color: #8fa0b5;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .type-tab.active {
          background: #1b253b;
          color: #ffffff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }

        .tab-icon {
          flex-shrink: 0;
        }

        .tab-count {
          font-size: 9.5px;
          padding: 1px 5px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.06);
          color: #cbd5e1;
        }

        .search-input-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #111726;
          border: 1px solid #1f2b40;
          padding: 0 12px;
          border-radius: 7px;
          flex: 1;
          max-width: 380px;
          min-width: 240px;
          height: 32px;
        }

        .updates-search-input {
          background: transparent;
          border: none;
          outline: none;
          color: #ffffff;
          font-size: 11.5px;
          width: 100%;
        }

        .updates-search-input::placeholder {
          color: #4f637b;
        }

        .search-icon {
          color: #55677d;
          flex-shrink: 0;
        }

        .view-mode-toggle {
          display: inline-flex;
          align-items: center;
          background: #090d16;
          border: 1px solid #1c263c;
          border-radius: 6px;
          padding: 2px;
          gap: 2px;
        }

        .view-mode-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 24px;
          border-radius: 4px;
          border: none;
          background: transparent;
          color: #64748b;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .view-mode-btn:hover {
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.05);
        }

        .view-mode-btn.active {
          background: #1e293b;
          color: #38bdf8;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
        }

        /* Updates Grid View */
        .updates-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
          gap: 14px;
          padding-bottom: 24px;
        }

        .update-grid-card {
          background: #111726;
          border: 1px solid #1c273e;
          border-radius: 9px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
          box-sizing: border-box;
        }

        .update-grid-card:hover {
          border-color: #2b3a58;
          background: #131b2c;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
        }

        .update-grid-card.is-completed {
          border-color: rgba(16, 185, 129, 0.25);
          background: rgba(16, 185, 129, 0.025);
        }

        .update-grid-card.is-updating {
          border-color: rgba(56, 189, 248, 0.45);
          background: rgba(56, 189, 248, 0.035);
        }

        .grid-card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .grid-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          flex: 1;
        }

        .meta-badges-row {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 3px;
        }

        .grid-desc-text {
          font-size: 11.5px;
          color: #94a3b8;
          line-height: 1.45;
          margin: 0;
          height: 34px;
          min-height: 34px;
          max-height: 34px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .grid-desc-text.empty-desc {
          color: #64748b;
          font-style: italic;
        }

        .grid-section {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .grid-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: auto;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        /* Updates Cards List */
        .updates-cards-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding-bottom: 24px;
        }

        /* List Column Headers */
        .updates-list-header {
          display: grid;
          align-items: center;
          gap: 16px;
          padding: 6px 18px 4px 18px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          user-select: none;
        }

        .updates-list-header.available-header {
          grid-template-columns: minmax(0, 1.9fr) minmax(0, 1.2fr) minmax(0, 2.1fr) 180px;
        }

        .updates-list-header.history-header {
          grid-template-columns: minmax(0, 1.8fr) minmax(0, 1.1fr) minmax(0, 1.8fr) minmax(0, 1.3fr) 130px;
        }

        .list-header-col {
          font-size: 9.5px;
          font-weight: 700;
          color: #55677d;
          letter-spacing: 0.05em;
        }

        .list-header-col.right {
          text-align: right;
        }

        /* Update Cards - Perfect Multi-Column Alignment */
        .update-row-card {
          background: #111726;
          border: 1px solid #1c273e;
          border-radius: 9px;
          padding: 13px 18px;
          align-items: center;
          gap: 16px;
          transition: border-color 0.15s ease, background 0.15s ease;
          box-sizing: border-box;
        }

        .update-row-card.available-card {
          display: grid;
          grid-template-columns: minmax(0, 1.9fr) minmax(0, 1.2fr) minmax(0, 2.1fr) 180px;
        }

        .update-row-card.history-card {
          display: grid;
          grid-template-columns: minmax(0, 1.8fr) minmax(0, 1.1fr) minmax(0, 1.8fr) minmax(0, 1.3fr) 130px;
        }

        .update-row-card:hover {
          border-color: #2b3a58;
          background: #131b2c;
        }

        .update-row-card.is-completed {
          border-color: rgba(16, 185, 129, 0.25);
          background: rgba(16, 185, 129, 0.025);
        }

        .update-row-card.is-updating {
          border-color: rgba(56, 189, 248, 0.45);
          background: rgba(56, 189, 248, 0.035);
        }

        .card-left-identity {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
          overflow: hidden;
        }

        .icon-avatar {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .icon-avatar.type-skill {
          background: rgba(192, 132, 252, 0.12);
          border: 1px solid rgba(192, 132, 252, 0.25);
          color: #c084fc;
        }

        .icon-avatar.type-mcp {
          background: rgba(129, 140, 248, 0.12);
          border: 1px solid rgba(129, 140, 248, 0.25);
          color: #818cf8;
        }

        .icon-avatar.type-plugin {
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.25);
          color: #38bdf8;
        }

        .identity-text-wrap {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 3px;
          overflow: hidden;
        }

        .name-row {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: nowrap;
          min-width: 0;
          max-width: 100%;
          overflow: hidden;
        }

        .package-title {
          font-size: 13.5px;
          font-weight: 700;
          color: #f1f5f9;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
          flex-shrink: 1;
        }

        .type-badge {
          font-size: 8.5px;
          font-weight: 700;
          padding: 1px 5px;
          border-radius: 3px;
          letter-spacing: 0.04em;
          flex-shrink: 0;
        }

        .tag-skill {
          background: rgba(192, 132, 252, 0.15);
          color: #c084fc;
          border: 1px solid rgba(192, 132, 252, 0.3);
        }

        .tag-mcp {
          background: rgba(129, 140, 248, 0.15);
          color: #818cf8;
          border: 1px solid rgba(129, 140, 248, 0.3);
        }

        .tag-plugin {
          background: rgba(56, 189, 248, 0.15);
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.3);
        }

        .registry-pill {
          font-size: 9px;
          color: #64748b;
          background: rgba(255, 255, 255, 0.04);
          padding: 1px 5px;
          border-radius: 3px;
          flex-shrink: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 160px;
        }

        .package-desc-snippet {
          font-size: 11px;
          color: #72849a;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
        }

        /* Center Agents */
        .card-center-agents {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
          overflow: hidden;
        }

        .col-label {
          font-size: 9px;
          color: #55677d;
          font-weight: 600;
          letter-spacing: 0.02em;
        }

        .equipped-agents-list {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-wrap: nowrap;
          overflow: hidden;
        }

        .agent-bubble {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 2.5px 8px;
          border-radius: 4px;
          border: 1px solid;
          font-size: 10px;
          font-weight: 600;
          white-space: nowrap;
          max-width: 170px;
          min-width: 0;
          flex-shrink: 0;
          box-sizing: border-box;
        }

        .agent-bubble-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }

        /* Version Delta */
        .card-version-delta {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
          overflow: hidden;
        }

        .version-badges-row {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: nowrap;
          min-width: 0;
          width: 100%;
          overflow: hidden;
        }

        .ver-pill {
          font-size: 10px;
          padding: 2.5px 8px;
          border-radius: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
          max-width: 170px;
          flex-shrink: 1;
          display: inline-block;
          box-sizing: border-box;
        }

        .ver-pill.from {
          background: rgba(255, 255, 255, 0.04);
          color: #72849a;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .arrow-icon {
          color: #475569;
          flex-shrink: 0;
        }

        .ver-pill.to {
          background: rgba(56, 189, 248, 0.12);
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.3);
          font-weight: 600;
        }

        /* Right Actions */
        .card-right-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          justify-content: flex-end;
          min-width: 0;
          flex-shrink: 0;
        }

        .inspect-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          height: 26px;
          padding: 0 10px;
          background: #141c2c;
          border: 1px solid #223048;
          color: #8da1b8;
          border-radius: 5px;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s ease;
          box-sizing: border-box;
        }

        .inspect-btn:hover {
          background: #1c273e;
          border-color: #384b6c;
          color: #ffffff;
        }

        .execute-update-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          height: 26px;
          padding: 0 12px;
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.4);
          color: #38bdf8;
          border-radius: 5px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          box-shadow: 0 2px 6px rgba(56, 189, 248, 0.12);
          min-width: 95px;
          justify-content: center;
          box-sizing: border-box;
        }

        .execute-update-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #0284c7, #2563eb);
          border-color: rgba(56, 189, 248, 0.6);
          color: #ffffff;
          transform: translateY(-0.5px);
          box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
        }

        .execute-update-btn.completed {
          background: rgba(16, 185, 129, 0.12);
          border-color: rgba(16, 185, 129, 0.35);
          color: #34d399;
          box-shadow: none;
          cursor: default;
        }

        .execute-update-btn.failed {
          background: rgba(239, 68, 68, 0.12);
          border-color: rgba(239, 68, 68, 0.35);
          color: #f87171;
          box-shadow: none;
        }

        .execute-update-btn:disabled {
          opacity: 0.6;
        }

        .spin-icon {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Empty State */
        .empty-updates-state {
          padding: 60px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          background: #111726;
          border: 1px dashed rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          gap: 8px;
        }

        .empty-icon {
          margin-bottom: 6px;
        }

        .empty-title {
          font-size: 16px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0;
        }

        .empty-subtitle {
          font-size: 12px;
          color: #64748b;
          max-width: 440px;
          margin: 0 0 8px 0;
          line-height: 1.45;
        }

        .recheck-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          background: #172033;
          border: 1px solid #283650;
          color: #93c5fd;
          font-size: 11px;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .recheck-btn:hover:not(:disabled) {
          background: #1e2c47;
          border-color: #3b5077;
          color: #ffffff;
        }

        /* Inspect Modal */
        .inspect-modal-overlay {
          position: fixed;
          inset: 0;
          background: radial-gradient(ellipse at 50% 40%, rgba(13, 19, 36, 0.62) 0%, rgba(4, 7, 15, 0.74) 100%);
          backdrop-filter: blur(16px) saturate(180%) contrast(105%);
          -webkit-backdrop-filter: blur(16px) saturate(180%) contrast(105%);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100000;
          padding: 20px;
          box-sizing: border-box;
          animation: modalOverlayFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          will-change: opacity;
        }

        .inspect-modal-overlay.is-closing {
          animation: modalOverlayFadeOut 0.16s cubic-bezier(0.4, 0, 1, 1) forwards !important;
          pointer-events: none !important;
        }

        @keyframes modalOverlayFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes modalOverlayFadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }

        .inspect-modal-card {
          width: 880px;
          max-width: 95vw;
          max-height: 88vh;
          background: #101625;
          border: 1px solid #1f2d45;
          border-radius: 12px;
          box-shadow: 0 24px 50px rgba(0, 0, 0, 0.75);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: modalCardScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          will-change: transform, opacity;
        }

        .inspect-modal-card.is-closing {
          animation: modalCardScaleOut 0.16s cubic-bezier(0.4, 0, 1, 1) forwards !important;
          pointer-events: none !important;
        }

        @keyframes modalCardScaleIn {
          from {
            opacity: 0;
            transform: scale(0.96) translate3d(0, 10px, 0);
          }
          to {
            opacity: 1;
            transform: scale(1) translate3d(0, 0, 0);
          }
        }

        @keyframes modalCardScaleOut {
          from {
            opacity: 1;
            transform: scale(1) translate3d(0, 0, 0);
          }
          to {
            opacity: 0;
            transform: scale(0.96) translate3d(0, 10px, 0);
          }
        }

        .modal-header {
          padding: 14px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          background: #0f1422;
        }

        .modal-title-group {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .modal-title {
          font-size: 14px;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0;
        }

        .modal-close-btn {
          width: 28px;
          height: 28px;
          padding: 0;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          cursor: pointer;
          border-radius: 7px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
          flex-shrink: 0;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
          user-select: none;
        }

        .modal-close-btn:hover {
          color: #f8fafc;
          background: rgba(255, 255, 255, 0.09);
          border-color: rgba(255, 255, 255, 0.18);
          transform: translateY(-0.5px);
        }

        .modal-close-btn:active {
          transform: translateY(0.5px);
          background: rgba(255, 255, 255, 0.14);
        }

        /* Modal Nav Tabs */
        .modal-nav-tabs {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 18px;
          background: #0d121f;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .modal-nav-tab {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border-radius: 6px;
          background: transparent;
          border: 1px solid transparent;
          color: #8da1b8;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .modal-nav-tab:hover {
          background: rgba(255, 255, 255, 0.04);
          color: #ffffff;
        }

        .modal-nav-tab.active {
          background: rgba(56, 189, 248, 0.12);
          border-color: rgba(56, 189, 248, 0.35);
          color: #38bdf8;
        }

        .tab-diff-count {
          font-size: 9px;
          padding: 1px 5px;
          border-radius: 4px;
          background: rgba(56, 189, 248, 0.2);
          color: #bae6fd;
        }

        .modal-body {
          padding: 16px 18px;
          overflow-y: auto;
          flex: 1;
        }

        .modal-details-view {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .modal-field {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .field-label {
          font-size: 9.5px;
          color: #64748b;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        .field-value {
          font-size: 12px;
          color: #cbd5e1;
          margin: 0;
          line-height: 1.45;
        }

        .modal-agent-chips {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .agent-chip-box {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 6px 10px;
          border-radius: 6px;
          border: 1px solid;
          background: rgba(0, 0, 0, 0.2);
        }

        .chip-name {
          font-size: 11px;
          font-weight: 700;
        }

        .chip-path {
          font-size: 9.5px;
          color: #64748b;
          word-break: break-all;
        }

        .source-url-link {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #38bdf8;
          font-size: 11px;
          text-decoration: none;
          word-break: break-all;
        }

        .source-url-link:hover {
          text-decoration: underline;
        }

        .modal-footer {
          padding: 12px 18px;
          background: #0f1422;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
        }

        .modal-action-btn {
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }

        .modal-action-btn.secondary {
          background: #141c2c;
          border: 1px solid #223048;
          color: #94a3b8;
        }

        .modal-action-btn.secondary:hover {
          color: #ffffff;
        }

        .modal-action-btn.primary {
          background: linear-gradient(135deg, #0284c7, #2563eb);
          border: 1px solid rgba(56, 189, 248, 0.4);
          color: #ffffff;
          transition: all 0.15s ease;
        }

        .modal-action-btn.primary:hover {
          background: linear-gradient(135deg, #0369a1, #1d4ed8);
        }

        /* Diff Viewer Styles */
        .diff-viewer-container {
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-height: 340px;
        }

        .diff-loading-box, .diff-empty-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-height: 280px;
          color: #64748b;
          font-size: 12px;
        }

        .diff-file-tabs {
          display: flex;
          align-items: center;
          gap: 6px;
          overflow-x: auto;
          padding-bottom: 2px;
        }

        .diff-file-tab {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 5px;
          background: #0d121f;
          border: 1px solid #1e283d;
          color: #8fa0b5;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }

        .diff-file-tab.active {
          background: #172136;
          border-color: #38bdf8;
          color: #38bdf8;
        }

        .tab-stats {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 9.5px;
        }

        .stat-add { color: #34d399; }
        .stat-del { color: #f87171; }

        .diff-controls-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 10px;
          background: #0b0f19;
          border: 1px solid #1a2336;
          border-radius: 7px;
          gap: 10px;
          flex-wrap: wrap;
        }

        .diff-file-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
        }

        .current-file-badge {
          font-size: 8.5px;
          font-weight: 700;
          padding: 1px 5px;
          border-radius: 3px;
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.25);
          color: #38bdf8;
        }

        .current-file-name {
          color: #f1f5f9;
          font-weight: 600;
        }

        .diff-stats-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .diff-stat-pill {
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 600;
        }

        .diff-stat-pill.add {
          background: rgba(16, 185, 129, 0.12);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.25);
        }

        .diff-stat-pill.del {
          background: rgba(239, 68, 68, 0.12);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.25);
        }

        .diff-stat-pill.same {
          background: rgba(100, 116, 139, 0.12);
          color: #94a3b8;
          border: 1px solid rgba(100, 116, 139, 0.2);
        }

        .diff-filter-toggle {
          background: #141c2c;
          border: 1px solid #223048;
          color: #94a3b8;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 10px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .diff-filter-toggle:hover {
          color: #ffffff;
          border-color: #384b6c;
        }

        .diff-filter-toggle.active {
          background: rgba(56, 189, 248, 0.15);
          border-color: #38bdf8;
          color: #38bdf8;
        }

        .diff-lines-wrapper {
          overflow: auto;
          background: #090d16;
          border: 1px solid #172134;
          border-radius: 7px;
          max-height: 420px;
        }

        .diff-lines-table {
          display: flex;
          flex-direction: column;
          width: 100%;
          min-width: 600px;
        }

        .diff-line-row {
          display: flex;
          align-items: stretch;
          font-size: 11px;
          line-height: 1.5;
          border-bottom: 1px solid rgba(255, 255, 255, 0.02);
        }

        .diff-line-row:hover {
          background: rgba(255, 255, 255, 0.03);
        }

        .diff-line-row.diff-added {
          background: rgba(16, 185, 129, 0.12);
        }

        .diff-line-row.diff-removed {
          background: rgba(239, 68, 68, 0.12);
        }

        .diff-line-row .line-num {
          width: 38px;
          padding: 0 6px;
          text-align: right;
          color: #4b5d73;
          user-select: none;
          flex-shrink: 0;
          border-right: 1px solid rgba(255, 255, 255, 0.05);
          font-size: 10px;
        }

        .diff-line-row.diff-added .line-num.new {
          color: #34d399;
          font-weight: 600;
        }

        .diff-line-row.diff-removed .line-num.old {
          color: #f87171;
          font-weight: 600;
        }

        .diff-line-row .line-sign {
          width: 20px;
          text-align: center;
          font-weight: 700;
          user-select: none;
          flex-shrink: 0;
        }

        .diff-line-row.diff-added .line-sign {
          color: #34d399;
        }

        .diff-line-row.diff-removed .line-sign {
          color: #f87171;
        }

        .diff-line-row .line-content {
          padding: 0 8px;
          white-space: pre-wrap;
          word-break: break-all;
          flex: 1;
          color: #cbd5e1;
        }

        .diff-line-row.diff-added .line-content {
          color: #a7f3d0;
        }

        .diff-line-row.diff-removed .line-content {
          color: #fecaca;
          text-decoration: line-through;
          opacity: 0.85;
        }

        .diff-identical-message {
          padding: 30px;
          text-align: center;
          color: #34d399;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Updates View Tabs */
        .updates-view-tabs {
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
          padding-bottom: 12px;
        }

        .updates-view-tab {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 16px;
          border-radius: 8px;
          background: #111726;
          border: 1px solid #1e293b;
          color: #94a3b8;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .updates-view-tab:hover {
          background: #172136;
          color: #f1f5f9;
          border-color: #334155;
        }

        .updates-view-tab.active {
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(99, 102, 241, 0.1));
          border-color: rgba(56, 189, 248, 0.45);
          color: #38bdf8;
          box-shadow: 0 2px 10px rgba(56, 189, 248, 0.12);
        }

        .tab-pill {
          padding: 1px 6px;
          border-radius: 10px;
          font-size: 10px;
          font-weight: 700;
          background: rgba(255, 255, 255, 0.08);
          color: #cbd5e1;
        }

        .updates-view-tab.active .tab-pill {
          background: rgba(56, 189, 248, 0.25);
          color: #e0f2fe;
        }

        /* History Status Badge */
        .history-status-badge {
          font-size: 9.5px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          letter-spacing: 0.04em;
        }

        .history-status-badge.success {
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.35);
          color: #34d399;
        }

        .history-status-badge.failed {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.35);
          color: #f87171;
        }

        .history-timestamp {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          color: #64748b;
          font-weight: 500;
        }

        /* Changed Files in History Card */
        .card-files-summary {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 170px;
        }

        .history-files-chips {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
        }

        .history-file-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 7px;
          border-radius: 4px;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(56, 189, 248, 0.2);
          color: #7dd3fc;
          font-size: 10px;
        }

        .history-file-tag.more {
          background: rgba(148, 163, 184, 0.1);
          border-color: rgba(148, 163, 184, 0.2);
          color: #94a3b8;
        }

        /* Modal Enhanced Elements */
        .modal-ver-delta-box {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #0d121f;
          border: 1px solid #1e293b;
          border-radius: 8px;
          padding: 10px 14px;
          gap: 12px;
        }

        .ver-box-col {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .ver-box-sub {
          font-size: 9px;
          color: #64748b;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        .ver-box-val {
          font-size: 12px;
          font-weight: 700;
        }

        .ver-box-val.from {
          color: #94a3b8;
        }

        .ver-box-val.to {
          color: #38bdf8;
        }

        .ver-box-arrow {
          color: #38bdf8;
          flex-shrink: 0;
        }

        .modal-timestamp {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: #cbd5e1;
          background: rgba(56, 189, 248, 0.08);
          border: 1px solid rgba(56, 189, 248, 0.2);
          border-radius: 6px;
          padding: 5px 9px;
          width: fit-content;
        }

        .modal-files-list {
          display: flex;
          flex-direction: column;
          gap: 5px;
          max-height: 160px;
          overflow-y: auto;
          background: #0b0f19;
          border: 1px solid #1a2336;
          border-radius: 7px;
          padding: 8px 10px;
        }

        .modal-file-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 6px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.02);
          gap: 8px;
        }

        .modal-file-item .file-name {
          font-size: 11px;
          color: #e2e8f0;
          word-break: break-all;
          flex: 1;
        }

        .modal-file-item .file-badge {
          font-size: 8.5px;
          font-weight: 700;
          padding: 1px 5px;
          border-radius: 3px;
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.25);
          color: #38bdf8;
          white-space: nowrap;
        }

        .chip-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .chip-type {
          font-size: 8.5px;
          color: #64748b;
          font-weight: 700;
        }
      `}</style>

    </div>
  );
};
