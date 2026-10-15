import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Layers,
  Download,
  Trash2,
  CheckCircle2,
  Loader2,
  FolderOpen,
  RefreshCw,
  ArrowRightLeft,
  Filter,
  FileCode2,
  BookOpen,
  Package,
  Globe,
  Check,
  X,
  ChevronDown,
  Edit3,
  AlertCircle,
  Copy,
  Power,
  PowerOff,
} from 'lucide-react';
import { logActivity } from '../services/activityLogger';
import { useToast } from '../context/ToastContext';
import { formatSourceBadge } from '../services/catalogSync';
import { ForgeSkillModal, InitialSkillData } from './ForgeSkillModal';
import { TransferSkillsModal } from './TransferSkillsModal';
import { DependencyReport } from '../types/dependencies';
import { getRequiredDependencies, evaluateDependencyStatus, getInstallSnippetForPlatform } from '../utils/dependencyResolver';
import { DependencyInstallDrawer } from './DependencyInstallDrawer';

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
  activeAgentFilter?: string[];
  onAgentFilterChange?: (agentIds: string[]) => void;
  dependencyReport?: DependencyReport | null;
  onRefreshDependencies?: () => Promise<void>;
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
  id: string;
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
  sourceRegistry?: string;
  license?: string;
  disabledAgentIds?: string[];
  isDisabled?: boolean;
}

const EMPTY_AGENTS: SupportedAgent[] = [];

// Skill search cache - lazily calculated only when user searches
const skillSearchCache = new WeakMap<UnifiedSkillCard, string>();

function getSkillSearchString(card: UnifiedSkillCard): string {
  let cached = skillSearchCache.get(card);
  if (!cached) {
    cached = `${card.name} ${card.description} ${card.category || ''} ${card.author || ''} ${(card.tags || []).join(' ')} ${card.pluginName || ''}`.toLowerCase();
    skillSearchCache.set(card, cached);
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
  activeAgentFilter: propActiveAgentFilter,
  onAgentFilterChange,
  dependencyReport,
  onRefreshDependencies,
}) => {
  const [activeSegment, setActiveSegment] = useState<SegmentTab>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [localAgentFilter, setLocalAgentFilter] = useState<string[]>([]);
  const currentAgentFilter = propActiveAgentFilter !== undefined ? propActiveAgentFilter : localAgentFilter;
  const setAgentFilter = onAgentFilterChange || setLocalAgentFilter;
  const [visibleCount, setVisibleCount] = useState(48);
  const [loadingSkillId, setLoadingSkillId] = useState<string | null>(null);
  const [depDrawerTarget, setDepDrawerTarget] = useState<{
    targetName: string;
    requiredBinaries: string[];
  } | null>(null);
  const [copiedDepKey, setCopiedDepKey] = useState<string | null>(null);
  const [copiedSkillId, setCopiedSkillId] = useState<string | null>(null);
  const [togglingSkillId, setTogglingSkillId] = useState<string | null>(null);
  const toast = useToast();

  const handleCopyMissingDep = async (key: string, binary: string) => {
    try {
      const snippet = getInstallSnippetForPlatform(binary);
      await navigator.clipboard.writeText(snippet);
      setCopiedDepKey(key);
      toast.success(`Copied install command: "${snippet}"`);
      setTimeout(() => setCopiedDepKey(null), 2000);
    } catch {
      toast.error('Failed to copy install command');
    }
  };

  const handleCopySkillCommand = async (skill: UnifiedSkillCard) => {
    try {
      const command = skill.rawUrl
        ? `npx skills add ${skill.rawUrl}`
        : `npx skills add ${skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      await navigator.clipboard.writeText(command);
      setCopiedSkillId(skill.id);
      toast.success(`Copied skill command: "${command}"`);
      setTimeout(() => setCopiedSkillId(null), 2000);
    } catch {
      toast.error('Failed to copy skill command');
    }
  };
  const [isForgeModalOpen, setIsForgeModalOpen] = useState(false);
  const [forgeModalMode, setForgeModalMode] = useState<'create' | 'edit'>('create');
  const [editingSkillData, setEditingSkillData] = useState<InitialSkillData | null>(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferSourceAgentId, setTransferSourceAgentId] = useState<string | undefined>();
  const [transferSkillSlug, setTransferSkillSlug] = useState<string | undefined>();
  const [transferSelectedSlugs, setTransferSelectedSlugs] = useState<string[] | undefined>();
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
  const agentMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (agentMenuRef.current && !agentMenuRef.current.contains(e.target as Node)) {
        setIsAgentMenuOpen(false);
      }
    };
    if (isAgentMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isAgentMenuOpen]);

  const activeSkillsCatalog = skillsCatalog || SKILLS_CATALOG;

  // Data Processing
  const { unifiedSkills, categories, counts } = useMemo(() => {
    const installedMap = new Map<string, {
      installedAgents: SupportedAgent[];
      disabledAgentIds: string[];
      localMatch?: ScannedSkill;
    }>();

    for (let i = 0; i < skills.length; i++) {
      const s = skills[i];
      // Skip plugin-bundled skills
      if (s.pluginName) continue;

      const agent = selectedAgents.find((a) => a.id === s.sourceAgentId);
      if (!agent) continue;

      const k1 = (s.folderName || s.id || '').toLowerCase().trim();
      if (!k1) continue;

      let entry = installedMap.get(k1);
      if (!entry) {
        entry = { installedAgents: [], disabledAgentIds: [], localMatch: s };
        installedMap.set(k1, entry);
      }
      if (!entry.installedAgents.some((a) => a.id === agent.id)) {
        entry.installedAgents.push(agent);
      }
      if (s.disabled && !entry.disabledAgentIds.includes(agent.id)) {
        entry.disabledAgentIds.push(agent.id);
      }
    }

    const list: UnifiedSkillCard[] = [];
    const processedFolderNames = new Set<string>();
    const categorySet = new Set<string>();

    let installedCount = 0;
    let availableCount = 0;
    const selectedCount = selectedAgents.length;

    for (let i = 0; i < activeSkillsCatalog.length; i++) {
      const cat = activeSkillsCatalog[i];
      const catIdLower = cat.id.toLowerCase();
      processedFolderNames.add(catIdLower);

      const entry = installedMap.get(catIdLower);
      const installedAgents = entry ? entry.installedAgents : EMPTY_AGENTS;
      const disabledAgentIds = entry ? entry.disabledAgentIds : [];
      const isDisabled = installedAgents.length > 0 && disabledAgentIds.length >= installedAgents.length;
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
        sourceRegistry: cat.sourceRegistry || (cat.author === 'Addy Osmani' ? 'Addy Osmani' : 'AAS'),
        license: cat.license || 'MIT',
        isCatalog: true,
        installedAgents,
        disabledAgentIds,
        isDisabled,
        hasScripts: localMatch?.hasScripts,
        hasReferences: localMatch?.hasReferences,
        pluginName: localMatch?.pluginName,
        localPath: localMatch?.sourcePath,
      };

      list.push(card);

      if (cat.category) {
        categorySet.add(cat.category);
      }

      if (installedAgents.length > 0) {
        installedCount++;
      }
      if (selectedCount === 0 || installedAgents.length < selectedCount) {
        availableCount++;
      }
    }

    for (let i = 0; i < skills.length; i++) {
      const s = skills[i];
      if (s.pluginName) continue;
      const folder = (s.folderName || s.name || s.id).toLowerCase().trim();
      if (!processedFolderNames.has(folder)) {
        processedFolderNames.add(folder);
        const entry = installedMap.get(folder);
        const installedAgents = entry ? entry.installedAgents : EMPTY_AGENTS;
        const disabledAgentIds = entry ? entry.disabledAgentIds : [];
        const isDisabled = installedAgents.length > 0 && disabledAgentIds.length >= installedAgents.length;

        const card: UnifiedSkillCard = {
          id: s.folderName || s.id,
          name: s.name,
          description: s.description,
          category: 'Local Extension',
          author: 'Local',
          sourceRegistry: 'Local Workspace',
          license: 'Custom',
          isCatalog: false,
          installedAgents,
          disabledAgentIds,
          isDisabled,
          hasScripts: s.hasScripts,
          hasReferences: s.hasReferences,
          pluginName: s.pluginName,
          localPath: s.sourcePath,
        };

        list.push(card);
        categorySet.add('Local Extension');

        if (installedAgents.length > 0) {
          installedCount++;
        }
      }
    }

    return {
      unifiedSkills: list,
      categories: ['All', ...Array.from(categorySet)],
      counts: {
        all: list.length,
        installed: installedCount,
        available: availableCount,
      },
    };
  }, [skills, selectedAgents, activeSkillsCatalog]);

  // Search & Filtering
  const filteredSkills = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const isInstalledOnly = activeSegment === 'installed';
    const isAvailableOnly = activeSegment === 'available';
    const hasCategory = selectedCategory !== 'All';
    const selectedCount = selectedAgents.length;

    // Fast-path: if no filters active, return list directly with zero allocation
    if (!q && activeSegment === 'all' && !hasCategory && currentAgentFilter.length === 0) {
      return unifiedSkills;
    }

    const matched: UnifiedSkillCard[] = [];
    for (let i = 0; i < unifiedSkills.length; i++) {
      const item = unifiedSkills[i];

      if (isInstalledOnly && item.installedAgents.length === 0) continue;
      if (isAvailableOnly && (!item.isCatalog || (selectedCount > 0 && item.installedAgents.length >= selectedCount))) continue;
      if (hasCategory && item.category !== selectedCategory) continue;
      if (q && !getSkillSearchString(item).includes(q)) continue;

      // Agent Filter
      if (currentAgentFilter.length > 0) {
        const hasFilteredAgent = item.installedAgents.some((a) => currentAgentFilter.includes(a.id));
        if (isInstalledOnly) {
          if (!hasFilteredAgent) continue;
        } else if (isAvailableOnly) {
          const installedFilteredCount = item.installedAgents.filter((a) => currentAgentFilter.includes(a.id)).length;
          if (installedFilteredCount >= currentAgentFilter.length) continue;
        } else {
          if (item.installedAgents.length > 0 && !hasFilteredAgent) continue;
        }
      }

      matched.push(item);
    }
    return matched;
  }, [unifiedSkills, activeSegment, selectedCategory, searchQuery, selectedAgents.length, currentAgentFilter]);

  // Effects
  useEffect(() => {
    setVisibleCount(48);
  }, [searchQuery, activeSegment, selectedCategory, currentAgentFilter]);

  const handleToggleAgentFilter = (agentId: string | null) => {
    if (!agentId) {
      setAgentFilter([]);
      return;
    }
    if (currentAgentFilter.includes(agentId)) {
      setAgentFilter(currentAgentFilter.filter((id) => id !== agentId));
    } else {
      setAgentFilter([...currentAgentFilter, agentId]);
    }
  };

  const handleAgentPillClick = (agentId: string) => {
    if (currentAgentFilter.length === 1 && currentAgentFilter[0] === agentId) {
      setAgentFilter([]);
    } else {
      setAgentFilter([agentId]);
    }
  };

  // Identify target skill match from highlightedId
  const targetSkillMatch = useMemo(() => {
    if (!highlightedId) return null;
    const hLower = highlightedId.toLowerCase().trim();
    return (
      unifiedSkills.find(
        (s) =>
          s.id.toLowerCase() === hLower ||
          s.name.toLowerCase() === hLower ||
          skills.some(
            (ms) =>
              ms.id === highlightedId &&
              (ms.name.toLowerCase() === s.name.toLowerCase() ||
                (ms.folderName && ms.folderName.toLowerCase() === s.id.toLowerCase()))
          )
      ) || null
    );
  }, [highlightedId, unifiedSkills, skills]);

  // If highlighted item is hidden by category or segment filters, auto-reveal it
  useEffect(() => {
    if (!targetSkillMatch) return;

    // Reset segment if it hides the target
    if (activeSegment === 'installed' && targetSkillMatch.installedAgents.length === 0) {
      setActiveSegment('all');
    } else if (
      activeSegment === 'available' &&
      targetSkillMatch.isCatalog &&
      targetSkillMatch.installedAgents.length >= selectedAgents.length
    ) {
      setActiveSegment('all');
    }

    // Reset category if it hides the target
    if (selectedCategory !== 'All' && targetSkillMatch.category && targetSkillMatch.category !== selectedCategory) {
      setSelectedCategory('All');
    }

    // Reset agent filter if it hides the target
    if (
      currentAgentFilter.length > 0 &&
      !targetSkillMatch.installedAgents.some((a) => currentAgentFilter.includes(a.id))
    ) {
      setAgentFilter([]);
    }
  }, [targetSkillMatch, activeSegment, selectedCategory, currentAgentFilter, selectedAgents.length, setAgentFilter]);

  // Expand pagination if target is beyond current slice
  useEffect(() => {
    if (!targetSkillMatch) return;
    const targetIdx = filteredSkills.findIndex((s) => s.id === targetSkillMatch.id);
    if (targetIdx !== -1 && targetIdx >= visibleCount) {
      setVisibleCount(targetIdx + 12);
    }
  }, [targetSkillMatch, filteredSkills, visibleCount]);

  // Scroll into view with multi-attempt polling to handle tab transition & render delays
  useEffect(() => {
    if (!targetSkillMatch && !highlightedId) return;
    const targetCardId = targetSkillMatch ? targetSkillMatch.id : highlightedId;

    let attempts = 0;
    const maxAttempts = 14;
    const intervalId = setInterval(() => {
      attempts++;
      const el =
        document.getElementById(`skill-card-${targetCardId}`) ||
        document.getElementById(`skill-card-${highlightedId}`) ||
        document.querySelector('.item-card-highlighted');

      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        clearInterval(intervalId);
      } else if (attempts >= maxAttempts) {
        clearInterval(intervalId);
      }
    }, 50);

    return () => clearInterval(intervalId);
  }, [targetSkillMatch, highlightedId, visibleCount]);

  // Handlers
  const handleInstallSkill = async (skill: UnifiedSkillCard) => {
    if (!skill.rawUrl || !window.electronAPI?.installSkill) return;

    // Target agents
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
        toast.success(`Installed "${skill.name}" on ${targetAgents.map((a) => a.name).join(', ')}`);
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
        toast.error(`Error: ${res.error || 'Failed to install skill'}`);
        logActivity({
          type: 'SKILL',
          title: 'Install Failed',
          description: `Failed to install "${skill.name}": ${res.error || 'Unknown error'}`,
          status: 'error',
        });
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message || 'Installation failed'}`);
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

  // Uninstall
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
        toast.success(`Uninstalled "${skill.name}" from ${targetAgents.map((a) => a.name).join(', ')}`);
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
        toast.error(`Error: ${res.error || 'Failed to uninstall skill'}`);
        logActivity({
          type: 'SKILL',
          title: 'Uninstall Failed',
          description: `Failed to uninstall "${skill.name}": ${res.error || 'Unknown error'}`,
          status: 'error',
        });
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message || 'Uninstall failed'}`);
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

  // Enable / Disable Skill Toggle
  const handleToggleSkill = async (skill: UnifiedSkillCard) => {
    if (!window.electronAPI?.toggleSkill) return;

    const targetAgents = skill.installedAgents.filter((agent) =>
      selectedAgents.length === 0 || selectedAgents.some((sel) => sel.id === agent.id)
    );
    const effectiveTargets = targetAgents.length > 0 ? targetAgents : skill.installedAgents;
    if (effectiveTargets.length === 0) return;

    const newEnabledState = Boolean(skill.isDisabled); // if currently disabled, we are enabling it
    setTogglingSkillId(skill.id);
    try {
      const res = await window.electronAPI.toggleSkill({
        skillId: skill.id,
        enabled: newEnabledState,
        targets: effectiveTargets.map((a) => ({
          agentId: a.id,
          skillsDir: a.paths.skillsDir,
        })),
      });

      if (res.success) {
        toast.success(`${newEnabledState ? 'Enabled' : 'Disabled'} "${skill.name}" on ${effectiveTargets.map((a) => a.name).join(', ')}`);
        logActivity({
          type: 'SKILL',
          title: newEnabledState ? 'Skill Enabled' : 'Skill Disabled',
          description: `${newEnabledState ? 'Enabled' : 'Disabled'} "${skill.name}" on ${effectiveTargets.map((a) => a.name).join(', ')}`,
          status: newEnabledState ? 'success' : 'info',
        });
        if (onRefreshCapabilities) {
          await onRefreshCapabilities();
        }
      } else {
        toast.error(`Error: ${res.error || 'Failed to toggle skill'}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message || 'Toggle failed'}`);
    } finally {
      setTogglingSkillId(null);
    }
  };

  // Edit skill
  const handleEditSkill = async (skill: UnifiedSkillCard) => {
    let rawContent = '';
    // 1. Try reading from disk via electronAPI.readSkill
    if (window.electronAPI?.readSkill) {
      try {
        const firstAgent = skill.installedAgents[0];
        const res = await window.electronAPI.readSkill({
          skillPath: skill.localPath,
          skillsDir: firstAgent?.paths?.skillsDir,
          skillId: skill.id,
        });
        if (res.success && res.content) {
          rawContent = res.content;
        }
      } catch (e) {
        console.warn('Failed reading skill from disk:', e);
      }
    }

    // 2. If rawContent is empty and skill has rawUrl, fallback to fetch
    if (!rawContent && skill.rawUrl) {
      try {
        const resp = await fetch(skill.rawUrl);
        if (resp.ok) {
          rawContent = await resp.text();
        }
      } catch (e) {
        console.warn('Failed fetching raw skill url:', e);
      }
    }

    // Parse frontmatter from rawContent if available
    let parsedDesc = skill.description;
    let parsedCat = skill.category !== 'Local Extension' ? skill.category : 'Development';
    let parsedTags: string[] = skill.tags || [];
    let parsedInstructions = rawContent;

    if (rawContent) {
      const fmMatch = rawContent.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---([\s\S]*)$/);
      if (fmMatch) {
        const fm = fmMatch[1];
        parsedInstructions = fmMatch[2].trim();

        const descMatch = fm.match(/description:\s*(?:>-\s*|\|-\s*)?([\s\S]*?)(?=\n[a-zA-Z0-9_-]+:|$)/);
        if (descMatch) {
          parsedDesc = descMatch[1].trim().replace(/^['"]|['"]$/g, '');
        }

        const catMatch = fm.match(/category:\s*([^\r\n]+)/);
        if (catMatch) {
          parsedCat = catMatch[1].trim().replace(/^['"]|['"]$/g, '');
        }

        const tagsMatch = fm.match(/tags:\s*[\r\n]+((?:\s*-\s*[^\r\n]+[\r\n]*)+)/);
        if (tagsMatch) {
          parsedTags = tagsMatch[1]
            .split('\n')
            .map((line) => line.replace(/^\s*-\s*/, '').trim())
            .filter(Boolean);
        }
      }
    }

    setEditingSkillData({
      id: skill.id,
      name: skill.name,
      folderSlug: skill.id,
      description: parsedDesc,
      category: parsedCat,
      tags: parsedTags,
      instructions: parsedInstructions || skill.description || '',
      targetAgentIds: skill.installedAgents.map((a) => a.id),
      localPath: skill.localPath,
      rawUrl: skill.rawUrl,
    });
    setForgeModalMode('edit');
    setIsForgeModalOpen(true);
  };

  // Open folder
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

  // Highlighted match
  const highlightedSkillMatch = useMemo(() => {
    if (!highlightedId) return null;
    return skills.find((s) => s.id === highlightedId) || null;
  }, [highlightedId, skills]);

  const displayedSkills = useMemo(() => {
    return filteredSkills.slice(0, visibleCount);
  }, [filteredSkills, visibleCount]);

  return (
    <div className="skills-view-container">
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
                  setForgeModalMode('create');
                  setEditingSkillData(null);
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

      {/* Category Pills Bar with Floating Agent Filter Dropdown */}
      <div className="category-toolbar-row">
        {/* Left: Category Pills with Category Label */}
        <div className="category-pills">
          <div className="category-label">
            <Filter size={12} />
            <span>Category:</span>
          </div>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`cat-pill ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Right: Floating Agent Filter Menu (if >1 agent selected) */}
        {selectedAgents.length > 1 && (
          <div className="agent-dropdown-wrapper" ref={agentMenuRef}>
            <button
              type="button"
              className={`agent-dropdown-trigger ${currentAgentFilter.length > 0 ? 'filtered' : ''}`}
              onClick={() => setIsAgentMenuOpen((prev) => !prev)}
              title="Filter skills to specific target agents"
            >
              <Bot size={12} className="agent-trigger-bot-icon" />
              <span className="agent-trigger-text">
                {currentAgentFilter.length === 0
                  ? `All Agents (${selectedAgents.length})`
                  : currentAgentFilter.length === 1
                  ? selectedAgents.find((a) => a.id === currentAgentFilter[0])?.name || '1 Agent'
                  : `${currentAgentFilter.length} Agents`}
              </span>
              <ChevronDown
                size={11}
                className={`agent-trigger-chevron ${isAgentMenuOpen ? 'open' : ''}`}
              />
            </button>

            {currentAgentFilter.length > 0 && (
              <button
                type="button"
                className="agent-quick-reset-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleAgentFilter(null);
                }}
                title="Clear agent filter"
              >
                <X size={10} />
              </button>
            )}

            {isAgentMenuOpen && (
              <div className="toolbar-agent-dropdown-menu">
                <div className="toolbar-dropdown-header">
                  <span>Filter by Agent</span>
                  {currentAgentFilter.length > 0 && (
                    <button
                      type="button"
                      className="toolbar-dropdown-reset-btn"
                      onClick={() => {
                        handleToggleAgentFilter(null);
                      }}
                    >
                      Reset
                    </button>
                  )}
                </div>

                <div className="toolbar-dropdown-list">
                  <button
                    type="button"
                    className={`toolbar-dropdown-item ${currentAgentFilter.length === 0 ? 'selected' : ''}`}
                    onClick={() => {
                      handleToggleAgentFilter(null);
                      setIsAgentMenuOpen(false);
                    }}
                  >
                    <div className="toolbar-dropdown-item-left">
                      <span className="toolbar-dropdown-item-icon">
                        <Bot size={13} />
                      </span>
                      <span className="toolbar-dropdown-item-name">All Selected Agents</span>
                    </div>
                    <div className="toolbar-dropdown-item-right">
                      <span className="toolbar-dropdown-item-count">{selectedAgents.length}</span>
                      {currentAgentFilter.length === 0 && <Check size={12} className="toolbar-dropdown-item-check" />}
                    </div>
                  </button>

                  <div className="toolbar-dropdown-divider" />

                  {selectedAgents.map((ag) => {
                    const isFiltered = currentAgentFilter.includes(ag.id);
                    const agentSkillsCount = skills.filter((s) => s.sourceAgentId === ag.id && !s.pluginName).length;
                    const AgentIcon = AGENT_ICON_MAP[ag.iconName] || Bot;
                    return (
                      <button
                        type="button"
                        key={ag.id}
                        className={`toolbar-dropdown-item ${isFiltered ? 'selected' : ''}`}
                        onClick={() => handleToggleAgentFilter(ag.id)}
                      >
                        <div className="toolbar-dropdown-item-left">
                          <span
                            className="toolbar-dropdown-item-dot"
                            style={{ background: ag.color }}
                          />
                          <AgentIcon size={12} style={{ color: ag.color }} />
                          <span className="toolbar-dropdown-item-name">{ag.name}</span>
                        </div>
                        <div className="toolbar-dropdown-item-right">
                          <span className="toolbar-dropdown-item-count">{agentSkillsCount}</span>
                          {isFiltered && <Check size={12} className="toolbar-dropdown-item-check" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
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
              const isHighlighted = targetSkillMatch
                ? targetSkillMatch.id === skill.id
                : highlightedId === skill.id ||
                  (highlightedSkillMatch
                    ? highlightedSkillMatch.folderName === skill.id || highlightedSkillMatch.name === skill.name
                    : false);
              const isLoading = loadingSkillId === skill.id;

              const requiredBinaries = getRequiredDependencies({
                name: skill.name,
                description: skill.description,
                category: skill.category,
                tags: skill.tags,
                hasScripts: skill.hasScripts,
              });
              const depStatus = evaluateDependencyStatus(requiredBinaries, dependencyReport || null);

              return (
                <div
                  key={skill.id}
                  id={`skill-card-${skill.id}`}
                  className={`skill-card ${isHighlighted ? 'item-card-highlighted' : ''} ${skill.isDisabled ? 'is-card-disabled' : ''}`}
                >
                  {/* Card Header: Icon Avatar + Name/Meta + Status Badge */}
                  <div className="card-header-cluster">
                    <div className="card-header-left">
                      <div className="card-icon-avatar">
                        <Sparkles size={16} />
                      </div>
                      <div className="card-identity-text">
                        <div className="card-title-row">
                          <span className="card-item-name" title={skill.name}>{skill.name}</span>
                        </div>
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
                          {skill.sourceRegistry && (() => {
                            const badge = formatSourceBadge(skill.sourceRegistry);
                            return (
                              <>
                                <span className="card-meta-dot">·</span>
                                <span
                                  className={`source-registry-pill font-mono ${badge.badgeClass}`}
                                  title={`${badge.tooltip} · License: ${skill.license || 'MIT'}`}
                                >
                                  {badge.badgeText}
                                </span>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    <div className="card-header-right">
                      {depStatus.status !== 'none' && (
                        <div className="dep-badge-cluster">
                          <button
                            type="button"
                            className={`dep-badge ${
                              depStatus.status === 'ready'
                                ? 'ready'
                                : depStatus.firstMissing === 'docker' || depStatus.firstMissing === 'go'
                                ? 'missing-amber'
                                : 'missing-rose'
                            } font-mono`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDepDrawerTarget({
                                targetName: skill.name,
                                requiredBinaries,
                              });
                            }}
                            title={
                              depStatus.status === 'ready'
                                ? `Prerequisites: ${requiredBinaries.join(', ')} (Verified on system PATH). Click to inspect.`
                                : `Missing prerequisite: ${depStatus.missingBinaries.join(', ')}. Click for 1-click install snippets.`
                            }
                          >
                            {depStatus.status === 'ready' ? (
                              <>
                                <CheckCircle2 size={10} className="dep-badge-icon" />
                                <span>Ready</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle size={10} className="dep-badge-icon" />
                                <span>Missing: {depStatus.firstMissing}</span>
                              </>
                            )}
                          </button>

                          {depStatus.status === 'missing' && depStatus.firstMissing && (
                            <button
                              type="button"
                              className={`dep-badge-quick-copy ${copiedDepKey === `dep-${skill.id}` ? 'copied' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyMissingDep(`dep-${skill.id}`, depStatus.firstMissing!);
                              }}
                              title={`Copy install command: ${getInstallSnippetForPlatform(depStatus.firstMissing)}`}
                              aria-label="Copy prerequisite install command"
                            >
                              {copiedDepKey === `dep-${skill.id}` ? <Check size={10} /> : <Copy size={10} />}
                            </button>
                          )}
                        </div>
                      )}

                      {isInstalledOnAll ? (
                        <button
                          type="button"
                          className={`status-pill-clean ${skill.isDisabled ? 'disabled' : 'installed'} font-mono clickable`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSkill(skill);
                          }}
                          title={skill.isDisabled ? 'Skill is disabled. Click to enable.' : 'Skill is enabled. Click to disable.'}
                        >
                          <span className={`status-dot ${skill.isDisabled ? 'disabled' : 'installed'}`} />
                          <span>{skill.isDisabled ? 'DISABLED' : 'INSTALLED'}</span>
                        </button>
                      ) : isPartiallyInstalled ? (
                        <button
                          type="button"
                          className={`status-pill-clean ${skill.isDisabled ? 'disabled' : 'partial'} font-mono clickable`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSkill(skill);
                          }}
                          title={skill.isDisabled ? 'Skill is disabled on equipped agents. Click to enable.' : `Equipped on ${skill.installedAgents.length}/${selectedAgents.length} agents. Click to toggle.`}
                        >
                          <span className={`status-dot ${skill.isDisabled ? 'disabled' : 'partial'}`} />
                          <span>{skill.isDisabled ? 'DISABLED' : `PARTIAL (${skill.installedAgents.length}/${selectedAgents.length})`}</span>
                        </button>
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
                            const isThisFiltered = currentAgentFilter.includes(ag.id);
                            return (
                              <button
                                type="button"
                                key={ag.id}
                                className={`agent-pill clickable ${isThisFiltered ? 'filtered-active' : ''}`}
                                style={{
                                  color: ag.color,
                                  borderColor: isThisFiltered ? `${ag.color}80` : `${ag.color}35`,
                                  background: isThisFiltered ? `${ag.color}20` : `${ag.color}0d`,
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAgentPillClick(ag.id);
                                }}
                                title={isThisFiltered ? `Filtered by ${ag.name} (click to clear)` : `Click to filter by ${ag.name}`}
                              >
                                <AgentIcon size={10} />
                                <span>{ag.name}</span>
                                {isThisFiltered && <Check size={9} />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card Bottom Toolbar: Minimal Metadata Icons (left) + Action Group (right) */}
                  <div className="card-bottom-toolbar">
                    <div className="toolbar-left-chips">
                      {skill.sourceRegistry && (
                        <span
                          className="meta-subtle-badge source-badge font-mono"
                          title={`Source: ${skill.sourceRegistry} (${skill.license || 'MIT'})`}
                        >
                          <Globe size={11} />
                          <span>{skill.sourceRegistry}</span>
                        </span>
                      )}
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
                      {/* Enable / Disable Toggle Button */}
                      {skill.installedAgents.length > 0 && (
                        <button
                          type="button"
                          className={`card-action-icon-btn toggle-state-btn ${skill.isDisabled ? 'disabled-state' : 'active-state'}`}
                          onClick={() => handleToggleSkill(skill)}
                          disabled={togglingSkillId === skill.id}
                          title={skill.isDisabled ? 'Enable skill on equipped agent(s)' : 'Disable skill without uninstalling'}
                          aria-label={skill.isDisabled ? 'Enable skill' : 'Disable skill'}
                        >
                          {togglingSkillId === skill.id ? (
                            <Loader2 size={13} className="spin" />
                          ) : skill.isDisabled ? (
                            <PowerOff size={13} style={{ color: '#fb7185' }} />
                          ) : (
                            <Power size={13} style={{ color: '#34d399' }} />
                          )}
                        </button>
                      )}

                      {/* Visual Skill Edit Action for Installed Skills */}
                      {skill.installedAgents.length > 0 && (
                        <button
                          type="button"
                          className="card-action-icon-btn edit-btn"
                          onClick={() => handleEditSkill(skill)}
                          title="Edit skill playbook and instructions"
                          aria-label="Edit Skill"
                        >
                          <Edit3 size={13} />
                        </button>
                      )}

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

                      {/* Copy Manual Installation Command Button */}
                      <button
                        type="button"
                        className={`card-action-icon-btn ${copiedSkillId === skill.id ? 'active-copied' : ''}`}
                        onClick={() => handleCopySkillCommand(skill)}
                        title="Copy CLI command for manual skill installation"
                        aria-label="Copy skill manual install command"
                      >
                        {copiedSkillId === skill.id ? <Check size={13} style={{ color: '#34d399' }} /> : <Copy size={13} />}
                      </button>

                      {/* Source Link */}
                      {skill.sourceRepo && (
                        <button
                          type="button"
                          onClick={() => {
                            let url = `https://github.com/${skill.sourceRepo}/tree/main/skills/${skill.id}`;
                            if (skill.rawUrl && skill.rawUrl.includes('raw.githubusercontent.com')) {
                              url = skill.rawUrl
                                .replace('https://raw.githubusercontent.com/', 'https://github.com/')
                                .replace(/\/main\//, '/tree/main/')
                                .replace(/\/SKILL\.md$/i, '');
                            }
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

      {/* Forge Custom Skill Authoring / Editing Modal */}
      <ForgeSkillModal
        isOpen={isForgeModalOpen}
        mode={forgeModalMode}
        initialSkill={editingSkillData}
        onClose={() => {
          setIsForgeModalOpen(false);
          setEditingSkillData(null);
          setForgeModalMode('create');
        }}
        selectedAgents={selectedAgents}
        onSkillCreated={async (skillName, count) => {
          if (forgeModalMode === 'edit') {
            toast.success(`Successfully updated "${skillName}" on ${count} agent(s)!`);
          } else {
            toast.success(`Successfully forged "${skillName}" and deployed to ${count} agent(s)!`);
          }
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
          toast.success(`Successfully ${transferMode === 'move' ? 'moved' : 'copied'} ${count} skill(s) to ${targetNames.join(', ')}!`);
          if (onRefreshCapabilities) {
            await onRefreshCapabilities();
          }
        }}
      />

      <DependencyInstallDrawer
        isOpen={Boolean(depDrawerTarget)}
        onClose={() => setDepDrawerTarget(null)}
        targetName={depDrawerTarget?.targetName || ''}
        requiredBinaries={depDrawerTarget?.requiredBinaries || []}
        report={dependencyReport || null}
        onRefreshReport={async () => {
          if (onRefreshDependencies) {
            await onRefreshDependencies();
          }
        }}
      />

      <style>{`
        .skills-view-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
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

        .skills-view-header .count-pill {
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
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
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
          justify-content: center;
          gap: 6px;
          background: #141c2c;
          border: 1px solid #223048;
          color: #cbd5e1;
          font-size: 11px;
          font-weight: 600;
          padding: 0 12px;
          height: 28px;
          border-radius: 5px;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
          box-sizing: border-box;
        }

        .transfer-action-btn:hover {
          background: #1c263c;
          border-color: rgba(124, 58, 237, 0.3);
          color: #f1f5f9;
        }

        .import-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: linear-gradient(135deg, #8b5cf6, #6d28d9);
          border: 1px solid rgba(168, 85, 247, 0.45);
          color: #ffffff;
          font-size: 11px;
          font-weight: 600;
          padding: 0 12px;
          height: 28px;
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
          height: 28px;
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
          height: 22px;
          border-radius: 4px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          transition: all 0.15s ease;
          white-space: nowrap;
          box-sizing: border-box;
        }

        .segment-btn:hover {
          color: #f1f5f9;
        }

        .segment-btn.active {
          background: #1e2a42;
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.09);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        }

        .segment-btn.active .segment-count {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
        }

        .segment-count {
          font-size: 9.5px;
          background: rgba(255, 255, 255, 0.08);
          padding: 1px 5px;
          border-radius: 10px;
          font-family: monospace;
        }

        /* Category Toolbar Row */
        .category-toolbar-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          background: #0f1523;
          border: 1px solid #182235;
          padding: 0 10px;
          height: 36px;
          min-height: 36px;
          max-height: 36px;
          border-radius: 7px;
          box-sizing: border-box;
          position: relative;
          z-index: 50;
        }

        .category-pills {
          display: flex;
          align-items: center;
          gap: 5px;
          overflow-x: auto;
          flex: 1;
          min-width: 0;
          height: 100%;
          padding: 0;
        }

        .category-pills::-webkit-scrollbar {
          height: 3px;
        }

        .category-pills::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 9999px;
        }

        .category-pills::-webkit-scrollbar-thumb {
          background: #27354f;
          border-radius: 9999px;
        }

        .category-pills::-webkit-scrollbar-thumb:hover {
          background: #3b4e72;
        }

        .category-label {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: #64748b;
          font-size: 10.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          flex-shrink: 0;
          position: sticky;
          left: 0;
          z-index: 2;
          background: #0f1523;
          padding-right: 6px;
          height: 22px;
          line-height: 1;
          box-sizing: border-box;
          user-select: none;
        }

        .cat-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #141c2c;
          border: 1px solid #1f2b42;
          color: #94a3b8;
          font-size: 10.5px;
          font-weight: 500;
          padding: 0 9px;
          height: 22px;
          min-height: 22px;
          max-height: 22px;
          line-height: 1;
          border-radius: 4px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.12s ease;
          flex-shrink: 0;
          box-sizing: border-box;
        }

        .cat-pill:hover {
          background: #1c263c;
          color: #e2e8f0;
        }

        .cat-pill.active {
          background: #1e2a42;
          border-color: #334155;
          color: #ffffff;
          font-weight: 600;
        }

        /* Agent Dropdown Filter */
        .agent-dropdown-wrapper {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
          position: relative;
          z-index: 60;
          height: 22px;
          align-self: center;
        }

        .agent-dropdown-trigger {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: #141c2c;
          border: 1px solid #1f2b42;
          color: #94a3b8;
          font-size: 10.5px;
          font-weight: 500;
          height: 22px;
          min-height: 22px;
          max-height: 22px;
          line-height: 1;
          padding: 0 8px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.12s ease;
          user-select: none;
          white-space: nowrap;
          box-sizing: border-box;
        }

        .agent-dropdown-trigger:hover {
          background: #1c263c;
          border-color: #2e3e5c;
          color: #e2e8f0;
        }

        .agent-dropdown-trigger.filtered {
          background: #1e2a42;
          border-color: #334155;
          color: #ffffff;
          font-weight: 600;
        }

        .agent-trigger-bot-icon {
          color: #38bdf8;
          flex-shrink: 0;
        }

        .agent-trigger-text {
          max-width: 140px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .agent-trigger-chevron {
          color: #64748b;
          transition: transform 0.2s ease;
          flex-shrink: 0;
        }

        .agent-trigger-chevron.open {
          transform: rotate(180deg);
        }

        .agent-quick-reset-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          min-height: 22px;
          max-height: 22px;
          border-radius: 4px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #f87171;
          cursor: pointer;
          transition: all 0.12s ease;
          padding: 0;
          box-sizing: border-box;
        }

        .agent-quick-reset-btn:hover {
          background: rgba(239, 68, 68, 0.2);
          border-color: rgba(239, 68, 68, 0.45);
          color: #ef4444;
        }

        .toolbar-agent-dropdown-menu {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          left: auto !important;
          background: #0d1320;
          border: 1px solid #1f2b42;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          min-width: 220px;
          max-width: 280px;
          width: max-content;
          padding: 6px;
          z-index: 1000;
          animation: dropdownFadeIn 0.15s ease-out forwards;
          box-sizing: border-box;
        }

        @keyframes dropdownFadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .toolbar-dropdown-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 8px 6px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #64748b;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          margin-bottom: 4px;
        }

        .toolbar-dropdown-reset-btn {
          background: transparent;
          border: none;
          color: #f87171;
          font-size: 10px;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
          transition: color 0.12s ease;
        }

        .toolbar-dropdown-reset-btn:hover {
          color: #ef4444;
          text-decoration: underline;
        }

        .toolbar-dropdown-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
          max-height: min(220px, calc(100vh - 280px));
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
        }

        .toolbar-dropdown-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          width: 100%;
          padding: 6px 8px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 5px;
          cursor: pointer;
          color: #cbd5e1;
          font-size: 11.5px;
          text-align: left;
          transition: all 0.12s ease;
        }

        .toolbar-dropdown-item:hover {
          background: #141d2f;
          border-color: rgba(255, 255, 255, 0.05);
          color: #ffffff;
        }

        .toolbar-dropdown-item.selected {
          background: rgba(56, 189, 248, 0.1);
          border-color: rgba(56, 189, 248, 0.25);
          color: #38bdf8;
          font-weight: 600;
        }

        .toolbar-dropdown-item-left {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          flex: 1;
        }

        .toolbar-dropdown-item-icon {
          color: #38bdf8;
          display: inline-flex;
          align-items: center;
        }

        .toolbar-dropdown-item-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .toolbar-dropdown-item-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .toolbar-dropdown-item-right {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }

        .toolbar-dropdown-item-count {
          font-family: monospace;
          font-size: 10px;
          background: rgba(0, 0, 0, 0.4);
          color: #8da2be;
          padding: 1px 5px;
          border-radius: 4px;
        }

        .toolbar-dropdown-item-check {
          color: #38bdf8;
        }

        .toolbar-dropdown-divider {
          height: 1px;
          background: rgba(255, 255, 255, 0.06);
          margin: 3px 0;
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
          min-height: 206px;
          box-sizing: border-box;
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
          overflow: hidden;
        }

        .skill-card:hover {
          border-color: rgba(99, 102, 241, 0.35);
          background: #131b2c;
          box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.45);
          transform: translateY(-1px);
        }

        /* Header: Rigid 38px height, never wraps or expands */
        .card-header-cluster {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
          height: 38px;
          min-height: 38px;
          max-height: 38px;
          flex-shrink: 0;
        }

        .card-header-left {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          min-width: 0;
          flex: 1;
          overflow: hidden;
        }

        .skills-view-container .card-icon-avatar,
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
          gap: 3px;
          min-width: 0;
          flex: 1;
          overflow: hidden;
        }

        .card-title-row {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          line-height: 1.2;
        }

        .card-item-name {
          font-size: 13.5px;
          font-weight: 600;
          color: #f8fafc;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          letter-spacing: -0.01em;
          min-width: 0;
          flex-shrink: 1;
        }

        .card-sub-meta {
          display: flex;
          align-items: center;
          gap: 5px;
          min-width: 0;
          height: 16px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .card-cat-text {
          font-size: 9.5px;
          line-height: 1;
          color: #8fa0b5;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 105px;
          flex-shrink: 1;
          display: inline-flex;
          align-items: center;
        }

        .card-meta-dot {
          color: #3b4d66;
          font-size: 10px;
          flex-shrink: 0;
        }

        .author-text {
          font-size: 10px;
          color: #64748b;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 95px;
          flex-shrink: 1;
        }

        .source-registry-pill {
          font-size: 8.5px;
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.08);
          border: 1px solid rgba(56, 189, 248, 0.22);
          padding: 0.5px 5px;
          border-radius: 3px;
          font-weight: 600;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 110px;
          flex-shrink: 0;
        }

        .source-registry-pill.pill-aas {
          color: #c084fc;
          background: rgba(192, 132, 252, 0.12);
          border-color: rgba(192, 132, 252, 0.28);
        }

        .source-registry-pill.pill-official {
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.12);
          border-color: rgba(56, 189, 248, 0.28);
        }

        .source-registry-pill.pill-addy {
          color: #fbbf24;
          background: rgba(251, 191, 36, 0.12);
          border-color: rgba(251, 191, 36, 0.28);
        }

        .source-registry-pill.pill-custom {
          color: #34d399;
          background: rgba(52, 211, 153, 0.12);
          border-color: rgba(52, 211, 153, 0.28);
        }

        .source-registry-pill.pill-smithery {
          color: #fb923c;
          background: rgba(251, 146, 60, 0.12);
          border-color: rgba(251, 146, 60, 0.28);
        }

        .source-registry-pill.pill-community {
          color: #2dd4bf;
          background: rgba(45, 212, 191, 0.12);
          border-color: rgba(45, 212, 191, 0.28);
        }

        .source-registry-pill.pill-core {
          color: #818cf8;
          background: rgba(129, 140, 248, 0.12);
          border-color: rgba(129, 140, 248, 0.28);
        }

        .card-header-right {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 1px;
        }

        .dep-badge-cluster {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .dep-badge-quick-copy {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 19px;
          border-radius: 9999px;
          background: rgba(244, 63, 94, 0.12);
          border: 1px solid rgba(244, 63, 94, 0.35);
          color: #fb7185;
          cursor: pointer;
          transition: all 0.15s ease;
          padding: 0;
        }

        .dep-badge-quick-copy:hover {
          background: rgba(244, 63, 94, 0.25);
          border-color: rgba(244, 63, 94, 0.6);
          transform: translateY(-1px);
        }

        .dep-badge-quick-copy.copied {
          background: rgba(52, 211, 153, 0.18);
          border-color: rgba(52, 211, 153, 0.5);
          color: #34d399;
        }

        .card-action-icon-btn.active-copied {
          background: rgba(52, 211, 153, 0.15);
          border-color: rgba(52, 211, 153, 0.4);
        }

        .dep-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 7px;
          border-radius: 9999px;
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.02em;
          white-space: nowrap;
          cursor: pointer;
          border: 1px solid transparent;
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          user-select: none;
        }

        .dep-badge:hover {
          transform: translateY(-1px);
        }

        .dep-badge.ready {
          color: #34d399;
          background: rgba(16, 185, 129, 0.09);
          border-color: rgba(16, 185, 129, 0.25);
        }

        .dep-badge.ready:hover {
          background: rgba(16, 185, 129, 0.18);
          border-color: rgba(16, 185, 129, 0.45);
        }

        .dep-badge.missing-amber {
          color: #fbbf24;
          background: rgba(245, 158, 11, 0.12);
          border-color: rgba(245, 158, 11, 0.35);
        }

        .dep-badge.missing-amber:hover {
          background: rgba(245, 158, 11, 0.22);
          border-color: rgba(245, 158, 11, 0.55);
        }

        .dep-badge.missing-rose {
          color: #fb7185;
          background: rgba(244, 63, 94, 0.12);
          border-color: rgba(244, 63, 94, 0.35);
        }

        .dep-badge.missing-rose:hover {
          background: rgba(244, 63, 94, 0.22);
          border-color: rgba(244, 63, 94, 0.55);
        }

        .status-pill-clean {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 2.5px 8px;
          border-radius: 9999px;
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.02em;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .status-pill-clean.installed {
          color: #34d399;
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.22);
        }

        .status-pill-clean.disabled {
          color: #fb7185;
          background: rgba(244, 63, 94, 0.08);
          border: 1px solid rgba(244, 63, 94, 0.28);
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

        .status-pill-clean.clickable {
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .status-pill-clean.clickable:hover {
          transform: translateY(-1px);
          filter: brightness(1.15);
        }

        .card-action-icon-btn.toggle-state-btn.disabled-state {
          background: rgba(244, 63, 94, 0.1);
          border-color: rgba(244, 63, 94, 0.3);
          color: #fb7185;
        }

        .card-action-icon-btn.toggle-state-btn.disabled-state:hover {
          background: rgba(244, 63, 94, 0.22);
          border-color: rgba(244, 63, 94, 0.5);
          color: #fda4af;
        }

        .card-action-icon-btn.toggle-state-btn.active-state {
          background: rgba(52, 211, 153, 0.08);
          border-color: rgba(52, 211, 153, 0.25);
          color: #34d399;
        }

        .card-action-icon-btn.toggle-state-btn.active-state:hover {
          background: rgba(52, 211, 153, 0.18);
          border-color: rgba(52, 211, 153, 0.45);
          color: #6ee7b7;
        }

        .skill-card.is-card-disabled {
          border-color: rgba(244, 63, 94, 0.2);
          background: rgba(18, 24, 38, 0.7);
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

        .status-dot.disabled {
          background: #fb7185;
          box-shadow: 0 0 6px rgba(244, 63, 94, 0.6);
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
          margin-bottom: 10px;
          min-width: 0;
        }

        .card-description-text {
          font-size: 12px;
          color: #94a3b8;
          line-height: 1.45;
          margin: 0;
          height: 35px;
          min-height: 35px;
          max-height: 35px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .equipped-agents-bar {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(0, 0, 0, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 3px 8px;
          border-radius: 6px;
          min-height: 24px;
          box-sizing: border-box;
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
          flex-wrap: nowrap;
          overflow: hidden;
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
          transition: all 0.15s ease;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .agent-pill.clickable {
          cursor: pointer;
          user-select: none;
        }

        .agent-pill.clickable:hover {
          transform: translateY(-0.5px);
          filter: brightness(1.15);
        }

        .agent-pill.filtered-active {
          font-weight: 600;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
        }

        /* Bottom Toolbar: Rigid 38px height, never wraps */
        .card-bottom-toolbar {
          margin-top: auto;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          padding-top: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-height: 38px;
          height: 38px;
          max-height: 38px;
          box-sizing: border-box;
        }

        .toolbar-left-chips {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: nowrap;
          min-width: 0;
          flex: 1;
          overflow: hidden;
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
          white-space: nowrap;
          flex-shrink: 0;
        }

        .meta-subtle-badge.source-badge {
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.06);
          border-color: rgba(56, 189, 248, 0.2);
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
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
          box-sizing: border-box;
        }

        .card-action-icon-btn:hover:not(:disabled) {
          background: #1d283e;
          color: #ffffff;
          border-color: #384b6c;
        }

        .card-action-icon-btn.edit-btn:hover:not(:disabled) {
          background: rgba(192, 132, 252, 0.15);
          color: #c084fc;
          border-color: rgba(192, 132, 252, 0.4);
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

        .skills-view-container .card-primary-action-btn,
        .card-primary-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          height: 28px;
          padding: 0 11px;
          background: #141c2c;
          border: 1px solid #223048;
          color: #e2e8f0;
          font-size: 11px;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
          box-sizing: border-box;
          box-shadow: none;
        }

        .skills-view-container .card-primary-action-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #5b21b6, #4c1d95);
          border-color: rgba(124, 58, 237, 0.35);
          color: #ffffff;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3), 0 0 6px rgba(109, 40, 217, 0.2);
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
          border-color: rgba(192, 132, 252, 0.95) !important;
          background: linear-gradient(135deg, rgba(192, 132, 252, 0.12), rgba(168, 85, 247, 0.04)) !important;
          box-shadow: 0 0 0 2px rgba(192, 132, 252, 0.7), 0 0 32px rgba(168, 85, 247, 0.38) !important;
          animation: highlightCardSoft 3.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          z-index: 10;
          position: relative;
        }

        @keyframes highlightCardSoft {
          0% {
            transform: scale(1.025);
            border-color: rgba(192, 132, 252, 1);
            box-shadow: 0 0 0 2.5px rgba(192, 132, 252, 0.85), 0 0 40px rgba(168, 85, 247, 0.5);
          }
          15% {
            transform: scale(1);
            border-color: rgba(192, 132, 252, 0.95);
            box-shadow: 0 0 0 2px rgba(192, 132, 252, 0.75), 0 0 32px rgba(168, 85, 247, 0.4);
          }
          65% {
            transform: scale(1);
            border-color: rgba(192, 132, 252, 0.8);
            box-shadow: 0 0 0 1.5px rgba(192, 132, 252, 0.55), 0 0 22px rgba(168, 85, 247, 0.25);
          }
          88% {
            transform: scale(1);
            border-color: rgba(192, 132, 252, 0.45);
            box-shadow: 0 0 0 1px rgba(192, 132, 252, 0.2), 0 0 10px rgba(168, 85, 247, 0.1);
          }
          100% {
            transform: scale(1);
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
