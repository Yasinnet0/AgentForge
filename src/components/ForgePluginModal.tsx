import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Boxes, 
  Sparkles, 
  Server, 
  ScrollText, 
  Check, 
  CheckSquare, 
  Square, 
  Search, 
  ArrowRight, 
  ArrowLeft, 
  FolderArchive, 
  FolderPlus, 
  Bot, 
  AlertCircle, 
  Loader2, 
  Copy, 
  FileCode, 
  FolderTree, 
  ExternalLink,
  Tag,
  ShieldCheck,
  Download,
  Edit3,
} from 'lucide-react';
import { ScannedSkill, ScannedMcpServer, SupportedAgent, InstalledPluginDetails } from '../types/agent';
import { RULE_PRESETS } from '../data/rulePresets';
import { logActivity } from '../services/activityLogger';
import { useModalTransition } from '../hooks/useModalTransition';
import { AGENT_ICON_MAP } from './AgentIcon';

interface ForgePluginModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents: SupportedAgent[];
  skills: ScannedSkill[];
  mcpServers: ScannedMcpServer[];
  editingPlugin?: InstalledPluginDetails | null;
  onPluginForged?: (pluginName: string, action: 'install' | 'export-zip' | 'export-dir', countOrPath?: string | number) => void;
}

type WizardStep = 1 | 2 | 3;
type CapabilitySubTab = 'skills' | 'mcps' | 'rules';
type ExportAction = 'install' | 'export-zip' | 'export-dir';

const CATEGORIES = [
  'Development',
  'Architecture',
  'DevOps',
  'Testing',
  'Security',
  'AI / Agents',
  'Frontend',
  'Backend',
  'Databases',
  'Docs & Workflow'
];

export const ForgePluginModal: React.FC<ForgePluginModalProps> = ({
  isOpen,
  onClose,
  agents,
  skills,
  mcpServers,
  editingPlugin,
  onPluginForged,
}) => {
  const { isRendered, isClosing, handleClose } = useModalTransition(isOpen, onClose, 140);
  const isEditing = !!editingPlugin;

  // State
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [capabilityTab, setCapabilityTab] = useState<CapabilitySubTab>('skills');

  const [name, setName] = useState('');
  const [folderSlug, setFolderSlug] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [author, setAuthor] = useState('AgentForge Developer');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set());
  const [selectedMcpIds, setSelectedMcpIds] = useState<Set<string>>(new Set());
  const [selectedRulePresetIds, setSelectedRulePresetIds] = useState<Set<string>>(new Set());

  const [skillSearch, setSkillSearch] = useState('');
  const [mcpSearch, setMcpSearch] = useState('');
  const [ruleSearch, setRuleSearch] = useState('');

  const [exportAction, setExportAction] = useState<ExportAction>('install');
  const [targetAgentIds, setTargetAgentIds] = useState<string[]>([]);
  const [zipDestinationPath, setZipDestinationPath] = useState('');
  const [dirDestinationPath, setDirDestinationPath] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ action: ExportAction; pathOrCount: string | number } | null>(null);
  const [isCopiedManifest, setIsCopiedManifest] = useState(false);

  const prevIsOpenRef = useRef(false);
  const prevEditingPluginRef = useRef<InstalledPluginDetails | null | undefined>(undefined);

  // Effects
  useEffect(() => {
    const isNowOpen = isOpen && !prevIsOpenRef.current;
    const editingChanged = isOpen && editingPlugin !== prevEditingPluginRef.current;

    if (isNowOpen || editingChanged) {
      setCurrentStep(1);
      setErrorMsg(null);
      setSuccessInfo(null);

      if (editingPlugin) {
        // Pre-fill from installed plugin details
        const m = editingPlugin.manifest || {};
        setName(m.displayName || m.name || editingPlugin.folderName);
        setFolderSlug(editingPlugin.folderName);
        setVersion(m.version || '1.0.0');
        setAuthor(m.author || 'Local Developer');
        setCategory(m.category && CATEGORIES.includes(m.category) ? m.category : CATEGORIES[0]);
        setDescription(m.description || '');
        setTagsInput(Array.isArray(m.tags) ? m.tags.join(', ') : '');

        // Pre-select skills
        const pluginSkillSlugs = new Set<string>();
        if (editingPlugin.skills) {
          for (const s of editingPlugin.skills) {
            pluginSkillSlugs.add(s.folderName);
          }
        }
        if (m.skills) {
          for (const s of m.skills) {
            pluginSkillSlugs.add(s);
          }
        }
        setSelectedSkillIds(pluginSkillSlugs);

        // Pre-select MCPs
        const pluginMcpNames = new Set<string>();
        if (editingPlugin.mcpServers) {
          for (const mcp of editingPlugin.mcpServers) {
            pluginMcpNames.add(mcp.name);
          }
        }
        if (m.mcpServers) {
          for (const mcpKey of Object.keys(m.mcpServers)) {
            pluginMcpNames.add(mcpKey);
          }
        }
        setSelectedMcpIds(pluginMcpNames);

        // Pre-select Rules
        const initialSelectedRules = new Set<string>();
        if (editingPlugin.rules && editingPlugin.rules.length > 0) {
          for (const r of editingPlugin.rules) {
            const matchedPreset = RULE_PRESETS.find((preset) => {
              const expectedName = `${preset.category}-${preset.id.replace('preset-', '')}.md`;
              return r.filename === expectedName || r.filename === `${preset.id}.md` || r.title === preset.title;
            });
            if (matchedPreset) {
              initialSelectedRules.add(matchedPreset.id);
            } else {
              initialSelectedRules.add(`plugin-rule-${r.filename}`);
            }
          }
        } else if (m.rules) {
          for (const rf of m.rules) {
            const matchedPreset = RULE_PRESETS.find((preset) => {
              const expectedName = `${preset.category}-${preset.id.replace('preset-', '')}.md`;
              return rf === expectedName || rf === `${preset.id}.md`;
            });
            if (matchedPreset) {
              initialSelectedRules.add(matchedPreset.id);
            }
          }
        }
        setSelectedRulePresetIds(initialSelectedRules);

        // Target action: default to 'install'
        setExportAction('install');

        // Target agents: match agents where this plugin exists
        const matchedAgents = agents.filter((ag) => {
          if (ag.paths?.pluginsDir) {
            const normP = editingPlugin.pluginPath.replace(/\\/g, '/').toLowerCase();
            const normA = ag.paths.pluginsDir.replace(/\\/g, '/').toLowerCase();
            return normP.includes(normA);
          }
          return false;
        });

        if (matchedAgents.length > 0) {
          setTargetAgentIds(matchedAgents.map((a) => a.id));
        } else {
          const activeIds = agents.filter((a) => a.selected).map((a) => a.id);
          setTargetAgentIds(activeIds.length > 0 ? activeIds : (agents[0] ? [agents[0].id] : []));
        }

        setZipDestinationPath(`${editingPlugin.folderName}-v${m.version || '1.0.0'}.zip`);
        setDirDestinationPath('');
      } else {
        // Reset wizard for fresh creation
        setName('');
        setFolderSlug('');
        setVersion('1.0.0');
        setAuthor('AgentForge Developer');
        setCategory(CATEGORIES[0]);
        setDescription('');
        setTagsInput('');
        setSelectedSkillIds(new Set());
        setSelectedMcpIds(new Set());
        setSelectedRulePresetIds(new Set());
        setExportAction('install');
        setZipDestinationPath('custom-plugin-kit-v1.0.0.zip');
        setDirDestinationPath('');

        const activeIds = agents.filter((a) => a.selected).map((a) => a.id);
        setTargetAgentIds(activeIds.length > 0 ? activeIds : (agents[0] ? [agents[0].id] : []));
      }
    }
    prevIsOpenRef.current = isOpen;
    prevEditingPluginRef.current = editingPlugin;
  }, [isOpen, editingPlugin, agents]);

  useEffect(() => {
    if (!isRendered) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRendered, handleClose]);

  // Slug Handlers
  const handleNameChange = (val: string) => {
    setName(val);
    if (!isEditing) {
      const slug = val
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setFolderSlug(slug);
      setZipDestinationPath(`${slug || 'custom-plugin-kit'}-v${version}.zip`);
    }
  };

  const handleSlugChange = (val: string) => {
    if (isEditing) return;
    const slug = val.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    setFolderSlug(slug);
    setZipDestinationPath(`${slug || 'custom-plugin-kit'}-v${version}.zip`);
  };

  // Capabilities & Filtering
  const uniqueSkills = useMemo(() => {
    const map = new Map<string, ScannedSkill>();
    if (editingPlugin?.skills) {
      for (const s of editingPlugin.skills) {
        const slug = s.folderName;
        map.set(slug, {
          id: slug,
          name: s.name || slug,
          description: s.description || 'Skill bundled in this plugin',
          folderName: slug,
          sourceAgentId: 'plugin',
          sourceAgentName: 'Current Plugin',
          sourceAgentColor: '#10b981',
          sourceAgentIcon: 'Boxes',
          sourcePath: s.sourcePath,
          hasScripts: false,
          hasReferences: false,
        });
      }
    }
    for (const s of skills) {
      const slug = s.folderName || s.id;
      if (!map.has(slug)) {
        map.set(slug, s);
      }
    }
    return Array.from(map.values());
  }, [skills, editingPlugin]);

  const uniqueMcps = useMemo(() => {
    const map = new Map<string, ScannedMcpServer>();
    if (editingPlugin?.mcpServers) {
      for (const m of editingPlugin.mcpServers) {
        map.set(m.name, {
          id: m.name,
          name: m.name,
          command: m.command,
          args: m.args,
          url: m.url,
          transport: (m.transport as any) || (m.url ? 'sse' : 'stdio'),
          envKeys: m.env ? Object.keys(m.env) : [],
          sourceAgentId: 'plugin',
          sourceAgentName: 'Current Plugin',
          sourceAgentColor: '#10b981',
          sourceAgentIcon: 'Server',
          sourcePath: editingPlugin.pluginPath,
        });
      }
    }
    for (const m of mcpServers) {
      if (!map.has(m.name)) {
        map.set(m.name, m);
      }
    }
    return Array.from(map.values());
  }, [mcpServers, editingPlugin]);

  const allRuleItems = useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      summary: string;
      category: string;
      directives: Array<{ title: string; content: string }>;
      customContent?: string;
      filename?: string;
    }> = [...RULE_PRESETS];

    if (editingPlugin?.rules) {
      for (const r of editingPlugin.rules) {
        const matchesPreset = RULE_PRESETS.some((preset) => {
          const expectedName = `${preset.category}-${preset.id.replace('preset-', '')}.md`;
          return r.filename === expectedName || r.filename === `${preset.id}.md` || r.title === preset.title;
        });
        if (!matchesPreset) {
          list.push({
            id: `plugin-rule-${r.filename}`,
            title: r.title || r.filename,
            summary: 'Custom behavioral directive bundled in this plugin',
            category: 'custom',
            directives: [],
            customContent: r.content,
            filename: r.filename,
          });
        }
      }
    }
    return list;
  }, [editingPlugin]);

  const filteredSkills = useMemo(() => {
    if (!skillSearch.trim()) return uniqueSkills;
    const q = skillSearch.toLowerCase().trim();
    return uniqueSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.folderName && s.folderName.toLowerCase().includes(q)) ||
        s.description.toLowerCase().includes(q)
    );
  }, [uniqueSkills, skillSearch]);

  const filteredMcps = useMemo(() => {
    if (!mcpSearch.trim()) return uniqueMcps;
    const q = mcpSearch.toLowerCase().trim();
    return uniqueMcps.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.command && m.command.toLowerCase().includes(q)) ||
        (m.args && m.args.join(' ').toLowerCase().includes(q))
    );
  }, [uniqueMcps, mcpSearch]);

  const filteredRulePresets = useMemo(() => {
    if (!ruleSearch.trim()) return allRuleItems;
    const q = ruleSearch.toLowerCase().trim();
    return allRuleItems.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
    );
  }, [allRuleItems, ruleSearch]);

  // Selection Handlers
  const toggleSkill = (slug: string) => {
    setSelectedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const toggleAllSkills = () => {
    if (selectedSkillIds.size === filteredSkills.length && filteredSkills.length > 0) {
      setSelectedSkillIds(new Set());
    } else {
      setSelectedSkillIds(new Set(filteredSkills.map((s) => s.folderName || s.id)));
    }
  };

  const toggleMcp = (name: string) => {
    setSelectedMcpIds((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAllMcps = () => {
    if (selectedMcpIds.size === filteredMcps.length && filteredMcps.length > 0) {
      setSelectedMcpIds(new Set());
    } else {
      setSelectedMcpIds(new Set(filteredMcps.map((m) => m.name)));
    }
  };

  const toggleRulePreset = (id: string) => {
    setSelectedRulePresetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllRules = () => {
    if (selectedRulePresetIds.size === filteredRulePresets.length && filteredRulePresets.length > 0) {
      setSelectedRulePresetIds(new Set());
    } else {
      setSelectedRulePresetIds(new Set(filteredRulePresets.map((r) => r.id)));
    }
  };

  const toggleTargetAgent = (agentId: string) => {
    setTargetAgentIds((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  };

  const toggleAllTargetAgents = () => {
    if (targetAgentIds.length === agents.length) {
      setTargetAgentIds([]);
    } else {
      setTargetAgentIds(agents.map((a) => a.id));
    }
  };

  // Manifest Generation
  const compiledManifest = useMemo(() => {
    const cleanSlug = folderSlug.trim() || 'custom-plugin-kit';
    const tagsList = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const bundledSkillSlugs = Array.from(selectedSkillIds);

    const mcpServersMap: Record<string, any> = {};
    for (const mcp of uniqueMcps) {
      if (selectedMcpIds.has(mcp.name)) {
        mcpServersMap[mcp.name] = {
          ...(mcp.command ? { command: mcp.command } : {}),
          ...(mcp.args && mcp.args.length > 0 ? { args: mcp.args } : {}),
          ...(mcp.url ? { url: mcp.url } : {}),
          ...(mcp.transport ? { transport: mcp.transport } : {}),
        };
      }
    }

    const bundledRulesList: string[] = [];
    for (const ruleItem of allRuleItems) {
      if (selectedRulePresetIds.has(ruleItem.id)) {
        bundledRulesList.push(ruleItem.filename || `${ruleItem.category}-${ruleItem.id.replace('preset-', '')}.md`);
      }
    }

    return {
      name: cleanSlug,
      displayName: name.trim() || cleanSlug,
      version: version.trim() || '1.0.0',
      description: description.trim() || 'Custom agent capabilities plugin bundle created with AgentForge.',
      author: author.trim() || 'Local Developer',
      category,
      tags: tagsList,
      skills: bundledSkillSlugs,
      rules: bundledRulesList,
      ...(Object.keys(mcpServersMap).length > 0 ? { mcpServers: mcpServersMap } : {}),
    };
  }, [
    name,
    folderSlug,
    version,
    author,
    category,
    description,
    tagsInput,
    selectedSkillIds,
    selectedMcpIds,
    selectedRulePresetIds,
    uniqueMcps,
    allRuleItems
  ]);

  // Browse zip destination
  const handleBrowseZipDestination = async () => {
    if (!window.electronAPI?.showSaveDialog) return;
    const cleanSlug = folderSlug.trim() || 'custom-plugin-kit';
    const res = await window.electronAPI.showSaveDialog({
      defaultPath: `${cleanSlug}-v${version}.zip`,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
    });
    if (!res.canceled && res.filePath) {
      setZipDestinationPath(res.filePath);
    }
  };

  // Browse dir destination
  const handleBrowseDirDestination = async () => {
    if (!window.electronAPI?.showOpenDirectory) return;
    const res = await window.electronAPI.showOpenDirectory();
    if (!res.canceled && res.filePaths.length > 0) {
      setDirDestinationPath(res.filePaths[0]);
    }
  };

  // Copy manifest
  const handleCopyManifest = () => {
    navigator.clipboard.writeText(JSON.stringify(compiledManifest, null, 2));
    setIsCopiedManifest(true);
    setTimeout(() => setIsCopiedManifest(false), 2000);
  };

  // Validation
  const canProceedStep1 = useMemo(() => {
    return name.trim().length > 0 && folderSlug.trim().length > 0;
  }, [name, folderSlug]);

  const totalSelectedCapabilities = selectedSkillIds.size + selectedMcpIds.size + selectedRulePresetIds.size;
  const canProceedStep2 = totalSelectedCapabilities > 0;

  // Submit
  const handleForgeSubmit = async () => {
    setErrorMsg(null);
    const cleanSlug = folderSlug.trim();

    if (!cleanSlug) {
      setErrorMsg('Please specify a valid folder slug.');
      return;
    }

    if (totalSelectedCapabilities === 0) {
      setErrorMsg('Please select at least one capability (Skill, MCP Server, or Rule) to bundle.');
      return;
    }

    // Payload
    const selectedSkillsData = uniqueSkills
      .filter((s) => selectedSkillIds.has(s.folderName || s.id))
      .map((s) => ({
        folderName: s.folderName || s.id,
        sourcePath: s.sourcePath
      }));

    const selectedMcpsData = uniqueMcps
      .filter((m) => selectedMcpIds.has(m.name))
      .map((m) => ({
        name: m.name,
        command: m.command,
        args: m.args,
        url: m.url,
        transport: m.transport,
      }));

    const selectedRulesData = allRuleItems
      .filter((r) => selectedRulePresetIds.has(r.id))
      .map((r) => {
        if (r.customContent) {
          return {
            filename: r.filename || `${r.id}.md`,
            title: r.title,
            content: r.customContent
          };
        }
        const content = `# ${r.title}\n\n> ${r.summary}\n\n` + 
          r.directives.map((d) => `## ${d.title}\n${d.content}\n`).join('\n');
        return {
          filename: `${r.category}-${r.id.replace('preset-', '')}.md`,
          title: r.title,
          content
        };
      });

    let targetAgentsPayload: Array<{ agentId: string; pluginsDir: string; name?: string }> = [];
    let exportPath: string | undefined = undefined;

    if (exportAction === 'install') {
      const selectedAgentsList = agents.filter((a) => targetAgentIds.includes(a.id));
      if (selectedAgentsList.length === 0) {
        setErrorMsg('Please select at least one agent to install this plugin kit to.');
        return;
      }
      targetAgentsPayload = selectedAgentsList.map((a) => ({
        agentId: a.id,
        pluginsDir: a.paths.pluginsDir,
        name: a.name
      }));
    } else if (exportAction === 'export-zip') {
      if (!zipDestinationPath.trim()) {
        setErrorMsg('Please specify a valid destination file path for the .zip archive.');
        return;
      }
      exportPath = zipDestinationPath.trim();
    } else if (exportAction === 'export-dir') {
      if (!dirDestinationPath.trim()) {
        setErrorMsg('Please select a destination directory to export the plugin folder.');
        return;
      }
      exportPath = dirDestinationPath.trim();
    }

    setIsSubmitting(true);

    try {
      if (!window.electronAPI?.forgePluginBundle) {
        throw new Error('Electron API forgePluginBundle is not available');
      }

      const res = await window.electronAPI.forgePluginBundle({
        folderName: cleanSlug,
        manifest: compiledManifest,
        selectedSkills: selectedSkillsData,
        selectedMcps: selectedMcpsData,
        selectedRules: selectedRulesData,
        targetAction: exportAction,
        targetAgents: targetAgentsPayload,
        exportDestinationPath: exportPath
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to forge plugin bundle');
      }

      const actionTitle = 
        exportAction === 'install' 
          ? (isEditing
              ? `Updated plugin "${name || cleanSlug}" on ${targetAgentsPayload.map((a) => a.name || a.agentId).join(', ')}`
              : `Installed kit "${name || cleanSlug}" to ${targetAgentsPayload.map((a) => a.name || a.agentId).join(', ')}`)
          : exportAction === 'export-zip'
          ? `Exported plugin archive to ${res.exportPath || exportPath}`
          : `Exported plugin directory to ${res.exportPath || exportPath}`;

      logActivity({
        type: 'PLUGIN',
        title: isEditing ? `Updated Plugin "${name || cleanSlug}"` : `Forged Plugin Kit "${name || cleanSlug}"`,
        description: actionTitle,
        status: 'success',
      });

      setSuccessInfo({
        action: exportAction,
        pathOrCount: exportAction === 'install' ? (res.count || targetAgentsPayload.length) : (res.exportPath || exportPath || '')
      });

      if (onPluginForged) {
        onPluginForged(name || cleanSlug, exportAction, exportAction === 'install' ? (res.count || targetAgentsPayload.length) : (res.exportPath || exportPath));
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while forging the plugin bundle.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenExportedPath = async () => {
    if (!successInfo?.pathOrCount || typeof successInfo.pathOrCount !== 'string') return;
    if (window.electronAPI?.openPath) {
      await window.electronAPI.openPath(successInfo.pathOrCount);
    }
  };

  if (!isRendered) return null;

  return createPortal(
    <div className={`forge-modal-overlay ${isClosing ? 'is-closing' : ''}`} onClick={handleClose}>
      <div className={`forge-modal-card forge-plugin-card ${isClosing ? 'is-closing' : ''}`} onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="forge-modal-header">
          <div className={`header-icon-box plugin ${isEditing ? 'edit' : ''}`}>
            {isEditing ? <Edit3 size={18} /> : <Boxes size={18} />}
          </div>
          <div className="header-title-box">
            <h2 className="modal-title font-mono">
              {isEditing
                ? `Edit Plugin: ${name || folderSlug}`
                : 'Skill Kit & Plugin Bundler'}
            </h2>
            <p className="modal-subtitle">
              {isEditing
                ? 'Add, remove, or modify skills, MCP servers, and behavioral rules in this installed plugin'
                : 'Package skills, MCP servers, and behavioral rules into a portable plugin bundle'}
            </p>
          </div>

          <button className="forge-modal-close-btn" onClick={handleClose} aria-label="Close modal">
            <X size={16} />
          </button>
        </div>

        {/* Wizard Step Breadcrumb Navigation */}
        <div className="wizard-step-tracker">
          <button
            type="button"
            className={`wizard-step-item ${currentStep === 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}
            onClick={() => setCurrentStep(1)}
          >
            <span className="step-num font-mono">{currentStep > 1 ? <Check size={12} /> : '1'}</span>
            <span className="step-label">1. Bundle Identity</span>
          </button>
          <div className={`step-connector ${currentStep > 1 ? 'completed' : ''}`} />

          <button
            type="button"
            className={`wizard-step-item ${currentStep === 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}
            onClick={() => {
              if (canProceedStep1) setCurrentStep(2);
            }}
            disabled={!canProceedStep1}
          >
            <span className="step-num font-mono">{currentStep > 2 ? <Check size={12} /> : '2'}</span>
            <span className="step-label">2. Select Capabilities ({totalSelectedCapabilities})</span>
          </button>
          <div className={`step-connector ${currentStep > 2 ? 'completed' : ''}`} />

          <button
            type="button"
            className={`wizard-step-item ${currentStep === 3 ? 'active' : ''}`}
            onClick={() => {
              if (canProceedStep1 && canProceedStep2) setCurrentStep(3);
            }}
            disabled={!canProceedStep1 || !canProceedStep2}
          >
            <span className="step-num font-mono">3</span>
            <span className="step-label">3. Manifest & Export</span>
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="forge-plugin-body">
          {/* STEP 1: IDENTITY & METADATA */}
          {currentStep === 1 && (
            <div className="wizard-pane-step1">
              <div className="form-grid-two-col">
                <div className="form-field-group">
                  <label className="field-label font-mono">
                    Plugin Display Name <span className="req-asterisk">*</span>
                  </label>
                  <input
                    type="text"
                    className="field-input"
                    placeholder="e.g. Fullstack DevOps Studio"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    autoFocus
                  />
                  <span className="field-hint">Human-readable title shown across dashboards</span>
                </div>

                <div className="form-field-group">
                  <label className="field-label font-mono">
                    Package Folder Slug <span className="req-asterisk">*</span>
                  </label>
                  <input
                    type="text"
                    className="field-input font-mono"
                    placeholder="e.g. fullstack-devops-studio"
                    value={folderSlug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    disabled={isEditing}
                  />
                  <span className="field-hint">
                    {isEditing
                      ? 'Folder slug is locked to preserve directory integrity for this installed plugin'
                      : 'Filesystem folder name (alphanumeric & hyphens)'}
                  </span>
                </div>
              </div>

              <div className="form-grid-three-col">
                <div className="form-field-group">
                  <label className="field-label font-mono">Semantic Version</label>
                  <input
                    type="text"
                    className="field-input font-mono"
                    placeholder="1.0.0"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                  />
                </div>

                <div className="form-field-group">
                  <label className="field-label font-mono">Author / Team</label>
                  <input
                    type="text"
                    className="field-input"
                    placeholder="e.g. AgentForge Developer"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                  />
                </div>

                <div className="form-field-group">
                  <label className="field-label font-mono">Category</label>
                  <select
                    className="field-select"
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
              </div>

              <div className="form-field-group">
                <label className="field-label font-mono">Description</label>
                <textarea
                  className="field-textarea"
                  rows={3}
                  placeholder="Provide a concise description of the workflow, tooling, or capabilities this plugin kit provides..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="form-field-group">
                <label className="field-label font-mono">Tags (comma-separated)</label>
                <input
                  type="text"
                  className="field-input"
                  placeholder="docker, kubernetes, cicd, fullstack"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                />
                {tagsInput.trim() && (
                  <div className="tag-chips-preview">
                    {tagsInput
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .map((t, idx) => (
                        <span key={idx} className="tag-chip font-mono">
                          <Tag size={10} />
                          {t}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: CAPABILITY SELECTION */}
          {currentStep === 2 && (
            <div className="wizard-pane-step2">
              {/* Segmented Sub-Navigation Bar */}
              <div className="capability-subtabs-bar">
                <div className="subtabs-left">
                  <button
                    type="button"
                    className={`subtab-btn ${capabilityTab === 'skills' ? 'active' : ''}`}
                    onClick={() => setCapabilityTab('skills')}
                  >
                    <Sparkles size={13} />
                    <span>Skills ({selectedSkillIds.size}/{uniqueSkills.length})</span>
                  </button>
                  <button
                    type="button"
                    className={`subtab-btn ${capabilityTab === 'mcps' ? 'active' : ''}`}
                    onClick={() => setCapabilityTab('mcps')}
                  >
                    <Server size={13} />
                    <span>MCP Servers ({selectedMcpIds.size}/{uniqueMcps.length})</span>
                  </button>
                  <button
                    type="button"
                    className={`subtab-btn ${capabilityTab === 'rules' ? 'active' : ''}`}
                    onClick={() => setCapabilityTab('rules')}
                  >
                    <ScrollText size={13} />
                    <span>Rules ({selectedRulePresetIds.size}/{RULE_PRESETS.length})</span>
                  </button>
                </div>

                <div className="subtabs-right-search">
                  {capabilityTab === 'skills' && (
                    <div className="search-pill-wrap">
                      <Search size={12} className="search-icon" />
                      <input
                        type="text"
                        placeholder="Search skills..."
                        value={skillSearch}
                        onChange={(e) => setSkillSearch(e.target.value)}
                        className="search-inner-input"
                      />
                    </div>
                  )}
                  {capabilityTab === 'mcps' && (
                    <div className="search-pill-wrap">
                      <Search size={12} className="search-icon" />
                      <input
                        type="text"
                        placeholder="Search MCPs..."
                        value={mcpSearch}
                        onChange={(e) => setMcpSearch(e.target.value)}
                        className="search-inner-input"
                      />
                    </div>
                  )}
                  {capabilityTab === 'rules' && (
                    <div className="search-pill-wrap">
                      <Search size={12} className="search-icon" />
                      <input
                        type="text"
                        placeholder="Search rules..."
                        value={ruleSearch}
                        onChange={(e) => setRuleSearch(e.target.value)}
                        className="search-inner-input"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Tab 1: Skills Selector */}
              {capabilityTab === 'skills' && (
                <div className="capability-tab-content">
                  <div className="tab-control-strip">
                    <span className="items-count-text font-mono">
                      Showing {filteredSkills.length} installed skill{filteredSkills.length === 1 ? '' : 's'}
                    </span>
                    <button
                      type="button"
                      className="text-action-link font-mono"
                      onClick={toggleAllSkills}
                    >
                      {selectedSkillIds.size === filteredSkills.length && filteredSkills.length > 0
                        ? 'Deselect All'
                        : 'Select All Filtered'}
                    </button>
                  </div>

                  {filteredSkills.length === 0 ? (
                    <div className="empty-tab-state">
                      <Sparkles size={24} />
                      <span>No skills match your filter</span>
                    </div>
                  ) : (
                    <div className="capability-items-grid">
                      {filteredSkills.map((s) => {
                        const slug = s.folderName || s.id;
                        const isChecked = selectedSkillIds.has(slug);
                        return (
                          <div
                            key={slug}
                            className={`capability-picker-card ${isChecked ? 'selected' : ''}`}
                            onClick={() => toggleSkill(slug)}
                          >
                            <div className="picker-checkbox-wrap">
                              {isChecked ? (
                                <CheckSquare size={16} className="checked-icon" />
                              ) : (
                                <Square size={16} className="unchecked-icon" />
                              )}
                            </div>
                            <div className="picker-card-info">
                              <div className="picker-title-row">
                                <span className="picker-item-name">{s.name}</span>
                                <span className="picker-slug-badge font-mono">{slug}</span>
                              </div>
                              <p className="picker-desc-text">{s.description || 'No description provided'}</p>
                              <div className="picker-meta-row">
                                {(() => {
                                  const sourceAg = agents.find((a) => a.id === s.sourceAgentId);
                                  const agColor = sourceAg?.color || s.sourceAgentColor || '#8b5cf6';
                                  const agIconKey = sourceAg?.id || sourceAg?.iconName || s.sourceAgentIcon || 'Bot';
                                  const AgentIcon = AGENT_ICON_MAP[agIconKey] || Bot;
                                  return (
                                    <span
                                      className="source-agent-pill"
                                      style={{
                                        color: agColor,
                                        borderColor: `${agColor}33`,
                                        background: `${agColor}15`
                                      }}
                                    >
                                      <AgentIcon size={10} />
                                      <span>{s.sourceAgentName}</span>
                                    </span>
                                  );
                                })()}
                                {s.hasScripts && (
                                  <span className="feature-pill font-mono">Scripts</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: MCP Servers Selector */}
              {capabilityTab === 'mcps' && (
                <div className="capability-tab-content">
                  <div className="tab-control-strip">
                    <span className="items-count-text font-mono">
                      Showing {filteredMcps.length} configured MCP server{filteredMcps.length === 1 ? '' : 's'}
                    </span>
                    <button
                      type="button"
                      className="text-action-link font-mono"
                      onClick={toggleAllMcps}
                    >
                      {selectedMcpIds.size === filteredMcps.length && filteredMcps.length > 0
                        ? 'Deselect All'
                        : 'Select All Filtered'}
                    </button>
                  </div>

                  {filteredMcps.length === 0 ? (
                    <div className="empty-tab-state">
                      <Server size={24} />
                      <span>No MCP servers match your filter</span>
                    </div>
                  ) : (
                    <div className="capability-items-grid">
                      {filteredMcps.map((m) => {
                        const isChecked = selectedMcpIds.has(m.name);
                        return (
                          <div
                            key={m.name}
                            className={`capability-picker-card ${isChecked ? 'selected' : ''}`}
                            onClick={() => toggleMcp(m.name)}
                          >
                            <div className="picker-checkbox-wrap">
                              {isChecked ? (
                                <CheckSquare size={16} className="checked-icon" />
                              ) : (
                                <Square size={16} className="unchecked-icon" />
                              )}
                            </div>
                            <div className="picker-card-info">
                              <div className="picker-title-row">
                                <span className="picker-item-name">{m.name}</span>
                                <span className={`transport-badge font-mono ${m.transport}`}>
                                  {m.transport.toUpperCase()}
                                </span>
                              </div>
                              <div className="command-preview-box font-mono">
                                <code>
                                  {m.command || 'custom'} {(m.args || []).slice(0, 3).join(' ')}
                                </code>
                              </div>
                              <div className="picker-meta-row">
                                {(() => {
                                  const sourceAg = agents.find((a) => a.id === m.sourceAgentId);
                                  const agColor = sourceAg?.color || m.sourceAgentColor || '#38bdf8';
                                  const agIconKey = sourceAg?.id || sourceAg?.iconName || m.sourceAgentIcon || 'Bot';
                                  const AgentIcon = AGENT_ICON_MAP[agIconKey] || Bot;
                                  return (
                                    <span
                                      className="source-agent-pill"
                                      style={{
                                        color: agColor,
                                        borderColor: `${agColor}33`,
                                        background: `${agColor}15`
                                      }}
                                    >
                                      <AgentIcon size={10} />
                                      <span>{m.sourceAgentName}</span>
                                    </span>
                                  );
                                })()}
                                {m.envKeys && m.envKeys.length > 0 && (
                                  <span className="feature-pill font-mono">
                                    {m.envKeys.length} ENV key{m.envKeys.length === 1 ? '' : 's'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Rules & Behavioral Directives */}
              {capabilityTab === 'rules' && (
                <div className="capability-tab-content">
                  <div className="tab-control-strip">
                    <span className="items-count-text font-mono">
                      Showing {filteredRulePresets.length} curated behavioral rule preset{filteredRulePresets.length === 1 ? '' : 's'}
                    </span>
                    <button
                      type="button"
                      className="text-action-link font-mono"
                      onClick={toggleAllRules}
                    >
                      {selectedRulePresetIds.size === filteredRulePresets.length && filteredRulePresets.length > 0
                        ? 'Deselect All'
                        : 'Select All Filtered'}
                    </button>
                  </div>

                  <div className="capability-items-grid">
                    {filteredRulePresets.map((r) => {
                      const isChecked = selectedRulePresetIds.has(r.id);
                      return (
                        <div
                          key={r.id}
                          className={`capability-picker-card rule ${isChecked ? 'selected' : ''}`}
                          onClick={() => toggleRulePreset(r.id)}
                        >
                          <div className="picker-checkbox-wrap">
                            {isChecked ? (
                              <CheckSquare size={16} className="checked-icon" />
                            ) : (
                              <Square size={16} className="unchecked-icon" />
                            )}
                          </div>
                          <div className="picker-card-info">
                            <div className="picker-title-row">
                              <span className="picker-item-name">{r.title}</span>
                              <span className="category-tag font-mono">{r.category}</span>
                            </div>
                            <p className="picker-desc-text">{r.summary}</p>
                            <div className="rule-directives-preview font-mono">
                              {r.directives.map((d, dIdx) => (
                                <span key={dIdx} className="directive-bullet-chip">
                                  • {d.title}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sticky Capability Summary Bar */}
              <div className="capability-selection-summary-bar font-mono">
                <div className="summary-chips-wrap">
                  <span className={`summary-chip ${selectedSkillIds.size > 0 ? 'active' : ''}`}>
                    <Sparkles size={11} />
                    <span>{selectedSkillIds.size} Skills</span>
                  </span>
                  <span className={`summary-chip ${selectedMcpIds.size > 0 ? 'active' : ''}`}>
                    <Server size={11} />
                    <span>{selectedMcpIds.size} MCPs</span>
                  </span>
                  <span className={`summary-chip ${selectedRulePresetIds.size > 0 ? 'active' : ''}`}>
                    <ScrollText size={11} />
                    <span>{selectedRulePresetIds.size} Rules</span>
                  </span>
                </div>
                <div className="summary-total-text">
                  Total: {totalSelectedCapabilities} capabilities ready to bundle
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW MANIFEST & EXPORT */}
          {currentStep === 3 && (
            <div className="wizard-pane-step3">
              {/* Manifest Preview & Tree Split */}
              <div className="preview-split-container">
                {/* Left: Manifest JSON */}
                <div className="manifest-preview-column">
                  <div className="column-header-bar">
                    <div className="col-header-left">
                      <FileCode size={13} />
                      <span className="col-title font-mono">plugin.json Manifest</span>
                    </div>
                    <button
                      type="button"
                      className="copy-btn font-mono"
                      onClick={handleCopyManifest}
                    >
                      {isCopiedManifest ? <Check size={12} /> : <Copy size={12} />}
                      <span>{isCopiedManifest ? 'Copied' : 'Copy JSON'}</span>
                    </button>
                  </div>
                  <pre className="json-code-block font-mono">
                    <code>{JSON.stringify(compiledManifest, null, 2)}</code>
                  </pre>
                </div>

                {/* Right: Package Hierarchy Tree */}
                <div className="package-tree-column">
                  <div className="column-header-bar">
                    <div className="col-header-left">
                      <FolderTree size={13} />
                      <span className="col-title font-mono">Bundle Structure</span>
                    </div>
                    <span className="bundle-size-hint font-mono">Standard Bundle</span>
                  </div>

                  <div className="tree-visualizer-box font-mono">
                    <div className="tree-node root">
                      <Boxes size={14} className="tree-icon root-icon" />
                      <span className="node-text root-text">{folderSlug || 'custom-plugin-kit'}/</span>
                    </div>

                    <div className="tree-children">
                      <div className="tree-node file">
                        <span className="tree-line">├──</span>
                        <FileCode size={13} className="tree-icon json-icon" />
                        <span className="node-text file-text">plugin.json</span>
                      </div>

                      {selectedSkillIds.size > 0 && (
                        <>
                          <div className="tree-node dir">
                            <span className="tree-line">├──</span>
                            <FolderPlus size={13} className="tree-icon dir-icon" />
                            <span className="node-text dir-text">skills/</span>
                            <span className="node-badge">({selectedSkillIds.size} skills)</span>
                          </div>
                          {Array.from(selectedSkillIds).slice(0, 3).map((slug, idx, arr) => (
                            <div key={slug} className="tree-node sub-file">
                              <span className="tree-line sub">│&nbsp;&nbsp; {idx === arr.length - 1 && selectedSkillIds.size <= 3 ? '└──' : '├──'}</span>
                              <Sparkles size={11} className="tree-icon" />
                              <span className="node-text">{slug}/SKILL.md</span>
                            </div>
                          ))}
                          {selectedSkillIds.size > 3 && (
                            <div className="tree-node sub-file subtle">
                              <span className="tree-line sub">│&nbsp;&nbsp; └──</span>
                              <span className="node-text">...and {selectedSkillIds.size - 3} more skills</span>
                            </div>
                          )}
                        </>
                      )}

                      {selectedMcpIds.size > 0 && (
                        <div className="tree-node file">
                          <span className="tree-line">├──</span>
                          <Server size={13} className="tree-icon mcp-icon" />
                          <span className="node-text file-text">mcp_config.json</span>
                          <span className="node-badge">({selectedMcpIds.size} servers)</span>
                        </div>
                      )}

                      {selectedRulePresetIds.size > 0 && (
                        <div className="tree-node dir">
                          <span className="tree-line">└──</span>
                          <ScrollText size={13} className="tree-icon rule-icon" />
                          <span className="node-text dir-text">rules/</span>
                          <span className="node-badge">({selectedRulePresetIds.size} files)</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Export Mode Selection */}
              <div className="export-action-section">
                <div className="export-section-title font-mono">
                  <span>Export Target & Deployment Method</span>
                </div>

                <div className="export-options-grid">
                  {/* Option 1: Install directly into AI Agents */}
                  <div
                    className={`export-radio-card ${exportAction === 'install' ? 'selected' : ''}`}
                    onClick={() => setExportAction('install')}
                  >
                    <div className="card-radio-header">
                      <div className="radio-circle">
                        {exportAction === 'install' && <div className="radio-dot" />}
                      </div>
                      <div className="radio-title-group">
                        <span className="radio-card-title">
                          {isEditing ? 'Save & Update in AI Agents' : 'Install Directly to AI Agents'}
                        </span>
                        <span className="radio-card-desc">
                          {isEditing
                            ? 'Overwrites and updates the bundle directly in the target agents\' plugin directories'
                            : 'Equips the bundle directly into native agent plugin directories'}
                        </span>
                      </div>
                    </div>

                    {exportAction === 'install' && (
                      <div className="agent-target-picker-sub" onClick={(e) => e.stopPropagation()}>
                        <div className="picker-header-row">
                          <span className="sub-label font-mono">Target Agents ({targetAgentIds.length}/{agents.length}):</span>
                          <button
                            type="button"
                            className="sub-link font-mono"
                            onClick={toggleAllTargetAgents}
                          >
                            {targetAgentIds.length === agents.length ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>
                        <div className="agent-pills-wrap">
                          {agents.map((ag) => {
                            const isSelected = targetAgentIds.includes(ag.id);
                            return (
                              <button
                                key={ag.id}
                                type="button"
                                className={`target-agent-pill ${isSelected ? 'active' : ''}`}
                                style={{
                                  borderColor: isSelected ? ag.color : '#27354a',
                                  color: isSelected ? ag.color : '#94a3b8',
                                  background: isSelected ? `${ag.color}20` : '#0d1320'
                                }}
                                onClick={() => toggleTargetAgent(ag.id)}
                              >
                                {isSelected ? <Check size={11} /> : <Bot size={11} />}
                                <span>{ag.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Option 2: Export as Shareable .ZIP Archive */}
                  <div
                    className={`export-radio-card ${exportAction === 'export-zip' ? 'selected' : ''}`}
                    onClick={() => setExportAction('export-zip')}
                  >
                    <div className="card-radio-header">
                      <div className="radio-circle">
                        {exportAction === 'export-zip' && <div className="radio-dot" />}
                      </div>
                      <div className="radio-title-group">
                        <span className="radio-card-title">Export as Shareable .ZIP Archive</span>
                        <span className="radio-card-desc">
                          Package into a single compressed .zip file to share with other developers
                        </span>
                      </div>
                    </div>

                    {exportAction === 'export-zip' && (
                      <div className="destination-input-sub" onClick={(e) => e.stopPropagation()}>
                        <div className="dest-input-row">
                          <input
                            type="text"
                            className="dest-text-input font-mono"
                            placeholder="Destination path (e.g. C:\Users\user\Desktop\bundle.zip)"
                            value={zipDestinationPath}
                            onChange={(e) => setZipDestinationPath(e.target.value)}
                          />
                          <button
                            type="button"
                            className="browse-dest-btn font-mono"
                            onClick={handleBrowseZipDestination}
                          >
                            <FolderArchive size={13} />
                            <span>Browse...</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Option 3: Export as Uncompressed Folder */}
                  <div
                    className={`export-radio-card ${exportAction === 'export-dir' ? 'selected' : ''}`}
                    onClick={() => setExportAction('export-dir')}
                  >
                    <div className="card-radio-header">
                      <div className="radio-circle">
                        {exportAction === 'export-dir' && <div className="radio-dot" />}
                      </div>
                      <div className="radio-title-group">
                        <span className="radio-card-title">Export as Plugin Directory</span>
                        <span className="radio-card-desc">
                          Export the uncompressed plugin folder into a custom workspace or repository
                        </span>
                      </div>
                    </div>

                    {exportAction === 'export-dir' && (
                      <div className="destination-input-sub" onClick={(e) => e.stopPropagation()}>
                        <div className="dest-input-row">
                          <input
                            type="text"
                            className="dest-text-input font-mono"
                            placeholder="Select target folder directory"
                            value={dirDestinationPath}
                            onChange={(e) => setDirDestinationPath(e.target.value)}
                          />
                          <button
                            type="button"
                            className="browse-dest-btn font-mono"
                            onClick={handleBrowseDirDestination}
                          >
                            <FolderPlus size={13} />
                            <span>Browse...</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error / Success Feedback Banner */}
        {errorMsg && (
          <div className="forge-banner error">
            <AlertCircle size={15} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successInfo && (
          <div className="forge-banner success">
            <ShieldCheck size={15} />
            <div className="success-banner-text">
              {successInfo.action === 'install' ? (
                <span>
                  {isEditing
                    ? `Successfully updated "${name || folderSlug}" on ${successInfo.pathOrCount} target AI agent(s)!`
                    : `Successfully forged and equipped plugin to ${successInfo.pathOrCount} target AI agent(s)!`}
                </span>
              ) : successInfo.action === 'export-zip' ? (
                <span>Successfully generated shareable .zip bundle at: <strong>{String(successInfo.pathOrCount)}</strong></span>
              ) : (
                <span>Successfully exported plugin directory to: <strong>{String(successInfo.pathOrCount)}</strong></span>
              )}
            </div>
            {typeof successInfo.pathOrCount === 'string' && (
              <button
                type="button"
                className="banner-action-btn font-mono"
                onClick={handleOpenExportedPath}
              >
                <ExternalLink size={12} />
                <span>Show in Explorer</span>
              </button>
            )}
          </div>
        )}

        {/* Modal Footer Controls */}
        <div className="forge-modal-footer">
          <div className="footer-left">
            {currentStep > 1 && !successInfo && (
              <button
                type="button"
                className="secondary-btn font-mono"
                onClick={() => setCurrentStep((prev) => (prev - 1) as WizardStep)}
                disabled={isSubmitting}
              >
                <ArrowLeft size={13} />
                <span>Back</span>
              </button>
            )}
          </div>

          <div className="footer-right">
            <button
              type="button"
              className="cancel-btn font-mono"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              {successInfo ? 'Close' : 'Cancel'}
            </button>

            {currentStep === 1 && (
              <button
                type="button"
                className="primary-btn font-mono"
                onClick={() => setCurrentStep(2)}
                disabled={!canProceedStep1}
              >
                <span>Next: Select Capabilities</span>
                <ArrowRight size={13} />
              </button>
            )}

            {currentStep === 2 && (
              <button
                type="button"
                className="primary-btn font-mono"
                onClick={() => setCurrentStep(3)}
                disabled={!canProceedStep2}
              >
                <span>Next: Manifest & Export</span>
                <ArrowRight size={13} />
              </button>
            )}

            {currentStep === 3 && !successInfo && (
              <button
                type="button"
                className="primary-btn forge-btn font-mono"
                onClick={handleForgeSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={13} className="spin" />
                    <span>
                      {exportAction === 'install'
                        ? (isEditing ? 'Updating Plugin...' : 'Equipping Plugin...')
                        : exportAction === 'export-zip'
                        ? 'Packaging .ZIP...'
                        : 'Exporting Folder...'}
                    </span>
                  </>
                ) : (
                  <>
                    {exportAction === 'install' ? (
                      isEditing ? <Check size={13} /> : <Boxes size={13} />
                    ) : exportAction === 'export-zip' ? (
                      <Download size={13} />
                    ) : (
                      <FolderPlus size={13} />
                    )}
                    <span>
                      {exportAction === 'install'
                        ? (isEditing
                            ? `Save Changes (${targetAgentIds.length} Agent${targetAgentIds.length === 1 ? '' : 's'})`
                            : `Equip to ${targetAgentIds.length} Agent(s)`)
                        : exportAction === 'export-zip'
                        ? 'Create .ZIP Archive'
                        : 'Export Plugin Folder'}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Self-Contained Scoped Styling */}
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

          .forge-modal-overlay {
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

          .forge-modal-overlay.is-closing {
            animation: modalOverlayFadeOut 0.16s cubic-bezier(0.4, 0, 1, 1) forwards !important;
            pointer-events: none !important;
          }

          .forge-modal-card {
            background: #090d16;
            border: 1px solid #1c273c;
            border-radius: 12px;
            width: 100%;
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
          }

          .forge-modal-card.is-closing {
            animation: modalCardScaleOut 0.16s cubic-bezier(0.4, 0, 1, 1) forwards !important;
            pointer-events: none !important;
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
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2));
            border: 1px solid rgba(99, 102, 241, 0.4);
            color: #818cf8;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }

          .header-icon-box.plugin.edit {
            background: rgba(56, 189, 248, 0.15);
            border: 1px solid rgba(56, 189, 248, 0.35);
            color: #38bdf8;
          }

          .header-title-box {
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

          .forge-modal-close-btn {
            background: transparent;
            border: none;
            color: #64748b;
            padding: 6px;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.15s;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .forge-modal-close-btn:hover {
            color: #f1f5f9;
            background: #1e293b;
          }

          .forge-plugin-card {
            max-width: 960px !important;
            height: 85vh !important;
            max-height: 760px !important;
          }

          .wizard-step-tracker {
            display: flex;
            align-items: center;
            padding: 10px 24px;
            background: #080d17;
            border-bottom: 1px solid #141f33;
            gap: 12px;
          }

          .wizard-step-item {
            display: flex;
            align-items: center;
            gap: 8px;
            background: none;
            border: none;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 6px;
            transition: all 0.15s ease;
          }

          .wizard-step-item:disabled {
            cursor: not-allowed;
            opacity: 0.45;
          }

          .step-num {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #1e293b;
            color: #94a3b8;
            font-size: 11px;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s ease;
          }

          .wizard-step-item.active .step-num {
            background: #6366f1;
            color: #ffffff;
            box-shadow: 0 0 10px rgba(99, 102, 241, 0.45);
          }

          .wizard-step-item.completed .step-num {
            background: #10b981;
            color: #ffffff;
          }

          .step-label {
            font-size: 12px;
            font-weight: 600;
            color: #94a3b8;
          }

          .wizard-step-item.active .step-label {
            color: #f8fafc;
          }

          .step-connector {
            flex: 1;
            height: 1px;
            background: #1c273c;
          }

          .step-connector.completed {
            background: #10b981;
          }

          .forge-plugin-body {
            flex: 1;
            overflow-y: auto;
            padding: 20px 24px;
            background: #090e1a;
          }

          /* Step 1 Styles */
          .wizard-pane-step1 {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .form-grid-two-col {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
          }

          .form-grid-three-col {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 16px;
          }

          .form-field-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }

          .field-label {
            font-size: 11px;
            font-weight: 600;
            color: #94a3b8;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }

          .req-asterisk {
            color: #f43f5e;
          }

          .field-input, .field-select, .field-textarea {
            background: #0d1424;
            border: 1px solid #1a253a;
            border-radius: 6px;
            padding: 8px 12px;
            color: #e2e8f0;
            font-size: 13px;
            outline: none;
            transition: all 0.15s ease;
          }

          .field-input:focus, .field-select:focus, .field-textarea:focus {
            border-color: #6366f1;
            box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
          }

          .field-input:disabled {
            background: #080c16;
            color: #64748b;
            border-color: #151e2f;
            cursor: not-allowed;
            opacity: 0.75;
          }

          .field-hint {
            font-size: 11px;
            color: #64748b;
          }

          .tag-chips-preview {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 4px;
          }

          .tag-chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            padding: 2px 7px;
            border-radius: 4px;
            background: rgba(99, 102, 241, 0.15);
            color: #818cf8;
            border: 1px solid rgba(99, 102, 241, 0.3);
          }

          /* Step 2 Styles */
          .wizard-pane-step2 {
            display: flex;
            flex-direction: column;
            height: 100%;
            gap: 14px;
          }

          .capability-subtabs-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-bottom: 10px;
            border-bottom: 1px solid #151f33;
          }

          .subtabs-left {
            display: flex;
            gap: 6px;
          }

          .subtab-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 5px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            background: #0f172a;
            border: 1px solid #1e293b;
            color: #94a3b8;
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .subtab-btn:hover {
            color: #f1f5f9;
            background: #151f36;
          }

          .subtab-btn.active {
            background: #6366f1;
            color: #ffffff;
            border-color: #6366f1;
            box-shadow: 0 0 10px rgba(99, 102, 241, 0.35);
          }

          .search-pill-wrap {
            display: flex;
            align-items: center;
            gap: 6px;
            background: #0d1424;
            border: 1px solid #1c273c;
            border-radius: 20px;
            padding: 3px 10px;
          }

          .search-inner-input {
            background: none;
            border: none;
            outline: none;
            color: #e2e8f0;
            font-size: 11px;
            width: 130px;
          }

          .tab-control-strip {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
          }

          .items-count-text {
            font-size: 11px;
            color: #64748b;
          }

          .text-action-link {
            background: none;
            border: none;
            color: #818cf8;
            font-size: 11px;
            cursor: pointer;
            text-decoration: underline;
          }

          .text-action-link:hover {
            color: #a5b4fc;
          }

          .capability-tab-content {
            flex: 1;
            overflow-y: auto;
            max-height: 400px;
            padding-right: 4px;
          }

          .capability-items-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }

          .capability-picker-card {
            display: flex;
            gap: 10px;
            padding: 10px 12px;
            background: #0c1220;
            border: 1px solid #172236;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.15s ease;
            user-select: none;
          }

          .capability-picker-card:hover {
            border-color: #273752;
            background: #0f1729;
          }

          .capability-picker-card.selected {
            background: #111a30;
            border-color: #6366f1;
            box-shadow: 0 0 10px rgba(99, 102, 241, 0.18);
          }

          .picker-checkbox-wrap {
            margin-top: 2px;
            flex-shrink: 0;
          }

          .checked-icon {
            color: #818cf8;
          }

          .unchecked-icon {
            color: #475569;
          }

          .picker-card-info {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .picker-title-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
          }

          .picker-item-name {
            font-size: 13px;
            font-weight: 600;
            color: #f1f5f9;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .picker-slug-badge {
            font-size: 10px;
            color: #64748b;
            background: #162033;
            padding: 1px 5px;
            border-radius: 4px;
          }

          .transport-badge {
            font-size: 9px;
            padding: 1px 5px;
            border-radius: 4px;
            font-weight: 700;
          }

          .transport-badge.stdio {
            background: rgba(16, 185, 129, 0.15);
            color: #34d399;
            border: 1px solid rgba(16, 185, 129, 0.3);
          }

          .transport-badge.sse {
            background: rgba(56, 189, 248, 0.15);
            color: #38bdf8;
            border: 1px solid rgba(56, 189, 248, 0.3);
          }

          .picker-desc-text {
            font-size: 11px;
            color: #94a3b8;
            line-height: 1.4;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            margin: 0;
          }

          .command-preview-box {
            font-size: 10px;
            color: #a5b4fc;
            background: #070b14;
            padding: 3px 6px;
            border-radius: 4px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .picker-meta-row {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-top: 2px;
          }

          .source-agent-pill {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            padding: 1px 6px;
            border-radius: 10px;
            border: 1px solid;
          }

          .feature-pill {
            font-size: 9px;
            padding: 1px 5px;
            border-radius: 4px;
            background: #162033;
            color: #94a3b8;
          }

          .rule-directives-preview {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-top: 4px;
          }

          .directive-bullet-chip {
            font-size: 10px;
            color: #818cf8;
            background: rgba(99, 102, 241, 0.1);
            padding: 1px 5px;
            border-radius: 4px;
          }

          .category-tag {
            font-size: 9px;
            text-transform: uppercase;
            color: #64748b;
            background: #131c2e;
            padding: 1px 5px;
            border-radius: 4px;
          }

          .category-tag.custom {
            color: #38bdf8;
            background: rgba(56, 189, 248, 0.1);
            border: 1px solid rgba(56, 189, 248, 0.25);
          }

          .capability-selection-summary-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            background: #080d17;
            border: 1px solid #172236;
            border-radius: 8px;
            margin-top: auto;
          }

          .summary-chips-wrap {
            display: flex;
            gap: 8px;
          }

          .summary-chip {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            font-size: 11px;
            color: #64748b;
          }

          .summary-chip.active {
            color: #818cf8;
            font-weight: 600;
          }

          .summary-total-text {
            font-size: 11px;
            color: #94a3b8;
          }

          .empty-tab-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 40px 20px;
            color: #475569;
            font-size: 12px;
          }

          /* Step 3 Styles */
          .wizard-pane-step3 {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .preview-split-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            height: 240px;
          }

          .manifest-preview-column, .package-tree-column {
            display: flex;
            flex-direction: column;
            background: #060a12;
            border: 1px solid #162033;
            border-radius: 8px;
            overflow: hidden;
          }

          .column-header-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 12px;
            background: #0c1220;
            border-bottom: 1px solid #162033;
          }

          .col-header-left {
            display: flex;
            align-items: center;
            gap: 6px;
            color: #94a3b8;
          }

          .col-title {
            font-size: 11px;
            font-weight: 600;
            color: #e2e8f0;
          }

          .copy-btn {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            background: #162033;
            border: 1px solid #24334f;
            color: #94a3b8;
            padding: 2px 7px;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .copy-btn:hover {
            color: #ffffff;
            background: #202d45;
          }

          .json-code-block {
            flex: 1;
            margin: 0;
            padding: 10px 12px;
            overflow-y: auto;
            font-size: 11px;
            line-height: 1.45;
            color: #a5b4fc;
          }

          .tree-visualizer-box {
            flex: 1;
            padding: 12px;
            overflow-y: auto;
            font-size: 11px;
            line-height: 1.6;
          }

          .tree-node {
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .tree-node.root {
            font-weight: 700;
            color: #f1f5f9;
            margin-bottom: 4px;
          }

          .tree-children {
            padding-left: 8px;
          }

          .tree-line {
            color: #334155;
            font-weight: 400;
          }

          .tree-icon.root-icon { color: #818cf8; }
          .tree-icon.json-icon { color: #f59e0b; }
          .tree-icon.dir-icon { color: #38bdf8; }
          .tree-icon.mcp-icon { color: #34d399; }
          .tree-icon.rule-icon { color: #ec4899; }

          .node-badge {
            font-size: 10px;
            color: #64748b;
            margin-left: 4px;
          }

          .bundle-size-hint {
            font-size: 10px;
            color: #64748b;
          }

          /* Export Action Section */
          .export-action-section {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .export-section-title {
            font-size: 11px;
            font-weight: 600;
            color: #94a3b8;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }

          .export-options-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .export-radio-card {
            background: #0b111f;
            border: 1px solid #172236;
            border-radius: 8px;
            padding: 12px 14px;
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .export-radio-card:hover {
            border-color: #273752;
            background: #0f1628;
          }

          .export-radio-card.selected {
            background: #111a30;
            border-color: #6366f1;
            box-shadow: 0 0 10px rgba(99, 102, 241, 0.15);
          }

          .card-radio-header {
            display: flex;
            align-items: flex-start;
            gap: 10px;
          }

          .radio-circle {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            border: 2px solid #334155;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: 2px;
            flex-shrink: 0;
            transition: all 0.15s ease;
          }

          .export-radio-card.selected .radio-circle {
            border-color: #6366f1;
          }

          .radio-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #6366f1;
          }

          .radio-title-group {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          .radio-card-title {
            font-size: 13px;
            font-weight: 600;
            color: #f1f5f9;
          }

          .radio-card-desc {
            font-size: 11px;
            color: #94a3b8;
          }

          .agent-target-picker-sub, .destination-input-sub {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid #17243c;
          }

          .picker-header-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 6px;
          }

          .sub-label {
            font-size: 11px;
            color: #818cf8;
          }

          .sub-link {
            background: none;
            border: none;
            color: #64748b;
            font-size: 10px;
            cursor: pointer;
            text-decoration: underline;
          }

          .sub-link:hover { color: #94a3b8; }

          .agent-pills-wrap {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
          }

          .target-agent-pill {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            font-size: 11px;
            font-weight: 600;
            padding: 4px 10px;
            border-radius: 16px;
            border: 1px solid;
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .dest-input-row {
            display: flex;
            gap: 8px;
          }

          .dest-text-input {
            flex: 1;
            background: #060a12;
            border: 1px solid #1a253a;
            border-radius: 6px;
            padding: 6px 10px;
            color: #e2e8f0;
            font-size: 11px;
            outline: none;
          }

          .browse-dest-btn {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            background: #172338;
            border: 1px solid #233452;
            color: #cbd5e1;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .browse-dest-btn:hover {
            background: #1f304d;
            color: #ffffff;
          }

          /* Banners */
          .forge-banner {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 16px;
            font-size: 12px;
            border-top: 1px solid;
          }

          .forge-banner.error {
            background: rgba(239, 68, 68, 0.1);
            color: #f87171;
            border-color: rgba(239, 68, 68, 0.3);
          }

          .forge-banner.success {
            background: rgba(16, 185, 129, 0.1);
            color: #34d399;
            border-color: rgba(16, 185, 129, 0.3);
          }

          .success-banner-text {
            flex: 1;
          }

          .banner-action-btn {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: rgba(16, 185, 129, 0.2);
            border: 1px solid rgba(16, 185, 129, 0.4);
            color: #6ee7b7;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .banner-action-btn:hover {
            background: rgba(16, 185, 129, 0.3);
          }

          /* Footer */
          .forge-modal-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 20px;
            background: #090e1a;
            border-top: 1px solid #141f33;
            flex-shrink: 0;
          }

          .footer-left, .footer-right {
            display: flex;
            align-items: center;
            gap: 10px;
          }

          .primary-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 7px 16px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            background: #6366f1;
            color: #ffffff;
            border: none;
            cursor: pointer;
            transition: all 0.15s ease;
            box-shadow: 0 0 12px rgba(99, 102, 241, 0.3);
          }

          .primary-btn:hover:not(:disabled) {
            background: #4f46e5;
          }

          .primary-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            box-shadow: none;
          }

          .primary-btn.forge-btn {
            background: #10b981;
            box-shadow: 0 0 12px rgba(16, 185, 129, 0.3);
          }

          .primary-btn.forge-btn:hover:not(:disabled) {
            background: #059669;
          }

          .secondary-btn, .cancel-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 7px 14px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            background: #111a2d;
            border: 1px solid #1f2d47;
            color: #94a3b8;
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .secondary-btn:hover, .cancel-btn:hover {
            color: #ffffff;
            background: #17243c;
          }

          .spin {
            animation: spinAnim 1s linear infinite;
          }

          @keyframes spinAnim {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>,
    document.body
  );
};
