import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Sparkles, 
  Bot, 
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
  Filter,
  Copy
} from 'lucide-react';
import { SupportedAgent, RuleSection, RuleDirective, RulePreset } from '../types/agent';
import { RULE_PRESETS, DEFAULT_RULES_TEMPLATE } from '../data/rulePresets';
import { logActivity } from '../services/activityLogger';
import { MarkdownViewer, renderInlineMarkdown } from './MarkdownViewer';
import { useModalTransition } from '../hooks/useModalTransition';
import { useToast } from '../context/ToastContext';
import { AGENT_ICON_MAP } from './AgentIcon';

interface RulesBuilderViewProps {
  selectedAgents: SupportedAgent[];
  allAgents: SupportedAgent[];
  searchQuery?: string;
  onRefreshCapabilities?: () => Promise<void>;
}

const PRESET_CATEGORIES: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All Categories' },
  { id: 'communication', label: 'Communication' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'git', label: 'Git Discipline' },
  { id: 'debugging', label: 'Debugging' },
  { id: 'security', label: 'Security' },
];

type ViewMode = 'visual' | 'markdown';

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

      if (!currentSection) {
        currentSection = {
          id: `section-${sectionIndex++}`,
          title: 'General Directives',
          directives: [],
        };
        sections.push(currentSection);
      }

      currentSection.directives.push(directive);
    }
  }

  return sections;
}

// Markdown Generation
function generateMarkdownFromSections(preamble: string, sections: RuleSection[]): string {
  const lines: string[] = [];

  if (preamble && preamble.trim()) {
    lines.push(preamble.trim());
    lines.push('');
  }

  for (const section of sections) {
    lines.push(`## ${section.title}`);
    lines.push('');
    for (const d of section.directives) {
      if (d.enabled) {
        if (d.content) {
          lines.push(`- **${d.title}:** ${d.content}`);
        } else {
          lines.push(`- **${d.title}**`);
        }
      }
    }
    lines.push('');
  }

  return lines.join('\n').trim() + '\n';
}

// Normalization and equality utilities for accurate dirty state
function normalizeRulesContent(str: string): string {
  if (!str) return '';
  return str
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

function areRuleSectionsEqual(
  a: RuleSection[] | null | undefined,
  b: RuleSection[] | null | undefined
): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const secA = a[i];
    const secB = b[i];
    if (secA.title.trim() !== secB.title.trim()) return false;
    if (secA.directives.length !== secB.directives.length) return false;
    for (let j = 0; j < secA.directives.length; j++) {
      const dirA = secA.directives[j];
      const dirB = secB.directives[j];
      if (
        dirA.enabled !== dirB.enabled ||
        dirA.title.trim() !== dirB.title.trim() ||
        dirA.content.trim() !== dirB.content.trim()
      ) {
        return false;
      }
    }
  }
  return true;
}

export const RulesBuilderView: React.FC<RulesBuilderViewProps> = ({
  selectedAgents,
  allAgents,
  searchQuery: externalSearchQuery = '',
  onRefreshCapabilities,
}) => {
  const toast = useToast();

  // Primary State
  const [activeAgentId, setActiveAgentId] = useState<string>(() => {
    return selectedAgents[0]?.id || 'antigravity';
  });

  const [viewMode, setViewMode] = useState<ViewMode>('visual');

  const [sections, setSections] = useState<RuleSection[]>([]);
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [docPreamble, setDocPreamble] = useState<string>('# Agent Behavioral Directives');
  const [originalLoadedContent, setOriginalLoadedContent] = useState<string>('');
  const originalSectionsRef = useRef<RuleSection[] | null>(null);
  const originalContentRef = useRef<string>('');

  const [activeSectionId, setActiveSectionId] = useState<string>('all');
  const [localSearch, setLocalSearch] = useState<string>('');

  // Editing State
  const [editingDirectiveId, setEditingDirectiveId] = useState<string | null>(null);
  const [editDraftTitle, setEditDraftTitle] = useState<string>('');
  const [editDraftContent, setEditDraftContent] = useState<string>('');

  // UI Menus & Toggles
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState<boolean>(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState<boolean>(false);
  const [syncBothGeminiFiles, setSyncBothGeminiFiles] = useState<boolean>(true);
  const [syncToAllSelected, setSyncToAllSelected] = useState<boolean>(false);

  const agentMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Status
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [resolvedFilePath, setResolvedFilePath] = useState<string>('');
  const [copiedPath, setCopiedPath] = useState<boolean>(false);

  // Presets Modal
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

  // Adding Section
  const [isAddingSection, setIsAddingSection] = useState<boolean>(false);
  const [newSectionTitle, setNewSectionTitle] = useState<string>('');

  // Comprehensive Escape key handling for edit mode, section addition, and open dropdowns
  useEffect(() => {
    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingDirectiveId) {
          e.preventDefault();
          e.stopPropagation();
          setEditingDirectiveId(null);
          return;
        }
        if (isAddingSection) {
          e.preventDefault();
          e.stopPropagation();
          setIsAddingSection(false);
          setNewSectionTitle('');
          return;
        }
        if (isAgentMenuOpen) {
          e.preventDefault();
          setIsAgentMenuOpen(false);
          return;
        }
        if (isMoreMenuOpen) {
          e.preventDefault();
          setIsMoreMenuOpen(false);
          return;
        }
        if (isPresetCategoryOpen) {
          e.preventDefault();
          setIsPresetCategoryOpen(false);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown, true);
    return () => window.removeEventListener('keydown', handleWindowKeyDown, true);
  }, [editingDirectiveId, isAddingSection, isAgentMenuOpen, isMoreMenuOpen, isPresetCategoryOpen]);

  // Presets modal Escape key
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

  // Computed Values
  const isDirty = useMemo(() => {
    // If the visual sections match the original loaded sections exactly,
    // ensure visual toggles that return to baseline don't falsely trigger unsaved
    if (originalSectionsRef.current && areRuleSectionsEqual(sections, originalSectionsRef.current)) {
      const currentNorm = normalizeRulesContent(markdownContent);
      const originalNorm = normalizeRulesContent(originalLoadedContent);
      if (currentNorm === originalNorm) {
        return false;
      }
      const canonicalGenerated = normalizeRulesContent(
        generateMarkdownFromSections(docPreamble, sections)
      );
      if (currentNorm === canonicalGenerated) {
        return false;
      }
    }

    const currentNorm = normalizeRulesContent(markdownContent);
    const originalNorm = normalizeRulesContent(originalLoadedContent);
    return currentNorm !== originalNorm;
  }, [markdownContent, originalLoadedContent, sections, docPreamble]);

  const totalDirectivesCount = useMemo(() => {
    return sections.reduce((sum, s) => sum + s.directives.length, 0);
  }, [sections]);

  const activeDirectivesCount = useMemo(() => {
    return sections.reduce((sum, s) => sum + s.directives.filter((d) => d.enabled).length, 0);
  }, [sections]);

  const currentRulesPath = useMemo(() => {
    return currentAgent?.paths?.rulesPath || '~/.gemini/config/AGENTS.md';
  }, [currentAgent]);

  const currentFileName = useMemo(() => {
    const p = resolvedFilePath || currentRulesPath;
    const parts = p.split(/[/\\]/);
    return parts[parts.length - 1] || 'AGENTS.md';
  }, [resolvedFilePath, currentRulesPath]);

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
        originalContentRef.current = res.content;

        const firstHeadingIdx = res.content.indexOf('## ');
        if (firstHeadingIdx > 0) {
          setDocPreamble(res.content.slice(0, firstHeadingIdx).trim());
        } else {
          setDocPreamble('# Agent Behavioral Directives');
        }

        const parsed = parseMarkdownToSections(res.content);
        setSections(parsed);
        originalSectionsRef.current = JSON.parse(JSON.stringify(parsed));
      } else {
        const fallback = DEFAULT_RULES_TEMPLATE;
        setMarkdownContent(fallback);
        setOriginalLoadedContent(fallback);
        originalContentRef.current = fallback;
        setDocPreamble('# Agent Behavioral Directives');
        const parsed = parseMarkdownToSections(fallback);
        setSections(parsed);
        originalSectionsRef.current = JSON.parse(JSON.stringify(parsed));
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
    // If sections have returned to exact initial loaded state, restore original raw content
    if (originalSectionsRef.current && areRuleSectionsEqual(newSections, originalSectionsRef.current)) {
      setMarkdownContent(originalContentRef.current);
    } else {
      const newMd = generateMarkdownFromSections(docPreamble, newSections);
      setMarkdownContent(newMd);
    }
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
    const sectionExists = sections.find((s) => s.title.toLowerCase() === targetSectionTitle.toLowerCase());

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
        sec.id === sectionExists.id
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
          rulesPath: ag.paths.rulesPath,
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
        originalContentRef.current = markdownContent;
        originalSectionsRef.current = JSON.parse(JSON.stringify(sections));

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

  const handleCopyPath = async () => {
    const p = resolvedFilePath || currentRulesPath;
    if (!p) return;
    try {
      await navigator.clipboard.writeText(p);
      setCopiedPath(true);
      toast.success('Copied rules file path to clipboard');
      setTimeout(() => setCopiedPath(false), 2000);
    } catch {
      toast.error('Failed to copy file path');
    }
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

  const CurrentAgentIcon = AGENT_ICON_MAP[currentAgent?.id || ''] || AGENT_ICON_MAP[currentAgent?.iconName || ''] || Bot;

  return (
    <div className="rules-view-container">
      {/* 1. Header Card - Title, Badges & Actions */}
      <div className="rules-view-header">
        <div className="header-info">
          <div className="title-line">
            <h2 className="view-title">Context Rules & Directives</h2>
            <span className="count-pill font-mono">{activeDirectivesCount} ACTIVE</span>
            <span className="catalog-pill font-mono">{sections.length} SECTIONS</span>
            {isDirty ? (
              <span className="status-pill-clean partial font-mono" title="Unsaved changes in directives editor">
                <span className="status-dot partial" />
                <span>UNSAVED</span>
              </span>
            ) : lastSavedTime ? (
              <span className="status-pill-clean installed font-mono" title={`Last deployed at ${lastSavedTime}`}>
                <span className="status-dot installed" />
                <span>DEPLOYED {lastSavedTime}</span>
              </span>
            ) : null}
          </div>
          <p className="view-desc">
            Define system directives, coding standards, and operational guidelines executed by your AI agents.
          </p>
        </div>

        <div className="header-actions-wrap">
          {/* Preset Library Button */}
          <button
            type="button"
            className="rules-secondary-btn"
            onClick={() => setIsPresetModalOpen(true)}
            title="Browse curated directive templates and best-practice rules"
          >
            <Sparkles size={13} className="text-purple-400" />
            <span>Browse Presets</span>
          </button>

          {/* Primary Save & Deploy Button */}
          <button
            type="button"
            className={`rules-primary-btn ${isDirty ? 'has-unsaved' : ''}`}
            onClick={handleSaveRules}
            disabled={isSaving || !isDirty}
            title={isDirty ? 'Save and deploy directives to active agent' : 'All directives saved to disk'}
          >
            {isSaving ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
            <span>{isSaving ? 'Deploying...' : 'Save & Deploy'}</span>
          </button>

          {/* More Options Dropdown */}
          <div className="more-menu-wrapper" ref={moreMenuRef}>
            <button
              type="button"
              className="rules-icon-btn"
              onClick={() => setIsMoreMenuOpen((prev) => !prev)}
              title="Deployment options and file management"
            >
              <MoreVertical size={14} />
            </button>

            {isMoreMenuOpen && (
              <div className="rules-dropdown-menu">
                <div className="menu-header font-mono">DEPLOYMENT SETTINGS</div>
                {activeAgentId === 'antigravity' && (
                  <label className="menu-checkbox-item">
                    <input
                      type="checkbox"
                      checked={syncBothGeminiFiles}
                      onChange={(e) => setSyncBothGeminiFiles(e.target.checked)}
                    />
                    <span>Sync GEMINI.md file</span>
                  </label>
                )}
                <label className="menu-checkbox-item">
                  <input
                    type="checkbox"
                    checked={syncToAllSelected}
                    onChange={(e) => setSyncToAllSelected(e.target.checked)}
                  />
                  <span>Deploy to all ({selectedAgents.length}) agents</span>
                </label>
                <div className="menu-divider" />
                <button type="button" className="menu-action-btn" onClick={handleOpenInExplorer}>
                  <FolderOpen size={12} />
                  <span>Reveal in File Explorer</span>
                </button>
                <button type="button" className="menu-action-btn danger" onClick={handleReset}>
                  <RotateCcw size={12} />
                  <span>Reset to Default Template</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Sleek Filter & Mode Toolbar Row */}
      <div className="rules-toolbar-row">
        {/* Left: Scope, View Mode & Agent Selection */}
        <div className="toolbar-left-group">
          {/* Target Agent Selector Dropdown */}
          <div className="agent-select-wrapper" ref={agentMenuRef}>
            <button
              type="button"
              className="agent-filter-chip"
              onClick={() => setIsAgentMenuOpen((prev) => !prev)}
              title="Select target AI agent for directives"
            >
              <CurrentAgentIcon size={13} style={{ color: currentAgent?.color || '#a855f7' }} />
              <span className="agent-chip-name">{currentAgent?.name || 'Agent'}</span>
              <ChevronDown size={11} className={`chevron-icon ${isAgentMenuOpen ? 'open' : ''}`} />
            </button>

            {isAgentMenuOpen && (
              <div className="agent-dropdown-menu">
                <div className="menu-header font-mono">SELECT TARGET AGENT</div>
                {allAgents.map((ag) => {
                  const AgIcon = AGENT_ICON_MAP[ag.id] || AGENT_ICON_MAP[ag.iconName] || Bot;
                  const isSelected = ag.id === activeAgentId;
                  return (
                    <button
                      key={ag.id}
                      type="button"
                      className={`agent-menu-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        setActiveAgentId(ag.id);
                        setIsAgentMenuOpen(false);
                      }}
                    >
                      <AgIcon size={13} style={{ color: ag.color }} />
                      <span className="agent-item-name">{ag.name}</span>
                      {isSelected && <Check size={11} className="agent-item-check" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="toolbar-divider" />

          {/* View Mode Segmented Control */}
          <div className="segmented-controls">
            <button
              type="button"
              className={`segment-btn ${viewMode === 'visual' ? 'active' : ''}`}
              onClick={() => setViewMode('visual')}
            >
              <Sliders size={11} />
              <span>Blocks</span>
            </button>
            <button
              type="button"
              className={`segment-btn ${viewMode === 'markdown' ? 'active' : ''}`}
              onClick={() => setViewMode('markdown')}
            >
              <FileText size={11} />
              <span>Markdown</span>
            </button>
          </div>
        </div>

        {/* Right: Target File Chip & Search Box */}
        <div className="toolbar-right-group">
          <div
            className="target-file-chip font-mono"
            title={`Rules file: ${resolvedFilePath || currentRulesPath}`}
          >
            <FileText size={11} className="file-chip-icon text-purple-400" />
            <span className="file-chip-name">{currentFileName}</span>
            <button
              type="button"
              className="file-copy-btn"
              onClick={handleCopyPath}
              title="Copy file path to clipboard"
            >
              {copiedPath ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
            </button>
          </div>

          <div className="rules-search-box">
            <Search size={12} className="rules-search-icon" />
            <input
              type="text"
              placeholder="Filter rules..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
            />
            {localSearch && (
              <button
                type="button"
                onClick={() => setLocalSearch('')}
                className="rules-search-clear"
                title="Clear search"
              >
                <X size={11} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Main Content Layout */}
      {isLoadingFile ? (
        <div className="clean-loading-state">
          <Loader2 size={24} className="spin text-purple-400" />
          <p className="font-mono">Loading directives from disk...</p>
        </div>
      ) : viewMode === 'visual' ? (
        /* Master-Detail Layout */
        <div className="master-detail-layout">
          {/* Left Sections Sidebar */}
          <aside className="sections-sidebar">
            <div className="sidebar-top">
              <span className="sidebar-title font-mono">SECTIONS</span>
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
                <span className="nav-item-idx font-mono">ALL</span>
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
                    <span className="nav-item-idx font-mono">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="nav-item-title" title={sec.title}>
                      {sec.title}
                    </span>
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
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsAddingSection(false);
                      setNewSectionTitle('');
                    }
                  }}
                  autoFocus
                />
                <div className="form-btns">
                  <button type="submit" className="done-btn">Add</button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingSection(false);
                      setNewSectionTitle('');
                    }}
                    className="cancel-btn"
                  >
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
                {/* Section Header */}
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
                    title="Add directive rule to this section"
                  >
                    <Plus size={11} />
                    <span>Add Rule</span>
                  </button>
                </div>

                {/* Directives Items List */}
                <div className="directives-items-list">
                  {sec.directives.map((dir) => {
                    const isEditing = editingDirectiveId === dir.id;

                    if (isEditing) {
                      /* Focused Clean Editor Form */
                      return (
                        <div key={dir.id} className="clean-directive-editor">
                          <div className="editor-input-wrap">
                            <input
                              type="text"
                              className="editor-title-input"
                              value={editDraftTitle}
                              onChange={(e) => setEditDraftTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleCancelEdit();
                                } else if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveEdit(sec.id, dir.id);
                                }
                              }}
                              placeholder="Rule title / label (e.g. Zero Fluff)"
                              autoFocus
                            />
                          </div>

                          <textarea
                            className="editor-content-textarea"
                            rows={3}
                            value={editDraftContent}
                            onChange={(e) => setEditDraftContent(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                e.stopPropagation();
                                handleCancelEdit();
                              } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                e.preventDefault();
                                handleSaveEdit(sec.id, dir.id);
                              }
                            }}
                            placeholder="Specify clear, actionable instructions or constraints..."
                          />

                          <div className="editor-footer-actions">
                            <button
                              type="button"
                              className="editor-cancel-btn"
                              onClick={handleCancelEdit}
                              title="Cancel"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="editor-save-btn"
                              onClick={() => handleSaveEdit(sec.id, dir.id)}
                              title="Save directive"
                            >
                              <Check size={11} />
                              <span>Save Directive</span>
                            </button>
                          </div>
                        </div>
                      );
                    }

                    /* Clean, Uncluttered Directive Row */
                    return (
                      <div
                        key={dir.id}
                        className={`clean-directive-row ${dir.enabled ? 'active' : 'disabled'}`}
                      >
                        {/* Tactile Toggle Checkbox */}
                        <button
                          type="button"
                          className={`clean-toggle-checkbox ${dir.enabled ? 'checked' : ''}`}
                          onClick={() => handleToggleDirective(sec.id, dir.id)}
                          title={dir.enabled ? 'Click to disable rule' : 'Click to enable rule'}
                        >
                          {dir.enabled && <Check size={10} strokeWidth={2.5} />}
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
                    className="rules-primary-btn"
                    onClick={() => setIsPresetModalOpen(true)}
                  >
                    <Sparkles size={12} />
                    <span>Browse Presets</span>
                  </button>
                  <button
                    type="button"
                    className="rules-secondary-btn"
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
                        <h4 className="preset-card-title">{preset.title}</h4>
                        <p className="preset-card-summary">{preset.summary}</p>
                      </div>
                      <span className="preset-cat-badge font-mono">{preset.category}</span>
                    </div>

                    <div className="preset-card-preview">
                      {preset.directives.slice(0, 3).map((d, i) => (
                        <div key={i} className="preview-rule font-mono">
                          <span className="rule-dot" />
                          <span className="rule-t">{d.title}:</span>
                          <span className="rule-c">{d.content}</span>
                        </div>
                      ))}
                      {preset.directives.length > 3 && (
                        <div className="preview-more font-mono">
                          +{preset.directives.length - 3} more directives...
                        </div>
                      )}
                    </div>

                    <div className="preset-card-footer">
                      <span className="preset-rules-count font-mono">
                        {preset.directives.length} directives
                      </span>
                      <button
                        type="button"
                        className="inject-preset-btn"
                        onClick={() => handleApplyPreset(preset)}
                      >
                        <Plus size={11} />
                        <span>Inject Preset</span>
                      </button>
                    </div>
                  </div>
                ))}

                {filteredPresets.length === 0 && (
                  <div className="dialog-empty font-mono">No presets matching your search.</div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Embedded High-Polish Styling */}
      <style>{`
        .rules-view-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
          min-width: 0;
          padding-bottom: 24px;
        }

        /* 1. View Header */
        .rules-view-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding: 14px 18px;
          background: #0f1523;
          border: 1px solid #1c2638;
          border-radius: 8px;
        }

        .header-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }

        .title-line {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .view-title {
          font-size: 15px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0;
          letter-spacing: -0.01em;
        }

        .count-pill {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 4px;
          background: rgba(124, 58, 237, 0.15);
          border: 1px solid rgba(124, 58, 237, 0.35);
          color: #c084fc;
        }

        .catalog-pill {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 4px;
          background: #141c2c;
          border: 1px solid #223048;
          color: #94a3b8;
        }

        .status-pill-clean {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 9.5px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 4px;
        }

        .status-pill-clean.partial {
          background: rgba(245, 158, 11, 0.12);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .status-pill-clean.installed {
          background: rgba(16, 185, 129, 0.12);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }

        .status-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
        }

        .status-dot.partial {
          background: #f59e0b;
          box-shadow: 0 0 6px #f59e0b;
        }

        .status-dot.installed {
          background: #34d399;
          box-shadow: 0 0 6px #34d399;
        }

        .view-desc {
          font-size: 12px;
          color: #728298;
          margin: 0;
          line-height: 1.45;
        }

        .header-actions-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .rules-secondary-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #141c2c;
          border: 1px solid #223048;
          color: #cbd5e1;
          font-size: 11.5px;
          font-weight: 600;
          padding: 0 12px;
          height: 30px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.12s ease;
          white-space: nowrap;
        }

        .rules-secondary-btn:hover {
          background: #1c263c;
          color: #ffffff;
          border-color: #2e3e5c;
        }

        .rules-primary-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: linear-gradient(135deg, #7c3aed, #6366f1);
          border: 1px solid rgba(124, 58, 237, 0.4);
          color: #ffffff;
          font-size: 11.5px;
          font-weight: 600;
          padding: 0 14px;
          height: 30px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.12s ease;
          white-space: nowrap;
          box-shadow: 0 2px 8px rgba(124, 58, 237, 0.25);
        }

        .rules-primary-btn:hover:not(:disabled) {
          filter: brightness(1.1);
          box-shadow: 0 4px 14px rgba(124, 58, 237, 0.4);
        }

        .rules-primary-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          box-shadow: none;
        }

        .rules-primary-btn.has-unsaved {
          animation: pulseGlow 2.5s infinite;
        }

        @keyframes pulseGlow {
          0%, 100% {
            box-shadow: 0 2px 8px rgba(124, 58, 237, 0.3);
          }
          50% {
            box-shadow: 0 3px 16px rgba(124, 58, 237, 0.55);
          }
        }

        .rules-icon-btn {
          width: 30px;
          height: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #141c2c;
          border: 1px solid #223048;
          color: #8fa0b5;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.12s ease;
        }

        .rules-icon-btn:hover {
          background: #1c263c;
          color: #ffffff;
        }

        .more-menu-wrapper {
          position: relative;
        }

        .rules-dropdown-menu {
          position: absolute;
          top: calc(100% + 5px);
          right: 0;
          width: 220px;
          background: #0f1523;
          border: 1px solid #223048;
          border-radius: 7px;
          padding: 6px;
          z-index: 100;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
        }

        .menu-header {
          font-size: 9.5px;
          font-weight: 700;
          color: #64748b;
          padding: 4px 8px 6px;
          letter-spacing: 0.05em;
        }

        .menu-checkbox-item {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 6px 8px;
          font-size: 11px;
          color: #cbd5e1;
          cursor: pointer;
          border-radius: 4px;
        }

        .menu-checkbox-item:hover {
          background: #162034;
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
          gap: 7px;
          padding: 6px 8px;
          border: none;
          background: transparent;
          color: #8fa0b5;
          font-size: 11px;
          border-radius: 4px;
          cursor: pointer;
          text-align: left;
          transition: all 0.1s ease;
        }

        .menu-action-btn:hover {
          background: #162034;
          color: #f1f5f9;
        }

        .menu-action-btn.danger:hover {
          color: #f87171;
          background: rgba(239, 68, 68, 0.12);
        }

        /* 2. Toolbar Row */
        .rules-toolbar-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 8px 14px;
          background: #0c101c;
          border: 1px solid #1c2638;
          border-radius: 8px;
          flex-wrap: wrap;
        }

        .toolbar-left-group {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .toolbar-right-group {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .toolbar-divider {
          width: 1px;
          height: 18px;
          background: #1c2638;
          margin: 0 2px;
        }

        /* Target Agent Selector */
        .agent-select-wrapper {
          position: relative;
        }

        .agent-filter-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #111726;
          border: 1px solid #1e293b;
          border-radius: 6px;
          padding: 0 10px;
          height: 28px;
          color: #f1f5f9;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.12s ease;
        }

        .agent-filter-chip:hover {
          background: #182236;
          border-color: #2b3b55;
        }

        .agent-chip-name {
          max-width: 130px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .chevron-icon {
          color: #64748b;
          transition: transform 0.15s ease;
        }

        .chevron-icon.open {
          transform: rotate(180deg);
        }

        .agent-dropdown-menu {
          position: absolute;
          top: calc(100% + 5px);
          left: 0;
          width: 200px;
          background: #0f1523;
          border: 1px solid #223048;
          border-radius: 7px;
          padding: 5px;
          z-index: 100;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
        }

        .agent-menu-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          border: none;
          background: transparent;
          color: #94a3b8;
          font-size: 11.5px;
          font-weight: 500;
          border-radius: 4px;
          cursor: pointer;
          text-align: left;
          transition: all 0.1s ease;
        }

        .agent-menu-item:hover {
          background: #162034;
          color: #f1f5f9;
        }

        .agent-menu-item.selected {
          background: rgba(124, 58, 237, 0.15);
          color: #ffffff;
          font-weight: 600;
        }

        .agent-item-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .agent-item-check {
          color: #c084fc;
        }

        /* Segmented Controls */
        .segmented-controls {
          display: inline-flex;
          align-items: center;
          background: #111726;
          border: 1px solid #1c2638;
          border-radius: 6px;
          padding: 2px;
          gap: 2px;
        }

        .segment-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: transparent;
          border: none;
          color: #728298;
          font-size: 11px;
          font-weight: 600;
          padding: 0 10px;
          height: 24px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.12s ease;
          white-space: nowrap;
        }

        .segment-btn:hover {
          color: #cbd5e1;
        }

        .segment-btn.active {
          background: #1e293b;
          color: #ffffff;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
        }

        /* Target File Chip */
        .target-file-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #111726;
          border: 1px solid #1c2638;
          border-radius: 6px;
          padding: 0 8px;
          height: 28px;
          font-size: 11px;
          color: #94a3b8;
        }

        .file-chip-name {
          color: #cbd5e1;
          font-weight: 600;
        }

        .file-copy-btn {
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          padding: 2px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 3px;
        }

        .file-copy-btn:hover {
          color: #ffffff;
          background: #1c2638;
        }

        /* Search Box */
        .rules-search-box {
          position: relative;
          display: flex;
          align-items: center;
        }

        .rules-search-icon {
          position: absolute;
          left: 8px;
          color: #64748b;
          pointer-events: none;
        }

        .rules-search-box input {
          background: #111726;
          border: 1px solid #1c2638;
          border-radius: 6px;
          padding: 0 24px 0 26px;
          color: #e2e8f0;
          font-size: 11.5px;
          height: 28px;
          width: 150px;
          outline: none;
          transition: width 0.15s ease, border-color 0.15s ease;
        }

        .rules-search-box input:focus {
          border-color: #7c3aed;
          width: 180px;
        }

        .rules-search-clear {
          position: absolute;
          right: 6px;
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          padding: 2px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .rules-search-clear:hover {
          color: #cbd5e1;
        }

        /* 3. Master-Detail Layout */
        .master-detail-layout {
          display: flex;
          gap: 14px;
          align-items: flex-start;
          width: 100%;
        }

        /* Left Sections Sidebar */
        .sections-sidebar {
          width: 220px;
          background: #0f1523;
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
          letter-spacing: 0.05em;
        }

        .add-sec-quick-btn {
          background: transparent;
          border: none;
          color: #8fa0b5;
          cursor: pointer;
          padding: 2px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
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
          width: 16px;
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
          padding: 1px 5px;
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
          background: #0f1523;
          border: 1px solid #1c2638;
          border-radius: 8px;
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .section-block-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding-bottom: 10px;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .section-block-title {
          font-size: 13.5px;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0;
        }

        .section-count-tag {
          font-size: 10px;
          color: #64748b;
          background: rgba(255, 255, 255, 0.04);
          padding: 2px 6px;
          border-radius: 4px;
        }

        .add-rule-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: #141c2c;
          border: 1px solid #223048;
          color: #8fa0b5;
          font-size: 11px;
          font-weight: 600;
          padding: 0 10px;
          height: 26px;
          border-radius: 5px;
          cursor: pointer;
          transition: all 0.12s ease;
        }

        .add-rule-btn:hover {
          background: #1c263c;
          color: #ffffff;
          border-color: #2e3e5c;
        }

        .directives-items-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        /* Clean Directive Row */
        .clean-directive-row {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 6px;
          background: #090d16;
          border: 1px solid #182236;
          transition: all 0.12s ease;
        }

        .clean-directive-row:hover {
          background: #0e1422;
          border-color: #25334d;
        }

        .clean-directive-row.disabled {
          opacity: 0.5;
        }

        .clean-toggle-checkbox {
          width: 16px;
          height: 16px;
          border-radius: 4px;
          background: #111726;
          border: 1px solid #2d3d58;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          margin-top: 2px;
          flex-shrink: 0;
          color: transparent;
          transition: all 0.12s ease;
        }

        .clean-toggle-checkbox.checked {
          background: #7c3aed;
          border-color: #7c3aed;
          color: #ffffff;
        }

        .directive-text-area {
          flex: 1;
          font-size: 12px;
          line-height: 1.55;
          cursor: pointer;
        }

        .directive-title {
          font-weight: 700;
          color: #f1f5f9;
        }

        .directive-sep {
          color: #64748b;
          margin: 0 5px;
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
          gap: 4px;
          opacity: 0;
          transition: opacity 0.12s ease;
        }

        .clean-directive-row:hover .row-hover-actions {
          opacity: 1;
        }

        .row-tool-btn {
          width: 24px;
          height: 24px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #162034;
          border: 1px solid #233148;
          color: #8fa0b5;
          border-radius: 4px;
          cursor: pointer;
          padding: 0;
          transition: all 0.1s ease;
        }

        .row-tool-btn:hover {
          color: #ffffff;
          background: #1e2c48;
        }

        .row-tool-btn.danger:hover {
          color: #f87171;
          background: rgba(239, 68, 68, 0.15);
          border-color: rgba(239, 68, 68, 0.3);
        }

        /* Clean Directive Editor */
        .clean-directive-editor {
          background: #111827;
          border: 1px solid #7c3aed;
          border-radius: 6px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          box-shadow: 0 4px 16px rgba(124, 58, 237, 0.15);
        }

        .editor-input-wrap {
          display: flex;
          align-items: center;
        }

        .editor-title-input {
          width: 100%;
          background: #090d16;
          border: 1px solid #28374f;
          border-radius: 5px;
          padding: 6px 10px;
          color: #ffffff;
          font-size: 12px;
          font-weight: 600;
          outline: none;
          transition: border-color 0.12s ease;
        }

        .editor-title-input:focus {
          border-color: #8b5cf6;
          box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
        }

        .editor-content-textarea {
          width: 100%;
          background: #090d16;
          border: 1px solid #28374f;
          border-radius: 5px;
          padding: 8px 10px;
          color: #e2e8f0;
          font-size: 12px;
          line-height: 1.5;
          resize: vertical;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.12s ease;
        }

        .editor-content-textarea:focus {
          border-color: #8b5cf6;
          box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
        }

        .editor-footer-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
        }

        .editor-cancel-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: 1px solid #28374f;
          color: #94a3b8;
          font-size: 11px;
          font-weight: 500;
          padding: 0 10px;
          height: 26px;
          border-radius: 5px;
          cursor: pointer;
          transition: all 0.1s ease;
        }

        .editor-cancel-btn:hover {
          background: #1c2638;
          color: #ffffff;
        }

        .editor-save-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: #7c3aed;
          border: 1px solid #7c3aed;
          color: #ffffff;
          font-size: 11px;
          font-weight: 600;
          padding: 0 12px;
          height: 26px;
          border-radius: 5px;
          cursor: pointer;
          transition: all 0.12s ease;
        }

        .editor-save-btn:hover {
          background: #6d28d9;
          border-color: #6d28d9;
        }

        .empty-section-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          color: #64748b;
          font-size: 11.5px;
          background: rgba(0, 0, 0, 0.15);
          border-radius: 5px;
          border: 1px dashed #1c2638;
        }

        .empty-add-action {
          background: transparent;
          border: none;
          color: #c084fc;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }

        .empty-add-action:hover {
          text-decoration: underline;
        }

        /* Clean Loading & Empty States */
        .clean-loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 60px 20px;
          color: #8fa0b5;
          font-size: 12px;
        }

        .clean-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 60px 20px;
          text-align: center;
          background: #0f1523;
          border: 1px dashed #1c2638;
          border-radius: 8px;
        }

        .empty-shield-icon {
          color: #7c3aed;
          opacity: 0.7;
        }

        .empty-heading {
          font-size: 14px;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0;
        }

        .empty-sub {
          font-size: 12px;
          color: #64748b;
          max-width: 440px;
          margin: 0;
          line-height: 1.5;
        }

        .empty-actions-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 6px;
        }

        /* Split Markdown Mode */
        .clean-split-editor {
          display: flex;
          gap: 12px;
          min-height: 480px;
          width: 100%;
        }

        .editor-half, .preview-half {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: #0f1523;
          border: 1px solid #1c2638;
          border-radius: 8px;
          overflow: hidden;
        }

        .half-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: #0b0f19;
          border-bottom: 1px solid #1c2638;
          font-size: 10px;
          font-weight: 700;
        }

        .split-textarea {
          flex: 1;
          width: 100%;
          min-height: 420px;
          background: transparent;
          border: none;
          padding: 12px;
          color: #e2e8f0;
          font-size: 12px;
          line-height: 1.6;
          resize: none;
          outline: none;
        }

        .split-preview-body {
          flex: 1;
          padding: 12px;
          overflow-y: auto;
          color: #cbd5e1;
          font-size: 12px;
          line-height: 1.6;
        }

        /* Presets Modal */
        .preset-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: modalFadeIn 0.15s ease-out forwards;
        }

        .preset-backdrop.is-closing {
          animation: modalFadeOut 0.14s ease-in forwards;
        }

        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes modalFadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }

        .preset-dialog {
          width: 640px;
          max-width: 90vw;
          max-height: 82vh;
          background: #0f1523;
          border: 1px solid #233148;
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);
          animation: modalZoomIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          overflow: hidden;
        }

        .preset-dialog.is-closing {
          animation: modalZoomOut 0.14s ease-in forwards;
        }

        @keyframes modalZoomIn {
          from { transform: scale(0.96); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        @keyframes modalZoomOut {
          from { transform: scale(1); opacity: 1; }
          to { transform: scale(0.96); opacity: 0; }
        }

        .dialog-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
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
          color: #ffffff;
          margin: 0;
        }

        .dialog-close-btn {
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          padding: 4px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
        }

        .dialog-close-btn:hover {
          color: #ffffff;
          background: #1c2638;
        }

        .dialog-filters {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          background: #0b0f19;
          border-bottom: 1px solid #1c2638;
        }

        .dialog-search {
          position: relative;
          flex: 1;
        }

        .dialog-search .search-icon {
          position: absolute;
          left: 8px;
          top: 50%;
          transform: translateY(-50%);
          color: #64748b;
        }

        .dialog-search input {
          width: 100%;
          background: #111726;
          border: 1px solid #1c2638;
          border-radius: 5px;
          padding: 5px 10px 5px 26px;
          color: #cbd5e1;
          font-size: 11.5px;
          outline: none;
        }

        .dialog-search input:focus {
          border-color: #7c3aed;
        }

        .dialog-category-dropdown-wrap {
          position: relative;
        }

        .category-dropdown-trigger {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #111726;
          border: 1px solid #1c2638;
          border-radius: 5px;
          padding: 0 10px;
          height: 28px;
          color: #94a3b8;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
        }

        .category-dropdown-trigger.open,
        .category-dropdown-trigger.active {
          color: #ffffff;
          border-color: #7c3aed;
        }

        .filter-icon {
          color: #c084fc;
        }

        .dialog-category-menu {
          position: absolute;
          top: calc(100% + 4px);
          right: 0;
          width: 180px;
          background: #0f1523;
          border: 1px solid #223048;
          border-radius: 6px;
          padding: 4px;
          z-index: 100;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        }

        .category-menu-item {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 5px 8px;
          border: none;
          background: transparent;
          color: #8fa0b5;
          font-size: 11px;
          border-radius: 4px;
          cursor: pointer;
        }

        .category-menu-item:hover {
          background: #162034;
          color: #ffffff;
        }

        .category-menu-item.active {
          background: rgba(124, 58, 237, 0.15);
          color: #ffffff;
          font-weight: 600;
        }

        .category-item-count {
          font-size: 9.5px;
          color: #64748b;
        }

        .dialog-cards-list {
          flex: 1;
          overflow-y: auto;
          padding: 14px 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .preset-card {
          background: #111726;
          border: 1px solid #1c2638;
          border-radius: 7px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .preset-card-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .preset-card-title {
          font-size: 12.5px;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0;
        }

        .preset-card-summary {
          font-size: 11px;
          color: #728298;
          margin: 3px 0 0;
          line-height: 1.4;
        }

        .preset-cat-badge {
          font-size: 9.5px;
          background: rgba(124, 58, 237, 0.12);
          border: 1px solid rgba(124, 58, 237, 0.3);
          color: #c084fc;
          padding: 2px 6px;
          border-radius: 4px;
          white-space: nowrap;
        }

        .preset-card-preview {
          background: #0b0f19;
          border: 1px solid #172134;
          border-radius: 5px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .preview-rule {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10.5px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rule-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #7c3aed;
          flex-shrink: 0;
        }

        .rule-t {
          font-weight: 700;
          color: #cbd5e1;
        }

        .rule-c {
          color: #64748b;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .preview-more {
          font-size: 9.5px;
          color: #64748b;
          padding-top: 2px;
        }

        .preset-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 4px;
        }

        .preset-rules-count {
          font-size: 10.5px;
          color: #64748b;
        }

        .inject-preset-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: #7c3aed;
          border: 1px solid #7c3aed;
          color: #ffffff;
          font-size: 11px;
          font-weight: 600;
          padding: 0 10px;
          height: 24px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.12s ease;
        }

        .inject-preset-btn:hover {
          background: #6d28d9;
          border-color: #6d28d9;
        }

        .dialog-empty {
          text-align: center;
          padding: 40px 10px;
          color: #64748b;
          font-size: 12px;
        }

        .spin {
          animation: spinAnimation 1s linear infinite;
        }

        @keyframes spinAnimation {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
