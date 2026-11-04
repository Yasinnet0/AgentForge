import React, { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { ScannedSkill, SupportedAgent } from '../types/agent';
import { CatalogSkill } from '../types/catalog';
import { SKILLS_CATALOG } from '../data/skillsCatalog';
import { 
  Sparkles, 
  Bot, 
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
  ChevronDown,
  Search,
  X,
  Edit3,
  AlertCircle,
  Copy,
  Power,
  PowerOff,
  LayoutGrid,
  List as ListIcon,
  RotateCcw,
  ShieldCheck,
  MoreVertical,
  Info,
  ExternalLink,
} from 'lucide-react';
import { formatAuthor } from '../utils/formatUtils';
import { logActivity } from '../services/activityLogger';
import { useToast } from '../context/ToastContext';
import { formatSourceBadge } from '../services/catalogSync';
import { ForgeSkillModal, InitialSkillData } from './ForgeSkillModal';
import { TransferSkillsModal } from './TransferSkillsModal';
import { DependencyReport } from '../types/dependencies';
import { getRequiredDependencies, evaluateDependencyStatus, getInstallSnippetForPlatform } from '../utils/dependencyResolver';
import { DependencyInstallDrawer } from './DependencyInstallDrawer';
import { AGENT_ICON_MAP } from './AgentIcon';
import { useModalTransition } from '../hooks/useModalTransition';
import { Tooltip } from './Tooltip';

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
  const segmentedControlsRef = useRef<HTMLDivElement>(null);
  const isPillAnimatedRef = useRef(false);
  const [segmentPillStyle, setSegmentPillStyle] = useState<{ left: number; width: number; isReady: boolean }>({
    left: 0,
    width: 0,
    isReady: false,
  });
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('agentforge_view_mode_skills') as 'grid' | 'list') || 'grid';
  });

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('agentforge_view_mode_skills', mode);
  };
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
  const [moreMenuSkillId, setMoreMenuSkillId] = useState<string | null>(null);
  const [moreMenuPosition, setMoreMenuPosition] = useState<{
    top?: number;
    bottom?: number;
    right: number;
    maxHeight?: number;
  } | null>(null);
  const [selectedSkillForDetails, setSelectedSkillForDetails] = useState<UnifiedSkillCard | null>(null);
  const [copiedPathSkillId, setCopiedPathSkillId] = useState<string | null>(null);

  const {
    isRendered: isDetailsModalRendered,
    isClosing: isDetailsModalClosing,
    handleClose: handleCloseDetailsModal,
  } = useModalTransition(
    Boolean(selectedSkillForDetails),
    () => setSelectedSkillForDetails(null),
    180
  );

  // Skill Uninstall Confirmation State & Transition
  const CONFIRM_UNINSTALL_SKILL_KEY = 'agentforge_skip_skill_uninstall_confirm';
  const [skillToConfirmUninstall, setSkillToConfirmUninstall] = useState<UnifiedSkillCard | null>(null);
  const [dontAskAgainUninstall, setDontAskAgainUninstall] = useState(false);

  const {
    isRendered: isConfirmModalRendered,
    isClosing: isConfirmModalClosing,
    handleClose: handleCloseConfirmModal,
  } = useModalTransition(
    Boolean(skillToConfirmUninstall),
    () => {
      setSkillToConfirmUninstall(null);
      setDontAskAgainUninstall(false);
    },
    180
  );

  const resolveSkillPath = (skill: UnifiedSkillCard) => {
    if (skill.localPath) return skill.localPath;
    if (skill.installedAgents.length > 0) {
      const agent = skill.installedAgents[0];
      const dir = agent.resolvedPaths?.skillsDir || agent.paths?.skillsDir;
      if (dir) {
        const base = dir.replace(/\\/g, '/').replace(/\/+$/, '');
        return `${base}/${skill.id}`;
      }
    }
    return '';
  };

  const handleCopySkillPath = async (skill: UnifiedSkillCard) => {
    const path = resolveSkillPath(skill);
    if (!path) return;
    try {
      await navigator.clipboard.writeText(path);
      setCopiedPathSkillId(skill.id);
      toast.success('Skill path copied to clipboard');
      setTimeout(() => setCopiedPathSkillId(null), 2000);
    } catch {
      toast.error('Failed to copy skill path');
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
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement>(null);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [agentSearchQuery, setAgentSearchQuery] = useState('');
  const categorySearchInputRef = useRef<HTMLInputElement>(null);
  const agentSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCategoryMenuOpen) {
      setTimeout(() => categorySearchInputRef.current?.focus(), 25);
    } else {
      setCategorySearchQuery('');
    }
  }, [isCategoryMenuOpen]);

  useEffect(() => {
    if (isAgentMenuOpen) {
      setTimeout(() => agentSearchInputRef.current?.focus(), 25);
    } else {
      setAgentSearchQuery('');
    }
  }, [isAgentMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (agentMenuRef.current && !agentMenuRef.current.contains(e.target as Node)) {
        setIsAgentMenuOpen(false);
      }
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(e.target as Node)) {
        setIsCategoryMenuOpen(false);
      }
    };
    if (isAgentMenuOpen || isCategoryMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isAgentMenuOpen, isCategoryMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.card-options-dropdown') && !target.closest('.more-options-btn')) {
        setMoreMenuSkillId(null);
        setMoreMenuPosition(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (skillToConfirmUninstall) {
          handleCloseConfirmModal();
          return;
        }
        setMoreMenuSkillId(null);
        setMoreMenuPosition(null);
        handleCloseDetailsModal();
      }
    };
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest && target.closest('.card-options-dropdown')) {
        return;
      }
      setMoreMenuSkillId(null);
      setMoreMenuPosition(null);
    };
    const handleResize = () => {
      setMoreMenuSkillId(null);
      setMoreMenuPosition(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [handleCloseDetailsModal]);

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
      categories: ['All', ...Array.from(categorySet).sort((a, b) => a.localeCompare(b))],
      counts: {
        all: list.length,
        installed: installedCount,
        available: availableCount,
      },
    };
  }, [skills, selectedAgents, activeSkillsCatalog]);

  const updateSegmentPill = useCallback(() => {
    const container = segmentedControlsRef.current;
    if (!container) return;
    const activeBtn = container.querySelector<HTMLButtonElement>('.segment-btn.active');
    if (!activeBtn) return;
    const containerRect = container.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    setSegmentPillStyle({
      left: btnRect.left - containerRect.left,
      width: btnRect.width,
      isReady: true,
    });
  }, []);

  useLayoutEffect(() => {
    updateSegmentPill();
  }, [updateSegmentPill, activeSegment, counts]);

  useEffect(() => {
    const timer = setTimeout(() => {
      isPillAnimatedRef.current = true;
    }, 60);
    window.addEventListener('resize', updateSegmentPill);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateSegmentPill);
    };
  }, [updateSegmentPill]);

  // Compute category item counts dynamically based on active segment and agent filter
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { All: 0 };
    for (let i = 0; i < unifiedSkills.length; i++) {
      const s = unifiedSkills[i];
      if (activeSegment === 'installed' && s.installedAgents.length === 0) continue;
      if (activeSegment === 'available' && selectedAgents.length > 0 && s.installedAgents.length >= selectedAgents.length) continue;
      if (currentAgentFilter.length > 0 && !currentAgentFilter.some((agId) => s.installedAgents.some((a) => a.id === agId))) continue;

      map.All = (map.All || 0) + 1;
      const cat = s.category || 'Other';
      map[cat] = (map[cat] || 0) + 1;
    }
    return map;
  }, [unifiedSkills, activeSegment, selectedAgents.length, currentAgentFilter]);

  // Combobox filtering for dropdown menus
  const filteredCategories = useMemo(() => {
    if (!categorySearchQuery.trim()) return categories;
    const q = categorySearchQuery.trim().toLowerCase();
    return categories.filter((cat) => cat.toLowerCase().includes(q));
  }, [categories, categorySearchQuery]);

  const filteredTargetAgents = useMemo(() => {
    if (!agentSearchQuery.trim()) return selectedAgents;
    const q = agentSearchQuery.trim().toLowerCase();
    return selectedAgents.filter((ag) => ag.name.toLowerCase().includes(q) || ag.id.toLowerCase().includes(q));
  }, [selectedAgents, agentSearchQuery]);

  // Search & Filtering (deferred for smooth, non-blocking typing)
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const filteredSkills = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
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
  }, [unifiedSkills, activeSegment, selectedCategory, deferredSearchQuery, selectedAgents.length, currentAgentFilter]);

  // Effects
  useEffect(() => {
    setVisibleCount(48);
  }, [deferredSearchQuery, activeSegment, selectedCategory, currentAgentFilter]);

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

  const [expandedAgentCards, setExpandedAgentCards] = useState<Set<string>>(new Set());

  const toggleCardAgentsExpanded = (cardId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedAgentCards((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  };

  const renderAgentTargetsDeck = (installedAgents: SupportedAgent[], cardId: string) => {
    const isExpanded = expandedAgentCards.has(cardId);

    type CardAgentItem = {
      agent: SupportedAgent;
      isInstalled: boolean;
      isFiltered: boolean;
    };

    const items: CardAgentItem[] = [];

    if (installedAgents.length > 0) {
      for (const ag of installedAgents) {
        items.push({
          agent: ag,
          isInstalled: true,
          isFiltered: currentAgentFilter.includes(ag.id),
        });
      }
      const pending = selectedAgents.filter((sa) => !installedAgents.some((ia) => ia.id === sa.id));
      for (const ag of pending) {
        items.push({
          agent: ag,
          isInstalled: false,
          isFiltered: currentAgentFilter.includes(ag.id),
        });
      }
    } else if (selectedAgents.length > 0) {
      for (const ag of selectedAgents) {
        items.push({
          agent: ag,
          isInstalled: false,
          isFiltered: currentAgentFilter.includes(ag.id),
        });
      }
    }

    let title = 'TARGET AGENTS';
    let badgeText = '';
    if (installedAgents.length > 0) {
      if (selectedAgents.length > 0) {
        title = installedAgents.length >= selectedAgents.length ? 'Active in' : 'Active / Target';
        badgeText = `${installedAgents.length}/${selectedAgents.length}`;
      } else {
        title = 'Active in';
        badgeText = `${installedAgents.length}`;
      }
    } else if (selectedAgents.length > 0) {
      title = selectedAgents.length === 1 ? 'Target agent' : 'Target agents';
      badgeText = `${selectedAgents.length}`;
    } else {
      title = 'Target agents';
      badgeText = '0';
    }

    if (items.length === 0) {
      return (
        <div className="agent-deck-container empty">
          <div className="agent-deck-header">
            <div className="agent-deck-label-group">
              <Bot size={11} className="agent-deck-icon" />
              <span className="agent-deck-title font-mono">{title}</span>
            </div>
          </div>
          <div className="agent-deck-empty-hint font-mono">No target agents selected</div>
        </div>
      );
    }

    const sortedItems = [...items].sort((a, b) => {
      if (a.isFiltered && !b.isFiltered) return -1;
      if (!a.isFiltered && b.isFiltered) return 1;
      if (a.isInstalled && !b.isInstalled) return -1;
      if (!a.isInstalled && b.isInstalled) return 1;
      return 0;
    });

    const MAX_VISIBLE = 4;
    const shouldCollapse = sortedItems.length > MAX_VISIBLE;
    const initialItems = shouldCollapse ? sortedItems.slice(0, MAX_VISIBLE) : sortedItems;
    const overflowItems = shouldCollapse ? sortedItems.slice(MAX_VISIBLE) : [];
    const hiddenCount = sortedItems.length - MAX_VISIBLE;

    return (
      <div className={`agent-deck-container ${installedAgents.length === 0 ? 'pending-only' : ''}`}>
        <div className="agent-deck-header">
          <div className="agent-deck-label-group">
            <Bot size={11} className="agent-deck-icon" />
            <span className="agent-deck-title font-mono">{title}</span>
            <span className="agent-deck-count-badge font-mono">{badgeText}</span>
          </div>
          {items.length > 0 && (
            <span className="agent-deck-filter-hint font-mono">
              {currentAgentFilter.length > 0 && items.some((i) => i.isFiltered) ? 'filtered' : 'click to filter'}
            </span>
          )}
        </div>

        <div className="agent-deck-pills">
          <div className="agent-deck-base-row">
            {initialItems.map(({ agent: ag, isInstalled, isFiltered }) => {
              const AgentIcon = AGENT_ICON_MAP[ag.id] || AGENT_ICON_MAP[ag.iconName] || Bot;
              return (
                <button
                  type="button"
                  key={ag.id}
                  className={`agent-deck-pill ${isInstalled ? 'installed' : 'pending'} ${isFiltered ? 'is-filtered' : ''}`}
                  style={{
                    color: ag.color,
                    borderColor: isFiltered
                      ? `${ag.color}75`
                      : isInstalled
                      ? `${ag.color}40`
                      : `${ag.color}28`,
                    background: isFiltered
                      ? `${ag.color}16`
                      : isInstalled
                      ? `${ag.color}0e`
                      : `${ag.color}06`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAgentPillClick(ag.id);
                  }}
                  title={
                    isFiltered
                      ? `Filtered by ${ag.name} (click to clear)`
                      : isInstalled
                      ? `Active in ${ag.name} (click to filter)`
                      : `Pending target: ${ag.name} (click to filter)`
                  }
                >
                  <AgentIcon size={11} className="pill-brand-icon" />
                  <span className="pill-name">{isInstalled ? ag.name : `+${ag.name}`}</span>
                  {isFiltered && <Check size={9} className="pill-check-icon" />}
                </button>
              );
            })}

            {shouldCollapse && (
              <button
                type="button"
                className={`agent-deck-more-btn font-mono ${isExpanded ? 'is-expanded' : ''}`}
                onClick={(e) => toggleCardAgentsExpanded(cardId, e)}
                title={isExpanded ? 'Collapse agent list' : `Show ${hiddenCount} more agents`}
              >
                <span>{isExpanded ? 'Less' : `+${hiddenCount}`}</span>
                <ChevronDown size={10} className={`deck-chevron ${isExpanded ? 'rotated' : ''}`} />
              </button>
            )}
          </div>

          {shouldCollapse && (
            <div className={`agent-deck-expandable ${isExpanded ? 'is-expanded' : ''}`}>
              <div className="agent-deck-expandable-content">
                <div className="agent-deck-overflow-pills">
                  {overflowItems.map(({ agent: ag, isInstalled, isFiltered }, idx) => {
                    const AgentIcon = AGENT_ICON_MAP[ag.id] || AGENT_ICON_MAP[ag.iconName] || Bot;
                    return (
                      <button
                        type="button"
                        key={ag.id}
                        className={`agent-deck-pill ${isInstalled ? 'installed' : 'pending'} ${isFiltered ? 'is-filtered' : ''}`}
                        style={{
                          color: ag.color,
                          borderColor: isFiltered
                            ? `${ag.color}75`
                            : isInstalled
                            ? `${ag.color}40`
                            : `${ag.color}28`,
                          background: isFiltered
                            ? `${ag.color}16`
                            : isInstalled
                            ? `${ag.color}0e`
                            : `${ag.color}06`,
                          animationDelay: `${idx * 28}ms`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAgentPillClick(ag.id);
                        }}
                        title={
                          isFiltered
                            ? `Filtered by ${ag.name} (click to clear)`
                            : isInstalled
                            ? `Active in ${ag.name} (click to filter)`
                            : `Pending target: ${ag.name} (click to filter)`
                        }
                      >
                        <AgentIcon size={11} className="pill-brand-icon" />
                        <span className="pill-name">{isInstalled ? ag.name : `+${ag.name}`}</span>
                        {isFiltered && <Check size={9} className="pill-check-icon" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderListAgentTargetsDeck = (installedAgents: SupportedAgent[], cardId: string) => {
    const listCardKey = `list-${cardId}`;
    const isExpanded = expandedAgentCards.has(listCardKey);

    type CardAgentItem = {
      agent: SupportedAgent;
      isInstalled: boolean;
      isFiltered: boolean;
    };

    const items: CardAgentItem[] = [];

    if (installedAgents.length > 0) {
      for (const ag of installedAgents) {
        items.push({
          agent: ag,
          isInstalled: true,
          isFiltered: currentAgentFilter.includes(ag.id),
        });
      }
      const pending = selectedAgents.filter((sa) => !installedAgents.some((ia) => ia.id === sa.id));
      for (const ag of pending) {
        items.push({
          agent: ag,
          isInstalled: false,
          isFiltered: currentAgentFilter.includes(ag.id),
        });
      }
    } else if (selectedAgents.length > 0) {
      for (const ag of selectedAgents) {
        items.push({
          agent: ag,
          isInstalled: false,
          isFiltered: currentAgentFilter.includes(ag.id),
        });
      }
    }

    if (items.length === 0) {
      return (
        <span className="uninstalled-muted-label font-mono" title="No target agents selected">
          No target agents
        </span>
      );
    }

    const sortedItems = [...items].sort((a, b) => {
      if (a.isFiltered && !b.isFiltered) return -1;
      if (!a.isFiltered && b.isFiltered) return 1;
      if (a.isInstalled && !b.isInstalled) return -1;
      if (!a.isInstalled && b.isInstalled) return 1;
      return 0;
    });

    const MAX_LIST_VISIBLE = 2;
    const shouldCollapse = sortedItems.length > MAX_LIST_VISIBLE;
    const initialItems = shouldCollapse ? sortedItems.slice(0, MAX_LIST_VISIBLE) : sortedItems;
    const overflowItems = shouldCollapse ? sortedItems.slice(MAX_LIST_VISIBLE) : [];
    const hiddenCount = sortedItems.length - MAX_LIST_VISIBLE;

    return (
      <div className="list-agents-deck">
        <div className="list-agents-base-row">
          {initialItems.map(({ agent: ag, isInstalled, isFiltered }) => {
            const AgentIcon = AGENT_ICON_MAP[ag.id] || AGENT_ICON_MAP[ag.iconName] || Bot;
            return (
              <button
                type="button"
                key={ag.id}
                className={`agent-deck-pill compact ${isInstalled ? 'installed' : 'pending'} ${isFiltered ? 'is-filtered' : ''}`}
                style={{
                  color: ag.color,
                  borderColor: isFiltered
                    ? `${ag.color}75`
                    : isInstalled
                    ? `${ag.color}40`
                    : `${ag.color}28`,
                  background: isFiltered
                    ? `${ag.color}16`
                    : isInstalled
                    ? `${ag.color}0e`
                    : `${ag.color}06`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleAgentPillClick(ag.id);
                }}
                title={
                  isFiltered
                    ? `Filtered by ${ag.name} (click to clear)`
                    : isInstalled
                    ? `Active in ${ag.name} (click to filter)`
                    : `Pending target: ${ag.name} (click to filter)`
                }
              >
                <AgentIcon size={10} className="pill-brand-icon" />
                <span className="pill-name">{isInstalled ? ag.name : `+${ag.name}`}</span>
                {isFiltered && <Check size={8} className="pill-check-icon" />}
              </button>
            );
          })}

          {shouldCollapse && (
            <button
              type="button"
              className={`agent-deck-more-btn compact font-mono ${isExpanded ? 'is-expanded' : ''}`}
              onClick={(e) => toggleCardAgentsExpanded(listCardKey, e)}
              title={
                isExpanded
                  ? 'Show fewer agents'
                  : `+${hiddenCount} more: ${overflowItems.map((i) => i.agent.name).join(', ')}`
              }
            >
              <span>{isExpanded ? 'Less' : `+${hiddenCount}`}</span>
              <ChevronDown size={9} className={`deck-chevron ${isExpanded ? 'rotated' : ''}`} />
            </button>
          )}
        </div>

        {shouldCollapse && (
          <div className={`agent-deck-expandable list-expandable ${isExpanded ? 'is-expanded' : ''}`}>
            <div className="agent-deck-expandable-content">
              <div className="list-agents-overflow-pills">
                {overflowItems.map(({ agent: ag, isInstalled, isFiltered }, idx) => {
                  const AgentIcon = AGENT_ICON_MAP[ag.id] || AGENT_ICON_MAP[ag.iconName] || Bot;
                  return (
                    <button
                      type="button"
                      key={ag.id}
                      className={`agent-deck-pill compact ${isInstalled ? 'installed' : 'pending'} ${isFiltered ? 'is-filtered' : ''}`}
                      style={{
                        color: ag.color,
                        borderColor: isFiltered
                          ? `${ag.color}75`
                          : isInstalled
                          ? `${ag.color}40`
                          : `${ag.color}28`,
                        background: isFiltered
                          ? `${ag.color}16`
                          : isInstalled
                          ? `${ag.color}0e`
                          : `${ag.color}06`,
                        animationDelay: `${idx * 24}ms`,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAgentPillClick(ag.id);
                      }}
                      title={
                        isFiltered
                          ? `Filtered by ${ag.name} (click to clear)`
                          : isInstalled
                          ? `Active in ${ag.name} (click to filter)`
                          : `Pending target: ${ag.name} (click to filter)`
                      }
                    >
                      <AgentIcon size={10} className="pill-brand-icon" />
                      <span className="pill-name">{isInstalled ? ag.name : `+${ag.name}`}</span>
                      {isFiltered && <Check size={8} className="pill-check-icon" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
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

  // Check if confirmation is skipped or trigger confirmation modal
  const initiateUninstallSkill = (skill: UnifiedSkillCard) => {
    try {
      const skipConfirm = localStorage.getItem(CONFIRM_UNINSTALL_SKILL_KEY) === 'true';
      if (skipConfirm) {
        handleUninstallSkill(skill);
        if (selectedSkillForDetails?.id === skill.id) {
          handleCloseDetailsModal();
        }
        return;
      }
    } catch {}
    setDontAskAgainUninstall(false);
    setSkillToConfirmUninstall(skill);
  };

  const handleExecuteConfirmedUninstall = async () => {
    if (!skillToConfirmUninstall) return;
    const target = skillToConfirmUninstall;
    if (dontAskAgainUninstall) {
      try {
        localStorage.setItem(CONFIRM_UNINSTALL_SKILL_KEY, 'true');
      } catch {}
    }
    handleCloseConfirmModal();
    if (selectedSkillForDetails?.id === target.id) {
      handleCloseDetailsModal();
    }
    await handleUninstallSkill(target);
  };

  // Reinstall skill: cleanly removes local copy and downloads fresh from web
  const handleReinstallSkill = async (skill: UnifiedSkillCard) => {
    if (!window.electronAPI?.installSkill || !window.electronAPI?.uninstallSkill) return;

    const targetAgents = skill.installedAgents.filter((agent) =>
      selectedAgents.length === 0 || selectedAgents.some((sel) => sel.id === agent.id)
    );
    const effectiveTargets = targetAgents.length > 0 ? targetAgents : skill.installedAgents;
    if (effectiveTargets.length === 0) return;

    let rawUrl = skill.rawUrl;
    if (!rawUrl) {
      const cat = activeSkillsCatalog.find((c) => c.id.toLowerCase() === skill.id.toLowerCase());
      if (cat?.rawUrl) {
        rawUrl = cat.rawUrl;
      } else if (skill.sourceRepo) {
        rawUrl = `https://raw.githubusercontent.com/${skill.sourceRepo}/main/skills/${skill.id}/SKILL.md`;
      } else {
        rawUrl = `https://raw.githubusercontent.com/sickn33/agentic-awesome-skills/main/skills/${skill.id}/SKILL.md`;
      }
    }

    setLoadingSkillId(skill.id);
    try {
      // 1. Remove current copy
      await window.electronAPI.uninstallSkill({
        skillId: skill.id,
        targets: effectiveTargets.map((a) => ({
          agentId: a.id,
          skillsDir: a.paths.skillsDir,
        })),
      });

      // 2. Fetch fresh copy and install
      const res = await window.electronAPI.installSkill({
        skillId: skill.id,
        rawUrl,
        targets: effectiveTargets.map((a) => ({
          agentId: a.id,
          skillsDir: a.paths.skillsDir,
        })),
      });

      if (res.success) {
        toast.success(`Reinstalled "${skill.name}" with the latest version from web.`);
        logActivity({
          type: 'SKILL',
          title: 'Skill Reinstalled',
          description: `Cleanly reinstalled "${skill.name}" from web on ${effectiveTargets.map((a) => a.name).join(', ')}`,
          status: 'success',
        });
        if (onRefreshCapabilities) {
          await onRefreshCapabilities();
        }
      } else {
        toast.error(`Reinstall failed: ${res.error || 'Failed to download fresh skill'}`);
      }
    } catch (err: any) {
      toast.error(`Reinstall error: ${err.message || 'Unknown error'}`);
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

  const renderSkillActions = (
    skill: UnifiedSkillCard,
    isInstalledOnAll: boolean,
    isPartiallyInstalled: boolean,
    isLoading: boolean
  ) => (
    <div className="toolbar-right-actions" onClick={(e) => e.stopPropagation()}>
      {/* 1. Enable / Disable Toggle Button */}
      {skill.installedAgents.length > 0 && (
        <button
          type="button"
          className={`card-action-icon-btn toggle-state-btn ${skill.isDisabled ? 'disabled-state' : 'active-state'}`}
          onClick={(e) => {
            e.stopPropagation();
            handleToggleSkill(skill);
          }}
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

      {/* 2. Reinstall (if installed) OR Install (if catalog/available) */}
      {skill.installedAgents.length > 0 ? (
        <button
          type="button"
          className="card-action-icon-btn reinstall"
          onClick={(e) => {
            e.stopPropagation();
            handleReinstallSkill(skill);
          }}
          disabled={isLoading}
          title="Reinstall latest version from web (removes local copy and fetches fresh)"
          aria-label="Reinstall Skill"
        >
          {isLoading ? (
            <Loader2 size={12} className="spin" />
          ) : (
            <RotateCcw size={13} />
          )}
        </button>
      ) : (
        (!isInstalledOnAll && skill.isCatalog) && (
          <button
            type="button"
            className="card-primary-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleInstallSkill(skill);
            }}
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
        )
      )}

      {/* 3. More Options Menu Button (...) */}
      <button
        type="button"
        className={`card-action-icon-btn more-options-btn ${moreMenuSkillId === skill.id ? 'active' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          if (moreMenuSkillId === skill.id) {
            setMoreMenuSkillId(null);
            setMoreMenuPosition(null);
          } else {
            const rect = e.currentTarget.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            const openUpward = spaceBelow < 280 && spaceAbove > spaceBelow;
            setMoreMenuPosition({
              top: openUpward ? undefined : rect.bottom + 6,
              bottom: openUpward ? window.innerHeight - rect.top + 6 : undefined,
              right: Math.max(8, window.innerWidth - rect.right),
              maxHeight: Math.max(160, (openUpward ? spaceAbove : spaceBelow) - 16),
            });
            setMoreMenuSkillId(skill.id);
          }
        }}
        title="More actions and details"
        aria-label="More actions"
      >
        <MoreVertical size={13} />
      </button>
    </div>
  );

  return (
    <div className="skills-view-container">
      {/* View Header with Segmented Filter */}
      <div className="skills-view-header">
        <div className="header-info">
          <div className="title-line">
            <h2 className="view-title">Agent Skills</h2>
            <span className="count-pill font-mono">{skills.length} INSTALLED</span>
            <span className="catalog-pill font-mono">{activeSkillsCatalog.length.toLocaleString()} <span className="pill-text-long">IN CLOUD </span>CATALOG</span>
            {catalogSyncedAt && (
              <span className="sync-pill font-mono" title={`Synced with AAS: ${new Date(catalogSyncedAt).toLocaleString()}`}>
                <CheckCircle2 size={10} /> AAS SYNCED
              </span>
            )}
            <span
              className="security-hub-pill font-mono"
              title="AgentForge is an open hub: packages are open-source and run locally. Always review upstream source before installing."
            >
              <ShieldCheck size={10} /> COMMUNITY HUB
            </span>
          </div>
          <p className="view-desc">
            Browse installed skills across your selected agent(s) or 1-click install from the 2,100+ Agentic Awesome Skills cloud catalog.
          </p>
        </div>

        <div className="header-actions-wrap">
          {/* Segmented Tab Controls on the right */}
          <div className="segmented-controls" ref={segmentedControlsRef}>
            <div
              className="segment-indicator-pill"
              style={{
                transform: `translateX(${segmentPillStyle.left}px)`,
                width: `${segmentPillStyle.width}px`,
                opacity: segmentPillStyle.isReady ? 1 : 0,
                transition: isPillAnimatedRef.current
                  ? 'transform 0.24s cubic-bezier(0.16, 1, 0.3, 1), width 0.24s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease'
                  : 'opacity 0.15s ease',
              }}
            />
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
              <span className="segment-full-label">Available in Catalog</span>
              <span className="segment-short-label">Catalog</span>{' '}
              <span className="segment-count">{counts.available}</span>
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

      {/* Linear-Style Sleek Filter Toolbar with Category & Agent Filter Chips */}
      <div className="category-toolbar-row">
        {/* Left: Filter Controls Group */}
        <div className="toolbar-filters-group">
          {/* Category Filter Dropdown Chip */}
          <div className="filter-dropdown-wrapper" ref={categoryMenuRef}>
            <button
              type="button"
              className={`filter-chip-trigger ${selectedCategory !== 'All' ? 'active' : ''}`}
              onClick={() => {
                setIsCategoryMenuOpen((prev) => !prev);
                setIsAgentMenuOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  setIsCategoryMenuOpen(true);
                  setIsAgentMenuOpen(false);
                } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                  setIsCategoryMenuOpen(true);
                  setIsAgentMenuOpen(false);
                  setCategorySearchQuery(e.key);
                }
              }}
              title="Filter skills by category"
            >
              <Filter size={12} className="filter-chip-icon text-purple" />
              <span className="filter-chip-label">Category:</span>
              <span className="filter-chip-value">
                {selectedCategory === 'All' ? 'All' : selectedCategory}
              </span>
              <ChevronDown
                size={11}
                className={`filter-chip-chevron ${isCategoryMenuOpen ? 'open' : ''}`}
              />
            </button>

            {isCategoryMenuOpen && (
              <div className="toolbar-dropdown-menu">
                <div className="toolbar-dropdown-header">
                  <span>Filter by Category</span>
                  {selectedCategory !== 'All' && (
                    <button
                      type="button"
                      className="toolbar-dropdown-reset-btn"
                      onClick={() => {
                        setSelectedCategory('All');
                        setIsCategoryMenuOpen(false);
                      }}
                    >
                      Reset
                    </button>
                  )}
                </div>

                <div className="toolbar-combobox-search-wrap">
                  <Search size={12} className="toolbar-combobox-search-icon" />
                  <input
                    ref={categorySearchInputRef}
                    type="text"
                    className="toolbar-combobox-search-input"
                    placeholder="Search category..."
                    value={categorySearchQuery}
                    onChange={(e) => setCategorySearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsCategoryMenuOpen(false);
                      } else if (e.key === 'Enter') {
                        const match = filteredCategories.find(c => c !== 'All') || (categorySearchQuery.toLowerCase() === 'all' ? 'All' : null);
                        if (match) {
                          setSelectedCategory(match);
                          setIsCategoryMenuOpen(false);
                        }
                      }
                    }}
                  />
                  {categorySearchQuery && (
                    <button
                      type="button"
                      className="toolbar-combobox-clear-btn"
                      onClick={() => setCategorySearchQuery('')}
                      title="Clear search"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>

                <div className="toolbar-dropdown-list">
                  {filteredCategories.includes('All') && (
                    <button
                      type="button"
                      className={`toolbar-dropdown-item ${selectedCategory === 'All' ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedCategory('All');
                        setIsCategoryMenuOpen(false);
                      }}
                    >
                      <div className="toolbar-dropdown-item-left">
                        <Filter size={12} className="text-purple" />
                        <span className="toolbar-dropdown-item-name">All Categories</span>
                      </div>
                      <div className="toolbar-dropdown-item-right">
                        <span className="toolbar-dropdown-item-count">{categoryCounts['All'] ?? 0}</span>
                        {selectedCategory === 'All' && <Check size={12} className="toolbar-dropdown-item-check text-purple" />}
                      </div>
                    </button>
                  )}

                  {filteredCategories.includes('All') && filteredCategories.filter(c => c !== 'All').length > 0 && (
                    <div className="toolbar-dropdown-divider" />
                  )}

                  {filteredCategories
                    .filter((c) => c !== 'All')
                    .map((cat) => {
                      const isSelected = selectedCategory === cat;
                      const count = categoryCounts[cat] ?? 0;
                      return (
                        <button
                          type="button"
                          key={cat}
                          className={`toolbar-dropdown-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedCategory(cat);
                            setIsCategoryMenuOpen(false);
                          }}
                        >
                          <div className="toolbar-dropdown-item-left">
                            <span className="toolbar-dropdown-item-name">{cat}</span>
                          </div>
                          <div className="toolbar-dropdown-item-right">
                            <span className="toolbar-dropdown-item-count">{count}</span>
                            {isSelected && <Check size={12} className="toolbar-dropdown-item-check text-purple" />}
                          </div>
                        </button>
                      );
                    })}

                  {filteredCategories.length === 0 && (
                    <div className="toolbar-dropdown-empty">
                      <span>No categories found</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Agent Filter Dropdown Chip */}
          {selectedAgents.length > 1 && (() => {
            const singleFilteredAgent = currentAgentFilter.length === 1
              ? selectedAgents.find((a) => a.id === currentAgentFilter[0])
              : null;
            const AgentTriggerIcon = singleFilteredAgent
              ? (AGENT_ICON_MAP[singleFilteredAgent.id] || AGENT_ICON_MAP[singleFilteredAgent.iconName] || Bot)
              : Bot;

            return (
              <div className="filter-dropdown-wrapper agent-dropdown-wrapper" ref={agentMenuRef}>
                <button
                  type="button"
                  className={`filter-chip-trigger ${currentAgentFilter.length > 0 ? 'active' : ''}`}
                  style={
                    singleFilteredAgent
                      ? {
                          borderColor: `${singleFilteredAgent.color}55`,
                          background: `${singleFilteredAgent.color}14`,
                        }
                      : currentAgentFilter.length > 1
                      ? {
                          borderColor: 'rgba(139, 92, 246, 0.4)',
                          background: 'rgba(139, 92, 246, 0.1)',
                        }
                      : undefined
                  }
                  onClick={() => {
                    setIsAgentMenuOpen((prev) => !prev);
                    setIsCategoryMenuOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      setIsAgentMenuOpen(true);
                      setIsCategoryMenuOpen(false);
                    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                      setIsAgentMenuOpen(true);
                      setIsCategoryMenuOpen(false);
                      setAgentSearchQuery(e.key);
                    }
                  }}
                  title="Filter skills to specific target agents"
                >
                  <AgentTriggerIcon
                    size={12}
                    style={
                      singleFilteredAgent
                        ? { color: singleFilteredAgent.color }
                        : currentAgentFilter.length > 1
                        ? { color: '#8b5cf6' }
                        : { color: '#94a3b8' }
                    }
                  />
                  <span className="filter-chip-label">Agent:</span>
                  <span
                    className="filter-chip-value"
                    style={singleFilteredAgent ? { color: singleFilteredAgent.color } : undefined}
                  >
                    {currentAgentFilter.length === 0
                      ? `All (${selectedAgents.length})`
                      : singleFilteredAgent?.name || (currentAgentFilter.length === 1 ? '1 Agent' : `${currentAgentFilter.length} Agents`)}
                  </span>
                  <ChevronDown
                    size={11}
                    className={`filter-chip-chevron ${isAgentMenuOpen ? 'open' : ''}`}
                  />
                </button>

                {isAgentMenuOpen && (
                  <div className="toolbar-dropdown-menu">
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

                    <div className="toolbar-combobox-search-wrap">
                      <Search size={12} className="toolbar-combobox-search-icon" />
                      <input
                        ref={agentSearchInputRef}
                        type="text"
                        className="toolbar-combobox-search-input"
                        placeholder="Search agent..."
                        value={agentSearchQuery}
                        onChange={(e) => setAgentSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setIsAgentMenuOpen(false);
                          } else if (e.key === 'Enter') {
                            const first = filteredTargetAgents[0];
                            if (first) {
                              handleToggleAgentFilter(first.id);
                              setIsAgentMenuOpen(false);
                            }
                          }
                        }}
                      />
                      {agentSearchQuery && (
                        <button
                          type="button"
                          className="toolbar-combobox-clear-btn"
                          onClick={() => setAgentSearchQuery('')}
                          title="Clear search"
                        >
                          <X size={10} />
                        </button>
                      )}
                    </div>

                    <div className="toolbar-dropdown-list">
                      {(!agentSearchQuery.trim() || 'all selected agents'.includes(agentSearchQuery.toLowerCase())) && (
                        <button
                          type="button"
                          className={`toolbar-dropdown-item ${currentAgentFilter.length === 0 ? 'selected' : ''}`}
                          onClick={() => {
                            handleToggleAgentFilter(null);
                            setIsAgentMenuOpen(false);
                          }}
                        >
                          <div className="toolbar-dropdown-item-left">
                            <Bot size={13} className="text-muted" />
                            <span className="toolbar-dropdown-item-name">All Selected Agents</span>
                          </div>
                          <div className="toolbar-dropdown-item-right">
                            <span className="toolbar-dropdown-item-count">{selectedAgents.length}</span>
                            {currentAgentFilter.length === 0 && <Check size={12} className="toolbar-dropdown-item-check text-purple" />}
                          </div>
                        </button>
                      )}

                      {(!agentSearchQuery.trim() || 'all selected agents'.includes(agentSearchQuery.toLowerCase())) && filteredTargetAgents.length > 0 && (
                        <div className="toolbar-dropdown-divider" />
                      )}

                      {filteredTargetAgents.map((ag) => {
                        const isFiltered = currentAgentFilter.includes(ag.id);
                        const agentSkillsCount = skills.filter((s) => s.sourceAgentId === ag.id && !s.pluginName).length;
                        const AgentIcon = AGENT_ICON_MAP[ag.id] || AGENT_ICON_MAP[ag.iconName] || Bot;
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
                              {isFiltered && <Check size={12} className="toolbar-dropdown-item-check" style={{ color: ag.color }} />}
                            </div>
                          </button>
                        );
                      })}

                      {filteredTargetAgents.length === 0 && (agentSearchQuery.trim() && !'all selected agents'.includes(agentSearchQuery.toLowerCase())) && (
                        <div className="toolbar-dropdown-empty">
                          <span>No agents found</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Quick Reset All Filters Button */}
          {(selectedCategory !== 'All' || currentAgentFilter.length > 0) && (
            <Tooltip content="Reset all active filters">
              <button
                type="button"
                className="toolbar-reset-filters-btn"
                onClick={() => {
                  setSelectedCategory('All');
                  handleToggleAgentFilter(null);
                }}
                aria-label="Reset all active filters"
              >
                <RotateCcw size={13} className="reset-btn-icon" />
              </button>
            </Tooltip>
          )}
        </div>

        {/* Right: Results Count & View Mode Toggle */}
        <div className="category-toolbar-right">
          <span className="toolbar-items-count font-mono">
            {filteredSkills.length} {filteredSkills.length === 1 ? 'skill' : 'skills'}
          </span>
          <div className="view-mode-toggle font-mono" role="group" aria-label="View mode">
            <Tooltip content="Grid view">
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => handleViewModeChange('grid')}
                aria-label="Grid View"
              >
                <LayoutGrid size={13} />
              </button>
            </Tooltip>
            <Tooltip content="List view">
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => handleViewModeChange('list')}
                aria-label="List View"
              >
                <ListIcon size={13} />
              </button>
            </Tooltip>
          </div>
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
        <div key={`${activeSegment}-empty`} className="empty-state-card segment-content-animated">
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
          {viewMode === 'grid' ? (
            <div key={`${activeSegment}-grid`} className="skills-grid segment-content-animated">
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
                    onClick={() => setSelectedSkillForDetails(skill)}
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
                          </div>
                        </div>
                      </div>

                      <div className="card-header-right">
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

                    {/* Card Body: Description + Prerequisite Alert + Equipped Agents */}
                    <div className="card-content-body">
                      <p className={`card-description-text ${!skill.description ? 'empty-desc' : ''}`}>
                        {skill.description || 'No description provided for this skill.'}
                      </p>

                      {depStatus.status === 'missing' && depStatus.firstMissing && (
                        <div className="card-prereq-alert font-mono">
                          <div
                            className="prereq-alert-label"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDepDrawerTarget({
                                targetName: skill.name,
                                requiredBinaries,
                              });
                            }}
                            title={`Prerequisites missing: ${depStatus.missingBinaries.join(', ')}. Click to inspect install instructions.`}
                          >
                            <AlertCircle size={11} className="prereq-alert-icon" />
                            <span>Requires: <strong>{depStatus.firstMissing}</strong></span>
                          </div>
                          <button
                            type="button"
                            className={`prereq-quick-copy ${copiedDepKey === `dep-${skill.id}` ? 'copied' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyMissingDep(`dep-${skill.id}`, depStatus.firstMissing!);
                            }}
                            title={`Copy install command: ${getInstallSnippetForPlatform(depStatus.firstMissing)}`}
                            aria-label="Copy install command"
                          >
                            {copiedDepKey === `dep-${skill.id}` ? <Check size={10} /> : <Copy size={10} />}
                            <span>{copiedDepKey === `dep-${skill.id}` ? 'COPIED' : 'INSTALL'}</span>
                          </button>
                        </div>
                      )}

                      {renderAgentTargetsDeck(skill.installedAgents, skill.id)}
                    </div>

                    {/* Card Bottom Toolbar */}
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

                      {renderSkillActions(skill, isInstalledOnAll, isPartiallyInstalled, isLoading)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div key={`${activeSegment}-list`} className="skills-list segment-content-animated">
              <div className="skills-list-header font-mono">
                <span className="col-identity">SKILL & DETAILS</span>
                <span className="col-meta">CATEGORY & SOURCE</span>
                <span className="col-agents">EQUIPPED IN</span>
                <span className="col-status">STATUS / PREREQ</span>
                <span className="col-actions right">ACTIONS</span>
              </div>
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
                    className={`skill-row-card ${isHighlighted ? 'item-card-highlighted' : ''} ${skill.isDisabled ? 'is-card-disabled' : ''}`}
                    onClick={() => setSelectedSkillForDetails(skill)}
                  >
                    {/* Identity Col */}
                    <div className="list-col col-identity">
                      <div className="card-icon-avatar list-avatar">
                        <Sparkles size={15} />
                      </div>
                      <div className="list-identity-text">
                        <div className="list-title-row">
                          <span className="card-item-name" title={skill.name}>{skill.name}</span>
                          {skill.hasScripts && (
                            <span className="meta-subtle-badge font-mono" title="Contains automation scripts">
                              <FileCode2 size={10} />
                              <span>scripts</span>
                            </span>
                          )}
                          {skill.hasReferences && (
                            <span className="meta-subtle-badge font-mono" title="Contains reference docs">
                              <BookOpen size={10} />
                              <span>docs</span>
                            </span>
                          )}
                          {skill.pluginName && (
                            <span className="meta-subtle-badge font-mono" title={`Bundled in ${skill.pluginName}`}>
                              <Package size={10} />
                              <span>{skill.pluginName}</span>
                            </span>
                          )}
                        </div>
                        <p className="list-description-snippet" title={skill.description}>{skill.description}</p>
                      </div>
                    </div>

                    {/* Meta Col */}
                    <div className="list-col col-meta">
                      {skill.category && (
                        <span className="card-cat-text font-mono">{skill.category}</span>
                      )}
                      {skill.author && (
                        <span className="author-text font-mono">by {skill.author}</span>
                      )}
                      {skill.sourceRegistry && (() => {
                        const badge = formatSourceBadge(skill.sourceRegistry);
                        return (
                          <span
                            className={`source-registry-pill font-mono ${badge.badgeClass}`}
                            title={`${badge.tooltip} · License: ${skill.license || 'MIT'}`}
                          >
                            {badge.badgeText}
                          </span>
                        );
                      })()}
                    </div>

                    {/* Equipped Agents Col */}
                    <div className="list-col col-agents">
                      {renderListAgentTargetsDeck(skill.installedAgents, skill.id)}
                    </div>

                    {/* Status & Prereqs Col */}
                    <div className="list-col col-status">
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
                                ? `Prerequisites: ${requiredBinaries.join(', ')} (Verified on system PATH)`
                                : `Missing prerequisite: ${depStatus.missingBinaries.join(', ')}`
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
                          title={skill.isDisabled ? 'Skill is disabled on equipped agents. Click to enable.' : `Equipped on ${skill.installedAgents.length}/${selectedAgents.length} agents.`}
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

                    {/* Actions Col */}
                    <div className="list-col col-actions right">
                      {renderSkillActions(skill, isInstalledOnAll, isPartiallyInstalled, isLoading)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

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

      {/* Floating More Options Dropdown */}
      {moreMenuSkillId && moreMenuPosition && (() => {
        const activeSkill = filteredSkills.find((s) => s.id === moreMenuSkillId);
        if (!activeSkill) return null;
        const isInstalled = activeSkill.installedAgents.length > 0;

        return createPortal(
          <div
            className="card-options-dropdown"
            style={{
              position: 'fixed',
              top: moreMenuPosition.top !== undefined ? `${moreMenuPosition.top}px` : undefined,
              bottom: moreMenuPosition.bottom !== undefined ? `${moreMenuPosition.bottom}px` : undefined,
              right: `${moreMenuPosition.right}px`,
              maxHeight: moreMenuPosition.maxHeight ? `${moreMenuPosition.maxHeight}px` : undefined,
              zIndex: 9999,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="dropdown-item"
              onClick={() => {
                setSelectedSkillForDetails(activeSkill);
                setMoreMenuSkillId(null);
                setMoreMenuPosition(null);
              }}
            >
              <Info size={13} className="item-icon" style={{ color: '#c084fc' }} />
              <span>Skill Details</span>
            </button>

            {isInstalled && (
              <button
                className="dropdown-item"
                onClick={() => {
                  handleEditSkill(activeSkill);
                  setMoreMenuSkillId(null);
                  setMoreMenuPosition(null);
                }}
              >
                <Edit3 size={13} className="item-icon" />
                <span>Edit Playbook</span>
              </button>
            )}

            {isInstalled && (
              <button
                className="dropdown-item"
                onClick={() => {
                  handleOpenSkillFolder(activeSkill);
                  setMoreMenuSkillId(null);
                  setMoreMenuPosition(null);
                }}
              >
                <FolderOpen size={13} className="item-icon" />
                <span>Open in Explorer</span>
              </button>
            )}

            {isInstalled && !activeSkill.pluginName && (
              <button
                className="dropdown-item"
                onClick={() => {
                  setTransferSourceAgentId(activeSkill.installedAgents[0]?.id);
                  setTransferSkillSlug(activeSkill.id);
                  setTransferSelectedSlugs([activeSkill.id]);
                  setIsTransferModalOpen(true);
                  setMoreMenuSkillId(null);
                  setMoreMenuPosition(null);
                }}
              >
                <ArrowRightLeft size={13} className="item-icon" />
                <span>Transfer / Clone</span>
              </button>
            )}

            <button
              className="dropdown-item"
              onClick={() => {
                handleCopySkillCommand(activeSkill);
                setMoreMenuSkillId(null);
                setMoreMenuPosition(null);
              }}
            >
              {copiedSkillId === activeSkill.id ? (
                <Check size={13} className="item-icon" style={{ color: '#34d399' }} />
              ) : (
                <Copy size={13} className="item-icon" />
              )}
              <span>{copiedSkillId === activeSkill.id ? 'Copied CLI Command!' : 'Copy CLI Command'}</span>
            </button>

            {activeSkill.sourceRepo && (
              <button
                className="dropdown-item"
                onClick={() => {
                  let url = `https://github.com/${activeSkill.sourceRepo}/tree/main/skills/${activeSkill.id}`;
                  if (activeSkill.rawUrl && activeSkill.rawUrl.includes('raw.githubusercontent.com')) {
                    url = activeSkill.rawUrl
                      .replace('https://raw.githubusercontent.com/', 'https://github.com/')
                      .replace(/\/main\//, '/tree/main/')
                      .replace(/\/SKILL\.md$/i, '');
                  }
                  if (window.electronAPI?.openExternal) {
                    window.electronAPI.openExternal(url);
                  } else {
                    window.open(url, '_blank');
                  }
                  setMoreMenuSkillId(null);
                  setMoreMenuPosition(null);
                }}
              >
                <Globe size={13} className="item-icon" />
                <span>View Source on GitHub</span>
              </button>
            )}

            {isInstalled && (
              <>
                <div className="dropdown-divider" />
                <button
                  className="dropdown-item item-danger"
                  onClick={() => {
                    initiateUninstallSkill(activeSkill);
                    setMoreMenuSkillId(null);
                    setMoreMenuPosition(null);
                  }}
                >
                  <Trash2 size={13} className="item-icon" />
                  <span>Uninstall Skill</span>
                </button>
              </>
            )}
          </div>,
          document.body
        );
      })()}

      {/* Skill Details Modal */}
      {isDetailsModalRendered && selectedSkillForDetails && createPortal(
        <div
          className={`item-modal-backdrop ${isDetailsModalClosing ? 'is-closing' : ''}`}
          onClick={handleCloseDetailsModal}
        >
          <div
            className={`item-modal-card ${isDetailsModalClosing ? 'is-closing' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="item-modal-header">
              <div className="item-modal-title-area">
                <div className="item-modal-icon-wrap skill">
                  <Sparkles size={20} />
                </div>
                <div className="item-modal-title-content">
                  <div className="item-modal-title-row">
                    <h3 className="item-modal-title">{selectedSkillForDetails.name}</h3>
                    {selectedSkillForDetails.category && (
                      <span className="item-modal-cat font-mono">{selectedSkillForDetails.category}</span>
                    )}
                  </div>
                  <div className="item-modal-subtitle">
                    <span className="badge badge-purple font-mono">SKILL</span>
                    <span className={`status-pill-clean ${selectedSkillForDetails.installedAgents.length > 0 ? (selectedSkillForDetails.isDisabled ? 'disabled' : 'installed') : 'available'} font-mono`}>
                      <span className={`status-dot ${selectedSkillForDetails.installedAgents.length > 0 ? (selectedSkillForDetails.isDisabled ? 'disabled' : 'installed') : 'available'}`} />
                      <span>
                        {selectedSkillForDetails.installedAgents.length > 0
                          ? selectedSkillForDetails.isDisabled
                            ? 'DISABLED'
                            : 'INSTALLED'
                          : 'AVAILABLE'}
                      </span>
                    </span>
                    {selectedSkillForDetails.author && (() => {
                      const authorInfo = formatAuthor(selectedSkillForDetails.author);
                      return (
                        <span
                          className={`author-text font-mono ${authorInfo.isLink ? 'clickable' : ''}`}
                          title={authorInfo.url || `Author: ${selectedSkillForDetails.author}`}
                          onClick={(e) => {
                            if (authorInfo.url) {
                              e.stopPropagation();
                              window.electronAPI?.openExternal(authorInfo.url);
                            }
                          }}
                        >
                          <span>by {authorInfo.displayText}</span>
                          {authorInfo.isLink && <ExternalLink size={10} className="author-link-icon" />}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
              <button
                className="item-modal-close-btn"
                onClick={handleCloseDetailsModal}
                title="Close (Esc)"
                aria-label="Close modal"
              >
                <X size={12} strokeWidth={2.2} />
                <kbd className="modal-esc-hint font-mono">ESC</kbd>
              </button>
            </div>

            {/* Body */}
            <div className="item-modal-body">
              {selectedSkillForDetails.description && (
                <div className="detail-section">
                  <div className="detail-label-row">
                    <span className="detail-label">DESCRIPTION</span>
                  </div>
                  <div className="detail-desc-card">
                    <p className="detail-description">{selectedSkillForDetails.description}</p>
                  </div>
                </div>
              )}

              {/* Location on Disk */}
              {resolveSkillPath(selectedSkillForDetails) && (
                <div className="detail-section">
                  <div className="detail-label-row">
                    <span className="detail-label">LOCATION ON DISK</span>
                    <button
                      className="copy-path-btn font-mono"
                      onClick={() => handleCopySkillPath(selectedSkillForDetails)}
                      title="Copy directory path"
                    >
                      {copiedPathSkillId === selectedSkillForDetails.id ? (
                        <>
                          <Check size={11} className="text-emerald" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          <span>Copy Path</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="detail-path-card">
                    <FolderOpen size={13} className="detail-path-icon" />
                    <span className="detail-path-text font-mono">
                      {resolveSkillPath(selectedSkillForDetails)}
                    </span>
                  </div>
                </div>
              )}

              {/* Equipped Agents */}
              {selectedSkillForDetails.installedAgents.length > 0 && (
                <div className="detail-section">
                  <div className="detail-label-row">
                    <span className="detail-label">
                      EQUIPPED AGENTS ({selectedSkillForDetails.installedAgents.length})
                    </span>
                  </div>
                  <div className="detail-agents-list">
                    {selectedSkillForDetails.installedAgents.map((agent) => {
                      const AgentIcon = AGENT_ICON_MAP[agent.id] || AGENT_ICON_MAP[agent.iconName] || Bot;
                      return (
                        <div
                          key={agent.id}
                          className="agent-modal-pill font-mono"
                          style={{
                            borderColor: `${agent.color || '#818cf8'}40`,
                            background: `${agent.color || '#818cf8'}10`,
                          }}
                        >
                          <AgentIcon size={12} style={{ color: agent.color || '#818cf8' }} />
                          <span className="agent-modal-pill-name">{agent.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Metadata Grid */}
              <div className="detail-meta-grid">
                <div className="meta-card">
                  <div className="meta-k">CATEGORY</div>
                  <div className="meta-v">{selectedSkillForDetails.category || 'General'}</div>
                </div>
                <div className="meta-card">
                  <div className="meta-k">AUTHOR</div>
                  {(() => {
                    const authorInfo = formatAuthor(selectedSkillForDetails.author);
                    return (
                      <div
                        className={`meta-v ${authorInfo.isLink ? 'clickable' : ''}`}
                        title={authorInfo.url || `Author: ${selectedSkillForDetails.author}`}
                        onClick={(e) => {
                          if (authorInfo.url) {
                            e.stopPropagation();
                            window.electronAPI?.openExternal(authorInfo.url);
                          }
                        }}
                      >
                        <span>{authorInfo.displayText}</span>
                        {authorInfo.isLink && <ExternalLink size={11} className="meta-link-icon" />}
                      </div>
                    );
                  })()}
                </div>
                <div className="meta-card">
                  <div className="meta-k">SOURCE</div>
                  <div className="meta-v font-mono">{selectedSkillForDetails.sourceRegistry || 'Local'}</div>
                </div>
                <div className="meta-card">
                  <div className="meta-k">LICENSE</div>
                  <div className="meta-v font-mono">{selectedSkillForDetails.license || 'MIT'}</div>
                </div>
                <div className="meta-card">
                  <div className="meta-k">SCRIPTS</div>
                  <div className="meta-v">{selectedSkillForDetails.hasScripts ? 'Available' : 'None'}</div>
                </div>
                <div className="meta-card">
                  <div className="meta-k">DOCUMENTATION</div>
                  <div className="meta-v">{selectedSkillForDetails.hasReferences ? 'Available' : 'Standard'}</div>
                </div>
              </div>

              {/* Tags if available */}
              {selectedSkillForDetails.tags && selectedSkillForDetails.tags.length > 0 && (
                <div className="detail-section">
                  <div className="detail-label-row">
                    <span className="detail-label">TAGS</span>
                  </div>
                  <div className="detail-tags-flow">
                    {selectedSkillForDetails.tags.map((tag) => (
                      <span key={tag} className="meta-subtle-badge font-mono">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="item-modal-footer">
              {selectedSkillForDetails.installedAgents.length > 0 ? (
                <button
                  className="modal-action-btn btn-danger"
                  onClick={() => {
                    initiateUninstallSkill(selectedSkillForDetails);
                  }}
                  title="Uninstall this skill"
                >
                  <Trash2 size={13} />
                  <span>Uninstall</span>
                </button>
              ) : <div />}

              <div className="item-modal-footer-right">
                {selectedSkillForDetails.installedAgents.length > 0 && (
                  <>
                    <button
                      className="modal-action-btn"
                      onClick={() => handleOpenSkillFolder(selectedSkillForDetails)}
                      title="Open skill folder in File Explorer"
                    >
                      <FolderOpen size={13} />
                      <span>Open Folder</span>
                    </button>
                    <button
                      className="modal-action-btn"
                      onClick={() => {
                        handleEditSkill(selectedSkillForDetails);
                        handleCloseDetailsModal();
                      }}
                      title="Edit SKILL.md playbook"
                    >
                      <Edit3 size={13} />
                      <span>Edit Playbook</span>
                    </button>
                    <button
                      className="modal-action-btn"
                      onClick={() => handleReinstallSkill(selectedSkillForDetails)}
                      title="Reinstall clean copy from registry"
                    >
                      <RotateCcw size={13} />
                      <span>Reinstall</span>
                    </button>
                    <button
                      className={`modal-action-btn ${selectedSkillForDetails.isDisabled ? 'btn-enable' : 'btn-disable'}`}
                      onClick={() => handleToggleSkill(selectedSkillForDetails)}
                      title={selectedSkillForDetails.isDisabled ? 'Enable skill' : 'Disable skill'}
                    >
                      {selectedSkillForDetails.isDisabled ? <Power size={13} /> : <PowerOff size={13} />}
                      <span>{selectedSkillForDetails.isDisabled ? 'Enable Skill' : 'Disable Skill'}</span>
                    </button>
                    <button
                      className="modal-action-btn btn-done"
                      onClick={handleCloseDetailsModal}
                      title="Close skill details"
                    >
                      <Check size={13} />
                      <span>Done</span>
                    </button>
                  </>
                )}
                {selectedSkillForDetails.installedAgents.length === 0 && selectedSkillForDetails.isCatalog && (
                  <>
                    <button
                      className="modal-action-btn"
                      onClick={handleCloseDetailsModal}
                    >
                      Close
                    </button>
                    <button
                      className="modal-action-btn btn-primary"
                      onClick={() => {
                        handleInstallSkill(selectedSkillForDetails);
                        handleCloseDetailsModal();
                      }}
                    >
                      <Download size={13} />
                      <span>Install Skill</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Skill Uninstall Confirmation Modal */}
      {isConfirmModalRendered && skillToConfirmUninstall && createPortal(
        <div
          className={`item-modal-backdrop confirm-modal-backdrop ${isConfirmModalClosing ? 'is-closing' : ''}`}
          onClick={handleCloseConfirmModal}
        >
          <div
            className={`confirm-dialog-card ${isConfirmModalClosing ? 'is-closing' : ''}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-skill-uninstall-title"
          >
            {/* Header */}
            <div className="confirm-dialog-header">
              <div className="confirm-dialog-icon-wrap danger">
                <Trash2 size={18} className="confirm-icon-danger" />
              </div>
              <div className="confirm-dialog-header-text">
                <h3 id="confirm-skill-uninstall-title" className="confirm-dialog-title">
                  Uninstall Skill
                </h3>
                <span className="confirm-dialog-badge font-mono">CONFIRMATION</span>
              </div>
              <button
                type="button"
                className="confirm-close-btn"
                onClick={handleCloseConfirmModal}
                aria-label="Close confirmation dialog"
              >
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="confirm-dialog-body">
              <p className="confirm-dialog-message">
                Are you sure you want to uninstall <strong className="confirm-highlight-name">{skillToConfirmUninstall.name}</strong>?
              </p>

              <div className="confirm-target-info">
                <span className="confirm-target-label font-mono">TARGET AGENT(S):</span>
                <div className="confirm-agent-tags">
                  {skillToConfirmUninstall.installedAgents.map((ag) => {
                    const AgentIconComp = AGENT_ICON_MAP[ag.iconName] || Bot;
                    return (
                      <span key={ag.id} className="confirm-agent-tag font-mono">
                        <AgentIconComp size={11} style={{ color: ag.color || '#a855f7' }} />
                        <span>{ag.name}</span>
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="confirm-warning-box">
                <AlertCircle size={14} className="confirm-warning-icon" />
                <span className="confirm-warning-text">
                  This will remove the skill folder and playbook instructions from disk.
                </span>
              </div>

              {/* "Don't ask again" checkbox */}
              <label
                className="confirm-checkbox-row"
                onClick={(e) => {
                  e.preventDefault();
                  setDontAskAgainUninstall(!dontAskAgainUninstall);
                }}
              >
                <div className={`confirm-checkbox-box ${dontAskAgainUninstall ? 'checked' : ''}`}>
                  {dontAskAgainUninstall && <Check size={11} strokeWidth={3} />}
                </div>
                <span className="confirm-checkbox-text">
                  Don't ask again for skill uninstallation
                </span>
              </label>
            </div>

            {/* Footer */}
            <div className="confirm-dialog-footer">
              <button
                type="button"
                className="confirm-action-btn cancel font-mono"
                onClick={handleCloseConfirmModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="confirm-action-btn danger font-mono"
                onClick={handleExecuteConfirmedUninstall}
                disabled={loadingSkillId === skillToConfirmUninstall.id}
              >
                {loadingSkillId === skillToConfirmUninstall.id ? (
                  <>
                    <Loader2 size={13} className="spin" />
                    <span>Uninstalling...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={13} />
                    <span>Uninstall Skill</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
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
          gap: 14px;
          background: #121826;
          border: 1px solid #1e283d;
          border-radius: 10px;
          padding: 10px 16px;
          margin-bottom: 12px;
          box-sizing: border-box;
          min-width: 0;
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
          gap: 8px;
          flex-wrap: wrap;
          min-width: 0;
        }

        .view-title {
          font-size: 16px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0;
          white-space: nowrap;
        }

        .skills-view-header .count-pill {
          font-size: 10px;
          font-weight: 700;
          color: #34d399;
          background: rgba(52, 211, 153, 0.12);
          padding: 2px 7px;
          border-radius: 4px;
          border: 1px solid rgba(52, 211, 153, 0.25);
          white-space: nowrap;
          flex-shrink: 0;
        }

        .catalog-pill {
          font-size: 10px;
          font-weight: 700;
          color: #c084fc;
          background: rgba(192, 132, 252, 0.12);
          padding: 2px 7px;
          border-radius: 4px;
          border: 1px solid rgba(192, 132, 252, 0.25);
          white-space: nowrap;
          flex-shrink: 0;
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
          white-space: nowrap;
          flex-shrink: 0;
        }

        .view-desc {
          font-size: 12px;
          color: #8899ac;
          margin: 0;
          line-height: 1.4;
        }

        .header-actions-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }

        .header-buttons-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
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
          position: relative;
          display: flex;
          align-items: center;
          height: 28px;
          background: #0b0f19;
          border: 1px solid #223048;
          border-radius: 6px;
          padding: 2px;
          gap: 2px;
          box-sizing: border-box;
          overflow: hidden;
        }

        .segment-indicator-pill {
          position: absolute;
          top: 2px;
          left: 0;
          height: 22px;
          background: #1e2a42;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
          pointer-events: none;
          z-index: 0;
          will-change: transform, width;
        }

        .segment-btn {
          position: relative;
          z-index: 1;
          background: transparent;
          border: 1px solid transparent;
          color: #8899ac;
          font-size: 11px;
          font-weight: 550;
          padding: 0 9px;
          height: 22px;
          border-radius: 4px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          transition: color 0.18s ease;
          white-space: nowrap;
          box-sizing: border-box;
          user-select: none;
        }

        .segment-btn:hover {
          color: #f1f5f9;
        }

        .segment-btn.active {
          background: transparent;
          color: #ffffff;
          font-weight: 600;
          border-color: transparent;
          box-shadow: none;
        }

        .segment-btn.active .segment-count {
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
        }

        .segment-count {
          font-size: 9.5px;
          background: rgba(255, 255, 255, 0.08);
          padding: 1px 5px;
          border-radius: 10px;
          font-family: monospace;
          transition: background-color 0.18s ease, color 0.18s ease;
        }

        .segment-content-animated {
          animation: segmentContentEnter 0.22s cubic-bezier(0.16, 1, 0.3, 1) both;
          will-change: opacity, transform;
        }

        @keyframes segmentContentEnter {
          from {
            opacity: 0.2;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
          padding: 1px 5px;
          border-radius: 10px;
          font-family: monospace;
        }

        .segment-short-label {
          display: none;
        }

        @media (max-width: 1240px) {
          .skills-view-header .sync-pill,
          .skills-view-header .security-hub-pill {
            display: none !important;
          }
        }

        @media (max-width: 1100px) {
          .skills-view-header {
            flex-wrap: wrap;
            gap: 10px;
            padding: 10px 14px;
          }

          .header-info {
            flex: 1 1 auto;
            min-width: 200px;
          }

          .header-actions-wrap {
            flex: 1 1 auto;
            justify-content: flex-start;
            flex-wrap: wrap;
            gap: 8px;
          }

          .skills-view-header .view-desc {
            display: none !important;
          }

          .pill-text-long {
            display: none !important;
          }

          .segment-full-label {
            display: none !important;
          }

          .segment-short-label {
            display: inline !important;
          }
        }

        @media (max-width: 800px) {
          .header-actions-wrap {
            width: 100%;
            justify-content: space-between;
          }
        }

        /* Category Toolbar Row - Linear Style */
        .category-toolbar-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          background: rgba(13, 19, 32, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 0 10px;
          height: 40px;
          min-height: 40px;
          max-height: 40px;
          border-radius: 8px;
          box-sizing: border-box;
          position: relative;
          z-index: 50;
          backdrop-filter: blur(12px);
          margin-bottom: 14px;
        }

        .toolbar-filters-group {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          flex-wrap: wrap;
        }

        .filter-dropdown-wrapper {
          position: relative;
          display: inline-flex;
          align-items: center;
          width: 195px;
          max-width: 220px;
          min-width: 130px;
          height: 30px;
          flex-shrink: 1;
          z-index: 60;
        }

        @media (max-width: 850px) {
          .filter-dropdown-wrapper {
            width: 150px;
          }
        }

        .filter-chip-trigger {
          display: inline-flex;
          align-items: center;
          width: 100%;
          gap: 6px;
          height: 30px;
          min-height: 30px;
          max-height: 30px;
          padding: 0 10px;
          background: rgba(20, 28, 45, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          color: #94a3b8;
          font-size: 11.5px;
          cursor: pointer;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
          box-sizing: border-box;
          user-select: none;
          white-space: nowrap;
        }

        .filter-chip-trigger:hover {
          background: rgba(27, 38, 62, 0.9);
          border-color: rgba(255, 255, 255, 0.16);
          color: #f8fafc;
        }

        .filter-chip-trigger.active {
          background: rgba(168, 85, 247, 0.12);
          border-color: rgba(168, 85, 247, 0.35);
          color: #f8fafc;
        }

        .filter-chip-icon {
          flex-shrink: 0;
        }

        .filter-chip-label {
          font-size: 11px;
          font-weight: 500;
          color: #64748b;
          letter-spacing: 0.01em;
          flex-shrink: 0;
        }

        .filter-chip-value {
          font-size: 11.5px;
          font-weight: 600;
          color: #e2e8f0;
          flex: 1;
          min-width: 0;
          text-align: left;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .filter-chip-trigger.active .filter-chip-value {
          color: #ffffff;
        }

        .filter-chip-chevron {
          color: #64748b;
          transition: transform 0.18s ease;
          flex-shrink: 0;
          margin-left: auto;
        }

        .filter-chip-chevron.open {
          transform: rotate(180deg);
        }

        .toolbar-reset-filters-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          min-width: 30px;
          min-height: 30px;
          max-width: 30px;
          max-height: 30px;
          padding: 0;
          background: rgba(20, 28, 45, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          color: #94a3b8;
          cursor: pointer;
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          box-sizing: border-box;
          flex-shrink: 0;
        }

        .toolbar-reset-filters-btn:hover {
          background: rgba(239, 68, 68, 0.14);
          border-color: rgba(239, 68, 68, 0.35);
          color: #f87171;
          box-shadow: 0 0 10px rgba(239, 68, 68, 0.18);
        }

        .toolbar-reset-filters-btn:hover .reset-btn-icon {
          transform: rotate(-45deg);
        }

        .toolbar-reset-filters-btn .reset-btn-icon {
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          display: block;
        }

        .toolbar-reset-filters-btn:active {
          transform: scale(0.94);
        }

        .category-toolbar-right {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }

        .toolbar-items-count {
          font-size: 11px;
          font-family: var(--font-mono);
          font-weight: 600;
          color: #64748b;
          letter-spacing: 0.02em;
          white-space: nowrap;
        }

        .view-mode-toggle {
          display: inline-flex;
          align-items: center;
          background: rgba(14, 21, 35, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.07);
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
          transition: all 0.12s ease;
        }

        .view-mode-btn:hover {
          color: #cbd5e1;
          background: rgba(255, 255, 255, 0.06);
        }

        .view-mode-btn.active {
          background: #1e293b;
          color: #c084fc;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        }

        /* Floating Linear-Style Popover Menu - Perfectly matched to dropdown box width */
        .toolbar-dropdown-menu {
          position: absolute;
          top: calc(100% + 5px);
          left: 0;
          right: 0;
          width: 100%;
          min-width: 100%;
          max-width: 100%;
          background: #0d1322;
          border: 1px solid rgba(255, 255, 255, 0.09);
          box-shadow: 0 16px 36px -4px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.04);
          border-radius: 8px;
          padding: 5px;
          z-index: 1000;
          backdrop-filter: blur(16px);
          animation: dropdownFadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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
          padding: 5px 8px 6px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #64748b;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
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

        .toolbar-combobox-search-wrap {
          display: flex;
          align-items: center;
          gap: 6px;
          height: 28px;
          padding: 0 8px;
          margin-bottom: 5px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 5px;
          transition: all 0.15s ease;
          box-sizing: border-box;
        }

        .toolbar-combobox-search-wrap:focus-within {
          background: rgba(255, 255, 255, 0.07);
          border-color: rgba(168, 85, 247, 0.55);
          box-shadow: 0 0 0 1px rgba(168, 85, 247, 0.25);
        }

        .toolbar-combobox-search-icon {
          color: #64748b;
          flex-shrink: 0;
        }

        .toolbar-combobox-search-input {
          flex: 1;
          min-width: 0;
          background: transparent;
          border: none;
          outline: none;
          color: #f1f5f9;
          font-size: 11px;
          font-family: inherit;
          padding: 0;
        }

        .toolbar-combobox-search-input::placeholder {
          color: #64748b;
          font-size: 11px;
        }

        .toolbar-combobox-clear-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 14px;
          height: 14px;
          padding: 0;
          background: rgba(255, 255, 255, 0.08);
          border: none;
          border-radius: 3px;
          color: #94a3b8;
          cursor: pointer;
          transition: all 0.1s ease;
          flex-shrink: 0;
        }

        .toolbar-combobox-clear-btn:hover {
          background: rgba(239, 68, 68, 0.25);
          color: #f87171;
        }

        .toolbar-dropdown-empty {
          padding: 16px 8px;
          text-align: center;
          color: #64748b;
          font-size: 11px;
          font-style: italic;
        }

        .toolbar-dropdown-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
          max-height: 280px;
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: 2px;
        }

        .toolbar-dropdown-list::-webkit-scrollbar {
          width: 4px;
        }

        .toolbar-dropdown-list::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.18);
          border-radius: 4px;
        }

        .toolbar-dropdown-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          height: 30px;
          padding: 0 8px;
          border-radius: 5px;
          background: transparent;
          border: 1px solid transparent;
          cursor: pointer;
          transition: all 0.12s ease;
          width: 100%;
          box-sizing: border-box;
          text-align: left;
        }

        .toolbar-dropdown-item:hover {
          background: rgba(255, 255, 255, 0.06);
          color: #ffffff;
        }

        .toolbar-dropdown-item.selected {
          background: rgba(168, 85, 247, 0.12);
          border-color: rgba(168, 85, 247, 0.28);
          color: #ffffff;
          font-weight: 600;
        }

        .toolbar-dropdown-item-left {
          display: flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
          flex: 1;
        }

        .toolbar-dropdown-item-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .toolbar-dropdown-item-name {
          font-size: 11.5px;
          font-weight: 500;
          color: #cbd5e1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .toolbar-dropdown-item.selected .toolbar-dropdown-item-name {
          color: #ffffff;
          font-weight: 600;
        }

        .toolbar-dropdown-item-right {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }

        .toolbar-dropdown-item-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 19px;
          height: 16px;
          padding: 0 4.5px;
          font-size: 9.5px;
          font-family: var(--font-mono, monospace);
          font-weight: 600;
          line-height: 1;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #7f91a7;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
          flex-shrink: 0;
          user-select: none;
          box-sizing: border-box;
          transition: all 0.14s ease;
        }

        .toolbar-dropdown-item:hover .toolbar-dropdown-item-count {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.16);
          color: #f1f5f9;
        }

        .toolbar-dropdown-item.selected .toolbar-dropdown-item-count {
          background: rgba(168, 85, 247, 0.22);
          border-color: rgba(168, 85, 247, 0.45);
          color: #f3e8ff;
          box-shadow: 0 0 8px rgba(168, 85, 247, 0.2);
        }

        .toolbar-dropdown-item-check {
          flex-shrink: 0;
        }

        .toolbar-dropdown-divider {
          height: 1px;
          background: rgba(255, 255, 255, 0.06);
          margin: 3px 0;
        }

        /* Skills List View */
        .skills-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
          overflow-x: auto;
          padding-bottom: 8px;
          box-sizing: border-box;
        }

        .skills-list-header {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) 150px 180px 140px 140px;
          gap: 14px;
          min-width: 900px;
          width: 100%;
          padding: 10px 18px;
          font-size: 10px;
          font-weight: 700;
          color: #718096;
          letter-spacing: 0.08em;
          background: rgba(13, 18, 30, 0.92);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 8px;
          align-items: center;
          user-select: none;
          box-sizing: border-box;
          position: sticky;
          top: 0;
          z-index: 10;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
        }

        .skills-list-header span {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          min-width: 0;
          text-align: left;
        }

        .skills-list-header .col-meta,
        .skills-list-header .col-agents,
        .skills-list-header .col-status {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          text-align: left;
        }

        .skills-list-header .right {
          justify-content: flex-end;
          text-align: right;
        }

        .skill-row-card {
          background: #0f1626;
          border: 1px solid rgba(255, 255, 255, 0.065);
          border-radius: 9px;
          padding: 10px 18px;
          display: grid;
          grid-template-columns: minmax(260px, 1fr) 150px 180px 140px 140px;
          gap: 14px;
          min-width: 900px;
          width: 100%;
          min-height: 56px;
          align-items: center;
          transition: border-color 0.12s ease, background 0.12s ease;
          position: relative;
          box-sizing: border-box;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
          cursor: pointer;
        }

        .skill-row-card:hover {
          border-color: rgba(168, 85, 247, 0.3);
          background: #131c30;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }

        .skill-row-card.is-card-disabled {
          opacity: 0.72;
          background: #0d121f;
        }

        .list-col {
          display: flex;
          align-items: center;
          min-width: 0;
        }

        .skill-row-card .col-identity {
          gap: 12px;
        }

        .card-icon-avatar.list-avatar {
          width: 34px;
          height: 34px;
          min-width: 34px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.16), rgba(99, 102, 241, 0.08));
          border: 1px solid rgba(168, 85, 247, 0.28);
          color: #c084fc;
          box-shadow: none;
          flex-shrink: 0;
          transition: border-color 0.15s ease;
        }

        .skill-row-card:hover .card-icon-avatar.list-avatar {
          border-color: rgba(168, 85, 247, 0.5);
          box-shadow: none;
          transform: none;
        }

        .list-identity-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
          overflow: hidden;
        }

        .list-title-row {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }

        .list-description-snippet {
          margin: 0;
          font-size: 11.5px;
          color: #94a3b8;
          line-height: 1.35;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .skill-row-card .col-meta {
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          gap: 3px;
          min-width: 0;
          overflow: hidden;
        }

        .col-agents {
          min-width: 0;
          display: flex;
          align-items: center;
        }

        .list-agents-deck {
          display: flex;
          flex-direction: column;
          min-width: 0;
          width: 100%;
        }

        .list-agents-base-row,
        .list-agents-pills-row {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
          min-width: 0;
          width: 100%;
        }

        .agent-deck-pill.compact {
          padding: 1.5px 6.5px;
          font-size: 9px;
          gap: 3.5px;
          border-radius: 4px;
          line-height: 13px;
        }

        .agent-deck-more-btn.compact {
          padding: 1.5px 5.5px;
          font-size: 8.5px;
          gap: 2.5px;
          border-radius: 4px;
          line-height: 13px;
        }

        .uninstalled-muted-label {
          font-size: 11px;
          color: #475569;
          white-space: nowrap;
          letter-spacing: 0.02em;
        }

        .skill-row-card .col-status,
        .list-col.col-status {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          gap: 4px;
          min-width: 0;
          width: 100%;
        }

        .col-actions.right {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          min-width: 0;
          width: 100%;
          overflow: visible;
        }

        .col-actions.right .toolbar-right-actions {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: nowrap;
          margin-left: auto;
        }

        .skills-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 14px;
        }

        .skill-card {
          background: #0f1626;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 12px;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          min-width: 0;
          min-height: 226px;
          box-sizing: border-box;
          transition: border-color 0.12s ease, background 0.12s ease;
          position: relative;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
          cursor: pointer;
        }

        .skill-card:hover {
          border-color: rgba(168, 85, 247, 0.32);
          background: #131c30;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
        }

        /* Header: Clean decoupled flex header */
        .card-header-cluster {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 8px;
          min-height: 38px;
          flex-shrink: 0;
        }

        .card-header-left {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          min-width: 0;
          flex: 1;
        }

        .skills-view-container .card-icon-avatar,
        .card-icon-avatar {
          width: 36px;
          height: 36px;
          border-radius: 9px;
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.18), rgba(99, 102, 241, 0.08));
          border: 1px solid rgba(168, 85, 247, 0.32);
          color: #c084fc;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: none;
          transition: border-color 0.15s ease;
        }

        .skill-card:hover .card-icon-avatar {
          border-color: rgba(168, 85, 247, 0.55);
          box-shadow: none;
          transform: none;
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
          font-size: 14px;
          font-weight: 600;
          color: #f8fafc;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          letter-spacing: -0.01em;
          min-width: 0;
          flex-shrink: 1;
          transition: color 0.15s ease;
        }

        .skill-card:hover .card-item-name,
        .skill-row-card:hover .card-item-name {
          color: #ffffff;
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
          max-width: 130px;
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
          max-width: 140px;
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
          border-radius: 4px;
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
          border-radius: 4px;
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
          border-radius: 4px;
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

        .card-description-text.empty-desc {
          color: #64748b;
          font-style: italic;
        }

        /* Prerequisite Alert Banner in Card Body */
        .card-prereq-alert {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          background: rgba(244, 63, 94, 0.08);
          border: 1px solid rgba(244, 63, 94, 0.25);
          border-radius: 5px;
          padding: 2px 7px;
          height: 24px;
          box-sizing: border-box;
        }

        .prereq-alert-label {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 9.5px;
          color: #fb7185;
          cursor: pointer;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
          flex: 1;
        }

        .prereq-alert-label strong {
          color: #fda4af;
        }

        .prereq-alert-icon {
          flex-shrink: 0;
          color: #fb7185;
        }

        .prereq-quick-copy {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          background: rgba(244, 63, 94, 0.15);
          border: 1px solid rgba(244, 63, 94, 0.35);
          color: #fb7185;
          font-size: 8.5px;
          font-weight: 700;
          letter-spacing: 0.04em;
          padding: 1px 5px;
          border-radius: 3px;
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.15s ease;
          height: 18px;
          box-sizing: border-box;
        }

        .prereq-quick-copy:hover {
          background: rgba(244, 63, 94, 0.25);
          color: #ffffff;
        }

        .prereq-quick-copy.copied {
          background: rgba(52, 211, 153, 0.2);
          border-color: rgba(52, 211, 153, 0.4);
          color: #34d399;
        }

        /* Modern Agent Targets Deck (Grid View) */
        .agent-deck-container {
          display: flex;
          flex-direction: column;
          gap: 7px;
          background: rgba(15, 23, 42, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 8px 10px;
          box-sizing: border-box;
          width: 100%;
          min-width: 0;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .agent-deck-container:hover {
          background: rgba(15, 23, 42, 0.65);
          border-color: rgba(255, 255, 255, 0.09);
        }

        .agent-deck-container.pending-only {
          background: rgba(15, 23, 42, 0.25);
          border-color: rgba(255, 255, 255, 0.035);
          border-style: dashed;
        }

        .agent-deck-container.empty {
          padding: 7px 10px;
        }

        .agent-deck-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          width: 100%;
          min-width: 0;
        }

        .agent-deck-label-group {
          display: flex;
          align-items: center;
          gap: 5.5px;
          min-width: 0;
        }

        .agent-deck-icon {
          color: #64748b;
          flex-shrink: 0;
        }

        .agent-deck-title {
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.05em;
          color: #718096;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .agent-deck-count-badge {
          display: inline-flex;
          align-items: center;
          font-size: 9px;
          font-weight: 600;
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.07);
          padding: 0 5px;
          border-radius: 9999px;
          line-height: 14px;
        }

        .agent-deck-filter-hint {
          font-size: 9px;
          color: #475569;
          font-style: italic;
          white-space: nowrap;
          letter-spacing: 0.01em;
          transition: color 0.15s ease;
        }

        .agent-deck-container:hover .agent-deck-filter-hint {
          color: #64748b;
        }

        .agent-deck-empty-hint {
          font-size: 10px;
          color: #475569;
          font-style: italic;
          padding: 2px 0;
        }

        .agent-deck-pills {
          display: flex;
          flex-direction: column;
          width: 100%;
          min-width: 0;
        }

        .agent-deck-base-row {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-wrap: wrap;
          width: 100%;
          min-width: 0;
        }

        .agent-deck-expandable {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 0.3s cubic-bezier(0.16, 1, 0.3, 1),
                      opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1),
                      margin-top 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          opacity: 0;
          margin-top: 0;
          width: 100%;
          min-width: 0;
        }

        .agent-deck-expandable.is-expanded {
          grid-template-rows: 1fr;
          opacity: 1;
          margin-top: 5px;
        }

        .agent-deck-expandable.list-expandable.is-expanded {
          margin-top: 4px;
        }

        .agent-deck-expandable-content {
          overflow: hidden;
          min-height: 0;
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          transform: translateY(-5px);
        }

        .agent-deck-expandable.is-expanded .agent-deck-expandable-content {
          transform: translateY(0);
        }

        .agent-deck-overflow-pills,
        .list-agents-overflow-pills {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-wrap: wrap;
          padding-top: 1px;
          padding-bottom: 2px;
          width: 100%;
          min-width: 0;
        }

        .list-agents-overflow-pills {
          gap: 4px;
        }

        .agent-deck-expandable.is-expanded .agent-deck-pill {
          animation: deckPillReveal 0.24s cubic-bezier(0.16, 1, 0.3, 1) backwards;
        }

        @keyframes deckPillReveal {
          from {
            opacity: 0;
            transform: translateY(-4px) scale(0.94);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .agent-deck-pill {
          display: inline-flex;
          align-items: center;
          gap: 4.5px;
          padding: 2.5px 7.5px;
          border-radius: 5px;
          font-size: 10px;
          font-weight: 600;
          border: 1px solid;
          cursor: pointer;
          user-select: none;
          white-space: nowrap;
          flex-shrink: 0;
          line-height: 14px;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .agent-deck-pill:hover {
          filter: brightness(1.12);
        }

        .agent-deck-pill.pending {
          border-style: dashed !important;
          opacity: 0.85;
        }

        .agent-deck-pill.pending:hover {
          opacity: 1;
          border-style: solid !important;
        }

        .agent-deck-pill.is-filtered {
          font-weight: 600;
          box-shadow: none;
        }

        .agent-deck-pill .pill-brand-icon {
          flex-shrink: 0;
        }

        .agent-deck-pill .pill-name {
          font-family: inherit;
        }

        .agent-deck-pill .pill-check-icon {
          flex-shrink: 0;
        }

        .agent-deck-more-btn {
          display: inline-flex;
          align-items: center;
          gap: 3.5px;
          padding: 2px 7px;
          border-radius: 5px;
          font-size: 9.5px;
          font-weight: 600;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #cbd5e1;
          cursor: pointer;
          user-select: none;
          white-space: nowrap;
          flex-shrink: 0;
          line-height: 14px;
          transition: background 0.18s ease,
                      border-color 0.18s ease,
                      color 0.18s ease,
                      transform 0.18s ease,
                      box-shadow 0.18s ease;
        }

        .agent-deck-more-btn:hover {
          background: rgba(255, 255, 255, 0.09);
          border-color: rgba(255, 255, 255, 0.2);
          color: #ffffff;
        }

        .agent-deck-more-btn.is-expanded {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.22);
          color: #f1f5f9;
        }

        .agent-deck-more-btn .deck-chevron {
          transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
          flex-shrink: 0;
        }

        .agent-deck-more-btn .deck-chevron.rotated {
          transform: rotate(180deg);
        }

        /* List View Equipped Agents styling */
        .equipped-agents-bar {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          background: rgba(0, 0, 0, 0.28);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 5px 8px;
          border-radius: 6px;
          min-height: 28px;
          box-sizing: border-box;
          width: 100%;
          min-width: 0;
        }

        .equipped-agents-bar.inactive {
          background: rgba(0, 0, 0, 0.15);
          border-color: rgba(255, 255, 255, 0.03);
        }

        .equipped-label {
          font-size: 9.5px;
          color: #64748b;
          font-weight: 600;
          flex-shrink: 0;
          white-space: nowrap;
          line-height: 20px;
        }

        .equipped-pills-list {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
          flex: 1;
          min-width: 0;
        }

        .equipped-pills-list.compact {
          flex-wrap: wrap;
          gap: 3.5px;
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

        .agent-pill.compact {
          padding: 1px 5px;
          font-size: 9px;
          gap: 3px;
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

        .agent-pill.unequipped {
          border-style: dashed !important;
          opacity: 0.85;
        }

        .agent-pill.unequipped:hover {
          opacity: 1 !important;
          border-style: solid !important;
        }

        /* Bottom Toolbar: Clean 36px height, consistent across tabs */
        .card-bottom-toolbar {
          margin-top: auto;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          padding-top: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-height: 36px;
          height: 36px;
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
          min-width: 0;
          overflow: hidden;
          box-sizing: border-box;
        }

        .meta-subtle-badge svg {
          flex-shrink: 0;
        }

        .meta-subtle-badge span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
          display: block;
        }

        .meta-subtle-badge.source-badge {
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.06);
          border-color: rgba(56, 189, 248, 0.2);
          max-width: 150px;
          min-width: 0;
          flex-shrink: 1;
          overflow: hidden;
        }

        .meta-subtle-badge.source-badge span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
          display: block;
        }

        .toolbar-right-actions {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
          margin-left: auto;
        }

        .card-action-icon-btn {
          width: 28px;
          height: 28px;
          min-width: 28px;
          max-width: 28px;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #8fa0b5;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
          padding: 0;
          box-sizing: border-box;
        }

        .card-action-icon-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.09);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.2);
        }

        .card-action-icon-btn.edit-btn:hover:not(:disabled) {
          background: rgba(192, 132, 252, 0.14);
          color: #e9d5ff;
          border-color: rgba(192, 132, 252, 0.35);
        }

        .card-action-icon-btn.reinstall {
          color: #a78bfa;
          border-color: rgba(167, 139, 250, 0.2);
          background: rgba(167, 139, 250, 0.05);
        }

        .card-action-icon-btn.reinstall:hover:not(:disabled) {
          background: rgba(167, 139, 250, 0.14);
          color: #ffffff;
          border-color: rgba(167, 139, 250, 0.35);
        }

        .security-hub-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: rgba(168, 85, 247, 0.08);
          border: 1px solid rgba(168, 85, 247, 0.24);
          color: #c084fc;
          font-size: 10px;
          font-weight: 600;
          padding: 2px 7px;
          border-radius: 4px;
          letter-spacing: 0.04em;
          user-select: none;
        }

        .card-action-icon-btn.danger {
          color: #f87171;
          border-color: rgba(239, 68, 68, 0.2);
          background: rgba(239, 68, 68, 0.05);
        }

        .card-action-icon-btn.danger:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.15);
          color: #ffffff;
          border-color: rgba(239, 68, 68, 0.4);
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
          gap: 5.5px;
          height: 28px;
          padding: 0 12px;
          background: rgba(168, 85, 247, 0.12);
          border: 1px solid rgba(168, 85, 247, 0.3);
          color: #e9d5ff;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.01em;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
          white-space: nowrap;
          box-sizing: border-box;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
        }

        .skills-view-container .card-primary-action-btn:hover:not(:disabled) {
          background: rgba(168, 85, 247, 0.22);
          border-color: rgba(168, 85, 247, 0.55);
          color: #ffffff;
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

        /* Highlighted Skill Card with genuine GPU animated fade-out */
        .skill-card.item-card-highlighted,
        .skill-row-card.item-card-highlighted,
        .item-card-highlighted {
          position: relative;
          z-index: 10;
          animation: highlightSkillBorder 2.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .skill-card.item-card-highlighted > *,
        .skill-row-card.item-card-highlighted > *,
        .item-card-highlighted > * {
          position: relative;
          z-index: 1;
        }

        .skill-card.item-card-highlighted::before,
        .skill-row-card.item-card-highlighted::before,
        .item-card-highlighted::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(124, 58, 237, 0.03));
          pointer-events: none;
          z-index: 0;
          animation: highlightSkillOverlay 2.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes highlightSkillBorder {
          0% {
            border-color: rgba(168, 85, 247, 0.85);
            box-shadow: 0 0 20px rgba(168, 85, 247, 0.4);
          }
          20% {
            border-color: rgba(168, 85, 247, 0.8);
            box-shadow: 0 0 16px rgba(168, 85, 247, 0.3);
          }
          45% {
            border-color: rgba(168, 85, 247, 0.6);
            box-shadow: 0 0 12px rgba(168, 85, 247, 0.2);
          }
          70% {
            border-color: rgba(168, 85, 247, 0.3);
            box-shadow: 0 0 8px rgba(168, 85, 247, 0.1);
          }
          100% {
            border-color: rgba(255, 255, 255, 0.07);
            box-shadow: none;
          }
        }

        @keyframes highlightSkillOverlay {
          0%, 25% {
            opacity: 1;
          }
          50% {
            opacity: 0.65;
          }
          75% {
            opacity: 0.25;
          }
          100% {
            opacity: 0;
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

        /* Floating 3-dots Context Menu */
        .card-options-dropdown {
          background: #111827;
          border: 1px solid #1f293d;
          border-radius: 8px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
          padding: 5px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 175px;
          max-height: calc(100vh - 24px);
          overflow-y: auto;
          overflow-x: hidden;
          animation: dropdownFadeIn 0.12s ease-out;
        }

        .card-options-dropdown::-webkit-scrollbar {
          width: 4px;
        }

        .card-options-dropdown::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
        }

        @keyframes dropdownFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .card-options-dropdown .dropdown-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 10px;
          border-radius: 5px;
          font-size: 12px;
          font-weight: 500;
          color: #cbd5e1;
          background: transparent;
          border: none;
          cursor: pointer;
          text-align: left;
          width: 100%;
          transition: background 0.1s ease, color 0.1s ease;
          white-space: nowrap;
        }

        .card-options-dropdown .dropdown-item:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.07);
          color: #ffffff;
        }

        .card-options-dropdown .dropdown-item .item-icon {
          flex-shrink: 0;
          color: #94a3b8;
        }

        .card-options-dropdown .dropdown-item:hover .item-icon {
          color: #f8fafc;
        }

        .card-options-dropdown .dropdown-item.item-danger {
          color: #f87171;
        }

        .card-options-dropdown .dropdown-item.item-danger:hover {
          background: rgba(239, 68, 68, 0.14);
          color: #fca5a5;
        }

        .card-options-dropdown .dropdown-item.item-danger .item-icon {
          color: #f87171;
        }

        .card-options-dropdown .dropdown-divider {
          height: 1px;
          background: #1e293b;
          margin: 4px 0;
        }

        /* Package Details Modal */
        .item-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(3, 7, 18, 0.78);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 18px 16px;
          animation: itemModalFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          will-change: opacity;
        }

        .item-modal-backdrop.is-closing {
          animation: itemModalFadeOut 0.16s cubic-bezier(0.4, 0, 1, 1) forwards !important;
          pointer-events: none !important;
        }

        @keyframes itemModalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes itemModalFadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }

        .item-modal-card {
          background: #0d1322;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          width: 100%;
          max-width: 740px;
          min-width: 0;
          box-sizing: border-box;
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), 0 25px 65px -12px rgba(0, 0, 0, 0.85), inset 0 1px 0 0 rgba(255, 255, 255, 0.1);
          overflow: hidden;
          overflow-x: hidden;
          animation: itemModalScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          will-change: transform, opacity;
          display: flex;
          flex-direction: column;
          max-height: min(94vh, calc(100vh - 36px));
          position: relative;
        }

        .item-modal-card.is-closing {
          animation: itemModalScaleOut 0.16s cubic-bezier(0.4, 0, 1, 1) forwards !important;
        }

        @keyframes itemModalScaleIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        @keyframes itemModalScaleOut {
          from { opacity: 1; transform: scale(1) translateY(0); }
          to { opacity: 0; transform: scale(0.96) translateY(8px); }
        }

        .item-modal-header {
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, transparent 100%), #0e1526;
          flex-shrink: 0;
          gap: 14px;
          min-width: 0;
          width: 100%;
          box-sizing: border-box;
        }

        .item-modal-title-area {
          display: flex;
          align-items: center;
          gap: 14px;
          min-width: 0;
          flex: 1;
        }

        .item-modal-title-content {
          min-width: 0;
          flex: 1;
        }

        .item-modal-icon-wrap {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .item-modal-icon-wrap.skill {
          background: rgba(168, 85, 247, 0.14);
          border: 1px solid rgba(168, 85, 247, 0.35);
          color: #c084fc;
          box-shadow: 0 0 16px rgba(168, 85, 247, 0.15);
        }

        .item-modal-icon-wrap.mcp {
          background: rgba(56, 189, 248, 0.14);
          border: 1px solid rgba(56, 189, 248, 0.35);
          color: #38bdf8;
          box-shadow: 0 0 16px rgba(56, 189, 248, 0.15);
        }

        .item-modal-icon-wrap.plugin {
          background: rgba(245, 158, 11, 0.14);
          border: 1px solid rgba(245, 158, 11, 0.35);
          color: #fbbf24;
          box-shadow: 0 0 16px rgba(245, 158, 11, 0.15);
        }

        .item-modal-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          flex-wrap: wrap;
        }

        .item-modal-title {
          font-size: 16px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          letter-spacing: -0.015em;
        }

        .item-modal-cat {
          font-size: 10.5px;
          font-weight: 600;
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 1.5px 7px;
          border-radius: 4px;
        }

        .item-modal-subtitle {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
          flex-wrap: wrap;
          min-width: 0;
          max-width: 100%;
        }

        .item-modal-subtitle .author-text {
          font-size: 10px;
          color: #64748b;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
          max-width: 320px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          line-height: 1.2;
        }

        .item-modal-subtitle .author-text.clickable {
          cursor: pointer;
          transition: color 0.12s ease;
        }

        .item-modal-subtitle .author-text.clickable:hover {
          color: #93c5fd;
          text-decoration: underline;
        }

        .author-link-icon {
          flex-shrink: 0;
          opacity: 0.7;
        }

        .item-modal-close-btn {
          align-self: flex-start;
          margin-top: 2px;
          height: 26px;
          padding: 0 7px 0 6px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          cursor: pointer;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          transition: all 0.14s cubic-bezier(0.16, 1, 0.3, 1);
          flex-shrink: 0;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
          user-select: none;
        }

        .item-modal-close-btn:hover {
          color: #f8fafc;
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.18);
        }

        .item-modal-close-btn:active {
          transform: translateY(0.5px);
          background: rgba(255, 255, 255, 0.12);
        }

        .item-modal-close-btn .modal-esc-hint,
        .modal-esc-hint {
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.04em;
          color: #64748b;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.35);
          padding: 1px 4.5px;
          border-radius: 3.5px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 15px;
          box-sizing: border-box;
          transition: all 0.14s ease;
        }

        .item-modal-close-btn:hover .modal-esc-hint {
          color: #e2e8f0;
          background: rgba(255, 255, 255, 0.09);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .item-modal-body {
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow-y: auto;
          overflow-x: hidden;
          min-height: 0;
          min-width: 0;
          width: 100%;
          box-sizing: border-box;
          flex: 1 1 auto;
          overscroll-behavior-y: contain;
        }

        .item-modal-body::-webkit-scrollbar {
          width: 5px;
        }

        .item-modal-body::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 4px;
        }

        .item-modal-body::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.25);
        }

        .detail-section {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .detail-label-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .detail-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #64748b;
          font-family: var(--font-mono, monospace);
        }

        .detail-desc-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 9px;
          padding: 9px 13px;
        }

        .detail-description {
          font-size: 13px;
          line-height: 1.6;
          color: #cbd5e1;
          word-break: break-word;
          margin: 0;
        }

        .detail-path-card {
          background: #080c14;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 8px;
          padding: 9px 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .detail-path-icon {
          color: #64748b;
          flex-shrink: 0;
        }

        .detail-path-text {
          font-size: 11.5px;
          color: #93c5fd;
          word-break: break-all;
          flex: 1;
          user-select: text;
        }

        .copy-path-btn {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #cbd5e1;
          font-size: 11px;
          font-weight: 500;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          padding: 2px 7px;
          border-radius: 5px;
          transition: all 0.12s;
        }

        .copy-path-btn:hover {
          background: rgba(255, 255, 255, 0.09);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.15);
        }

        .detail-agents-list {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
        }

        .agent-modal-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 9px;
          border-radius: 6px;
          border: 1px solid transparent;
          font-size: 11px;
          font-weight: 600;
          color: #f1f5f9;
        }

        .agent-modal-pill-name {
          font-size: 11px;
        }

        .detail-meta-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }

        .meta-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 8px 11px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
          overflow: hidden;
          box-sizing: border-box;
          transition: border-color 0.15s, background 0.15s;
        }

        .meta-card:hover {
          border-color: rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.035);
        }

        .meta-k {
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #64748b;
          font-family: var(--font-mono, monospace);
        }

        .meta-v {
          font-size: 12px;
          font-weight: 600;
          color: #e2e8f0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .meta-v.clickable {
          cursor: pointer;
          color: #93c5fd;
          transition: color 0.12s ease;
        }

        .meta-v.clickable:hover {
          color: #bfdbfe;
          text-decoration: underline;
        }

        .meta-link-icon {
          flex-shrink: 0;
          opacity: 0.7;
        }

        .detail-tags-flow {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .item-modal-footer {
          padding: 12px 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #090e1a;
          flex-shrink: 0;
          gap: 12px;
          box-sizing: border-box;
        }

        .item-modal-footer-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: nowrap;
          flex-shrink: 0;
        }

        .modal-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          height: 32px;
          padding: 0 13px;
          border-radius: 6px;
          font-size: 11.5px;
          font-weight: 600;
          letter-spacing: 0.01em;
          cursor: pointer;
          border: 1px solid rgba(255, 255, 255, 0.09);
          background: rgba(255, 255, 255, 0.05);
          color: #cbd5e1;
          transition: all 0.14s cubic-bezier(0.16, 1, 0.3, 1);
          white-space: nowrap;
          box-sizing: border-box;
          user-select: none;
        }

        .modal-action-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.2);
          transform: translateY(-1px);
        }

        .modal-action-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .modal-action-btn.btn-danger {
          color: #f87171;
          border-color: rgba(239, 68, 68, 0.25);
          background: rgba(239, 68, 68, 0.06);
        }

        .modal-action-btn.btn-danger:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.16);
          border-color: rgba(239, 68, 68, 0.45);
          color: #fca5a5;
        }

        .modal-action-btn.btn-primary {
          background: linear-gradient(135deg, #9333ea, #7c3aed);
          border-color: rgba(168, 85, 247, 0.45);
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(147, 51, 234, 0.25);
        }

        .modal-action-btn.btn-primary:hover:not(:disabled) {
          background: linear-gradient(135deg, #a855f7, #8b5cf6);
          border-color: rgba(168, 85, 247, 0.65);
          box-shadow: 0 4px 14px rgba(147, 51, 234, 0.4);
          color: #ffffff;
        }

        .modal-action-btn.btn-done {
          background: linear-gradient(135deg, #7c3aed, #8b5cf6);
          border-color: rgba(139, 92, 246, 0.45);
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(124, 58, 237, 0.25);
        }

        .modal-action-btn.btn-done:hover:not(:disabled) {
          background: linear-gradient(135deg, #6d28d9, #7c3aed);
          border-color: rgba(139, 92, 246, 0.65);
          box-shadow: 0 4px 14px rgba(124, 58, 237, 0.4);
          color: #ffffff;
        }

        .modal-action-btn.btn-enable {
          background: rgba(16, 185, 129, 0.12);
          border-color: rgba(16, 185, 129, 0.35);
          color: #6ee7b7;
        }

        .modal-action-btn.btn-enable:hover:not(:disabled) {
          background: rgba(16, 185, 129, 0.22);
          border-color: rgba(16, 185, 129, 0.55);
          color: #ffffff;
        }

        .modal-action-btn.btn-disable {
          background: rgba(244, 63, 94, 0.1);
          border-color: rgba(244, 63, 94, 0.3);
          color: #fda4af;
        }

        .modal-action-btn.btn-disable:hover:not(:disabled) {
          background: rgba(244, 63, 94, 0.2);
          border-color: rgba(244, 63, 94, 0.5);
          color: #ffffff;
        }

        /* Confirmation Dialog Styles */
        .confirm-modal-backdrop {
          z-index: 10500 !important;
        }

        .confirm-dialog-card {
          background: #0d1322;
          border: 1px solid rgba(244, 63, 94, 0.28);
          border-radius: 14px;
          width: 100%;
          max-width: 440px;
          min-width: 0;
          box-sizing: border-box;
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), 0 25px 65px -12px rgba(0, 0, 0, 0.85), 0 0 35px -5px rgba(244, 63, 94, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.08);
          overflow: hidden;
          animation: itemModalScaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          will-change: transform, opacity;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .confirm-dialog-card.is-closing {
          animation: itemModalScaleOut 0.16s cubic-bezier(0.4, 0, 1, 1) forwards !important;
        }

        .confirm-dialog-header {
          padding: 15px 18px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          align-items: center;
          gap: 12px;
          background: linear-gradient(180deg, rgba(244, 63, 94, 0.08) 0%, transparent 100%), #0e1526;
          flex-shrink: 0;
        }

        .confirm-dialog-icon-wrap {
          width: 34px;
          height: 34px;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .confirm-dialog-icon-wrap.danger {
          background: rgba(244, 63, 94, 0.12);
          border: 1px solid rgba(244, 63, 94, 0.3);
          color: #fb7185;
        }

        .confirm-dialog-header-text {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .confirm-dialog-title {
          font-size: 15px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0;
          letter-spacing: -0.01em;
        }

        .confirm-dialog-badge {
          font-size: 9.5px;
          font-weight: 700;
          color: #f43f5e;
          background: rgba(244, 63, 94, 0.12);
          border: 1px solid rgba(244, 63, 94, 0.25);
          padding: 1.5px 6px;
          border-radius: 4px;
          letter-spacing: 0.04em;
        }

        .confirm-close-btn {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          width: 26px;
          height: 26px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.14s ease;
        }

        .confirm-close-btn:hover {
          background: rgba(255, 255, 255, 0.09);
          color: #f8fafc;
        }

        .confirm-dialog-body {
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .confirm-dialog-message {
          font-size: 13px;
          color: #cbd5e1;
          line-height: 1.5;
          margin: 0;
        }

        .confirm-highlight-name {
          color: #f8fafc;
          font-weight: 600;
        }

        .confirm-target-info {
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          padding: 9px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .confirm-target-label {
          font-size: 10px;
          font-weight: 600;
          color: #64748b;
          letter-spacing: 0.04em;
        }

        .confirm-agent-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .confirm-agent-tag {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          color: #e2e8f0;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 2px 7px;
          border-radius: 5px;
        }

        .confirm-warning-box {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          background: rgba(244, 63, 94, 0.06);
          border: 1px solid rgba(244, 63, 94, 0.18);
          border-radius: 8px;
          padding: 9px 12px;
        }

        .confirm-warning-icon {
          color: #fb7185;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .confirm-warning-text {
          font-size: 11.5px;
          color: #fca5a5;
          line-height: 1.4;
        }

        .confirm-checkbox-row {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 6px 2px;
          cursor: pointer;
          user-select: none;
        }

        .confirm-checkbox-box {
          width: 16px;
          height: 16px;
          border-radius: 4px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.04);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #f8fafc;
          transition: all 0.12s ease;
          flex-shrink: 0;
        }

        .confirm-checkbox-row:hover .confirm-checkbox-box {
          border-color: rgba(255, 255, 255, 0.45);
        }

        .confirm-checkbox-box.checked {
          background: #6366f1;
          border-color: #6366f1;
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.4);
        }

        .confirm-checkbox-text {
          font-size: 12px;
          color: #94a3b8;
          transition: color 0.12s ease;
        }

        .confirm-checkbox-row:hover .confirm-checkbox-text {
          color: #e2e8f0;
        }

        .confirm-dialog-footer {
          padding: 12px 18px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(14, 21, 38, 0.95);
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
        }

        .confirm-action-btn {
          height: 32px;
          padding: 0 13px;
          border-radius: 6px;
          font-size: 11.5px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          cursor: pointer;
          transition: all 0.14s ease;
          border: none;
          outline: none;
          box-sizing: border-box;
        }

        .confirm-action-btn.cancel {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #94a3b8;
        }

        .confirm-action-btn.cancel:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #f8fafc;
        }

        .confirm-action-btn.danger {
          background: linear-gradient(135deg, #e11d48 0%, #be123c 100%);
          color: #ffffff;
          border: 1px solid rgba(244, 63, 94, 0.4);
          box-shadow: 0 2px 8px rgba(225, 29, 72, 0.25);
        }

        .confirm-action-btn.danger:hover:not(:disabled) {
          background: linear-gradient(135deg, #f43f5e 0%, #e11d48 100%);
          box-shadow: 0 4px 14px rgba(244, 63, 94, 0.4);
          transform: translateY(-0.5px);
        }

        .confirm-action-btn.danger:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 620px) {
          .item-modal-footer {
            flex-direction: column-reverse;
            align-items: stretch;
            gap: 10px;
          }
          .item-modal-footer-right {
            flex-wrap: wrap;
            justify-content: flex-end;
          }
          .item-modal-footer .btn-danger {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
};
