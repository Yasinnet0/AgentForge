import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Sparkles, 
  Bot, 
  Terminal, 
  Cpu, 
  Boxes, 
  Compass, 
  Server, 
  Layers,
  Save, 
  RotateCcw, 
  FolderOpen, 
  Plus, 
  Trash2, 
  Loader2, 
  FileText, 
  Sliders, 
  BookOpen, 
  Search,
  X,
  Edit3,
  Check,
  ChevronDown,
  MoreVertical,
  Shield,
  Filter
} from 'lucide-react';
import { SupportedAgent, RuleSection, RuleDirective, RulePreset } from '../types/agent';
import { RULE_PRESETS, DEFAULT_RULES_TEMPLATE } from '../data/rulePresets';
import { logActivity } from '../services/activityLogger';
import { MarkdownViewer, renderInlineMarkdown } from './MarkdownViewer';
import { useModalTransition } from '../hooks/useModalTransition';
import { useToast } from '../context/ToastContext';

interface RulesBuilderViewProps {
  selectedAgents: SupportedAgent[];
  allAgents: SupportedAgent[];
  searchQuery?: string;
  onRefreshCapabilities?: () => Promise<void>;
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

const PRESET_CATEGORIES: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All Categories' },
  { id: 'communication', label: 'Communication' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'git', label: 'Git Discipline' },
  { id: 'debugging', label: 'Debugging' },
  { id: 'security', label: 'Security' },
];

type ViewMode = 'visual' | 'markdown';
type ScopeMode = 'global' | 'workspace';

// Markdown Parsing
function parseMarkdownToSections(markdown: string): RuleSection[] {
  const sections: RuleSection[] = [];
  const lines = markdown.split(/\r?\n/);
  let currentSection: RuleSection | null = null;
  let sectionIndex = 0;
  let directiveIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Section header
    if (trimmed.startsWith('## ')) {
      const sectionTitle = trimmed.replace(/^##\s+/, '').trim();
      currentSection = {
        id: `section-${sectionIndex++}`,
        title: sectionTitle,
        directives: [],
      };
      sections.push(currentSection);
      continue;
    }

    // Directive bullet
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const bulletText = trimmed.replace(/^[-*]\s+/, '').trim();
      let title = 'Directive';
      let content = bulletText;

      const boldMatch = bulletText.match(/^\*\*([^*]+)\*\*(?::\s*|\s*[-–—]\s*|\s+|$)(.*)$/);
      if (boldMatch) {
        title = boldMatch[1].trim();
        content = boldMatch[2] ? boldMatch[2].trim() : '';
      } else {
        const colonIdx = bulletText.indexOf(':');
        if (colonIdx > 0 && colonIdx < 35) {
          title = bulletText.slice(0, colonIdx).trim();
          content = bulletText.slice(colonIdx + 1).trim();
        }
      }

      const directive: RuleDirective = {
        id: `dir-${directiveIndex++}`,
        title,
        content,
        category: 'engineering',
        enabled: true,
      };

      if (currentSection) {
        currentSection.directives.push(directive);
      } else {
        if (sections.length === 0) {
          currentSection = {
            id: 'section-general',
            title: 'General Directives',
            directives: [],
          };
          sections.push(currentSection);
        }
        sections[0].directives.push(directive);
      }
    }
  }

  return sections;
}

// Markdown serialization
function generateMarkdownFromSections(
  preamble: string,
  sections: RuleSection[]
): string {
  let md = preamble.trim() ? `${preamble.trim()}\n\n` : '# Agent Behavioral Directives\n\n';

  for (const section of sections) {
    md += `## ${section.title}\n`;
    for (const dir of section.directives) {
      if (dir.enabled) {
        if (dir.title && dir.title !== 'Directive') {
          if (dir.content) {
            md += `- **${dir.title}:** ${dir.content}\n`;
          } else {
            md += `- **${dir.title}**\n`;
          }
        } else {
          md += `- ${dir.content}\n`;
        }
      }
    }
    md += '\n';
  }

  return md.trim() + '\n';
}

export const RulesBuilderView: React.FC<RulesBuilderViewProps> = ({
  selectedAgents,
  allAgents,
  searchQuery: externalSearchQuery = '',
  onRefreshCapabilities,
}) => {
  // State
  const [activeAgentId, setActiveAgentId] = useState<string>(() => {
    return selectedAgents[0]?.id || allAgents[0]?.id || 'antigravity';
  });
  const [scope, setScope] = useState<ScopeMode>('global');
  const [syncBothGeminiFiles, setSyncBothGeminiFiles] = useState<boolean>(true);
  const [syncToAllSelected, setSyncToAllSelected] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<ViewMode>('visual');
  const [activeSectionId, setActiveSectionId] = useState<string>('all');
  const [localSearch, setLocalSearch] = useState<string>('');
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState<boolean>(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState<boolean>(false);
  const agentMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const [markdownContent, setMarkdownContent] = useState<string>(DEFAULT_RULES_TEMPLATE);
  const [originalLoadedContent, setOriginalLoadedContent] = useState<string>(DEFAULT_RULES_TEMPLATE);
  const [sections, setSections] = useState<RuleSection[]>(() =>
    parseMarkdownToSections(DEFAULT_RULES_TEMPLATE)
  );
  const [docPreamble, setDocPreamble] = useState<string>('# Agent Behavioral Directives');

  const [editingDirectiveId, setEditingDirectiveId] = useState<string | null>(null);
  const [editDraftTitle, setEditDraftTitle] = useState<string>('');
  const [editDraftContent, setEditDraftContent] = useState<string>('');

  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const toast = useToast();
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [resolvedFilePath, setResolvedFilePath] = useState<string>('');

  const [isPresetModalOpen, setIsPresetModalOpen] = useState<boolean>(false);
  const {
    isRendered: isPresetModalRendered,
    isClosing: isPresetModalClosing,
    handleClose: handleClosePresetModal
  } = useModalTransition(isPresetModalOpen, () => setIsPresetModalOpen(false), 140);
  const [presetSearch, setPresetSearch] = useState<string>('');
  const [selectedPresetCategory, setSelectedPresetCategory] = useState<string>('all');
  const [isPresetCategoryOpen, setIsPresetCategoryOpen] = useState<boolean>(false);
  const presetCategoryRef = useRef<HTMLDivElement>(null);

  const [isAddingSection, setIsAddingSection] = useState<boolean>(false);
  const [newSectionTitle, setNewSectionTitle] = useState<string>('');

  // Effects
  useEffect(() => {
    if (!isPresetModalRendered) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClosePresetModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPresetModalRendered, handleClosePresetModal]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: RULE_PRESETS.length };
    for (const p of RULE_PRESETS) {
      counts[p.category] = (counts[p.category] || 0) + 1;
    }
    return counts;
  }, []);

  const selectedCategoryLabel = useMemo(() => {
    return PRESET_CATEGORIES.find((c) => c.id === selectedPresetCategory)?.label || 'All Categories';
  }, [selectedPresetCategory]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (agentMenuRef.current && !agentMenuRef.current.contains(e.target as Node)) {
        setIsAgentMenuOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
      if (presetCategoryRef.current && !presetCategoryRef.current.contains(e.target as Node)) {
        setIsPresetCategoryOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Target Agent Object
  const currentAgent = useMemo(() => {
    return allAgents.find((a) => a.id === activeAgentId) || allAgents[0];
  }, [allAgents, activeAgentId]);

  // Computed
  const isDirty = useMemo(() => {
    return markdownContent.trim() !== originalLoadedContent.trim();
  }, [markdownContent, originalLoadedContent]);

  const totalDirectivesCount = useMemo(() => {
    return sections.reduce((sum, s) => sum + s.directives.length, 0);
  }, [sections]);

  const activeDirectivesCount = useMemo(() => {
    return sections.reduce((sum, s) => sum + s.directives.filter((d) => d.enabled).length, 0);
  }, [sections]);

  const currentRulesPath = useMemo(() => {
    if (scope === 'workspace') {
      if (currentAgent?.id === 'claude-code') return './CLAUDE.md';
      if (currentAgent?.id === 'cursor') return './.cursorrules';
      return './AGENTS.md';
    }
    return currentAgent?.paths?.rulesPath || '~/.gemini/config/AGENTS.md';
  }, [scope, currentAgent]);

  // File Handlers
  const loadRulesFromDisk = useCallback(async () => {
    if (!window.electronAPI?.readRules) return;

    setIsLoadingFile(true);
    setEditingDirectiveId(null);
    setActiveSectionId('all');

    try {
      const res = await window.electronAPI.readRules(currentRulesPath);
      setResolvedFilePath(res.path || currentRulesPath);

      if (res.exists && res.content.trim()) {
        setMarkdownContent(res.content);
        setOriginalLoadedContent(res.content);

        const firstHeadingIdx = res.content.indexOf('## ');
        if (firstHeadingIdx > 0) {
          setDocPreamble(res.content.slice(0, firstHeadingIdx).trim());
        } else {
          setDocPreamble('# Agent Behavioral Directives');
        }

        const parsed = parseMarkdownToSections(res.content);
        setSections(parsed);
      } else {
        const fallback = DEFAULT_RULES_TEMPLATE;
        setMarkdownContent(fallback);
        setOriginalLoadedContent(fallback);
        setDocPreamble('# Agent Behavioral Directives');
        setSections(parseMarkdownToSections(fallback));
      }
    } catch (err: any) {
      console.warn('Failed to load rules file:', err);
      toast.error(`Failed to read rules: ${err.message || 'Unknown error'}`);
    } finally {
      setIsLoadingFile(false);
    }
  }, [currentRulesPath]);

  useEffect(() => {
    loadRulesFromDisk();
  }, [loadRulesFromDisk]);

  // Directive Actions
  const updateVisualSections = (newSections: RuleSection[]) => {
    setSections(newSections);
    const newMd = generateMarkdownFromSections(docPreamble, newSections);
    setMarkdownContent(newMd);
  };

  const handleToggleDirective = (sectionId: string, directiveId: string) => {
    const updated = sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        directives: sec.directives.map((dir) =>
          dir.id === directiveId ? { ...dir, enabled: !dir.enabled } : dir
        ),
      };
    });
    updateVisualSections(updated);
  };

  const handleStartEdit = (dir: RuleDirective) => {
    setEditingDirectiveId(dir.id);
    setEditDraftTitle(dir.title);
    setEditDraftContent(dir.content);
  };

  const handleSaveEdit = (sectionId: string, directiveId: string) => {
    const updated = sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        directives: sec.directives.map((dir) =>
          dir.id === directiveId
            ? { ...dir, title: editDraftTitle.trim() || 'Directive', content: editDraftContent.trim() }
            : dir
        ),
      };
    });
    updateVisualSections(updated);
    setEditingDirectiveId(null);
  };

  const handleCancelEdit = () => {
    setEditingDirectiveId(null);
  };

  const handleDeleteDirective = (sectionId: string, directiveId: string) => {
    const updated = sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        directives: sec.directives.filter((dir) => dir.id !== directiveId),
      };
    });
    updateVisualSections(updated);
    if (editingDirectiveId === directiveId) {
      setEditingDirectiveId(null);
    }
  };

  const handleAddDirectiveToSection = (sectionId: string) => {
    const targetSec = sections.find((s) => s.id === sectionId) || sections[0];
    if (!targetSec) return;

    const newId = `dir-${Date.now()}`;
    const newDir: RuleDirective = {
      id: newId,
      title: 'New Guideline',
      content: 'Define behavioral rule, constraint, or coding standard.',
      category: 'engineering',
      enabled: true,
    };

    const updated = sections.map((sec) => {
      if (sec.id !== targetSec.id) return sec;
      return {
        ...sec,
        directives: [...sec.directives, newDir],
      };
    });

    updateVisualSections(updated);
    setActiveSectionId(targetSec.id);
    setEditingDirectiveId(newId);
    setEditDraftTitle(newDir.title);
    setEditDraftContent(newDir.content);
  };

  const handleCreateSection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSectionTitle.trim()) return;

    const newSecId = `sec-${Date.now()}`;
    const newSec: RuleSection = {
      id: newSecId,
      title: newSectionTitle.trim(),
      directives: [
        {
          id: `dir-${Date.now()}`,
          title: 'Core Guideline',
          content: 'Add actionable instruction for this directive block.',
          category: 'engineering',
          enabled: true,
        },
      ],
    };

    updateVisualSections([...sections, newSec]);
    setActiveSectionId(newSecId);
    setNewSectionTitle('');
    setIsAddingSection(false);
    toast.success(`Section "${newSec.title}" created.`);
  };

  // Delete section
  const handleDeleteSection = (sectionId: string, title: string) => {
    const updated = sections.filter((sec) => sec.id !== sectionId);
    updateVisualSections(updated);
    if (activeSectionId === sectionId) {
      setActiveSectionId('all');
    }
    toast.info(`Section "${title}" removed.`);
  };

  // Presets & Templates
  const handleApplyPreset = (preset: RulePreset) => {
    const targetSectionTitle = preset.title;
    let sectionExists = sections.find((s) => s.title.toLowerCase() === targetSectionTitle.toLowerCase());

    let updated: RuleSection[];
    if (sectionExists) {
      const newDirs: RuleDirective[] = preset.directives.map((d, i) => ({
        id: `preset-${Date.now()}-${i}`,
        title: d.title,
        content: d.content,
        category: preset.category,
        enabled: true,
      }));

      updated = sections.map((sec) =>
        sec.id === sectionExists!.id
          ? { ...sec, directives: [...sec.directives, ...newDirs] }
          : sec
      );
      setActiveSectionId(sectionExists.id);
    } else {
      const newSecId = `sec-preset-${Date.now()}`;
      const newSec: RuleSection = {
        id: newSecId,
        title: preset.title,
        directives: preset.directives.map((d, i) => ({
          id: `preset-${Date.now()}-${i}`,
          title: d.title,
          content: d.content,
          category: preset.category,
          enabled: true,
        })),
      };
      updated = [...sections, newSec];
      setActiveSectionId(newSecId);
    }

    updateVisualSections(updated);
    toast.success(`Injected preset: "${preset.title}"`);
    setIsPresetModalOpen(false);
  };

  // Markdown manual changes
  const handleMarkdownChange = (newMd: string) => {
    setMarkdownContent(newMd);
    try {
      const parsed = parseMarkdownToSections(newMd);
      setSections(parsed);
    } catch {}
  };

  // Reset to default template
  const handleReset = () => {
    setMarkdownContent(DEFAULT_RULES_TEMPLATE);
    setSections(parseMarkdownToSections(DEFAULT_RULES_TEMPLATE));
    toast.info('Directives reset to default template.');
    setIsMoreMenuOpen(false);
  };

  // Save & Deploy
  const handleSaveRules = async () => {
    if (!window.electronAPI?.saveRules) return;

    setIsSaving(true);

    const targets = syncToAllSelected
      ? selectedAgents.map((ag) => ({
          agentId: ag.id,
          rulesPath: scope === 'workspace' ? './AGENTS.md' : ag.paths.rulesPath,
        }))
      : [
          {
            agentId: currentAgent.id,
            rulesPath: currentRulesPath,
          },
        ];

    try {
      const res = await window.electronAPI.saveRules({
        targets,
        content: markdownContent,
        syncGeminiMd: syncBothGeminiFiles,
      });

      if (res.success) {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setLastSavedTime(timeStr);
        setOriginalLoadedContent(markdownContent);

        const targetNames = targets.map((t) => {
          const ag = allAgents.find((a) => a.id === t.agentId);
          return ag ? ag.name : t.agentId;
        });

        const syncNote = syncBothGeminiFiles && targets.some((t) => t.agentId === 'antigravity')
          ? ' (+ GEMINI.md sync)'
          : '';

        toast.success(`Directives deployed to ${targetNames.join(', ')}${syncNote}`);

        logActivity({
          type: 'RULES',
          title: 'Agent Directives Saved',
          description: `Saved ${activeDirectivesCount} active rules to ${targetNames.join(', ')}${syncNote}`,
          status: 'success',
          agentName: targetNames.join(', '),
        });

        if (onRefreshCapabilities) {
          await onRefreshCapabilities();
        }
      } else {
        toast.error(res.error || 'Failed to deploy directives');
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenInExplorer = () => {
    if (window.electronAPI?.openPath) {
      window.electronAPI.openPath(resolvedFilePath || currentRulesPath);
    }
    setIsMoreMenuOpen(false);
  };

  // Search & Filtering
  const filteredPresets = useMemo(() => {
    return RULE_PRESETS.filter((p) => {
      const matchesCat = selectedPresetCategory === 'all' || p.category === selectedPresetCategory;
      const matchesQuery =
        !presetSearch.trim() ||
        p.title.toLowerCase().includes(presetSearch.toLowerCase()) ||
        p.summary.toLowerCase().includes(presetSearch.toLowerCase());
      return matchesCat && matchesQuery;
    });
  }, [presetSearch, selectedPresetCategory]);

  const activeSearch = localSearch.trim() || externalSearchQuery.trim();

  const visibleSections = useMemo(() => {
    let list = sections;
    if (activeSectionId !== 'all') {
      list = list.filter((s) => s.id === activeSectionId);
    }
    if (activeSearch) {
      const q = activeSearch.toLowerCase();
      list = list
        .map((sec) => ({
          ...sec,
          directives: sec.directives.filter(
            (d) => d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q)
          ),
        }))
        .filter((sec) => sec.directives.length > 0 || sec.title.toLowerCase().includes(q));
    }
    return list;
  }, [sections, activeSectionId, activeSearch]);

  const CurrentAgentIcon = AGENT_ICON_MAP[currentAgent?.iconName] || Bot;

  return (
    <div className="clean-rules-container">
      {/* Single Consolidated Header Card */}
      <div className="clean-header-card">
        {/* Top Control Bar */}
        <div className="header-primary-row">
          <div className="header-identity">
            <h2 className="header-title">Context Rules</h2>

            {/* Compact Target Agent Selector Dropdown */}
            <div className="agent-select-wrapper" ref={agentMenuRef}>
              <button
                type="button"
                className="agent-menu-trigger"
                onClick={() => setIsAgentMenuOpen(!isAgentMenuOpen)}
                title="Change target AI agent"
              >
                <CurrentAgentIcon size={13} style={{ color: currentAgent.color }} />
                <span className="agent-name font-mono">{currentAgent.name}</span>
                <ChevronDown size={11} className={`chevron-icon ${isAgentMenuOpen ? 'open' : ''}`} />
              </button>

              {isAgentMenuOpen && (
                <div className="rules-agent-dropdown-menu">
                  <div className="menu-header font-mono">TARGET AGENTS</div>
                  {allAgents.map((ag) => {
                    const AgIcon = AGENT_ICON_MAP[ag.iconName] || Bot;
                    const isSelected = ag.id === activeAgentId;
                    return (
                      <button
                        key={ag.id}
                        type="button"
                        className={`menu-agent-item ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          setActiveAgentId(ag.id);
                          setIsAgentMenuOpen(false);
                        }}
                      >
                        <AgIcon size={13} style={{ color: ag.color }} />
                        <span className="flex-1 text-left">{ag.name}</span>
                        {isSelected && <Check size={12} className="text-purple-400" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Scope Toggle */}
            <div className="clean-scope-toggle">
              <button
                type="button"
                className={`scope-btn ${scope === 'global' ? 'active' : ''}`}
                onClick={() => setScope('global')}
              >
                Global
              </button>
              <button
                type="button"
                className={`scope-btn ${scope === 'workspace' ? 'active' : ''}`}
                onClick={() => setScope('workspace')}
              >
                Workspace
              </button>
            </div>

            {/* Status Indicators */}
            {isDirty ? (
              <span className="clean-status-tag dirty font-mono">UNSAVED</span>
            ) : lastSavedTime ? (
              <span className="clean-status-tag saved font-mono">SAVED {lastSavedTime}</span>
            ) : null}
          </div>

          {/* Right Header Actions */}
          <div className="header-primary-actions">
            {/* View Mode Toggle */}
            <div className="clean-mode-toggle">
              <button
                type="button"
                className={`mode-btn ${viewMode === 'visual' ? 'active' : ''}`}
                onClick={() => setViewMode('visual')}
                title="Structured visual policy editor"
              >
                <Sliders size={11} />
                <span>Blocks</span>
              </button>
              <button
                type="button"
                className={`mode-btn ${viewMode === 'markdown' ? 'active' : ''}`}
                onClick={() => setViewMode('markdown')}
                title="Split markdown code editor"
              >
                <FileText size={11} />
                <span>Markdown</span>
              </button>
            </div>

            {/* Preset Library Button */}
            <button
              type="button"
              className="clean-secondary-btn"
              onClick={() => setIsPresetModalOpen(true)}
              title="Open preset directives library"
            >
              <Sparkles size={12} className="text-purple-400" />
              <span>Presets</span>
            </button>

            {/* Primary Save & Deploy Button */}
            <button
              type="button"
              className="clean-primary-btn"
              onClick={handleSaveRules}
              disabled={isSaving || isLoadingFile}
              title="Save and deploy directives to disk"
            >
              {isSaving ? <Loader2 size={12} className="spin" /> : <Save size={12} />}
              <span>{isSaving ? 'Deploying...' : 'Save & Deploy'}</span>
            </button>

            {/* More Options Dropdown */}
            <div className="more-menu-wrapper" ref={moreMenuRef}>
              <button
                type="button"
                className="clean-icon-btn"
                onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                title="More settings & actions"
              >
                <MoreVertical size={13} />
              </button>

              {isMoreMenuOpen && (
                <div className="clean-dropdown-menu">
                  <div className="menu-header font-mono">DEPLOYMENT OPTIONS</div>
                  {activeAgentId === 'antigravity' && (
                    <label className="menu-checkbox-item font-mono">
                      <input
                        type="checkbox"
                        checked={syncBothGeminiFiles}
                        onChange={(e) => setSyncBothGeminiFiles(e.target.checked)}
                      />
                      <span>Sync GEMINI.md file</span>
                    </label>
                  )}
                  <label className="menu-checkbox-item font-mono">
                    <input
                      type="checkbox"
                      checked={syncToAllSelected}
                      onChange={(e) => setSyncToAllSelected(e.target.checked)}
                    />
                    <span>Deploy to all ({selectedAgents.length}) agents</span>
                  </label>
                  <div className="menu-divider" />
                  <button
                    type="button"
                    className="menu-action-btn"
                    onClick={handleOpenInExplorer}
                  >
                    <FolderOpen size={12} />
                    <span>Reveal in File Explorer</span>
                  </button>
                  <button
                    type="button"
                    className="menu-action-btn danger"
                    onClick={handleReset}
                  >
                    <RotateCcw size={12} />
                    <span>Reset to Default Template</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quiet Meta Sub-Row */}
        <div className="header-meta-row">
          <div className="meta-left font-mono">
            <span className="file-target-tag">TARGET:</span>
            <span className="file-path-text" title={resolvedFilePath || currentRulesPath}>
              {resolvedFilePath || currentRulesPath}
            </span>
            <span className="bullet-sep">·</span>
            <span className="stats-pill">{activeDirectivesCount} active rules</span>
            <span className="bullet-sep">·</span>
            <span className="stats-pill">{sections.length} sections</span>
          </div>

          <div className="meta-right">
            <div className="clean-search-box">
              <Search size={11} className="search-icon" />
              <input
                type="text"
                placeholder="Filter rules..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
              />
              {localSearch && (
                <button onClick={() => setLocalSearch('')} className="clear-search-btn">
                  <X size={10} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      {isLoadingFile ? (
        <div className="clean-loading-state">
          <Loader2 size={24} className="spin text-purple-400" />
          <p className="font-mono">Loading directives from disk...</p>
        </div>
      ) : viewMode === 'visual' ? (
        /* Spacious Master-Detail Layout */
        <div className="master-detail-layout">
          {/* Left Sections Sidebar */}
          <aside className="sections-sidebar">
            <div className="sidebar-top">
              <span className="sidebar-title font-mono">DIRECTIVE SECTIONS</span>
              <button
                type="button"
                className="add-sec-quick-btn"
                onClick={() => setIsAddingSection(true)}
                title="Add new section"
              >
                <Plus size={12} />
              </button>
            </div>

            {/* Sections List */}
            <div className="sections-nav-list">
              <button
                type="button"
                className={`section-nav-item ${activeSectionId === 'all' ? 'active' : ''}`}
                onClick={() => setActiveSectionId('all')}
              >
                <span className="nav-item-title">All Sections</span>
                <span className="nav-item-count font-mono">{totalDirectivesCount}</span>
              </button>

              {sections.map((sec, idx) => {
                const isActive = activeSectionId === sec.id;
                const activeCount = sec.directives.filter((d) => d.enabled).length;

                return (
                  <div
                    key={sec.id}
                    className={`section-nav-item ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveSectionId(sec.id)}
                  >
                    <span className="nav-item-idx font-mono">{idx + 1}</span>
                    <span className="nav-item-title">{sec.title}</span>
                    <span className="nav-item-count font-mono">{activeCount}</span>
                    <button
                      type="button"
                      className="nav-item-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSection(sec.id, sec.title);
                      }}
                      title="Delete section"
                    >
                      <X size={11} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Add Section Input Form */}
            {isAddingSection ? (
              <form onSubmit={handleCreateSection} className="sidebar-add-form">
                <input
                  type="text"
                  placeholder="Section title..."
                  value={newSectionTitle}
                  onChange={(e) => setNewSectionTitle(e.target.value)}
                  autoFocus
                />
                <div className="form-btns">
                  <button type="submit" className="done-btn">Add</button>
                  <button type="button" onClick={() => setIsAddingSection(false)} className="cancel-btn">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className="sidebar-add-btn"
                onClick={() => setIsAddingSection(true)}
              >
                <Plus size={12} />
                <span>New Section</span>
              </button>
            )}
          </aside>

          {/* Right Directives Canvas */}
          <main className="directives-canvas">
            {visibleSections.map((sec) => (
              <div key={sec.id} className="section-block">
                {/* Clean Section Heading */}
                <div className="section-block-header">
                  <div className="header-left">
                    <h3 className="section-block-title">{sec.title}</h3>
                    <span className="section-count-tag font-mono">
                      {sec.directives.filter((d) => d.enabled).length} of {sec.directives.length} active
                    </span>
                  </div>

                  <button
                    type="button"
                    className="add-rule-btn"
                    onClick={() => handleAddDirectiveToSection(sec.id)}
                  >
                    <Plus size={11} />
                    <span>Add Rule</span>
                  </button>
                </div>

                {/* Directives List */}
                <div className="directives-items-list">
                  {sec.directives.map((dir) => {
                    const isEditing = editingDirectiveId === dir.id;

                    if (isEditing) {
                      /* Focused Clean Editor Form */
                      return (
                        <div key={dir.id} className="clean-directive-editor">
                          <div className="editor-row">
                            <input
                              type="text"
                              className="editor-title-input"
                              value={editDraftTitle}
                              onChange={(e) => setEditDraftTitle(e.target.value)}
                              placeholder="Rule title / label (e.g. Zero Fluff)"
                              autoFocus
                            />
                            <div className="editor-actions">
                              <button
                                type="button"
                                className="editor-save-btn"
                                onClick={() => handleSaveEdit(sec.id, dir.id)}
                              >
                                <Check size={11} />
                                <span>Done</span>
                              </button>
                              <button
                                type="button"
                                className="editor-cancel-btn"
                                onClick={handleCancelEdit}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                          <textarea
                            className="editor-content-textarea"
                            rows={3}
                            value={editDraftContent}
                            onChange={(e) => setEditDraftContent(e.target.value)}
                            placeholder="Specify clear, actionable instructions or constraints..."
                          />
                        </div>
                      );
                    }

                    /* Clean, Uncluttered Directive Row */
                    return (
                      <div
                        key={dir.id}
                        className={`clean-directive-row ${dir.enabled ? 'active' : 'disabled'}`}
                      >
                        {/* Minimal Toggle */}
                        <button
                          type="button"
                          className={`clean-toggle-checkbox ${dir.enabled ? 'checked' : ''}`}
                          onClick={() => handleToggleDirective(sec.id, dir.id)}
                          title={dir.enabled ? 'Click to disable' : 'Click to enable'}
                        >
                          {dir.enabled && <Check size={10} />}
                        </button>

                        {/* Content */}
                        <div
                          className="directive-text-area"
                          onClick={() => handleStartEdit(dir)}
                          title="Click to edit rule"
                        >
                          <span className="directive-title">{renderInlineMarkdown(dir.title)}</span>
                          {dir.content && (
                            <>
                              <span className="directive-sep">:</span>
                              <span className="directive-body">{renderInlineMarkdown(dir.content)}</span>
                            </>
                          )}
                        </div>

                        {/* Quiet Hover Actions */}
                        <div className="row-hover-actions">
                          <button
                            type="button"
                            className="row-tool-btn"
                            onClick={() => handleStartEdit(dir)}
                            title="Edit rule"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            type="button"
                            className="row-tool-btn danger"
                            onClick={() => handleDeleteDirective(sec.id, dir.id)}
                            title="Delete rule"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {sec.directives.length === 0 && (
                    <div className="empty-section-row">
                      <span>No rules in this section.</span>
                      <button
                        type="button"
                        className="empty-add-action"
                        onClick={() => handleAddDirectiveToSection(sec.id)}
                      >
                        + Add first rule
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {sections.length === 0 ? (
              <div className="clean-empty-state">
                <Shield size={36} className="empty-shield-icon" />
                <h3 className="empty-heading">No Rules Configured for {currentAgent?.name || 'Agent'}</h3>
                <p className="empty-sub">
                  This agent does not have active directives yet. Inject curated rule presets from the library or create custom sections to get started.
                </p>
                <div className="empty-actions-row">
                  <button
                    type="button"
                    className="clean-primary-btn"
                    onClick={() => setIsPresetModalOpen(true)}
                  >
                    <Sparkles size={12} />
                    <span>Browse Presets</span>
                  </button>
                  <button
                    type="button"
                    className="clean-secondary-btn"
                    onClick={() => setIsAddingSection(true)}
                  >
                    <Plus size={12} />
                    <span>Add Section</span>
                  </button>
                </div>
              </div>
            ) : visibleSections.length === 0 ? (
              <div className="clean-empty-state">
                <p>No directives matching your filter.</p>
              </div>
            ) : null}
          </main>
        </div>
      ) : (
        /* Split Markdown Mode */
        <div className="clean-split-editor">
          {/* Left: Raw Markdown Editor */}
          <div className="editor-half">
            <div className="half-topbar font-mono">
              <span className="flex items-center gap-1 text-slate-400">
                <FileText size={11} /> RAW MARKDOWN
              </span>
              <span className="text-slate-500">{markdownContent.length} chars</span>
            </div>
            <textarea
              className="split-textarea font-mono"
              value={markdownContent}
              onChange={(e) => handleMarkdownChange(e.target.value)}
              placeholder="Write markdown rules..."
              spellCheck={false}
            />
          </div>

          {/* Right: Rendered Markdown Preview */}
          <div className="preview-half">
            <div className="half-topbar font-mono">
              <span className="flex items-center gap-1 text-slate-400">
                <BookOpen size={11} /> PREVIEW
              </span>
              <span style={{ color: currentAgent.color }}>{currentAgent.name}</span>
            </div>
            <div className="split-preview-body">
              <MarkdownViewer content={markdownContent} />
            </div>
          </div>
        </div>
      )}

      {/* Presets Modal via React Portal */}
      {isPresetModalRendered &&
        createPortal(
          <div className={`preset-backdrop ${isPresetModalClosing ? 'is-closing' : ''}`} onClick={handleClosePresetModal}>
            <div className={`preset-dialog ${isPresetModalClosing ? 'is-closing' : ''}`} onClick={(e) => e.stopPropagation()}>
              <div className="dialog-header">
                <div className="dialog-title-wrap">
                  <Sparkles size={16} className="text-purple-400" />
                  <h3 className="dialog-title">Directive Presets</h3>
                </div>
                <button
                  type="button"
                  className="dialog-close-btn"
                  onClick={handleClosePresetModal}
                >
                  <X size={14} />
                </button>
              </div>

              {/* Filters */}
              <div className="dialog-filters">
                <div className="dialog-search">
                  <Search size={12} className="search-icon" />
                  <input
                    type="text"
                    placeholder="Search presets..."
                    value={presetSearch}
                    onChange={(e) => setPresetSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                {/* Category Filter Dropdown */}
                <div className="dialog-category-dropdown-wrap" ref={presetCategoryRef}>
                  <button
                    type="button"
                    className={`category-dropdown-trigger ${isPresetCategoryOpen ? 'open' : ''} ${selectedPresetCategory !== 'all' ? 'active' : ''}`}
                    onClick={() => setIsPresetCategoryOpen(!isPresetCategoryOpen)}
                    title="Filter presets by category"
                  >
                    <Filter size={11} className="filter-icon" />
                    <span className="category-trigger-text">{selectedCategoryLabel}</span>
                    <ChevronDown size={11} className={`chevron-icon ${isPresetCategoryOpen ? 'open' : ''}`} />
                  </button>

                  {isPresetCategoryOpen && (
                    <div className="dialog-category-menu">
                      <div className="menu-header font-mono">FILTER BY CATEGORY</div>
                      {PRESET_CATEGORIES.map((cat) => {
                        const isSelected = selectedPresetCategory === cat.id;
                        const count = categoryCounts[cat.id] || 0;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            className={`category-menu-item ${isSelected ? 'active' : ''}`}
                            onClick={() => {
                              setSelectedPresetCategory(cat.id);
                              setIsPresetCategoryOpen(false);
                            }}
                          >
                            <span className="category-item-label">{cat.label}</span>
                            <span className="category-item-count font-mono">{count}</span>
                            {isSelected && <Check size={11} className="category-check text-purple-400" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Presets List */}
              <div className="dialog-cards-list">
                {filteredPresets.map((preset) => (
                  <div key={preset.id} className="preset-card">
                    <div className="preset-card-top">
                      <div>
                        <span className="preset-cat-tag font-mono">{preset.category.toUpperCase()}</span>
                        <h4 className="preset-title">{preset.title}</h4>
                        <p className="preset-desc">{preset.summary}</p>
                      </div>
                      <button
                        type="button"
                        className="inject-btn"
                        onClick={() => handleApplyPreset(preset)}
                      >
                        <Plus size={11} />
                        <span>Inject</span>
                      </button>
                    </div>

                    <div className="preset-preview font-mono">
                      {preset.directives.map((d, i) => (
                        <div key={i} className="preview-line">
                          <span className="line-bold">• {d.title}:</span>
                          <span className="line-desc">{renderInlineMarkdown(d.content)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Scoped Minimalist Styles */}
      <style>{`
        .clean-rules-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
        }

        /* Single Consolidated Header Card */
        .clean-header-card {
          background: #111726;
          border: 1px solid #1c2638;
          border-radius: 8px;
          padding: 12px 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .header-primary-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .header-identity {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .header-title {
          font-size: 15px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0;
          letter-spacing: -0.01em;
        }

        /* Agent Select Dropdown */
        .agent-select-wrapper {
          position: relative;
        }

        .agent-menu-trigger {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: #141c2c;
          border: 1px solid #223048;
          color: #f1f5f9;
          font-size: 11px;
          font-weight: 600;
          padding: 0 10px;
          height: 28px;
          border-radius: 5px;
          cursor: pointer;
          transition: all 0.12s ease;
          box-sizing: border-box;
        }

        .agent-menu-trigger:hover {
          background: #1c263c;
          border-color: #334466;
        }

        .chevron-icon {
          color: #64748b;
          transition: transform 0.15s ease;
        }

        .chevron-icon.open {
          transform: rotate(180deg);
        }

        .rules-agent-dropdown-menu {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          width: 170px;
          background: #0f1523;
          border: 1px solid #223048;
          border-radius: 6px;
          padding: 4px;
          z-index: 100;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
        }

        .menu-header {
          font-size: 9px;
          color: #64748b;
          font-weight: 700;
          padding: 4px 6px;
          letter-spacing: 0.04em;
        }

        .menu-agent-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 5px 8px;
          border-radius: 4px;
          border: none;
          background: transparent;
          color: #94a3b8;
          font-size: 11.5px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.1s ease;
        }

        .menu-agent-item:hover {
          background: #192236;
          color: #f8fafc;
        }

        .menu-agent-item.active {
          color: #ffffff;
          background: rgba(124, 58, 237, 0.12);
        }

        /* Scope Toggle */
        .clean-scope-toggle {
          display: flex;
          align-items: center;
          height: 28px;
          background: #0b0f19;
          border: 1px solid #1c2638;
          border-radius: 5px;
          padding: 2px;
          box-sizing: border-box;
        }

        .scope-btn {
          background: transparent;
          border: none;
          color: #728298;
          font-size: 10.5px;
          font-weight: 600;
          padding: 0 8px;
          height: 22px;
          border-radius: 3px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.12s ease;
          box-sizing: border-box;
        }

        .scope-btn.active {
          background: #1a2436;
          color: #f1f5f9;
        }

        /* Status Tags */
        .clean-status-tag {
          font-size: 9.5px;
          font-weight: 700;
          padding: 1.5px 6px;
          border-radius: 3px;
        }

        .clean-status-tag.dirty {
          background: rgba(245, 158, 11, 0.1);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.25);
        }

        .clean-status-tag.saved {
          background: rgba(16, 185, 129, 0.1);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.25);
        }

        /* Header Actions */
        .header-primary-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .clean-mode-toggle {
          display: flex;
          align-items: center;
          height: 28px;
          background: #0b0f19;
          border: 1px solid #1c2638;
          border-radius: 5px;
          padding: 2px;
          box-sizing: border-box;
        }

        .clean-mode-toggle .mode-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          background: transparent;
          border: none;
          color: #728298;
          font-size: 10.5px;
          font-weight: 600;
          padding: 0 8px;
          height: 22px;
          border-radius: 3px;
          cursor: pointer;
          transition: all 0.12s ease;
          box-sizing: border-box;
        }

        .clean-mode-toggle .mode-btn.active {
          background: #1a2436;
          color: #f1f5f9;
        }

        .clean-secondary-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          background: #141c2c;
          border: 1px solid #223048;
          color: #cbd5e1;
          font-size: 11px;
          font-weight: 600;
          padding: 0 12px;
          height: 28px;
          border-radius: 5px;
          cursor: pointer;
          transition: all 0.12s ease;
          white-space: nowrap;
          box-sizing: border-box;
        }

        .clean-secondary-btn:hover {
          background: #1c263c;
          color: #ffffff;
        }

        .clean-primary-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          background: linear-gradient(135deg, #7c3aed, #6366f1);
          border: 1px solid rgba(124, 58, 237, 0.35);
          color: #ffffff;
          font-size: 11px;
          font-weight: 600;
          padding: 0 12px;
          height: 28px;
          border-radius: 5px;
          cursor: pointer;
          transition: all 0.12s ease;
          white-space: nowrap;
          box-sizing: border-box;
          box-shadow: 0 2px 8px rgba(124, 58, 237, 0.25);
        }

        .clean-primary-btn:hover:not(:disabled) {
          filter: brightness(1.1);
          box-shadow: 0 3px 12px rgba(124, 58, 237, 0.4);
        }

        .clean-primary-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .clean-icon-btn {
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #141c2c;
          border: 1px solid #223048;
          color: #8fa0b5;
          border-radius: 5px;
          cursor: pointer;
          box-sizing: border-box;
        }

        .clean-icon-btn:hover {
          background: #1c263c;
          color: #ffffff;
        }

        .more-menu-wrapper {
          position: relative;
        }

        .clean-dropdown-menu {
          position: absolute;
          top: calc(100% + 4px);
          right: 0;
          width: 210px;
          background: #0f1523;
          border: 1px solid #223048;
          border-radius: 6px;
          padding: 6px;
          z-index: 100;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
        }

        .menu-checkbox-item {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 6px;
          font-size: 10.5px;
          color: #cbd5e1;
          cursor: pointer;
        }

        .menu-checkbox-item input {
          accent-color: #7c3aed;
        }

        .menu-divider {
          height: 1px;
          background: #1c2638;
          margin: 4px 0;
        }

        .menu-action-btn {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 6px;
          border: none;
          background: transparent;
          color: #8fa0b5;
          font-size: 11px;
          border-radius: 4px;
          cursor: pointer;
          text-align: left;
        }

        .menu-action-btn:hover {
          background: #182236;
          color: #f1f5f9;
        }

        .menu-action-btn.danger:hover {
          color: #f87171;
          background: rgba(239, 68, 68, 0.1);
        }

        /* Meta Sub-Row */
        .header-meta-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid rgba(255, 255, 255, 0.04);
          padding-top: 8px;
          gap: 12px;
        }

        .meta-left {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10.5px;
          color: #64748b;
          overflow: hidden;
        }

        .file-target-tag {
          font-weight: 700;
          color: #728298;
        }

        .file-path-text {
          color: #94a3b8;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .bullet-sep {
          color: #334460;
        }

        .stats-pill {
          color: #818cf8;
        }

        .clean-search-box {
          position: relative;
        }

        .clean-search-box input {
          background: #0b0f19;
          border: 1px solid #1c2638;
          border-radius: 4px;
          padding: 3px 20px 3px 22px;
          color: #cbd5e1;
          font-size: 11px;
          width: 140px;
          outline: none;
        }

        .clean-search-box input:focus {
          border-color: #7c3aed;
          width: 170px;
        }

        .clean-search-box .search-icon {
          position: absolute;
          left: 6px;
          top: 50%;
          transform: translateY(-50%);
          color: #64748b;
        }

        .clear-search-btn {
          position: absolute;
          right: 5px;
          top: 50%;
          transform: translateY(-50%);
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
        }

        /* Master-Detail Layout */
        .master-detail-layout {
          display: flex;
          gap: 14px;
          align-items: flex-start;
          width: 100%;
        }

        /* Left Sections Sidebar */
        .sections-sidebar {
          width: 220px;
          background: #111726;
          border: 1px solid #1c2638;
          border-radius: 8px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex-shrink: 0;
        }

        .sidebar-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 2px 4px;
        }

        .sidebar-title {
          font-size: 9.5px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.04em;
        }

        .add-sec-quick-btn {
          background: transparent;
          border: none;
          color: #8fa0b5;
          cursor: pointer;
          padding: 2px;
        }

        .add-sec-quick-btn:hover {
          color: #c084fc;
        }

        .sections-nav-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .section-nav-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 6px 8px;
          border-radius: 5px;
          border: none;
          background: transparent;
          color: #8fa0b5;
          font-size: 11.5px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.1s ease;
          position: relative;
        }

        .section-nav-item:hover {
          background: #162034;
          color: #f1f5f9;
        }

        .section-nav-item.active {
          background: #1c273e;
          color: #ffffff;
          font-weight: 600;
        }

        .nav-item-idx {
          font-size: 9.5px;
          color: #64748b;
          width: 12px;
        }

        .nav-item-title {
          flex: 1;
          text-align: left;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .nav-item-count {
          font-size: 9.5px;
          color: #64748b;
          background: rgba(255, 255, 255, 0.04);
          padding: 1px 4px;
          border-radius: 3px;
        }

        .nav-item-delete-btn {
          display: none;
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          padding: 0;
        }

        .section-nav-item:hover .nav-item-delete-btn {
          display: block;
        }

        .nav-item-delete-btn:hover {
          color: #f87171;
        }

        .sidebar-add-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 6px;
          background: transparent;
          border: 1px dashed #1c2638;
          border-radius: 5px;
          color: #728298;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.12s ease;
        }

        .sidebar-add-btn:hover {
          border-color: #7c3aed;
          color: #c084fc;
        }

        .sidebar-add-form {
          display: flex;
          flex-direction: column;
          gap: 6px;
          background: #0d121f;
          padding: 6px;
          border: 1px solid #7c3aed;
          border-radius: 5px;
        }

        .sidebar-add-form input {
          background: transparent;
          border: none;
          color: #ffffff;
          font-size: 11px;
          outline: none;
        }

        .form-btns {
          display: flex;
          align-items: center;
          gap: 4px;
          justify-content: flex-end;
        }

        .form-btns .done-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #7c3aed;
          border: 1px solid #7c3aed;
          color: #ffffff;
          font-size: 10px;
          font-weight: 600;
          padding: 0 8px;
          height: 22px;
          border-radius: 3px;
          cursor: pointer;
          box-sizing: border-box;
        }

        .form-btns .cancel-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 1px solid #28374f;
          color: #8fa0b5;
          font-size: 10px;
          font-weight: 500;
          padding: 0 8px;
          height: 22px;
          border-radius: 3px;
          cursor: pointer;
          box-sizing: border-box;
        }

        /* Right Directives Canvas */
        .directives-canvas {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 14px;
          min-width: 0;
        }

        .section-block {
          background: #111726;
          border: 1px solid #1c2638;
          border-radius: 8px;
          padding: 12px 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .section-block-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          padding-bottom: 8px;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .section-block-title {
          font-size: 13px;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0;
        }

        .section-count-tag {
          font-size: 9.5px;
          color: #64748b;
        }

        .add-rule-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          background: #141c2c;
          border: 1px solid #1f2b42;
          color: #8fa0b5;
          font-size: 10.5px;
          font-weight: 600;
          padding: 0 8px;
          height: 24px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.12s ease;
          box-sizing: border-box;
        }

        .add-rule-btn:hover {
          background: #1c263c;
          color: #ffffff;
        }

        .directives-items-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        /* Clean Directive Row */
        .clean-directive-row {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 6px;
          background: #0d121f;
          border: 1px solid #172134;
          transition: all 0.1s ease;
        }

        .clean-directive-row:hover {
          background: #111828;
          border-color: #233148;
        }

        .clean-directive-row.disabled {
          opacity: 0.5;
        }

        .clean-toggle-checkbox {
          width: 14px;
          height: 14px;
          border-radius: 3px;
          background: transparent;
          border: 1px solid #2d3d58;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          margin-top: 2px;
          flex-shrink: 0;
          color: transparent;
        }

        .clean-toggle-checkbox.checked {
          background: #7c3aed;
          border-color: #7c3aed;
          color: #ffffff;
        }

        .directive-text-area {
          flex: 1;
          font-size: 12px;
          line-height: 1.5;
          cursor: pointer;
        }

        .directive-title {
          font-weight: 700;
          color: #f1f5f9;
        }

        .directive-sep {
          color: #64748b;
          margin-right: 5px;
        }

        .directive-body {
          color: #94a3b8;
        }

        .directive-body strong,
        .directive-body .skill-bold {
          color: #f1f5f9;
          font-weight: 600;
        }

        .directive-body code,
        .directive-body .skill-inline-code {
          background: rgba(99, 102, 241, 0.12);
          border: 1px solid rgba(99, 102, 241, 0.25);
          color: #c084fc;
          padding: 1px 4px;
          border-radius: 3px;
          font-family: var(--font-mono);
          font-size: 11px;
        }

        .row-hover-actions {
          display: flex;
          align-items: center;
          gap: 3px;
          opacity: 0;
          transition: opacity 0.12s ease;
        }

        .clean-directive-row:hover .row-hover-actions {
          opacity: 1;
        }

        .row-tool-btn {
          width: 22px;
          height: 22px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #162034;
          border: 1px solid #233148;
          color: #8fa0b5;
          border-radius: 4px;
          cursor: pointer;
          padding: 0;
        }

        .row-tool-btn:hover {
          color: #ffffff;
          background: #1e2c48;
        }

        .row-tool-btn.danger:hover {
          color: #f87171;
          background: rgba(239, 68, 68, 0.15);
        }

        /* Clean Directive Editor */
        .clean-directive-editor {
          background: #141c2c;
          border: 1px solid #7c3aed;
          border-radius: 6px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .editor-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .editor-title-input {
          flex: 1;
          background: #0d121f;
          border: 1px solid #28374f;
          border-radius: 4px;
          padding: 4px 8px;
          color: #ffffff;
          font-size: 11.5px;
          font-weight: 600;
          outline: none;
        }

        .editor-title-input:focus {
          border-color: #8b5cf6;
        }

        .editor-actions {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .editor-save-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 3px;
          background: #7c3aed;
          border: 1px solid #7c3aed;
          color: #ffffff;
          font-size: 10.5px;
          font-weight: 600;
          padding: 0 8px;
          height: 24px;
          border-radius: 4px;
          cursor: pointer;
          box-sizing: border-box;
        }

        .editor-cancel-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 1px solid #28374f;
          color: #8fa0b5;
          font-size: 10.5px;
          font-weight: 500;
          padding: 0 8px;
          height: 24px;
          border-radius: 4px;
          cursor: pointer;
          box-sizing: border-box;
        }

        .editor-content-textarea {
          width: 100%;
          background: #0d121f;
          border: 1px solid #28374f;
          border-radius: 4px;
          padding: 6px 8px;
          color: #e2e8f0;
          font-size: 11.5px;
          line-height: 1.45;
          resize: vertical;
          outline: none;
          box-sizing: border-box;
        }

        .editor-content-textarea:focus {
          border-color: #8b5cf6;
        }

        .empty-section-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          color: #64748b;
          font-size: 11px;
          background: rgba(0, 0, 0, 0.1);
          border-radius: 4px;
        }

        .empty-add-action {
          background: transparent;
          border: none;
          color: #a78bfa;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }

        .clean-empty-state {
          padding: 60px 20px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          background: #0b0f19;
          border: 1px dashed #1c2638;
          border-radius: 8px;
          color: #64748b;
          font-size: 12px;
        }

        .clean-empty-state .empty-shield-icon {
          color: #475569;
          margin-bottom: 2px;
        }

        .clean-empty-state .empty-heading {
          font-size: 14px;
          font-weight: 600;
          color: #e2e8f0;
          margin: 0;
        }

        .clean-empty-state .empty-sub {
          font-size: 11.5px;
          color: #64748b;
          max-width: 440px;
          margin: 0;
          line-height: 1.5;
        }

        .clean-empty-state .empty-actions-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 6px;
        }

        /* Split Markdown */
        .clean-split-editor {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          min-height: 520px;
        }

        .editor-half, .preview-half {
          background: #111726;
          border: 1px solid #1c2638;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .half-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 12px;
          background: #0d121f;
          border-bottom: 1px solid #1c2638;
          font-size: 10.5px;
        }

        .split-textarea {
          flex: 1;
          width: 100%;
          min-height: 480px;
          background: #090d16;
          border: none;
          padding: 12px;
          color: #e2e8f0;
          font-size: 11.5px;
          line-height: 1.6;
          resize: none;
          outline: none;
          box-sizing: border-box;
        }

        .split-preview-body {
          flex: 1;
          padding: 14px;
          overflow-y: auto;
          background: #0a0e18;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }



        /* Preset Modal */
        @keyframes modalOverlayFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes modalOverlayFadeOut {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes modalCardScaleIn {
          0% {
            opacity: 0;
            transform: translate3d(0, 22px, 0) scale(0.95);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }
        @keyframes modalCardScaleOut {
          0% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate3d(0, 14px, 0) scale(0.96);
          }
        }

        .preset-backdrop {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(3, 7, 18, 0.82);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 24px;
          animation: modalOverlayFadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .preset-backdrop.is-closing {
          animation: modalOverlayFadeOut 0.16s cubic-bezier(0.4, 0, 1, 1) forwards !important;
          pointer-events: none !important;
        }

        .preset-dialog {
          width: 100%;
          max-width: 720px;
          max-height: 80vh;
          background: #0f1523;
          border: 1px solid #1c2638;
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.85);
          animation: modalCardScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .preset-dialog.is-closing {
          animation: modalCardScaleOut 0.16s cubic-bezier(0.4, 0, 1, 1) forwards !important;
          pointer-events: none !important;
        }

        .dialog-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 18px;
          background: #111726;
          border-bottom: 1px solid #1c2638;
        }

        .dialog-title-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .dialog-title {
          font-size: 14px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0;
        }

        .dialog-close-btn {
          border: none;
          background: transparent;
          color: #64748b;
          cursor: pointer;
        }

        .dialog-close-btn:hover {
          color: #ffffff;
        }

        .dialog-filters {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 16px;
          background: #0b101c;
          border-bottom: 1px solid #162032;
          gap: 10px;
        }

        .dialog-search {
          position: relative;
          flex: 1;
        }

        .dialog-search input {
          width: 100%;
          background: #141c2c;
          border: 1px solid #1f2b42;
          border-radius: 4px;
          padding: 4px 10px 4px 26px;
          color: #ffffff;
          font-size: 11px;
          outline: none;
          box-sizing: border-box;
        }

        .dialog-search .search-icon {
          position: absolute;
          left: 8px;
          top: 50%;
          transform: translateY(-50%);
          color: #64748b;
        }

        /* Category Filter Dropdown */
        .dialog-category-dropdown-wrap {
          position: relative;
          flex-shrink: 0;
        }

        .category-dropdown-trigger {
          height: 28px;
          padding: 0 10px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #141c2c;
          border: 1px solid #1f2b42;
          border-radius: 5px;
          color: #8fa0b5;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          box-sizing: border-box;
        }

        .category-dropdown-trigger:hover,
        .category-dropdown-trigger.open {
          background: #192338;
          border-color: #6366f1;
          color: #f1f5f9;
        }

        .category-dropdown-trigger.active {
          color: #cbd5e1;
          border-color: #4338ca;
        }

        .category-dropdown-trigger .filter-icon {
          color: #818cf8;
          flex-shrink: 0;
        }

        .category-dropdown-trigger .category-trigger-text {
          white-space: nowrap;
        }

        .category-dropdown-trigger .chevron-icon {
          color: #64748b;
          transition: transform 0.15s ease;
          flex-shrink: 0;
        }

        .category-dropdown-trigger .chevron-icon.open {
          transform: rotate(180deg);
        }

        .dialog-category-menu {
          position: absolute;
          top: calc(100% + 4px);
          right: 0;
          width: 190px;
          background: #0d1322;
          border: 1px solid #1f2b42;
          border-radius: 6px;
          padding: 5px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05);
          z-index: 1000;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .dialog-category-menu .menu-header {
          padding: 4px 8px;
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.05em;
          color: #64748b;
          border-bottom: 1px solid #162032;
          margin-bottom: 3px;
        }

        .category-menu-item {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 8px;
          border-radius: 4px;
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.12s ease;
          text-align: left;
          width: 100%;
          box-sizing: border-box;
        }

        .category-menu-item:hover {
          background: #172238;
          color: #f1f5f9;
        }

        .category-menu-item.active {
          background: rgba(99, 102, 241, 0.12);
          color: #c084fc;
          font-weight: 600;
        }

        .category-item-label {
          flex: 1;
        }

        .category-item-count {
          font-size: 9.5px;
          color: #64748b;
          background: #090d16;
          padding: 1px 5px;
          border-radius: 3px;
        }

        .category-menu-item.active .category-item-count {
          color: #a78bfa;
          background: rgba(124, 58, 237, 0.2);
        }

        .category-check {
          flex-shrink: 0;
        }

        .dialog-cards-list {
          flex: 1;
          overflow-y: auto;
          padding: 14px 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .preset-card {
          background: #111726;
          border: 1px solid #1c2638;
          border-radius: 6px;
          padding: 10px 12px;
        }

        .preset-card-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 6px;
        }

        .preset-cat-tag {
          font-size: 8.5px;
          font-weight: 700;
          color: #c084fc;
          background: rgba(168, 85, 247, 0.1);
          padding: 1px 4px;
          border-radius: 2px;
          display: inline-block;
          padding: 1.5px 5px;
          border-radius: 3px;
          background: rgba(255, 255, 255, 0.05);
          color: #8fa0b5;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .preset-desc {
          font-size: 11px;
          color: #8899ac;
          margin: 0;
        }

        .inject-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          background: #141c2c;
          border: 1px solid #223048;
          color: #e2e8f0;
          border-radius: 4px;
          font-size: 10.5px;
          font-weight: 600;
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.12s ease;
        }

        .inject-btn:hover {
          background: linear-gradient(135deg, #5b21b6, #4c1d95);
          border-color: rgba(124, 58, 237, 0.35);
          color: #ffffff;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3), 0 0 6px rgba(109, 40, 217, 0.2);
        }

        .preset-preview {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 4px;
          padding: 6px 8px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .preview-line {
          font-size: 9.5px;
          display: flex;
          gap: 5px;
        }

        .line-bold {
          color: #cbd5e1;
          font-weight: 700;
          flex-shrink: 0;
        }

        .line-desc {
          color: #8fa0b5;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
