import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  ArrowRightLeft, 
  Check, 
  AlertCircle, 
  Loader2, 
  Bot, 
  Search, 
  CheckSquare, 
  Square,
  Copy,
  Scissors,
  ChevronDown,
} from 'lucide-react';
import { ScannedSkill, SupportedAgent } from '../types/agent';
import { AGENT_ICON_MAP } from './AgentIcon';

import { logActivity } from '../services/activityLogger';
import { useModalTransition } from '../hooks/useModalTransition';

interface TransferSkillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents: SupportedAgent[];
  skills: ScannedSkill[];
  initialSourceAgentId?: string;
  initialSkillSlug?: string;
  initialSelectedSlugs?: string[];
  onSkillsTransferred?: (count: number, mode: 'copy' | 'move', targetAgentNames: string[]) => void;
}

// Skill row
interface SkillCheckRowProps {
  skill: ScannedSkill;
  slug: string;
  isChecked: boolean;
  alreadyInstalledTargets: string[];
  onMouseDownRow: (slug: string, currentChecked: boolean, e: React.MouseEvent) => void;
  onMouseEnterRow: (slug: string) => void;
  onKeyDownToggle: (slug: string) => void;
}

const SkillCheckRow = React.memo<SkillCheckRowProps>(({
  skill,
  slug,
  isChecked,
  alreadyInstalledTargets,
  onMouseDownRow,
  onMouseEnterRow,
  onKeyDownToggle
}) => {
  return (
    <div
      className={`skill-check-row ${isChecked ? 'active' : ''}`}
      tabIndex={0}
      role="checkbox"
      aria-checked={isChecked}
      onMouseDown={(e) => onMouseDownRow(slug, isChecked, e)}
      onMouseEnter={() => onMouseEnterRow(slug)}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onKeyDownToggle(slug);
        }
      }}
    >
      <div className="check-box-wrap">
        {isChecked ? (
          <CheckSquare size={15} className="text-purple-400" />
        ) : (
          <Square size={15} className="text-slate-600" />
        )}
      </div>

      <div className="skill-row-info">
        <div className="skill-row-title-bar">
          <span className="skill-row-name">{skill.name}</span>
          <span className="skill-row-slug font-mono">{slug}</span>
        </div>
        <p className="skill-row-desc">{skill.description}</p>
      </div>

      <div className="skill-row-meta">
        {alreadyInstalledTargets.length > 0 ? (
          <span
            className="already-badge font-mono"
            title={`Already installed on ${alreadyInstalledTargets.join(', ')}`}
          >
            Installed on {alreadyInstalledTargets.join(', ')}
          </span>
        ) : (
          <span className="ready-badge font-mono">Ready to sync</span>
        )}
      </div>
    </div>
  );
});

SkillCheckRow.displayName = 'SkillCheckRow';

export const TransferSkillsModal: React.FC<TransferSkillsModalProps> = ({
  isOpen,
  onClose,
  agents,
  skills,
  initialSourceAgentId,
  initialSkillSlug,
  initialSelectedSlugs,
  onSkillsTransferred
}) => {
  const { isRendered, isClosing, handleClose } = useModalTransition(isOpen, onClose, 140);

  // State
  const availableAgents = useMemo(() => agents.filter((a) => a.detected || a.selected), [agents]);

  const [sourceAgentId, setSourceAgentId] = useState<string>('');
  const [targetAgentIds, setTargetAgentIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'copy' | 'move'>('copy');
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Combobox dropdown states
  const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false);
  const [isTargetMenuOpen, setIsTargetMenuOpen] = useState(false);
  const [sourceSearchQuery, setSourceSearchQuery] = useState('');
  const [targetSearchQuery, setTargetSearchQuery] = useState('');

  const sourceMenuRef = useRef<HTMLDivElement>(null);
  const targetMenuRef = useRef<HTMLDivElement>(null);
  const sourceSearchInputRef = useRef<HTMLInputElement>(null);
  const targetSearchInputRef = useRef<HTMLInputElement>(null);

  const prevIsOpenRef = useRef(false);

  // Autofocus search inputs when menus open
  useEffect(() => {
    if (isSourceMenuOpen) {
      const t = setTimeout(() => {
        sourceSearchInputRef.current?.focus();
      }, 40);
      return () => clearTimeout(t);
    }
  }, [isSourceMenuOpen]);

  useEffect(() => {
    if (isTargetMenuOpen) {
      const t = setTimeout(() => {
        targetSearchInputRef.current?.focus();
      }, 40);
      return () => clearTimeout(t);
    }
  }, [isTargetMenuOpen]);

  // Click outside to close combobox popovers
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sourceMenuRef.current && !sourceMenuRef.current.contains(e.target as Node)) {
        setIsSourceMenuOpen(false);
      }
      if (targetMenuRef.current && !targetMenuRef.current.contains(e.target as Node)) {
        setIsTargetMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Effects
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current && availableAgents.length > 0) {
      setErrorMsg(null);
      setSearchQuery('');
      setIsSourceMenuOpen(false);
      setIsTargetMenuOpen(false);
      setSourceSearchQuery('');
      setTargetSearchQuery('');

      // Default source
      const defaultSource = initialSourceAgentId && availableAgents.some((a) => a.id === initialSourceAgentId)
        ? initialSourceAgentId
        : availableAgents.find((a) => skills.some((s) => s.sourceAgentId === a.id && !s.pluginName))?.id || availableAgents[0]?.id || '';
      setSourceAgentId(defaultSource);

      // Default target
      const potentialTargets = availableAgents.filter((a) => a.id !== defaultSource);
      if (potentialTargets.length > 0) {
        setTargetAgentIds([potentialTargets[0].id]);
      } else {
        setTargetAgentIds([]);
      }

      // Initial slugs
      if (initialSkillSlug) {
        setSelectedSlugs([initialSkillSlug]);
      } else if (initialSelectedSlugs && initialSelectedSlugs.length > 0) {
        setSelectedSlugs(initialSelectedSlugs);
      } else {
        const sourceSkills = skills.filter((s) => s.sourceAgentId === defaultSource && !s.pluginName);
        setSelectedSlugs(sourceSkills.map((s) => s.folderName || s.name));
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, availableAgents, skills, initialSourceAgentId, initialSkillSlug, initialSelectedSlugs]);

  // Keydown - Escape closes open combobox first, or modal
  useEffect(() => {
    if (!isRendered) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isSourceMenuOpen) {
          setIsSourceMenuOpen(false);
          e.stopPropagation();
          return;
        }
        if (isTargetMenuOpen) {
          setIsTargetMenuOpen(false);
          e.stopPropagation();
          return;
        }
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRendered, handleClose, isSourceMenuOpen, isTargetMenuOpen]);

  // Computed
  const sourceSkills = useMemo(() => {
    if (!sourceAgentId) return [];
    return skills.filter((s) => s.sourceAgentId === sourceAgentId && !s.pluginName);
  }, [skills, sourceAgentId]);

  const filteredSourceSkills = useMemo(() => {
    if (!searchQuery.trim()) return sourceSkills;
    const q = searchQuery.toLowerCase().trim();
    return sourceSkills.filter((s) => 
      s.name.toLowerCase().includes(q) || 
      (s.folderName && s.folderName.toLowerCase().includes(q)) ||
      s.description.toLowerCase().includes(q)
    );
  }, [sourceSkills, searchQuery]);

  const currentSourceAgent = useMemo(
    () => availableAgents.find((a) => a.id === sourceAgentId),
    [availableAgents, sourceAgentId]
  );

  const currentTargetAgents = useMemo(
    () => availableAgents.filter((a) => targetAgentIds.includes(a.id)),
    [availableAgents, targetAgentIds]
  );

  const selectedSlugsSet = useMemo(() => new Set(selectedSlugs), [selectedSlugs]);

  const installedTargetsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const t of currentTargetAgents) {
      for (const s of skills) {
        if (s.sourceAgentId === t.id) {
          const k1 = (s.folderName || '').toLowerCase();
          const k2 = (s.name || '').toLowerCase();
          if (k1) {
            const list = map.get(k1) || [];
            if (!list.includes(t.name)) list.push(t.name);
            map.set(k1, list);
          }
          if (k2 && k2 !== k1) {
            const list = map.get(k2) || [];
            if (!list.includes(t.name)) list.push(t.name);
            map.set(k2, list);
          }
        }
      }
    }
    return map;
  }, [currentTargetAgents, skills]);

  // Computed
  const potentialTargetAgents = useMemo(
    () => availableAgents.filter((a) => a.id !== sourceAgentId),
    [availableAgents, sourceAgentId]
  );

  const filteredSourceAgents = useMemo(() => {
    if (!sourceSearchQuery.trim()) return availableAgents;
    const q = sourceSearchQuery.toLowerCase().trim();
    return availableAgents.filter(
      (a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q)
    );
  }, [availableAgents, sourceSearchQuery]);

  const filteredTargetAgents = useMemo(() => {
    if (!targetSearchQuery.trim()) return potentialTargetAgents;
    const q = targetSearchQuery.toLowerCase().trim();
    return potentialTargetAgents.filter(
      (a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q)
    );
  }, [potentialTargetAgents, targetSearchQuery]);

  // Handlers
  const handleSourceAgentChange = (newSourceId: string) => {
    setSourceAgentId(newSourceId);
    setTargetAgentIds((prev) => prev.filter((id) => id !== newSourceId));
    const newSkills = skills.filter((s) => s.sourceAgentId === newSourceId);
    setSelectedSlugs(newSkills.map((s) => s.folderName || s.name));
  };

  const toggleTargetAgent = (agentId: string) => {
    setTargetAgentIds((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  };

  const handleToggleAllTargets = () => {
    if (targetAgentIds.length === potentialTargetAgents.length) {
      setTargetAgentIds([]);
    } else {
      setTargetAgentIds(potentialTargetAgents.map((a) => a.id));
    }
  };

  const toggleSkillSlug = useCallback((slug: string) => {
    setSelectedSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  }, []);

  // Drag-to-select checkboxes (Telegram-style)
  const isDraggingCheckboxesRef = useRef(false);
  const dragTargetCheckStateRef = useRef<boolean>(true);

  const handleRowMouseDown = useCallback((slug: string, currentChecked: boolean, e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only primary left-click
    e.preventDefault();
    window.getSelection()?.removeAllRanges();

    isDraggingCheckboxesRef.current = true;
    const nextState = !currentChecked;
    dragTargetCheckStateRef.current = nextState;

    setSelectedSlugs((prev) => {
      if (nextState) {
        return prev.includes(slug) ? prev : [...prev, slug];
      } else {
        return prev.filter((s) => s !== slug);
      }
    });
  }, []);

  const handleRowMouseEnter = useCallback((slug: string) => {
    if (!isDraggingCheckboxesRef.current) return;
    const targetState = dragTargetCheckStateRef.current;

    setSelectedSlugs((prev) => {
      if (targetState) {
        return prev.includes(slug) ? prev : [...prev, slug];
      } else {
        return prev.filter((s) => s !== slug);
      }
    });
  }, []);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      isDraggingCheckboxesRef.current = false;
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('blur', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('blur', handleGlobalMouseUp);
    };
  }, []);

  const isAllSelected = useMemo(() => {
    if (filteredSourceSkills.length === 0) return false;
    return filteredSourceSkills.every((s) => selectedSlugsSet.has(s.folderName || s.name));
  }, [filteredSourceSkills, selectedSlugsSet]);

  const toggleSelectAll = () => {
    const allFilteredSlugs = filteredSourceSkills.map((s) => s.folderName || s.name);
    if (isAllSelected) {
      setSelectedSlugs((prev) => prev.filter((s) => !allFilteredSlugs.includes(s)));
    } else {
      setSelectedSlugs((prev) => Array.from(new Set([...prev, ...allFilteredSlugs])));
    }
  };

  // Submit transfer
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!currentSourceAgent) {
      setErrorMsg('Please select a valid source agent.');
      return;
    }

    if (currentTargetAgents.length === 0) {
      setErrorMsg('Please select at least one target agent to transfer skills to.');
      return;
    }

    if (selectedSlugs.length === 0) {
      setErrorMsg('Please select at least one skill to transfer.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (!window.electronAPI?.transferSkills) {
        throw new Error('Electron transferSkills API is unavailable.');
      }

      const res = await window.electronAPI.transferSkills({
        sourceAgentId: currentSourceAgent.id,
        sourceSkillsDir: currentSourceAgent.paths.skillsDir,
        targetAgents: currentTargetAgents.map((t) => ({
          agentId: t.id,
          skillsDir: t.paths.skillsDir
        })),
        skillSlugs: selectedSlugs,
        mode
      });

      if (!res.success) {
        throw new Error(res.error || (res.errors && res.errors.join('; ')) || 'Failed to transfer skills');
      }

      const count = res.count || selectedSlugs.length;
      const targetNames = currentTargetAgents.map((a) => a.name);

      logActivity({
        type: 'SKILL',
        title: `${mode === 'move' ? 'Moved' : 'Copied'} ${count} skill${count === 1 ? '' : 's'}`,
        description: `${mode === 'move' ? 'Relocated' : 'Duplicated'} from ${currentSourceAgent.name} to ${targetNames.join(', ')}`,
        status: 'success',
        agentName: targetNames.join(', ')
      });

      if (onSkillsTransferred) {
        onSkillsTransferred(count, mode, targetNames);
      }

      handleClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during skill transfer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isRendered) return null;

  return createPortal(
    <div className={`transfer-modal-overlay ${isClosing ? 'is-closing' : ''}`} onClick={handleClose}>
      <div className={`transfer-modal-card ${isClosing ? 'is-closing' : ''}`} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="transfer-modal-header">
          <div className="header-icon-box">
            <ArrowRightLeft size={18} />
          </div>
          <div className="header-text">
            <h3 className="modal-title">Transfer & Sync Skills</h3>
            <p className="modal-subtitle">
              Copy or move skills seamlessly between your local AI agent environments.
            </p>
          </div>
          <button className="close-btn" onClick={handleClose} aria-label="Close modal">
            <X size={16} />
          </button>
        </div>

        {errorMsg && (
          <div className="transfer-error-banner">
            <AlertCircle size={15} />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="transfer-form">
          <div className="transfer-body">
            {/* Top Config Row: Source & Target & Mode in a compact single-row toolbar */}
            <div className="transfer-config-bar">
              {/* Source Agent Combobox */}
              <div className="transfer-combobox-wrapper source-wrapper" ref={sourceMenuRef}>
                <button
                  type="button"
                  className={`transfer-combobox-trigger ${isSourceMenuOpen ? 'open' : ''}`}
                  onClick={() => {
                    setIsSourceMenuOpen((prev) => !prev);
                    setIsTargetMenuOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      setIsSourceMenuOpen(true);
                      setIsTargetMenuOpen(false);
                    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                      setIsSourceMenuOpen(true);
                      setIsTargetMenuOpen(false);
                      setSourceSearchQuery(e.key);
                    }
                  }}
                  aria-expanded={isSourceMenuOpen}
                  title="Source agent"
                >
                  <div className="transfer-combobox-trigger-left">
                    {currentSourceAgent ? (
                      <>
                        <span
                          className="transfer-combobox-dot"
                          style={{ backgroundColor: currentSourceAgent.color || '#8b5cf6' }}
                        />
                        {React.createElement(AGENT_ICON_MAP[currentSourceAgent.id] || AGENT_ICON_MAP[currentSourceAgent.iconName] || Bot, {
                          size: 12,
                          style: { color: currentSourceAgent.color || '#8b5cf6' },
                          className: 'transfer-combobox-icon'
                        })}
                      </>
                    ) : (
                      <Bot size={12} className="transfer-combobox-icon text-muted" />
                    )}
                    <span className="transfer-combobox-label">From:</span>
                    <span className="transfer-combobox-value">{currentSourceAgent?.name || 'Select source'}</span>
                  </div>

                  <div className="transfer-combobox-trigger-right">
                    <span className="transfer-combobox-count font-mono">
                      {sourceSkills.length}
                    </span>
                    <ChevronDown
                      size={11}
                      className={`transfer-combobox-chevron ${isSourceMenuOpen ? 'open' : ''}`}
                    />
                  </div>
                </button>

                {isSourceMenuOpen && (
                  <div className="transfer-dropdown-menu">
                    <div className="transfer-dropdown-header">
                      <span>Select Source Agent</span>
                      <span className="transfer-dropdown-header-count font-mono">
                        {availableAgents.length} available
                      </span>
                    </div>

                    <div className="transfer-combobox-search-wrap">
                      <Search size={12} className="transfer-combobox-search-icon" />
                      <input
                        ref={sourceSearchInputRef}
                        type="text"
                        className="transfer-combobox-search-input"
                        placeholder="Search agent..."
                        value={sourceSearchQuery}
                        onChange={(e) => setSourceSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setIsSourceMenuOpen(false);
                          } else if (e.key === 'Enter') {
                            const first = filteredSourceAgents[0];
                            if (first) {
                              handleSourceAgentChange(first.id);
                              setIsSourceMenuOpen(false);
                            }
                          }
                        }}
                      />
                      {sourceSearchQuery && (
                        <button
                          type="button"
                          className="transfer-combobox-clear-btn"
                          onClick={() => setSourceSearchQuery('')}
                          title="Clear search"
                        >
                          <X size={10} />
                        </button>
                      )}
                    </div>

                    <div className="transfer-dropdown-list">
                      {filteredSourceAgents.map((ag) => {
                        const isSelected = ag.id === sourceAgentId;
                        const skillCount = skills.filter((s) => s.sourceAgentId === ag.id).length;
                        const AgentIcon = AGENT_ICON_MAP[ag.id] || AGENT_ICON_MAP[ag.iconName] || Bot;
                        return (
                          <button
                            type="button"
                            key={ag.id}
                            className={`transfer-dropdown-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => {
                              handleSourceAgentChange(ag.id);
                              setIsSourceMenuOpen(false);
                            }}
                          >
                            <div className="transfer-dropdown-item-left">
                              <span
                                className="transfer-dropdown-item-dot"
                                style={{ backgroundColor: ag.color || '#8b5cf6' }}
                              />
                              <AgentIcon size={12} style={{ color: ag.color || '#8b5cf6' }} />
                              <span className="transfer-dropdown-item-name">{ag.name}</span>
                            </div>
                            <div className="transfer-dropdown-item-right">
                              <span className="transfer-dropdown-item-count">{skillCount} skills</span>
                              {isSelected && (
                                <Check
                                  size={12}
                                  className="transfer-dropdown-item-check"
                                  style={{ color: ag.color || '#a855f7' }}
                                />
                              )}
                            </div>
                          </button>
                        );
                      })}

                      {filteredSourceAgents.length === 0 && (
                        <div className="transfer-dropdown-empty">
                          <span>No agents match "{sourceSearchQuery}"</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Target Agents Combobox */}
              <div className="transfer-combobox-wrapper target-wrapper" ref={targetMenuRef}>
                <button
                  type="button"
                  className={`transfer-combobox-trigger ${isTargetMenuOpen ? 'open' : ''} ${
                    currentTargetAgents.length > 0 ? 'active' : ''
                  }`}
                  onClick={() => {
                    setIsTargetMenuOpen((prev) => !prev);
                    setIsSourceMenuOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      setIsTargetMenuOpen(true);
                      setIsSourceMenuOpen(false);
                    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                      setIsTargetMenuOpen(true);
                      setIsSourceMenuOpen(false);
                      setTargetSearchQuery(e.key);
                    }
                  }}
                  aria-expanded={isTargetMenuOpen}
                  title="Target agents"
                >
                  <div className="transfer-combobox-trigger-left">
                    {currentTargetAgents.length === 1 ? (
                      <>
                        <span
                          className="transfer-combobox-dot"
                          style={{ backgroundColor: currentTargetAgents[0].color || '#8b5cf6' }}
                        />
                        {React.createElement(AGENT_ICON_MAP[currentTargetAgents[0].id] || AGENT_ICON_MAP[currentTargetAgents[0].iconName] || Bot, {
                          size: 12,
                          style: { color: currentTargetAgents[0].color || '#8b5cf6' },
                          className: 'transfer-combobox-icon'
                        })}
                      </>
                    ) : (
                      <Bot
                        size={12}
                        className={`transfer-combobox-icon ${currentTargetAgents.length > 0 ? 'text-purple-400' : 'text-muted'}`}
                      />
                    )}
                    <span className="transfer-combobox-label">To:</span>
                    <span className="transfer-combobox-value">
                      {currentTargetAgents.length === 0
                        ? 'Select targets...'
                        : currentTargetAgents.length === potentialTargetAgents.length && potentialTargetAgents.length > 0
                        ? `All Targets (${currentTargetAgents.length})`
                        : currentTargetAgents.map((a) => a.name).join(', ')}
                    </span>
                  </div>

                  <div className="transfer-combobox-trigger-right">
                    <span className="transfer-combobox-count font-mono">
                      {targetAgentIds.length}/{potentialTargetAgents.length}
                    </span>
                    <ChevronDown
                      size={11}
                      className={`transfer-combobox-chevron ${isTargetMenuOpen ? 'open' : ''}`}
                    />
                  </div>
                </button>

                {isTargetMenuOpen && (
                  <div className="transfer-dropdown-menu">
                    <div className="transfer-dropdown-header">
                      <span>Select Target Agents</span>
                      {potentialTargetAgents.length > 0 && (
                        <button
                          type="button"
                          className="transfer-dropdown-action-btn"
                          onClick={handleToggleAllTargets}
                        >
                          {targetAgentIds.length === potentialTargetAgents.length
                            ? 'Deselect All'
                            : 'Select All'}
                        </button>
                      )}
                    </div>

                    <div className="transfer-combobox-search-wrap">
                      <Search size={12} className="transfer-combobox-search-icon" />
                      <input
                        ref={targetSearchInputRef}
                        type="text"
                        className="transfer-combobox-search-input"
                        placeholder="Search target agent..."
                        value={targetSearchQuery}
                        onChange={(e) => setTargetSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setIsTargetMenuOpen(false);
                          } else if (e.key === 'Enter') {
                            const first = filteredTargetAgents[0];
                            if (first) {
                              toggleTargetAgent(first.id);
                            }
                          }
                        }}
                      />
                      {targetSearchQuery && (
                        <button
                          type="button"
                          className="transfer-combobox-clear-btn"
                          onClick={() => setTargetSearchQuery('')}
                          title="Clear search"
                        >
                          <X size={10} />
                        </button>
                      )}
                    </div>

                    <div className="transfer-dropdown-list">
                      {filteredTargetAgents.map((ag) => {
                        const isChecked = targetAgentIds.includes(ag.id);
                        const skillCount = skills.filter((s) => s.sourceAgentId === ag.id).length;
                        const AgentIcon = AGENT_ICON_MAP[ag.id] || AGENT_ICON_MAP[ag.iconName] || Bot;
                        return (
                          <button
                            type="button"
                            key={ag.id}
                            className={`transfer-dropdown-item ${isChecked ? 'selected' : ''}`}
                            onClick={() => toggleTargetAgent(ag.id)}
                          >
                            <div className="transfer-dropdown-item-left">
                              <div className={`transfer-combobox-checkbox ${isChecked ? 'checked' : ''}`}>
                                {isChecked && <Check size={10} />}
                              </div>
                              <span
                                className="transfer-dropdown-item-dot"
                                style={{ backgroundColor: ag.color || '#8b5cf6' }}
                              />
                              <AgentIcon size={12} style={{ color: ag.color || '#8b5cf6' }} />
                              <span className="transfer-dropdown-item-name">{ag.name}</span>
                            </div>
                            <div className="transfer-dropdown-item-right">
                              <span className="transfer-dropdown-item-count">{skillCount} skills</span>
                            </div>
                          </button>
                        );
                      })}

                      {filteredTargetAgents.length === 0 && (
                        <div className="transfer-dropdown-empty">
                          <span>No target agents match "{targetSearchQuery}"</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Mode Toggle */}
              <div className="mode-toggle-group">
                <button
                  type="button"
                  className={`mode-btn ${mode === 'copy' ? 'active' : ''}`}
                  onClick={() => setMode('copy')}
                  title="Keep original skill on source agent and duplicate to target"
                >
                  <Copy size={11} />
                  <span>Copy</span>
                </button>
                <button
                  type="button"
                  className={`mode-btn ${mode === 'move' ? 'active' : ''}`}
                  onClick={() => setMode('move')}
                  title="Copy to target and remove from source agent"
                >
                  <Scissors size={11} />
                  <span>Move</span>
                </button>
              </div>
            </div>

            {/* Middle Section: Skills Selection List */}
            <div className="skills-selection-container">
              <div className="selection-toolbar">
                <div className="search-input-wrap">
                  <Search size={13} className="search-icon" />
                  <input
                    type="text"
                    className="search-input"
                    placeholder={`Filter ${sourceSkills.length} skills in ${currentSourceAgent?.name || 'source'}...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="clear-search-btn"
                      onClick={() => setSearchQuery('')}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="selection-actions">
                  <button
                    type="button"
                    className="select-all-btn"
                    onClick={toggleSelectAll}
                  >
                    {isAllSelected ? 'Deselect All' : 'Select All'}
                  </button>
                  <span className="selected-count-pill font-mono">
                    {selectedSlugs.length} of {sourceSkills.length} selected
                  </span>
                </div>
              </div>

              {/* Skills List Table */}
              <div className="skills-checklist">
                {sourceSkills.length === 0 ? (
                  <div className="empty-state-notice">
                    <Bot size={18} className="text-slate-500" />
                    <span>No skills found in {currentSourceAgent?.name || 'source agent'}.</span>
                  </div>
                ) : filteredSourceSkills.length === 0 ? (
                  <div className="empty-state-notice">
                    <Search size={16} className="text-slate-500" />
                    <span>No skills match "{searchQuery}"</span>
                  </div>
                ) : (
                  filteredSourceSkills.map((skill) => {
                    const slug = skill.folderName || skill.name;
                    const isChecked = selectedSlugsSet.has(slug);
                    const alreadyInstalledTargets =
                      installedTargetsMap.get((skill.folderName || '').toLowerCase()) ||
                      installedTargetsMap.get(skill.name.toLowerCase()) ||
                      [];

                    return (
                      <SkillCheckRow
                        key={skill.id || slug}
                        skill={skill}
                        slug={slug}
                        isChecked={isChecked}
                        alreadyInstalledTargets={alreadyInstalledTargets}
                        onMouseDownRow={handleRowMouseDown}
                        onMouseEnterRow={handleRowMouseEnter}
                        onKeyDownToggle={toggleSkillSlug}
                      />
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="transfer-modal-footer">
            <div className="footer-summary">
              <span>
                {mode === 'copy' ? 'Copying' : 'Moving'}{' '}
                <strong>{selectedSlugs.length} {selectedSlugs.length === 1 ? 'skill' : 'skills'}</strong> from{' '}
                <strong className="text-purple-300">{currentSourceAgent?.name}</strong> to{' '}
                <strong>{currentTargetAgents.map((a) => a.name).join(', ') || 'selected targets'}</strong>
              </span>
            </div>

            <div className="footer-actions">
              <button
                type="button"
                className="cancel-action-btn"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="submit-transfer-btn"
                disabled={isSubmitting || selectedSlugs.length === 0 || currentTargetAgents.length === 0}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="spin" />
                    <span>Transferring Skills...</span>
                  </>
                ) : (
                  <>
                    <ArrowRightLeft size={14} />
                    <span>
                      {mode === 'copy' ? 'Copy' : 'Move'} {selectedSlugs.length}{' '}
                      {selectedSlugs.length === 1 ? 'Skill' : 'Skills'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        <style>{`
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

          .transfer-modal-overlay {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(3, 7, 18, 0.82) !important;
            backdrop-filter: blur(8px) !important;
            -webkit-backdrop-filter: blur(8px) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            z-index: 100000 !important;
            padding: 24px !important;
            animation: modalOverlayFadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
            box-sizing: border-box !important;
            -webkit-app-region: no-drag !important;
          }

          .transfer-modal-overlay.is-closing {
            animation: modalOverlayFadeOut 0.16s cubic-bezier(0.4, 0, 1, 1) forwards !important;
            pointer-events: none !important;
          }

          .transfer-modal-card {
            background: #090d16;
            border: 1px solid #1c273c;
            border-radius: 12px;
            width: 100%;
            max-width: 900px;
            height: 82vh;
            max-height: 700px;
            min-height: 520px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 48px -8px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(28, 39, 60, 0.6);
            overflow: hidden;
            will-change: transform, opacity;
            transform: translate3d(0, 0, 0);
            contain: layout;
            animation: modalCardScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
            position: relative;
            z-index: 100001;
            box-sizing: border-box;
            -webkit-app-region: no-drag !important;
            user-select: none;
            -webkit-user-select: none;
          }

          .transfer-modal-card.is-closing {
            animation: modalCardScaleOut 0.16s cubic-bezier(0.4, 0, 1, 1) forwards !important;
            pointer-events: none !important;
          }

          .transfer-modal-header {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 14px 20px;
            border-bottom: 1px solid #172133;
            background: #0d1320;
            flex-shrink: 0;
            -webkit-app-region: no-drag !important;
          }

          .header-icon-box {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            background: linear-gradient(135deg, rgba(147, 51, 234, 0.3), rgba(124, 58, 237, 0.2));
            border: 1px solid rgba(147, 51, 234, 0.45);
            color: #c084fc;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }

          .header-text {
            flex: 1;
            min-width: 0;
          }

          .modal-title {
            font-size: 14.5px;
            font-weight: 700;
            color: #f1f5f9;
            margin: 0;
            letter-spacing: -0.01em;
          }

          .modal-subtitle {
            font-size: 11.5px;
            color: #8899ac;
            margin: 2px 0 0 0;
          }

          .close-btn {
            background: transparent;
            border: none;
            color: #64748b;
            padding: 6px;
            border-radius: 6px;
            cursor: pointer;
            transition: background-color 0.12s ease, color 0.12s ease;
          }

          .close-btn:hover {
            background: #1e293b;
            color: #f8fafc;
          }

          .transfer-error-banner {
            display: flex;
            align-items: center;
            gap: 8px;
            background: rgba(239, 68, 68, 0.12);
            border-bottom: 1px solid rgba(239, 68, 68, 0.25);
            color: #fca5a5;
            font-size: 12px;
            padding: 8px 20px;
            flex-shrink: 0;
          }

          .transfer-form {
            display: flex;
            flex-direction: column;
            flex: 1;
            overflow: hidden;
            min-height: 0;
          }

          .transfer-body {
            display: flex;
            flex-direction: column;
            gap: 14px;
            padding: 16px 20px;
            flex: 1;
            min-height: 0;
            overflow: hidden;
          }

          /* Compact Toolbar Config Bar */
          .transfer-config-bar {
            display: grid;
            grid-template-columns: 1fr 1.3fr auto;
            gap: 10px;
            align-items: center;
            flex-shrink: 0;
            position: relative;
            z-index: 30;
          }

          /* Transfer Combobox Controls */
          .transfer-combobox-wrapper {
            position: relative;
            width: 100%;
          }

          .transfer-combobox-wrapper.source-wrapper {
            z-index: 35;
          }

          .transfer-combobox-wrapper.target-wrapper {
            z-index: 34;
          }

          .transfer-combobox-trigger {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
            width: 100%;
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
            text-align: left;
          }

          .transfer-combobox-trigger:hover {
            background: rgba(27, 38, 62, 0.9);
            border-color: rgba(255, 255, 255, 0.16);
            color: #f8fafc;
          }

          .transfer-combobox-trigger.open {
            border-color: rgba(168, 85, 247, 0.55);
            background: rgba(20, 28, 48, 0.98);
            box-shadow: 0 0 0 1px rgba(168, 85, 247, 0.25);
          }

          .transfer-combobox-trigger.active {
            border-color: rgba(168, 85, 247, 0.35);
            background: rgba(168, 85, 247, 0.12);
            color: #f8fafc;
          }

          .transfer-combobox-trigger-left {
            display: flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
            flex: 1;
            overflow: hidden;
          }

          .transfer-combobox-trigger-right {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
          }

          .transfer-combobox-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            flex-shrink: 0;
          }

          .transfer-combobox-icon {
            flex-shrink: 0;
          }

          .transfer-combobox-label {
            font-size: 11px;
            font-weight: 500;
            color: #64748b;
            letter-spacing: 0.01em;
            flex-shrink: 0;
          }

          .transfer-combobox-value {
            font-size: 11.5px;
            font-weight: 500;
            color: #e2e8f0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .transfer-combobox-trigger.active .transfer-combobox-value {
            color: #ffffff;
          }

          .transfer-combobox-placeholder {
            font-size: 11.5px;
            color: #64748b;
            font-style: italic;
          }

          .transfer-combobox-count {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 18px;
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
            flex-shrink: 0;
            user-select: none;
            box-sizing: border-box;
          }

          .transfer-combobox-chevron {
            color: #64748b;
            transition: transform 0.18s ease;
            flex-shrink: 0;
          }

          .transfer-combobox-chevron.open {
            transform: rotate(180deg);
            color: #c084fc;
          }

          /* Floating Combobox Popover */
          .transfer-dropdown-menu {
            position: absolute;
            top: calc(100% + 5px);
            left: 0;
            right: 0;
            width: 100%;
            min-width: 250px;
            background: #0d1322;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            box-shadow: 0 18px 40px -4px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.05);
            padding: 6px;
            z-index: 1000;
            backdrop-filter: blur(16px);
            animation: transferDropdownFadeIn 0.14s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            box-sizing: border-box;
          }

          @keyframes transferDropdownFadeIn {
            from {
              opacity: 0;
              transform: translateY(-4px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .transfer-dropdown-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 4px 8px 6px;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: #64748b;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            margin-bottom: 5px;
          }

          .transfer-dropdown-header-count {
            font-size: 9.5px;
            color: #64748b;
            text-transform: none;
          }

          .transfer-dropdown-action-btn {
            background: transparent;
            border: none;
            color: #c084fc;
            font-size: 10px;
            font-weight: 600;
            cursor: pointer;
            padding: 0;
            transition: color 0.12s ease;
          }

          .transfer-dropdown-action-btn:hover {
            color: #e9d5ff;
            text-decoration: underline;
          }

          .transfer-combobox-search-wrap {
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

          .transfer-combobox-search-wrap:focus-within {
            background: rgba(255, 255, 255, 0.07);
            border-color: rgba(168, 85, 247, 0.55);
            box-shadow: 0 0 0 1px rgba(168, 85, 247, 0.25);
          }

          .transfer-combobox-search-icon {
            color: #64748b;
            flex-shrink: 0;
          }

          .transfer-combobox-search-input {
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

          .transfer-combobox-search-input::placeholder {
            color: #64748b;
            font-size: 11px;
          }

          .transfer-combobox-clear-btn {
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

          .transfer-combobox-clear-btn:hover {
            background: rgba(239, 68, 68, 0.25);
            color: #f87171;
          }

          .transfer-dropdown-list {
            display: flex;
            flex-direction: column;
            gap: 2px;
            max-height: 220px;
            overflow-y: auto;
            overflow-x: hidden;
            padding-right: 2px;
          }

          .transfer-dropdown-list::-webkit-scrollbar {
            width: 4px;
          }

          .transfer-dropdown-list::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.18);
            border-radius: 4px;
          }

          .transfer-dropdown-item {
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

          .transfer-dropdown-item:hover {
            background: rgba(255, 255, 255, 0.06);
            color: #ffffff;
          }

          .transfer-dropdown-item.selected {
            background: rgba(168, 85, 247, 0.12);
            border-color: rgba(168, 85, 247, 0.28);
            color: #ffffff;
          }

          .transfer-dropdown-item-left {
            display: flex;
            align-items: center;
            gap: 7px;
            min-width: 0;
            flex: 1;
          }

          .transfer-combobox-checkbox {
            width: 13px;
            height: 13px;
            border-radius: 3px;
            border: 1px solid rgba(255, 255, 255, 0.25);
            background: rgba(255, 255, 255, 0.04);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            flex-shrink: 0;
            transition: all 0.12s ease;
          }

          .transfer-combobox-checkbox.checked {
            background: #9333ea;
            border-color: #a855f7;
          }

          .transfer-dropdown-item-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            flex-shrink: 0;
          }

          .transfer-dropdown-item-name {
            font-size: 11.5px;
            font-weight: 500;
            color: #cbd5e1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .transfer-dropdown-item.selected .transfer-dropdown-item-name {
            color: #ffffff;
            font-weight: 600;
          }

          .transfer-dropdown-item-right {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
          }

          .transfer-dropdown-item-count {
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
            flex-shrink: 0;
            user-select: none;
            box-sizing: border-box;
          }

          .transfer-dropdown-item:hover .transfer-dropdown-item-count {
            background: rgba(255, 255, 255, 0.1);
            color: #f1f5f9;
          }

          .transfer-dropdown-empty {
            padding: 16px 8px;
            text-align: center;
            color: #64748b;
            font-size: 11px;
            font-style: italic;
          }

          /* Mode Toggle */
          .mode-toggle-group {
            display: inline-flex;
            align-items: center;
            background: rgba(20, 28, 45, 0.7);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 6px;
            padding: 2px;
            gap: 2px;
            height: 30px;
            min-height: 30px;
            max-height: 30px;
            box-sizing: border-box;
          }

          .mode-btn {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 0 8px;
            height: 24px;
            border-radius: 4px;
            background: transparent;
            border: 1px solid transparent;
            color: #64748b;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.12s ease;
            white-space: nowrap;
          }

          .mode-btn:hover {
            color: #cbd5e1;
          }

          .mode-btn.active {
            background: rgba(168, 85, 247, 0.18);
            border-color: rgba(168, 85, 247, 0.35);
            color: #c084fc;
            font-weight: 600;
          }

          /* Selection Container */
          .skills-selection-container {
            display: flex;
            flex-direction: column;
            border: 1px solid #19243a;
            border-radius: 8px;
            background: #070b14;
            flex: 1;
            min-height: 0;
            overflow: hidden;
          }

          .selection-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            background: #0c1220;
            border-bottom: 1px solid #19243a;
            gap: 12px;
          }

          .search-input-wrap {
            position: relative;
            display: flex;
            align-items: center;
            flex: 1;
            max-width: 320px;
          }

          .search-icon {
            position: absolute;
            left: 8px;
            color: #64748b;
            pointer-events: none;
          }

          .search-input {
            width: 100%;
            background: #090e18;
            border: 1px solid #1c273c;
            border-radius: 5px;
            padding: 5px 24px 5px 28px;
            color: #e2e8f0;
            font-size: 11.5px;
            outline: none;
          }

          .search-input:focus {
            border-color: #7c3aed;
          }

          .clear-search-btn {
            position: absolute;
            right: 6px;
            background: transparent;
            border: none;
            color: #64748b;
            cursor: pointer;
            padding: 0;
          }

          .selection-actions {
            display: flex;
            align-items: center;
            gap: 10px;
          }

          .select-all-btn {
            background: transparent;
            border: none;
            color: #a78bfa;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            padding: 0;
          }

          .select-all-btn:hover {
            text-decoration: underline;
          }

          .selected-count-pill {
            font-size: 10.5px;
            color: #64748b;
            background: #090e18;
            border: 1px solid #172236;
            padding: 2px 7px;
            border-radius: 4px;
          }

          /* Checklist */
          .skills-checklist {
            display: flex;
            flex-direction: column;
            flex: 1;
            overflow-y: auto;
            overscroll-behavior: contain;
            contain: content;
            padding: 6px;
            gap: 4px;
            -webkit-overflow-scrolling: touch;
            user-select: none !important;
            -webkit-user-select: none !important;
          }

          .skills-checklist::-webkit-scrollbar {
            width: 5px;
          }

          .skills-checklist::-webkit-scrollbar-thumb {
            background: #1c273c;
            border-radius: 3px;
          }

          .skill-check-row {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 7px 10px;
            border-radius: 6px;
            background: #0b101c;
            border: 1px solid #151e30;
            cursor: pointer;
            contain: layout style;
            transition: background-color 0.08s ease, border-color 0.08s ease;
            user-select: none !important;
            -webkit-user-select: none !important;
          }

          .skill-check-row:focus-visible {
            outline: 2px solid #a855f7;
            outline-offset: 1px;
          }

          .skill-check-row * {
            user-select: none !important;
            -webkit-user-select: none !important;
          }

          .skill-check-row:hover {
            background: #11182a;
            border-color: #1f2d48;
          }

          .skill-check-row.active {
            background: rgba(147, 51, 234, 0.1);
            border-color: rgba(168, 85, 247, 0.35);
          }

          .check-box-wrap {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }

          .skill-row-info {
            flex: 1;
            min-width: 0;
          }

          .skill-row-title-bar {
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .skill-row-name {
            font-size: 12px;
            font-weight: 600;
            color: #f1f5f9;
          }

          .skill-row-slug {
            font-size: 10.5px;
            color: #64748b;
          }

          .skill-row-desc {
            font-size: 11px;
            color: #8899ac;
            margin: 2px 0 0 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .skill-row-meta {
            flex-shrink: 0;
          }

          .already-badge {
            font-size: 10px;
            color: #f59e0b;
            background: rgba(245, 158, 11, 0.1);
            border: 1px solid rgba(245, 158, 11, 0.25);
            padding: 1px 6px;
            border-radius: 4px;
          }

          .ready-badge {
            font-size: 10px;
            color: #10b981;
            background: rgba(16, 185, 129, 0.1);
            border: 1px solid rgba(16, 185, 129, 0.25);
            padding: 1px 6px;
            border-radius: 4px;
          }

          .empty-state-notice {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 40px 20px;
            color: #64748b;
            font-size: 12px;
          }

          /* Footer */
          .transfer-modal-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 20px;
            background: #0d1320;
            border-top: 1px solid #172133;
            flex-shrink: 0;
            -webkit-app-region: no-drag !important;
          }

          .footer-summary {
            font-size: 11.5px;
            color: #8899ac;
          }

          .footer-summary strong {
            color: #e2e8f0;
          }

          .footer-actions {
            display: flex;
            align-items: center;
            gap: 10px;
          }

          .cancel-action-btn {
            background: #111726;
            border: 1px solid #1e293b;
            color: #94a3b8;
            font-size: 12px;
            font-weight: 500;
            padding: 0 14px;
            height: 32px;
            border-radius: 6px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            transition: background-color 0.12s ease, color 0.12s ease;
          }

          .cancel-action-btn:hover:not(:disabled) {
            background: #1e293b;
            color: #ffffff;
          }

          .submit-transfer-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            background: linear-gradient(135deg, #9333ea, #7c3aed);
            border: 1px solid rgba(147, 51, 234, 0.45);
            color: #ffffff;
            font-size: 12px;
            font-weight: 600;
            padding: 0 16px;
            height: 32px;
            border-radius: 6px;
            cursor: pointer;
            box-sizing: border-box;
            box-shadow: 0 2px 10px rgba(147, 51, 234, 0.35);
            transition: filter 0.12s ease, box-shadow 0.12s ease;
          }

          .submit-transfer-btn:hover:not(:disabled) {
            filter: brightness(1.1);
            box-shadow: 0 4px 14px rgba(147, 51, 234, 0.45);
          }

          .submit-transfer-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
        `}</style>
      </div>
    </div>,
    document.body
  );
};
