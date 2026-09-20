import React, { useState, useEffect, useMemo } from 'react';
import { ScannedSkill, SupportedAgent } from '../types/agent';
import { CatalogSkill } from '../types/catalog';
import { SKILLS_CATALOG } from '../data/skillsCatalog';
import { 
  Sparkles, 
  Bot, 
  Terminal, 
  Boxes, 
  Server, 
  Cpu, 
  Compass, 
  FileCode2, 
  BookOpen, 
  Package,
  Layers,
  Download,
  Trash2,
  CheckCircle2,
  Globe,
  Loader2,
  Filter,
  FolderOpen,
  RefreshCw,
  ArrowRightLeft
} from 'lucide-react';
import { logActivity } from '../services/activityLogger';
import { ForgeSkillModal } from './ForgeSkillModal';
import { TransferSkillsModal } from './TransferSkillsModal';

interface SkillsViewProps {
  skills: ScannedSkill[];
  selectedAgents: SupportedAgent[];
  allAgents?: SupportedAgent[];
  skillsCatalog?: CatalogSkill[];
  isSyncingCatalog?: boolean;
  onSyncCatalog?: () => Promise<void>;
  catalogSyncedAt?: string | null;
  onImportSkill?: () => void;
  onRefreshCapabilities?: () => Promise<void>;
  searchQuery?: string;
  highlightedId?: string | null;
}

const AGENT_ICON_MAP: Record<string, React.ElementType> = {
  Sparkles,
  Bot,
  Terminal,
  Cpu,
  Boxes,
  Compass,
  Server,
  Layers,
};

type SegmentTab = 'all' | 'installed' | 'available';

interface UnifiedSkillCard {
  id: string; // folderName or slug
  name: string;
  description: string;
  category?: string;
  author?: string;
  tags?: string[];
  rawUrl?: string;
  sourceRepo?: string;
  isCatalog: boolean;
  installedAgents: SupportedAgent[];
  hasScripts?: boolean;
  hasReferences?: boolean;
  pluginName?: string;
  localPath?: string;
}

const EMPTY_AGENTS: SupportedAgent[] = [];

// Static WeakMap cache for catalog search strings so they are computed once across entire session
const catalogSearchCache = new WeakMap<CatalogSkill, string>();

function getCatalogSearchString(cat: CatalogSkill): string {
  let cached = catalogSearchCache.get(cat);
  if (!cached) {
    cached = `${cat.name} ${cat.description} ${cat.category || ''} ${cat.author || ''} ${(cat.tags || []).join(' ')}`.toLowerCase();
    catalogSearchCache.set(cat, cached);
  }
  return cached;
}

export const SkillsView: React.FC<SkillsViewProps> = ({
  skills,
  selectedAgents,
  allAgents,
  skillsCatalog,
  isSyncingCatalog = false,
  onSyncCatalog,
  catalogSyncedAt,
  onImportSkill,
  onRefreshCapabilities,
  searchQuery = '',
  highlightedId,
}) => {
  const [activeSegment, setActiveSegment] = useState<SegmentTab>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [visibleCount, setVisibleCount] = useState(48);
  const [loadingSkillId, setLoadingSkillId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isForgeModalOpen, setIsForgeModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferSourceAgentId, setTransferSourceAgentId] = useState<string | undefined>();
  const [transferSkillSlug, setTransferSkillSlug] = useState<string | undefined>();
  const [transferSelectedSlugs, setTransferSelectedSlugs] = useState<string[] | undefined>();

  const activeSkillsCatalog = skillsCatalog || SKILLS_CATALOG;

  // Clear action message after 3 seconds
  useEffect(() => {
    if (actionMessage) {
      const timer = setTimeout(() => setActionMessage(null), 3200);
      return () => clearTimeout(timer);
    }
  }, [actionMessage]);

  // Unified list of all skills (scanned local skills + remote catalog skills) in a single high-speed pass
  const { unifiedSkills, indexedSkills, categories, counts } = useMemo(() => {
    // 1. Build an O(1) lookup Map from local standalone skills for selected agents
    // Key: lowercased folderName / skill slug
    const installedMap = new Map<string, {
      installedAgents: SupportedAgent[];
      localMatch?: ScannedSkill;
    }>();

    for (let i = 0; i < skills.length; i++) {
      const s = skills[i];
      // Exclude plugin-bundled skills from being falsely marked as installed standalone agent skills
      if (s.pluginName) continue;

      const agent = selectedAgents.find((a) => a.id === s.sourceAgentId);
      if (!agent) continue;

      const k1 = (s.folderName || s.id || '').toLowerCase().trim();
      if (!k1) continue;

      let entry = installedMap.get(k1);
      if (!entry) {
        entry = { installedAgents: [], localMatch: s };
        installedMap.set(k1, entry);
      }
      if (!entry.installedAgents.some((a) => a.id === agent.id)) {
        entry.installedAgents.push(agent);
      }
    }

    const list: UnifiedSkillCard[] = [];
    const indexed: { item: UnifiedSkillCard; searchStr: string }[] = [];
    const processedFolderNames = new Set<string>();
    const categorySet = new Set<string>();

    let installedCount = 0;
    let availableCount = 0;
    const selectedCount = selectedAgents.length;

    // 2. Process all catalog skills with O(1) Map lookups & cached search strings
    for (let i = 0; i < activeSkillsCatalog.length; i++) {
      const cat = activeSkillsCatalog[i];
      const catIdLower = cat.id.toLowerCase();
      processedFolderNames.add(catIdLower);

      // Strict lookup by catalog slug ID only (prevent loose name false positives)
      const entry = installedMap.get(catIdLower);
      const installedAgents = entry ? entry.installedAgents : EMPTY_AGENTS;
      const localMatch = entry?.localMatch;

      const card: UnifiedSkillCard = {
        id: cat.id,
        name: cat.name,
        description: cat.description,
        category: cat.category,
        author: cat.author,
        tags: cat.tags,
        rawUrl: cat.rawUrl,
        sourceRepo: cat.sourceRepo,
        isCatalog: true,
        installedAgents,
        hasScripts: localMatch?.hasScripts,
        hasReferences: localMatch?.hasReferences,
        pluginName: localMatch?.pluginName,
        localPath: localMatch?.sourcePath,
      };

      list.push(card);

      const baseSearch = getCatalogSearchString(cat);
      const searchStr = localMatch?.pluginName ? `${baseSearch} ${localMatch.pluginName.toLowerCase()}` : baseSearch;
      indexed.push({ item: card, searchStr });

      if (cat.category) {
        categorySet.add(cat.category);
      }

      if (installedAgents.length > 0) {
        installedCount++;
      }
      if (installedAgents.length < selectedCount) {
        availableCount++;
      }
    }

    // 3. Process local scanned skills that aren't in catalog
    for (let i = 0; i < skills.length; i++) {
      const s = skills[i];
      if (s.pluginName) continue;
      const folder = (s.folderName || s.name || s.id).toLowerCase().trim();
      if (!processedFolderNames.has(folder)) {
        processedFolderNames.add(folder);
        const entry = installedMap.get(folder);
        const installedAgents = entry ? entry.installedAgents : EMPTY_AGENTS;

        const card: UnifiedSkillCard = {
          id: s.folderName || s.id,
          name: s.name,
          description: s.description,
          category: 'Local Extension',
          author: 'Local',
          isCatalog: false,
          installedAgents,
          hasScripts: s.hasScripts,
          hasReferences: s.hasReferences,
          pluginName: s.pluginName,
          localPath: s.sourcePath,
        };

        list.push(card);
        const searchStr = `${card.name} ${card.description} local extension local`.toLowerCase();
        indexed.push({ item: card, searchStr });

        categorySet.add('Local Extension');

        if (installedAgents.length > 0) {
          installedCount++;
        }
      }
    }

    return {
      unifiedSkills: list,
      indexedSkills: indexed,
      categories: ['All', ...Array.from(categorySet)],
      counts: {
        all: list.length,
        installed: installedCount,
        available: availableCount,
      },
    };
  }, [skills, selectedAgents, activeSkillsCatalog]);

  // Filtered skills by segment, category, and search query (single pass, zero multi-array churn)
  const filteredSkills = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const isInstalledOnly = activeSegment === 'installed';
    const isAvailableOnly = activeSegment === 'available';
    const hasCategory = selectedCategory !== 'All';
    const selectedCount = selectedAgents.length;

    // Fast-path: if no filters active, return list directly with zero allocation
    if (!q && activeSegment === 'all' && !hasCategory) {
      return unifiedSkills;
    }

    const matched: UnifiedSkillCard[] = [];
    for (let i = 0; i < indexedSkills.length; i++) {
      const entry = indexedSkills[i];
      const item = entry.item;

      if (isInstalledOnly && item.installedAgents.length === 0) continue;
      if (isAvailableOnly && (!item.isCatalog || item.installedAgents.length >= selectedCount)) continue;
      if (hasCategory && item.category !== selectedCategory) continue;
      if (q && !entry.searchStr.includes(q)) continue;

      matched.push(item);
    }
    return matched;
  }, [unifiedSkills, indexedSkills, activeSegment, selectedCategory, searchQuery, selectedAgents.length]);

  // Reset pagination on query or segment change
  useEffect(() => {
    setVisibleCount(48);
  }, [searchQuery, activeSegment, selectedCategory]);

  // Scroll into view if an item is highlighted
  useEffect(() => {
    if (highlightedId) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`skill-card-${highlightedId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [highlightedId]);

  // Multi-Agent 1-Click Install Handler: Downloads once, installs to all target agents
  const handleInstallSkill = async (skill: UnifiedSkillCard) => {
    if (!skill.rawUrl || !window.electronAPI?.installSkill) return;

    // Determine target agents: install on all selected agents that do not have it yet
    const targetAgents = selectedAgents.filter(
      (agent) => !skill.installedAgents.some((inst) => inst.id === agent.id)
    );

    if (targetAgents.length === 0) return;

    setLoadingSkillId(skill.id);
    try {
      const res = await window.electronAPI.installSkill({
        skillId: skill.id,
        rawUrl: skill.rawUrl,
        targets: targetAgents.map((a) => ({
          agentId: a.id,
          skillsDir: a.paths.skillsDir,
        })),
      });

      if (res.success) {
        setActionMessage(`Installed "${skill.name}" on ${targetAgents.map((a) => a.name).join(', ')}`);
        logActivity({
          type: 'SKILL',
          title: 'Skill Installed',
          description: `Installed "${skill.name}" on ${targetAgents.map((a) => a.name).join(', ')}`,
          status: 'success',
        });
        if (onRefreshCapabilities) {
          await onRefreshCapabilities();
        }
      } else {
        setActionMessage(`Error: ${res.error || 'Failed to install skill'}`);
        logActivity({
          type: 'SKILL',
          title: 'Install Failed',
          description: `Failed to install "${skill.name}": ${res.error || 'Unknown error'}`,
          status: 'error',
        });
      }
    } catch (err: any) {
      setActionMessage(`Error: ${err.message || 'Installation failed'}`);
      logActivity({
        type: 'SKILL',
        title: 'Install Error',
        description: `Error installing "${skill.name}": ${err.message || 'Unknown error'}`,
        status: 'error',
      });
    } finally {
      setLoadingSkillId(null);
    }
  };

  // 1-Click Uninstall Handler: Removes skill from selected agents
  const handleUninstallSkill = async (skill: UnifiedSkillCard) => {
    if (!window.electronAPI?.uninstallSkill) return;

    const targetAgents = skill.installedAgents.filter((agent) =>
      selectedAgents.some((sel) => sel.id === agent.id)
    );

    if (targetAgents.length === 0) return;

    setLoadingSkillId(skill.id);
    try {
      const res = await window.electronAPI.uninstallSkill({
        skillId: skill.id,
        targets: targetAgents.map((a) => ({
          agentId: a.id,
          skillsDir: a.paths.skillsDir,
        })),
      });

      if (res.success) {
        setActionMessage(`Uninstalled "${skill.name}" from ${targetAgents.map((a) => a.name).join(', ')}`);
        logActivity({
          type: 'SKILL',
          title: 'Skill Uninstalled',
          description: `Uninstalled "${skill.name}" from ${targetAgents.map((a) => a.name).join(', ')}`,
          status: 'warning',
        });
        if (onRefreshCapabilities) {
          await onRefreshCapabilities();
        }
      } else {
        setActionMessage(`Error: ${res.error || 'Failed to uninstall skill'}`);
        logActivity({
          type: 'SKILL',
          title: 'Uninstall Failed',
          description: `Failed to uninstall "${skill.name}": ${res.error || 'Unknown error'}`,
          status: 'error',
        });
      }
    } catch (err: any) {
      setActionMessage(`Error: ${err.message || 'Uninstall failed'}`);
      logActivity({
        type: 'SKILL',
        title: 'Uninstall Error',
        description: `Error removing "${skill.name}": ${err.message || 'Unknown error'}`,
        status: 'error',
      });
    } finally {
      setLoadingSkillId(null);
    }
  };

  // Open skill folder in system File Explorer
  const handleOpenSkillFolder = (skill: UnifiedSkillCard) => {
    if (!window.electronAPI?.openPath) return;
    if (skill.localPath) {
      window.electronAPI.openPath(skill.localPath);
      return;
    }
    const agent = skill.installedAgents[0];
    if (agent?.paths?.skillsDir) {
      const folder = `${agent.paths.skillsDir}/${skill.id}`;
      window.electronAPI.openPath(folder);
    }
  };

  // Precompute highlighted skill match to avoid array scanning inside the card render loop
  const highlightedSkillMatch = useMemo(() => {
    if (!highlightedId) return null;
    return skills.find((s) => s.id === highlightedId) || null;
  }, [highlightedId, skills]);

  const displayedSkills = useMemo(() => {
    return filteredSkills.slice(0, visibleCount);
  }, [filteredSkills, visibleCount]);

  return (
    <div className="skills-view-container">
      {/* Toast Notification */}
      {actionMessage && (
        <div className="action-toast-banner">
          <CheckCircle2 size={15} />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* View Header with Segmented Filter */}
      <div className="skills-view-header">
        <div className="header-info">
          <div className="title-line">
            <h2 className="view-title">Agent Skills</h2>
            <span className="count-pill font-mono">{skills.length} INSTALLED</span>
            <span className="catalog-pill font-mono">{activeSkillsCatalog.length.toLocaleString()} IN CLOUD CATALOG</span>
            {catalogSyncedAt && (
              <span className="sync-pill font-mono" title={`Synced with AAS: ${new Date(catalogSyncedAt).toLocaleString()}`}>
                <CheckCircle2 size={10} /> AAS SYNCED
              </span>
            )}
          </div>
          <p className="view-desc">
            Browse installed skills across your selected agent(s) or 1-click install from the 2,100+ Agentic Awesome Skills cloud catalog.
          </p>
        </div>

        <div className="header-actions-wrap">
          {/* Segmented Tab Controls on the right */}
          <div className="segmented-controls">
            <button
              className={`segment-btn ${activeSegment === 'all' ? 'active' : ''}`}
              onClick={() => setActiveSegment('all')}
            >
              All <span className="segment-count">{counts.all}</span>
            </button>
            <button
              className={`segment-btn ${activeSegment === 'installed' ? 'active' : ''}`}
              onClick={() => setActiveSegment('installed')}
            >
              Installed <span className="segment-count">{counts.installed}</span>
            </button>
            <button
              className={`segment-btn ${activeSegment === 'available' ? 'active' : ''}`}
              onClick={() => setActiveSegment('available')}
            >
              Available in Catalog <span className="segment-count">{counts.available}</span>
            </button>

            {onSyncCatalog && (
              <>
                <div className="segment-divider" />
                <button
                  className={`segment-sync-btn ${isSyncingCatalog ? 'syncing' : ''}`}
                  onClick={onSyncCatalog}
                  disabled={isSyncingCatalog}
                  title={isSyncingCatalog ? 'Syncing latest skills from GitHub...' : 'Sync latest skills from sickn33/agentic-awesome-skills'}
                  aria-label="Sync Catalog"
                >
                  <RefreshCw size={12} className={isSyncingCatalog ? 'spin' : ''} />
                </button>
              </>
            )}
          </div>

          <div className="header-buttons-row">
            {counts.installed > 0 && (
              <button
                className="transfer-action-btn"
                onClick={() => {
                  setTransferSourceAgentId(undefined);
                  setTransferSkillSlug(undefined);
                  setTransferSelectedSlugs(undefined);
                  setIsTransferModalOpen(true);
                }}
                title="Copy or move skills between your agents"
              >
                <ArrowRightLeft size={12} />
                <span>Transfer Skills</span>
              </button>
            )}

            <button
              className="import-action-btn"
              onClick={() => {
                if (onImportSkill) {
                  onImportSkill();
                } else {
                  setIsForgeModalOpen(true);
                }
              }}
              title="Forge and deploy a custom skill playbook to selected agents"
            >
              <Sparkles size={12} />
              <span>Forge Skill</span>
            </button>
          </div>
        </div>
      </div>

      {/* Category Pills Bar */}
      <div className="category-filter-bar">
        <div className="category-label">
          <Filter size={12} />
          <span>Filter:</span>
        </div>
        <div className="category-pills">
          {categories.map((cat) => (
            <button
              key={cat}
              className={`cat-pill ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Content Grid */}
      {selectedAgents.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-icon-wrap">
            <Bot size={28} />
          </div>
          <div className="empty-title">No Target Agents Selected</div>
          <div className="empty-desc">
            Use the agent selector in the top bar to choose which AI agents you want to inspect or equip with skills.
          </div>
        </div>
      ) : filteredSkills.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-icon-wrap">
            <Sparkles size={28} />
          </div>
          <div className="empty-title">
            {searchQuery ? 'No matching skills found' : 'No skills in this view'}
          </div>
          <div className="empty-desc">
            {searchQuery
              ? `No skills match "${searchQuery}". Try adjusting your search query or filter.`
              : activeSegment === 'installed'
              ? 'No skills are currently installed on your selected agent(s). Switch to "Available in Catalog" to install skills with 1-click.'
              : 'All catalog skills are currently installed on your selected agent(s).'}
          </div>
        </div>
      ) : (
        <>
          <div className="skills-grid">
            {displayedSkills.map((skill) => {
              const isInstalledOnAll =
                selectedAgents.length > 0 && skill.installedAgents.length === selectedAgents.length;
              const isPartiallyInstalled =
                skill.installedAgents.length > 0 && skill.installedAgents.length < selectedAgents.length;
              const isHighlighted =
                highlightedId === skill.id ||
                (highlightedSkillMatch
                  ? highlightedSkillMatch.folderName === skill.id || highlightedSkillMatch.name === skill.name
                  : false);
              const isLoading = loadingSkillId === skill.id;

              return (
                <div
                  key={skill.id}
                  id={`skill-card-${skill.id}`}
                  className={`skill-card ${isHighlighted ? 'item-card-highlighted' : ''}`}
                >
                  {/* Card Header: Icon Avatar + Name/Meta + Status Badge */}
                  <div className="card-header-cluster">
                    <div className="card-header-left">
                      <div className="card-icon-avatar">
                        <Sparkles size={16} />
                      </div>
                      <div className="card-identity-text">
                        <span className="card-item-name" title={skill.name}>{skill.name}</span>
                        <div className="card-sub-meta">
                          {skill.category && (
                            <span className="card-cat-text font-mono">{skill.category}</span>
                          )}
                          {skill.category && skill.author && (
                            <span className="card-meta-dot">·</span>
                          )}
                          {skill.author && (
                            <span className="author-text font-mono">by {skill.author}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="card-header-right">
                      {isInstalledOnAll ? (
                        <span className="status-pill-clean installed font-mono">
                          <span className="status-dot installed" />
                          <span>INSTALLED</span>
                        </span>
                      ) : isPartiallyInstalled ? (
                        <span className="status-pill-clean partial font-mono">
                          <span className="status-dot partial" />
                          <span>PARTIAL ({skill.installedAgents.length}/{selectedAgents.length})</span>
                        </span>
                      ) : (
                        <span className="status-pill-clean available font-mono">
                          <span className="status-dot available" />
                          <span>AVAILABLE</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Body: Description + Equipped Agents */}
                  <div className="card-content-body">
                    <p className="card-description-text">{skill.description}</p>

                    {skill.installedAgents.length > 0 && (
                      <div className="equipped-agents-bar">
                        <span className="equipped-label font-mono">Active in:</span>
                        <div className="equipped-pills-list">
                          {skill.installedAgents.map((ag) => {
                            const AgentIcon = AGENT_ICON_MAP[ag.iconName] || Bot;
                            return (
                              <span
                                key={ag.id}
                                className="agent-pill"
                                style={{
                                  color: ag.color,
                                  borderColor: `${ag.color}40`,
                                  background: `${ag.color}15`,
                                }}
                              >
                                <AgentIcon size={10} />
                                {ag.name}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card Bottom Toolbar: Minimal Metadata Icons (left) + Action Group (right) */}
                  <div className="card-bottom-toolbar">
                    <div className="toolbar-left-chips">
                      {skill.hasScripts && (
                        <span className="meta-subtle-badge font-mono" title="Contains automation scripts">
                          <FileCode2 size={11} />
                          <span>scripts</span>
                        </span>
                      )}
                      {skill.hasReferences && (
                        <span className="meta-subtle-badge font-mono" title="Contains reference docs">
                          <BookOpen size={11} />
                          <span>docs</span>
                        </span>
                      )}
                      {skill.pluginName && (
                        <span className="meta-subtle-badge font-mono" title={`Bundled in ${skill.pluginName}`}>
                          <Package size={11} />
                          <span>{skill.pluginName}</span>
                        </span>
                      )}
                    </div>

                    <div className="toolbar-right-actions">
                      {/* Open Folder Button for Installed Skills */}
                      {skill.installedAgents.length > 0 && (
                        <button
                          type="button"
                          className="card-action-icon-btn"
                          onClick={() => handleOpenSkillFolder(skill)}
                          title="Open local skill folder in File Explorer"
                        >
                          <FolderOpen size={13} />
                        </button>
                      )}

                      {/* Transfer Quick Action for Installed Skills */}
                      {skill.installedAgents.length > 0 && !skill.pluginName && (
                        <button
                          type="button"
                          className="card-action-icon-btn"
                          onClick={() => {
                            setTransferSourceAgentId(skill.installedAgents[0]?.id);
                            setTransferSkillSlug(skill.id);
                            setTransferSelectedSlugs([skill.id]);
                            setIsTransferModalOpen(true);
                          }}
                          title="Transfer or copy this skill to other agents"
                        >
                          <ArrowRightLeft size={13} />
                        </button>
                      )}

                      {/* Source Link */}
                      {skill.sourceRepo && (
                        <button
                          type="button"
                          onClick={() => {
                            const url = `https://github.com/${skill.sourceRepo}/tree/main/skills/${skill.id}`;
                            if (window.electronAPI?.openExternal) {
                              window.electronAPI.openExternal(url);
                            } else {
                              window.open(url, '_blank');
                            }
                          }}
                          className="card-action-icon-btn"
                          title="Open upstream GitHub repository in default browser"
                        >
                          <Globe size={13} />
                        </button>
                      )}

                      {/* Uninstall Button */}
                      {skill.installedAgents.length > 0 && (
                        <button
                          type="button"
                          className="card-action-icon-btn danger"
                          onClick={() => handleUninstallSkill(skill)}
                          disabled={isLoading}
                          title={`Uninstall from ${skill.installedAgents.map((a) => a.name).join(', ')}`}
                        >
                          {isLoading ? (
                            <Loader2 size={12} className="spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </button>
                      )}

                      {/* Install Button */}
                      {(!isInstalledOnAll && skill.isCatalog) && (
                        <button
                          type="button"
                          className="card-primary-action-btn"
                          onClick={() => handleInstallSkill(skill)}
                          disabled={isLoading}
                          title={`Install to ${
                            selectedAgents.length > 1 && isPartiallyInstalled
                              ? 'remaining selected agents'
                              : selectedAgents.map((a) => a.name).join(' & ')
                          }`}
                        >
                          {isLoading ? (
                            <>
                              <Loader2 size={11} className="spin" />
                              <span>Installing...</span>
                            </>
                          ) : (
                            <>
                              <Download size={11} />
                              <span>
                                {isPartiallyInstalled
                                  ? `Install (${selectedAgents.length - skill.installedAgents.length})`
                                  : selectedAgents.length > 1
                                  ? `Install to ${selectedAgents.length}`
                                  : 'Install'}
                              </span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredSkills.length > visibleCount && (
            <div className="load-more-wrap">
              <button
                className="load-more-btn font-mono"
                onClick={() => setVisibleCount((prev) => prev + 48)}
              >
                <span>Show more skills ({displayedSkills.length} of {filteredSkills.length})</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* Forge Custom Skill Authoring Modal */}
      <ForgeSkillModal
        isOpen={isForgeModalOpen}
        onClose={() => setIsForgeModalOpen(false)}
        selectedAgents={selectedAgents}
        onSkillCreated={async (skillName, count) => {
          setActionMessage(`Successfully forged "${skillName}" and deployed to ${count} agent(s)!`);
          if (onRefreshCapabilities) {
            await onRefreshCapabilities();
          }
        }}
      />

      {/* Transfer Skills Modal */}
      <TransferSkillsModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        agents={allAgents && allAgents.length > 0 ? allAgents : selectedAgents}
        skills={skills}
        initialSourceAgentId={transferSourceAgentId}
        initialSkillSlug={transferSkillSlug}
        initialSelectedSlugs={transferSelectedSlugs}
        onSkillsTransferred={async (count, transferMode, targetNames) => {
          setActionMessage(`Successfully ${transferMode === 'move' ? 'moved' : 'copied'} ${count} skill(s) to ${targetNames.join(', ')}!`);
          if (onRefreshCapabilities) {
            await onRefreshCapabilities();
          }
        }}
      />

      <style>{`
        .skills-view-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .action-toast-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.35);
          color: #34d399;
          padding: 10px 16px;
          border-radius: 8px;
          font-size: 12.5px;
          font-weight: 600;
          animation: toastSlideDown 0.2s ease-out;
        }

        @keyframes toastSlideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .skills-view-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          background: #121826;
          border: 1px solid #1e283d;
          border-radius: 10px;
          padding: 14px 20px;
        }

        .header-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
          flex: 1;
        }

        .title-line {
          display: flex;
          align-items: center;
          gap: 9px;
          flex-wrap: wrap;
        }

        .view-title {
          font-size: 16px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0;
        }

        .count-pill {
          font-size: 10px;
          font-weight: 700;
          color: #34d399;
          background: rgba(52, 211, 153, 0.12);
          padding: 2px 7px;
          border-radius: 4px;
          border: 1px solid rgba(52, 211, 153, 0.25);
        }

        .catalog-pill {
          font-size: 10px;
          font-weight: 700;
          color: #c084fc;
          background: rgba(192, 132, 252, 0.12);
          padding: 2px 7px;
          border-radius: 4px;
          border: 1px solid rgba(192, 132, 252, 0.25);
        }

        .sync-pill {
          font-size: 10px;
          font-weight: 700;
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.12);
          padding: 2px 7px;
          border-radius: 4px;
          border: 1px solid rgba(56, 189, 248, 0.25);
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .view-desc {
          font-size: 12px;
          color: #8899ac;
          margin: 0;
        }

        .header-actions-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .header-buttons-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .segment-divider {
          width: 1px;
          height: 14px;
          background: #1c273c;
          margin: 0 2px;
          flex-shrink: 0;
        }

        .segment-sync-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 25px;
          height: 25px;
          padding: 0;
          background: transparent;
          border: none;
          border-radius: 4px;
          color: #8899ac;
          cursor: pointer;
          transition: all 0.15s ease;
          flex-shrink: 0;
          box-sizing: border-box;
        }

        .segment-sync-btn:hover:not(:disabled) {
          background: #141c2c;
          color: #c084fc;
        }

        .segment-sync-btn.syncing {
          color: #a855f7;
        }

        .segment-sync-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .transfer-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(139, 92, 246, 0.1);
          border: 1px solid rgba(168, 85, 247, 0.28);
          color: #c084fc;
          font-size: 11px;
          font-weight: 600;
          padding: 0 10px;
          height: 26px;
          border-radius: 5px;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
          box-sizing: border-box;
        }

        .transfer-action-btn:hover {
          background: rgba(139, 92, 246, 0.18);
          border-color: rgba(168, 85, 247, 0.45);
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(139, 92, 246, 0.25);
        }

        .import-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: linear-gradient(135deg, #8b5cf6, #6d28d9);
          border: 1px solid rgba(168, 85, 247, 0.45);
          color: #ffffff;
          font-size: 11px;
          font-weight: 600;
          padding: 0 10px;
          height: 26px;
          border-radius: 5px;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
          box-sizing: border-box;
          box-shadow: 0 2px 8px rgba(139, 92, 246, 0.25);
        }

        .import-action-btn:hover {
          filter: brightness(1.1);
          box-shadow: 0 3px 12px rgba(139, 92, 246, 0.4);
        }

        .segmented-controls {
          display: flex;
          align-items: center;
          background: #0b0f19;
          border: 1px solid #223048;
          border-radius: 6px;
          padding: 2px;
          gap: 2px;
          box-sizing: border-box;
        }

        .segment-btn {
          background: transparent;
          border: 1px solid transparent;
          color: #8899ac;
          font-size: 11px;
          font-weight: 600;
          padding: 0 9px;
          height: 25px;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          transition: all 0.15s ease;
          white-space: nowrap;
          box-sizing: border-box;
        }

        .segment-btn:hover {
          color: #f1f5f9;
        }

        .segment-btn.active {
          background: rgba(139, 92, 246, 0.16);
          color: #f8fafc;
          border-color: rgba(168, 85, 247, 0.38);
          box-shadow: 0 1px 4px rgba(124, 58, 237, 0.15);
        }

        .segment-btn.active .segment-count {
          background: rgba(168, 85, 247, 0.22);
          color: #e9d5ff;
        }

        .segment-count {
          font-size: 9.5px;
          background: rgba(255, 255, 255, 0.08);
          padding: 1px 5px;
          border-radius: 10px;
          font-family: monospace;
        }

        .category-filter-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #0f1523;
          border: 1px solid #182235;
          padding: 8px 14px;
          border-radius: 8px;
          overflow-x: auto;
        }

        .category-label {
          display: flex;
          align-items: center;
          gap: 5px;
          color: #64748b;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          flex-shrink: 0;
        }

        .category-pills {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: nowrap;
        }

        .cat-pill {
          background: #141c2c;
          border: 1px solid #1f2b42;
          color: #94a3b8;
          font-size: 11px;
          font-weight: 500;
          padding: 3px 10px;
          border-radius: 6px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.12s ease;
        }

        .cat-pill:hover {
          background: #1c263c;
          color: #e2e8f0;
        }

        .cat-pill.active {
          background: rgba(139, 92, 246, 0.15);
          border-color: rgba(168, 85, 247, 0.45);
          color: #f3e8ff;
          font-weight: 600;
        }

        .skills-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 14px;
        }

        .skill-card {
          background: #111726;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 11px;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          min-height: 202px;
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
        }

        .skill-card:hover {
          border-color: rgba(124, 58, 237, 0.35);
          background: #131b2c;
          box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.45);
          transform: translateY(-1px);
        }

        /* Header */
        .card-header-cluster {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 11px;
        }

        .card-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .card-icon-avatar {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: rgba(124, 58, 237, 0.12);
          border: 1px solid rgba(124, 58, 237, 0.25);
          color: #a78bfa;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .card-identity-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .card-item-name {
          font-size: 14px;
          font-weight: 600;
          color: #f8fafc;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          letter-spacing: -0.01em;
        }

        .card-sub-meta {
          display: flex;
          align-items: center;
          gap: 5px;
          min-width: 0;
        }

        .card-cat-text {
          font-size: 10px;
          color: #8fa0b5;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-weight: 600;
        }

        .card-meta-dot {
          color: #3b4d66;
          font-size: 10px;
        }

        .author-text {
          font-size: 10.5px;
          color: #64748b;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .card-header-right {
          flex-shrink: 0;
        }

        .status-pill-clean {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 8px;
          border-radius: 9999px;
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.02em;
        }

        .status-pill-clean.installed {
          color: #34d399;
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.22);
        }

        .status-pill-clean.partial {
          color: #fbbf24;
          background: rgba(245, 158, 11, 0.08);
          border: 1px solid rgba(245, 158, 11, 0.22);
        }

        .status-pill-clean.available {
          color: #c084fc;
          background: rgba(147, 51, 234, 0.1);
          border: 1px solid rgba(147, 51, 234, 0.25);
        }

        .status-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .status-dot.installed {
          background: #10b981;
          box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
        }

        .status-dot.partial {
          background: #f59e0b;
          box-shadow: 0 0 6px rgba(245, 158, 11, 0.6);
        }

        .status-dot.available {
          background: #a855f7;
          box-shadow: 0 0 6px rgba(168, 85, 247, 0.6);
        }

        /* Body */
        .card-content-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 12px;
        }

        .card-description-text {
          font-size: 12px;
          color: #94a3b8;
          line-height: 1.5;
          margin: 0;
          min-height: 36px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .equipped-agents-bar {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(0, 0, 0, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 4px 8px;
          border-radius: 6px;
        }

        .equipped-label {
          font-size: 9.5px;
          color: #64748b;
          font-weight: 600;
          flex-shrink: 0;
        }

        .equipped-pills-list {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
        }

        .agent-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 1.5px 6px;
          border-radius: 4px;
          font-size: 9.5px;
          font-weight: 600;
          border: 1px solid;
        }

        /* Bottom Toolbar */
        .card-bottom-toolbar {
          margin-top: auto;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          padding-top: 11px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .toolbar-left-chips {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-wrap: wrap;
          min-width: 0;
        }

        .meta-subtle-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          color: #72849a;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 2px 6px;
          border-radius: 4px;
        }

        .toolbar-right-actions {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-shrink: 0;
        }

        .card-action-icon-btn {
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #141c2c;
          border: 1px solid #223049;
          color: #8fa0b5;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
          padding: 0;
        }

        .card-action-icon-btn:hover:not(:disabled) {
          background: #1d283e;
          color: #ffffff;
          border-color: #384b6c;
        }

        .card-action-icon-btn.danger {
          color: #f87171;
          border-color: rgba(239, 68, 68, 0.2);
          background: rgba(239, 68, 68, 0.05);
        }

        .card-action-icon-btn.danger:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.18);
          color: #ffffff;
          border-color: rgba(239, 68, 68, 0.45);
        }

        .card-action-icon-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .card-primary-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          height: 28px;
          padding: 0 11px;
          background: linear-gradient(135deg, #8b5cf6, #6d28d9);
          border: 1px solid rgba(168, 85, 247, 0.45);
          color: #ffffff;
          font-size: 11px;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
          box-shadow: 0 2px 8px rgba(139, 92, 246, 0.25);
        }

        .card-primary-action-btn:hover:not(:disabled) {
          filter: brightness(1.1);
          box-shadow: 0 3px 12px rgba(139, 92, 246, 0.4);
          transform: translateY(-0.5px);
        }

        .card-primary-action-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .item-card-highlighted {
          border-color: rgba(192, 132, 252, 0.65) !important;
          background: rgba(192, 132, 252, 0.05) !important;
          box-shadow: 0 0 0 1px rgba(192, 132, 252, 0.4), 0 4px 16px rgba(168, 85, 247, 0.12) !important;
          animation: highlightCardSoft 1.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          z-index: 5;
        }

        @keyframes highlightCardSoft {
          0% {
            border-color: rgba(192, 132, 252, 0.8);
            box-shadow: 0 0 0 1.5px rgba(192, 132, 252, 0.45), 0 4px 16px rgba(168, 85, 247, 0.15);
          }
          60% {
            border-color: rgba(192, 132, 252, 0.5);
            box-shadow: 0 0 0 1px rgba(192, 132, 252, 0.25), 0 2px 8px rgba(168, 85, 247, 0.08);
          }
          100% {
            border-color: #1e283d;
            background: #121826;
            box-shadow: none;
          }
        }

        .load-more-wrap {
          display: flex;
          justify-content: center;
          margin-top: 14px;
        }

        .load-more-btn {
          background: #141324;
          border: 1px solid #2e2348;
          color: #c084fc;
          font-size: 11.5px;
          font-weight: 600;
          padding: 8px 20px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .load-more-btn:hover {
          background: #1e1a38;
          border-color: #4a3875;
          color: #ffffff;
        }
      `}</style>
    </div>
  );
};
