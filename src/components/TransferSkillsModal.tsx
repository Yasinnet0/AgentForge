import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Scissors
} from 'lucide-react';
import { ScannedSkill, SupportedAgent } from '../types/agent';
import { logActivity } from '../services/activityLogger';

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

// Memoized individual skill row to prevent re-rendering the entire list on every single toggle
interface SkillCheckRowProps {
  skill: ScannedSkill;
  slug: string;
  isChecked: boolean;
  alreadyInstalledTargets: string[];
  onToggle: (slug: string) => void;
}

const SkillCheckRow = React.memo<SkillCheckRowProps>(({
  skill,
  slug,
  isChecked,
  alreadyInstalledTargets,
  onToggle
}) => {
  return (
    <div
      className={`skill-check-row ${isChecked ? 'active' : ''}`}
      onClick={() => onToggle(slug)}
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
  // Available detected agents
  const availableAgents = useMemo(() => agents.filter((a) => a.detected || a.selected), [agents]);

  // Source agent state
  const [sourceAgentId, setSourceAgentId] = useState<string>('');
  // Target agent IDs state
  const [targetAgentIds, setTargetAgentIds] = useState<string[]>([]);
  // Transfer mode: 'copy' | 'move'
  const [mode, setMode] = useState<'copy' | 'move'>('copy');
  // Selected skill slugs to transfer
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  // Search filter query
  const [searchQuery, setSearchQuery] = useState('');
  // Submitting state
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Error message
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize or reset on open
  useEffect(() => {
    if (isOpen && availableAgents.length > 0) {
      setErrorMsg(null);
      setSearchQuery('');

      // Pick source agent: initialSourceAgentId or first agent with standalone skills
      const defaultSource = initialSourceAgentId && availableAgents.some((a) => a.id === initialSourceAgentId)
        ? initialSourceAgentId
        : availableAgents.find((a) => skills.some((s) => s.sourceAgentId === a.id && !s.pluginName))?.id || availableAgents[0]?.id || '';
      setSourceAgentId(defaultSource);

      // Default target: the other agent(s)
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
        // Pre-select all standalone skills from this source agent by default
        const sourceSkills = skills.filter((s) => s.sourceAgentId === defaultSource && !s.pluginName);
        setSelectedSlugs(sourceSkills.map((s) => s.folderName || s.name));
      }

      // Escape listener
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, availableAgents, skills, initialSourceAgentId, initialSkillSlug, initialSelectedSlugs, onClose]);

  // Skills belonging to the currently selected source agent
  const sourceSkills = useMemo(() => {
    if (!sourceAgentId) return [];
    return skills.filter((s) => s.sourceAgentId === sourceAgentId && !s.pluginName);
  }, [skills, sourceAgentId]);

  // Filtered source skills based on search query
  const filteredSourceSkills = useMemo(() => {
    if (!searchQuery.trim()) return sourceSkills;
    const q = searchQuery.toLowerCase().trim();
    return sourceSkills.filter((s) => 
      s.name.toLowerCase().includes(q) || 
      (s.folderName && s.folderName.toLowerCase().includes(q)) ||
      s.description.toLowerCase().includes(q)
    );
  }, [sourceSkills, searchQuery]);

  // Current source agent object
  const currentSourceAgent = useMemo(
    () => availableAgents.find((a) => a.id === sourceAgentId),
    [availableAgents, sourceAgentId]
  );

  // Target agent objects
  const currentTargetAgents = useMemo(
    () => availableAgents.filter((a) => targetAgentIds.includes(a.id)),
    [availableAgents, targetAgentIds]
  );

  // Fast O(1) set lookup for selected slugs
  const selectedSlugsSet = useMemo(() => new Set(selectedSlugs), [selectedSlugs]);

  // Precompute target agent installation map for instant O(1) row lookups instead of O(N * M * K)
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

  // When source agent changes, update target list and default selected skills
  const handleSourceAgentChange = (newSourceId: string) => {
    setSourceAgentId(newSourceId);
    // Exclude source from targets
    setTargetAgentIds((prev) => prev.filter((id) => id !== newSourceId));
    // Default to all skills of new source
    const newSkills = skills.filter((s) => s.sourceAgentId === newSourceId);
    setSelectedSlugs(newSkills.map((s) => s.folderName || s.name));
  };

  const toggleTargetAgent = (agentId: string) => {
    setTargetAgentIds((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  };

  const toggleSkillSlug = useCallback((slug: string) => {
    setSelectedSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
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

      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during skill transfer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="transfer-modal-overlay" onClick={onClose}>
      <div className="transfer-modal-card" onClick={(e) => e.stopPropagation()}>
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
          <button className="close-btn" onClick={onClose} aria-label="Close modal">
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
            {/* Top Config Row: Source & Target & Mode */}
            <div className="config-grid">
              {/* Source Agent */}
              <div className="config-box">
                <label className="config-label">
                  <span>Transfer From</span>
                  <span className="source-count font-mono">
                    {sourceSkills.length} {sourceSkills.length === 1 ? 'skill' : 'skills'}
                  </span>
                </label>
                <select
                  className="config-select"
                  value={sourceAgentId}
                  onChange={(e) => handleSourceAgentChange(e.target.value)}
                >
                  {availableAgents.map((ag) => {
                    const skillCount = skills.filter((s) => s.sourceAgentId === ag.id).length;
                    return (
                      <option key={ag.id} value={ag.id}>
                        {ag.name} ({skillCount} skills)
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Target Agents */}
              <div className="config-box">
                <label className="config-label">
                  <span>Transfer To (Target Agents)</span>
                  <span className="label-sub">{currentTargetAgents.length} selected</span>
                </label>
                <div className="target-chips-wrap">
                  {availableAgents
                    .filter((ag) => ag.id !== sourceAgentId)
                    .map((ag) => {
                      const isChecked = targetAgentIds.includes(ag.id);
                      return (
                        <button
                          key={ag.id}
                          type="button"
                          className={`target-chip-btn ${isChecked ? 'active' : ''}`}
                          onClick={() => toggleTargetAgent(ag.id)}
                        >
                          <span
                            className="target-chip-dot"
                            style={{ backgroundColor: ag.color || '#3b82f6' }}
                          />
                          <span className="target-chip-name">{ag.name}</span>
                          {isChecked && <Check size={11} className="target-chip-check" />}
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Mode Toggle */}
              <div className="config-box mode-box">
                <label className="config-label">Operation</label>
                <div className="mode-toggle-group">
                  <button
                    type="button"
                    className={`mode-btn ${mode === 'copy' ? 'active' : ''}`}
                    onClick={() => setMode('copy')}
                    title="Keep original skill on source agent and duplicate to target"
                  >
                    <Copy size={12} />
                    <span>Copy (Duplicate)</span>
                  </button>
                  <button
                    type="button"
                    className={`mode-btn ${mode === 'move' ? 'active' : ''}`}
                    onClick={() => setMode('move')}
                    title="Copy to target and remove from source agent"
                  >
                    <Scissors size={12} />
                    <span>Move (Relocate)</span>
                  </button>
                </div>
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
                        onToggle={toggleSkillSlug}
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
                onClick={onClose}
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
          .transfer-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(3, 7, 18, 0.88);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100000;
            padding: 24px;
            animation: fadeIn 0.12s ease-out;
            box-sizing: border-box;
            -webkit-app-region: no-drag !important;
          }

          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
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
            animation: modalScale 0.15s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
            z-index: 100001;
            box-sizing: border-box;
            -webkit-app-region: no-drag !important;
            user-select: text !important;
            -webkit-user-select: text !important;
          }

          @keyframes modalScale {
            from {
              opacity: 0;
              transform: translate3d(0, 8px, 0) scale(0.985);
            }
            to {
              opacity: 1;
              transform: translate3d(0, 0, 0) scale(1);
            }
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

          /* Config Grid */
          .config-grid {
            display: grid;
            grid-template-columns: 1fr 1.3fr auto;
            gap: 14px;
            background: #0c1220;
            border: 1px solid #19243a;
            border-radius: 8px;
            padding: 12px 14px;
            flex-shrink: 0;
          }

          .config-box {
            display: flex;
            flex-direction: column;
            gap: 6px;
            min-width: 0;
          }

          .config-label {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 11px;
            font-weight: 600;
            color: #94a3b8;
          }

          .source-count {
            color: #a78bfa;
            font-size: 10.5px;
          }

          .label-sub {
            color: #64748b;
            font-size: 10px;
          }

          .config-select {
            background: #090e18;
            border: 1px solid #1c273c;
            border-radius: 6px;
            color: #e2e8f0;
            font-size: 11.5px;
            padding: 6px 10px;
            outline: none;
            width: 100%;
            cursor: pointer;
          }

          .target-chips-wrap {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
          }

          .target-chip-btn {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 4px 8px;
            border-radius: 5px;
            background: #090e18;
            border: 1px solid #1c273c;
            color: #8899ac;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.1s ease, border-color 0.1s ease, color 0.1s ease;
          }

          .target-chip-btn.active {
            background: rgba(147, 51, 234, 0.15);
            border-color: #9333ea;
            color: #f1f5f9;
          }

          .target-chip-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
          }

          .target-chip-check {
            color: #c084fc;
          }

          /* Mode Toggle */
          .mode-toggle-group {
            display: flex;
            align-items: center;
            background: #090e18;
            border: 1px solid #1c273c;
            border-radius: 6px;
            padding: 2px;
            gap: 2px;
          }

          .mode-btn {
            display: flex;
            align-items: center;
            gap: 5px;
            padding: 5px 10px;
            border-radius: 4px;
            background: transparent;
            border: none;
            color: #64748b;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.1s ease, color 0.1s ease;
            white-space: nowrap;
          }

          .mode-btn.active {
            background: #172133;
            color: #c084fc;
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
            padding: 6px 14px;
            border-radius: 6px;
            cursor: pointer;
            transition: background-color 0.12s ease, color 0.12s ease;
          }

          .cancel-action-btn:hover:not(:disabled) {
            background: #1e293b;
            color: #ffffff;
          }

          .submit-transfer-btn {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            background: linear-gradient(135deg, #9333ea, #7c3aed);
            border: 1px solid rgba(147, 51, 234, 0.45);
            color: #ffffff;
            font-size: 12px;
            font-weight: 600;
            padding: 6px 16px;
            border-radius: 6px;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(124, 58, 237, 0.35);
            transition: filter 0.12s ease, box-shadow 0.12s ease;
          }

          .submit-transfer-btn:hover:not(:disabled) {
            filter: brightness(1.1);
            box-shadow: 0 4px 14px rgba(124, 58, 237, 0.5);
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
