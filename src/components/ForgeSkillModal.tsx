import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Sparkles, 
  Check, 
  Eye, 
  Code2, 
  AlertCircle, 
  Loader2, 
  FolderPlus,
  Bot,
  FileText
} from 'lucide-react';
import { SupportedAgent } from '../types/agent';
import { logActivity } from '../services/activityLogger';
import { SkillMarkdownViewer } from './SkillMarkdownViewer';

interface ForgeSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAgents: SupportedAgent[];
  onSkillCreated?: (skillName: string, count: number) => void;
}

const CATEGORIES = [
  'Development',
  'Architecture',
  'Testing',
  'Security',
  'DevOps',
  'Databases',
  'AI / Agents',
  'Frontend',
  'Backend',
  'Docs & Workflow'
];

const TEMPLATES: Record<string, { label: string; description: string; template: string }> = {
  standard: {
    label: 'Standard Playbook',
    description: 'Structured directives, workflow steps, and constraints',
    template: `# Overview\nProvide a concise overview of what this skill enables the agent to do.\n\n## Directives\n- Rule 1: Eliminate assumptions; verify with physical evidence before asserting completion.\n- Rule 2: Execute surgical, non-destructive edits without reformatting unrelated code.\n- Rule 3: Validate syntax and run builds after making changes.\n\n## Workflow\n1. **Analyze**: Inspect relevant files and configuration.\n2. **Execute**: Implement the proposed solution step-by-step.\n3. **Verify**: Test functionality and confirm resolution.\n\n## Constraints\n- Never delete comments or unrelated code unless instructed.\n- Always adhere to existing codebase architectural patterns.`
  },
  diagnostics: {
    label: 'Bug Diagnostics',
    description: 'Systematic root cause analysis without blind guessing',
    template: `# Systematic Diagnostics & Root Cause Analysis\n\n## Goal\nIsolate, reproduce, and eliminate defects systematically without guessing.\n\n## Diagnostic Protocol\n1. **Log & Trace Gathering**:\n   - Collect runtime error traces, HTTP status responses, or terminal logs.\n2. **Root Cause Isolation**:\n   - Trace the defect backwards from the point of failure to the root input.\n   - Formulate a testable hypothesis before modifying code.\n3. **Reproduction Test**:\n   - Establish a minimal behavioral reproduction case.\n4. **Surgical Resolution**:\n   - Apply the minimal fix required to resolve the isolated defect.\n5. **Regression Verification**:\n   - Run existing test suites and verify the fix physically resolves the error.`
  },
  architecture: {
    label: 'API & Architecture',
    description: 'Clean backend architecture, OpenAPI contracts, and design patterns',
    template: `# API & Backend Architecture Standards\n\n## Principles\n- **Predictable Endpoints**: Consistent resource naming, HTTP status codes, and JSON error responses.\n- **Input Validation**: Strict schema validation on all controller inputs.\n- **Idempotency**: Ensure state-mutating requests handle retries gracefully.\n\n## Implementation Standard\n1. **Routing & Controller**: Validate request body and parameters.\n2. **Service Layer**: Pure business logic, decoupled from HTTP transport.\n3. **Data Access**: Use parameterized queries or ORM transactions.\n4. **Error Handling**: Return unified \`{ error: string, code: string }\` structures.`
  },
  review: {
    label: 'Code Review & Guard',
    description: 'Pre-commit clean code, security, and performance checklists',
    template: `# Clean Code & Production Guard Review\n\n## Inspection Checklist\n- [ ] **Clean Code & SOLID**: Single responsibility per function and clear boundaries.\n- [ ] **Security Vulnerabilities**: No SQL injections, path traversals, or unescaped user inputs.\n- [ ] **Performance & Resource Leaks**: No unbounded memory buffers or unclosed streams.\n- [ ] **Documentation**: Critical architecture decisions and non-obvious logic documented.\n- [ ] **Error Boundaries**: All async operations have appropriate try/catch boundaries.`
  },
  blank: {
    label: 'Blank Playbook',
    description: 'Start with a clean slate',
    template: `# Custom Skill Instructions\n\n## Overview\nDescribe the purpose and instructions for your AI agent here.\n\n## Instructions\n1. Step one\n2. Step two`
  }
};

export const ForgeSkillModal: React.FC<ForgeSkillModalProps> = ({
  isOpen,
  onClose,
  selectedAgents,
  onSkillCreated
}) => {
  const [name, setName] = useState('');
  const [folderSlug, setFolderSlug] = useState('');
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [category, setCategory] = useState('Development');
  const [tagsInput, setTagsInput] = useState('custom, playbook');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState(TEMPLATES.standard.template);
  const [selectedTemplate, setSelectedTemplate] = useState('standard');
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [previewMode, setPreviewMode] = useState<'formatted' | 'raw'>('formatted');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize selected agents and escape listener when modal opens
  useEffect(() => {
    if (isOpen) {
      if (selectedAgents && selectedAgents.length > 0) {
        setSelectedAgentIds(selectedAgents.map((a) => a.id));
      } else {
        setSelectedAgentIds([]);
      }
      setErrorMsg(null);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, selectedAgents, onClose]);

  // Auto-generate folder slug from name if not manually modified
  const handleNameChange = (val: string) => {
    setName(val);
    if (!isSlugManuallyEdited) {
      const slug = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setFolderSlug(slug);
    }
  };

  const handleSlugChange = (val: string) => {
    setIsSlugManuallyEdited(true);
    const cleaned = val
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    setFolderSlug(cleaned);
  };

  const handleApplyTemplate = (key: string) => {
    setSelectedTemplate(key);
    const t = TEMPLATES[key];
    if (t) {
      setInstructions(t.template);
    }
  };

  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  };

  const toggleAllAgents = () => {
    if (selectedAgentIds.length === selectedAgents.length) {
      setSelectedAgentIds([]);
    } else {
      setSelectedAgentIds(selectedAgents.map((a) => a.id));
    }
  };

  // Compile SKILL.md content
  const compiledSkillMd = useMemo(() => {
    const tagsList = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const tagArrayString = tagsList.length > 0 
      ? `\ntags:\n${tagsList.map((t) => `  - ${t}`).join('\n')}`
      : '';

    const safeDesc = description.trim() || `Custom AI agent skill for ${name || 'project tasks'}.`;
    const cleanSlug = folderSlug.trim() || 'custom-skill';

    return `---
name: ${cleanSlug}
description: "${safeDesc.replace(/"/g, '\\"')}"
category: ${category}${tagArrayString}
---

${instructions.trim()}
`;
  }, [name, folderSlug, description, category, tagsInput, instructions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanSlug = folderSlug.trim();
    if (!cleanSlug) {
      setErrorMsg('Please specify a valid folder slug for the skill.');
      return;
    }

    if (!instructions.trim()) {
      setErrorMsg('Skill instructions cannot be empty.');
      return;
    }

    const targetAgents = selectedAgents.filter((a) => selectedAgentIds.includes(a.id));
    if (targetAgents.length === 0) {
      setErrorMsg('Please select at least one agent to install this skill to.');
      return;
    }

    const targets = targetAgents.map((a) => ({
      agentId: a.id,
      skillsDir: a.paths.skillsDir
    }));

    setIsSubmitting(true);

    try {
      if (!window.electronAPI?.createCustomSkill) {
        throw new Error('Electron API createCustomSkill is not available');
      }

      const res = await window.electronAPI.createCustomSkill({
        folderName: cleanSlug,
        skillContent: compiledSkillMd,
        targets
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to create skill');
      }

      logActivity({
        type: 'SKILL',
        title: `Forged "${name || cleanSlug}"`,
        description: `Created and deployed custom skill to ${targetAgents.map((a) => a.name).join(', ')}`,
        status: 'success',
        agentName: targetAgents.map((a) => a.name).join(', '),
      });

      if (onSkillCreated) {
        onSkillCreated(name || cleanSlug, res.count || targetAgents.length);
      }

      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while creating the skill.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="forge-modal-overlay" onClick={onClose}>
      <div className="forge-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="forge-modal-header">
          <div className="header-icon-box">
            <Sparkles size={18} />
          </div>
          <div className="header-text">
            <h3 className="modal-title">Forge Custom Skill</h3>
            <p className="modal-subtitle">
              Author an agent playbook and deploy directly to your local AI environments.
            </p>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close modal">
            <X size={16} />
          </button>
        </div>

        {errorMsg && (
          <div className="forge-error-banner">
            <AlertCircle size={15} />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="forge-form">
          <div className="forge-body-grid">
            {/* Left Column: Metadata & Target Environments */}
            <div className="metadata-column">
              <div className="form-group">
                <label className="form-label">
                  Skill Name <span className="req">*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Docker Production Hardener"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Folder Slug <span className="req">*</span>
                </label>
                <input
                  type="text"
                  className="form-input font-mono text-xs"
                  placeholder="docker-hardener"
                  value={folderSlug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  required
                />
                <span className="slug-hint font-mono">
                  📁 /skills/{folderSlug || '<slug>'}/
                </span>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select
                    className="form-select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Tags <span className="label-hint">(comma)</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="docker, security"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-textarea-short"
                  rows={2}
                  placeholder="What this skill equips the agent to accomplish..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {/* Target Agents Selector: Horizontal Chips */}
              <div className="form-group agents-form-group">
                <div className="section-header-row">
                  <label className="form-label mb-0">Deploy to Target Agents</label>
                  {selectedAgents.length > 1 && (
                    <button
                      type="button"
                      className="toggle-all-btn"
                      onClick={toggleAllAgents}
                    >
                      {selectedAgentIds.length === selectedAgents.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>

                {selectedAgents.length === 0 ? (
                  <div className="no-agents-warning">
                    <Bot size={13} />
                    <span>No target agents selected in top bar.</span>
                  </div>
                ) : (
                  <div className="agent-chips-wrap">
                    {selectedAgents.map((agent) => {
                      const isChecked = selectedAgentIds.includes(agent.id);
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          className={`agent-chip-btn ${isChecked ? 'active' : ''}`}
                          onClick={() => toggleAgent(agent.id)}
                          title={`Deploy to ${agent.name}`}
                        >
                          <span
                            className="agent-chip-dot"
                            style={{ backgroundColor: agent.color || '#3b82f6' }}
                          />
                          <span className="agent-chip-text">{agent.name}</span>
                          {isChecked && <Check size={11} className="agent-chip-check" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Unified Toolbar & Spacious Editor / Preview */}
            <div className="editor-column">
              {/* Unified Toolbar */}
              <div className="editor-unified-toolbar">
                <div className="editor-tab-pills">
                  <button
                    type="button"
                    className={`tab-pill-btn ${activeTab === 'editor' ? 'active' : ''}`}
                    onClick={() => setActiveTab('editor')}
                  >
                    <Code2 size={13} />
                    <span>Instructions (Editor)</span>
                  </button>
                  <button
                    type="button"
                    className={`tab-pill-btn ${activeTab === 'preview' ? 'active' : ''}`}
                    onClick={() => setActiveTab('preview')}
                  >
                    <Eye size={13} />
                    <span>SKILL.md (Preview)</span>
                  </button>
                </div>

                <div className="toolbar-controls-right">
                  {activeTab === 'editor' ? (
                    <div className="template-dropdown-group">
                      <span className="template-select-label">Template:</span>
                      <select
                        className="template-select"
                        value={selectedTemplate}
                        onChange={(e) => handleApplyTemplate(e.target.value)}
                      >
                        {Object.entries(TEMPLATES).map(([key, t]) => (
                          <option key={key} value={key}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="preview-mode-switch">
                      <button
                        type="button"
                        className={`preview-mode-btn ${previewMode === 'formatted' ? 'active' : ''}`}
                        onClick={() => setPreviewMode('formatted')}
                        title="Formatted document preview"
                      >
                        <Eye size={11} />
                        <span>Formatted</span>
                      </button>
                      <button
                        type="button"
                        className={`preview-mode-btn ${previewMode === 'raw' ? 'active' : ''}`}
                        onClick={() => setPreviewMode('raw')}
                        title="Raw SKILL.md file text"
                      >
                        <Code2 size={11} />
                        <span>Raw Code</span>
                      </button>
                    </div>
                  )}
                  <div className="instructions-char-pill font-mono">
                    {instructions.length.toLocaleString()} chars
                  </div>
                </div>
              </div>

              {/* Editor Tab Content */}
              {activeTab === 'editor' ? (
                <div className="editor-content-wrap">
                  <textarea
                    className="markdown-editor-input font-mono"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Write agent instructions, directives, workflows, and constraints in Markdown..."
                    spellCheck={false}
                  />
                </div>
              ) : (
                <div className="preview-content-wrap">
                  {previewMode === 'formatted' ? (
                    <SkillMarkdownViewer content={compiledSkillMd} />
                  ) : (
                    <>
                      <div className="preview-readonly-badge">
                        <FileText size={12} />
                        <span>Raw compiled SKILL.md with YAML frontmatter.</span>
                      </div>
                      <pre className="preview-code-block font-mono">
                        <code>{compiledSkillMd}</code>
                      </pre>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="forge-modal-footer">
            <div className="footer-summary">
              <FolderPlus size={14} className="text-purple-400" />
              <span>
                Installing to{' '}
                <strong>
                  {selectedAgentIds.length}{' '}
                  {selectedAgentIds.length === 1 ? 'agent' : 'agents'}
                </strong>{' '}
                ({selectedAgents.filter((a) => selectedAgentIds.includes(a.id)).map((a) => a.name).join(', ') || 'none'})
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
                className="submit-forge-btn"
                disabled={isSubmitting || selectedAgentIds.length === 0}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="spin" />
                    <span>Forging Skill...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    <span>Forge & Deploy Skill</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        <style>{`
          .forge-modal-overlay {
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

          .forge-modal-card {
            background: #090d16;
            border: 1px solid #1c273c;
            border-radius: 12px;
            width: 100%;
            max-width: 1040px;
            height: 82vh;
            max-height: 740px;
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

          .forge-modal-header {
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
            background: linear-gradient(135deg, rgba(124, 58, 237, 0.2), rgba(99, 102, 241, 0.2));
            border: 1px solid rgba(124, 58, 237, 0.4);
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
            transition: all 0.15s;
          }

          .close-btn:hover {
            background: #1e293b;
            color: #f8fafc;
          }

          .forge-error-banner {
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

          .forge-form {
            display: flex;
            flex-direction: column;
            flex: 1;
            overflow: hidden;
            min-height: 0;
          }

          .forge-body-grid {
            display: grid;
            grid-template-columns: 330px 1fr;
            gap: 22px;
            padding: 18px 22px;
            flex: 1;
            min-height: 0;
            overflow: hidden;
          }

          .metadata-column {
            display: flex;
            flex-direction: column;
            gap: 12px;
            overflow-y: auto;
            padding-right: 6px;
          }

          .metadata-column::-webkit-scrollbar {
            width: 5px;
          }

          .metadata-column::-webkit-scrollbar-thumb {
            background: #1c273c;
            border-radius: 3px;
          }

          .form-group {
            display: flex;
            flex-direction: column;
            gap: 5px;
            width: 100%;
            min-width: 0;
          }

          .form-row-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            width: 100%;
          }

          .form-row-2 > .form-group {
            min-width: 0;
            width: 100%;
          }

          .form-label {
            font-size: 11px;
            font-weight: 600;
            color: #94a3b8;
            letter-spacing: 0.02em;
          }

          .label-hint {
            font-size: 10px;
            font-weight: 400;
            color: #64748b;
          }

          .form-label.mb-0 {
            margin-bottom: 0;
          }

          .req {
            color: #f43f5e;
          }

          .form-input, .form-select, .form-textarea-short {
            width: 100%;
            min-width: 0;
            box-sizing: border-box;
            background: #0b101b;
            border: 1px solid #1c273c;
            border-radius: 6px;
            color: #e2e8f0;
            font-size: 12px;
            padding: 8px 10px;
            transition: all 0.15s;
            user-select: text !important;
            -webkit-user-select: text !important;
            -webkit-app-region: no-drag !important;
            pointer-events: auto !important;
          }

          .form-select {
            appearance: none;
            -webkit-appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 10px center;
            padding-right: 28px;
            cursor: pointer;
          }

          .form-input:focus, .form-select:focus, .form-textarea-short:focus {
            outline: none;
            border-color: #7c3aed;
            box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.2);
          }

          .slug-hint {
            font-size: 10px;
            color: #64748b;
            margin-top: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .agents-form-group {
            margin-top: 2px;
          }

          .section-header-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
          }

          .toggle-all-btn {
            background: transparent;
            border: none;
            color: #a78bfa;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            padding: 0;
          }

          .toggle-all-btn:hover {
            text-decoration: underline;
          }

          .no-agents-warning {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            color: #f59e0b;
            padding: 6px 0;
          }

          .agent-chips-wrap {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 3px;
          }

          .agent-chip-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 5px 9px;
            border-radius: 6px;
            background: #0e1422;
            border: 1px solid #1c273c;
            color: #8899ac;
            font-size: 11.5px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.12s;
            user-select: none;
          }

          .agent-chip-btn:hover {
            background: #141c2c;
            border-color: #2d3f5e;
            color: #cbd5e1;
          }

          .agent-chip-btn.active {
            background: rgba(99, 102, 241, 0.12);
            border-color: #4f46e5;
            color: #f1f5f9;
            box-shadow: 0 0 8px rgba(99, 102, 241, 0.15);
          }

          .agent-chip-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            flex-shrink: 0;
          }

          .agent-chip-text {
            line-height: 1;
          }

          .agent-chip-check {
            color: #818cf8;
            margin-left: 1px;
          }

          /* Right Column: Unified Toolbar & Editor */
          .editor-column {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0;
            height: 100%;
          }

          .editor-unified-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #0d1322;
            border: 1px solid #1c273c;
            border-radius: 8px 8px 0 0;
            padding: 6px 10px;
            gap: 12px;
            flex-shrink: 0;
            -webkit-app-region: no-drag !important;
          }

          .editor-tab-pills {
            display: flex;
            align-items: center;
            gap: 4px;
          }

          .tab-pill-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11.5px;
            font-weight: 600;
            padding: 4px 10px;
            background: transparent;
            border: 1px solid transparent;
            border-radius: 5px;
            color: #64748b;
            cursor: pointer;
            transition: all 0.12s;
          }

          .tab-pill-btn:hover {
            color: #94a3b8;
          }

          .tab-pill-btn.active {
            background: #172133;
            border-color: rgba(124, 58, 237, 0.35);
            color: #c084fc;
          }

          .toolbar-controls-right {
            display: flex;
            align-items: center;
            gap: 10px;
          }

          .template-dropdown-group {
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .template-select-label {
            font-size: 11px;
            font-weight: 600;
            color: #64748b;
          }

          .template-select {
            background: #111726;
            border: 1px solid #1e293b;
            color: #cbd5e1;
            font-size: 11.5px;
            font-weight: 500;
            padding: 3px 8px;
            border-radius: 5px;
            outline: none;
            cursor: pointer;
            transition: border-color 0.15s;
          }

          .template-select:hover, .template-select:focus {
            border-color: #3b82f6;
          }

          .preview-mode-switch {
            display: flex;
            align-items: center;
            background: #090e18;
            border: 1px solid #1a253a;
            border-radius: 6px;
            padding: 2px;
            gap: 2px;
          }

          .preview-mode-btn {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 11px;
            font-weight: 600;
            padding: 3px 8px;
            border-radius: 4px;
            background: transparent;
            border: none;
            color: #64748b;
            cursor: pointer;
            transition: all 0.12s;
          }

          .preview-mode-btn:hover {
            color: #cbd5e1;
          }

          .preview-mode-btn.active {
            background: #172133;
            color: #c084fc;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
          }

          .instructions-char-pill {
            font-size: 10.5px;
            color: #64748b;
            background: #090e18;
            border: 1px solid #172236;
            padding: 3px 7px;
            border-radius: 5px;
          }

          .editor-content-wrap, .preview-content-wrap {
            flex: 1;
            display: flex;
            flex-direction: column;
            border: 1px solid #1c273c;
            border-top: none;
            border-radius: 0 0 8px 8px;
            background: #070a12;
            overflow: hidden;
            min-height: 280px;
            height: 100%;
          }

          .markdown-editor-input {
            flex: 1;
            width: 100%;
            height: 100%;
            min-height: 280px;
            box-sizing: border-box;
            background: transparent;
            border: none;
            padding: 14px 16px;
            color: #e2e8f0;
            font-size: 12.5px;
            line-height: 1.6;
            resize: none;
            outline: none;
            user-select: text !important;
            -webkit-user-select: text !important;
            -webkit-app-region: no-drag !important;
            pointer-events: auto !important;
          }

          .markdown-editor-input::-webkit-scrollbar, .preview-content-wrap::-webkit-scrollbar {
            width: 6px;
          }

          .markdown-editor-input::-webkit-scrollbar-thumb, .preview-content-wrap::-webkit-scrollbar-thumb {
            background: #1c273c;
            border-radius: 3px;
          }

          .preview-content-wrap {
            padding: 12px 14px;
            overflow-y: auto;
            gap: 10px;
          }

          .preview-readonly-badge {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            color: #818cf8;
            background: rgba(99, 102, 241, 0.08);
            border: 1px solid rgba(99, 102, 241, 0.2);
            border-radius: 6px;
            padding: 6px 10px;
            flex-shrink: 0;
          }

          .preview-code-block {
            margin: 0;
            font-size: 11.5px;
            line-height: 1.5;
            color: #93c5fd;
            white-space: pre-wrap;
            word-break: break-word;
            user-select: text !important;
            -webkit-user-select: text !important;
          }

          /* Modal Footer */
          .forge-modal-footer {
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
            display: flex;
            align-items: center;
            gap: 6px;
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
            transition: all 0.15s;
          }

          .cancel-action-btn:hover:not(:disabled) {
            background: #1e293b;
            color: #ffffff;
          }

          .submit-forge-btn {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            background: linear-gradient(135deg, #7c3aed, #6366f1);
            border: 1px solid rgba(124, 58, 237, 0.4);
            color: #ffffff;
            font-size: 12px;
            font-weight: 600;
            padding: 6px 16px;
            border-radius: 6px;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(124, 58, 237, 0.35);
            transition: all 0.15s;
          }

          .submit-forge-btn:hover:not(:disabled) {
            filter: brightness(1.1);
            box-shadow: 0 4px 14px rgba(124, 58, 237, 0.5);
          }

          .submit-forge-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
        `}</style>
      </div>
    </div>,
    document.body
  );
};

