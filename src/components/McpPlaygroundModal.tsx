import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Play,
  Square,
  RotateCcw,
  RefreshCw,
  Terminal,
  Globe,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  Clock,
  KeyRound,
  ChevronDown,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Wrench,
  Code2,
  FormInput,
  ScrollText,
  Zap,
} from 'lucide-react';
import { CapabilityIcon } from './CapabilityIcon';
import { useModalTransition } from '../hooks/useModalTransition';
import { useToast } from '../context/ToastContext';
import type {
  McpToolDefinition,
  McpToolSchemaProperty,
  McpPlaygroundToolCallResult,
} from '../../electron/preload';

export interface PlaygroundServerTarget {
  id: string;
  name: string;
  category?: string;
  transport: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  envKeys?: string[];
  configPaths?: string[];
}

interface McpPlaygroundModalProps {
  isOpen: boolean;
  server: PlaygroundServerTarget | null;
  onClose: () => void;
}

interface EnvEntryRow {
  id: string;
  key: string;
  value: string;
}

interface CallHistoryEntry {
  id: string;
  toolName: string;
  latencyMs: number;
  success: boolean;
  timestamp: string;
  result: McpPlaygroundToolCallResult;
}

function splitCommandArgs(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuotes: '"' | "'" | null = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === inQuotes) {
        inQuotes = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuotes = ch;
    } else if (/\s/.test(ch)) {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) {
    args.push(current);
  }
  return args;
}

function normalizeSchemaType(prop?: McpToolSchemaProperty): string {
  if (!prop) return 'string';
  if (Array.isArray(prop.enum) && prop.enum.length > 0) return 'enum';
  const rawType = Array.isArray(prop.type)
    ? prop.type.find((t) => t !== 'null') || prop.type[0]
    : prop.type;
  if (rawType === 'integer' || rawType === 'number') return 'number';
  if (rawType === 'boolean') return 'boolean';
  if (rawType === 'array') return 'array';
  if (rawType === 'object') return 'object';
  return 'string';
}

function buildDefaultArgsForTool(tool: McpToolDefinition | null): Record<string, unknown> {
  if (!tool?.inputSchema?.properties) return {};
  const defaults: Record<string, unknown> = {};
  const required = new Set(tool.inputSchema.required || []);

  for (const [key, prop] of Object.entries(tool.inputSchema.properties)) {
    if (prop.default !== undefined) {
      defaults[key] = prop.default;
      continue;
    }
    if (Array.isArray(prop.enum) && prop.enum.length > 0 && required.has(key)) {
      defaults[key] = prop.enum[0];
      continue;
    }
    if (!required.has(key)) continue;

    const kind = normalizeSchemaType(prop);
    if (kind === 'boolean') defaults[key] = false;
    else if (kind === 'number') defaults[key] = 0;
    else if (kind === 'array') defaults[key] = [];
    else if (kind === 'object') defaults[key] = {};
    else defaults[key] = '';
  }

  return defaults;
}

function formatJsonTextIfValid(text: string): string {
  const trimmed = text.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}

interface PlaygroundEnumSelectProps {
  options: unknown[];
  value: unknown;
  allowUnset: boolean;
  onChange: (val: unknown) => void;
  onOpenChange?: (isOpen: boolean) => void;
}

const PlaygroundEnumSelect: React.FC<PlaygroundEnumSelectProps> = ({
  options,
  value,
  allowUnset,
  onChange,
  onOpenChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isUpward, setIsUpward] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const setOpenState = useCallback(
    (next: boolean) => {
      setIsOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange]
  );

  const updateMenuPosition = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUpward = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(240, openUpward ? spaceAbove : spaceBelow));

    setIsUpward(openUpward);
    setMenuStyle({
      position: 'fixed',
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      ...(openUpward
        ? { bottom: `${window.innerHeight - rect.top + 6}px` }
        : { top: `${rect.bottom + 6}px` }),
      maxHeight: `${maxHeight}px`,
      zIndex: 10160,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpenState(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpenState(false);
        triggerRef.current?.focus();
      }
    };

    const handleWindowChange = () => updateMenuPosition();

    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', handleWindowChange);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', handleWindowChange);
    };
  }, [isOpen, setOpenState, updateMenuPosition]);

  const hasValue = value !== undefined && value !== '';
  const displayValue = hasValue ? String(value) : '-- Unset --';

  return (
    <div className="mcp-pg-select-wrap">
      <button
        ref={triggerRef}
        type="button"
        className={`mcp-pg-select-trigger font-mono ${isOpen ? 'open' : ''} ${!hasValue ? 'placeholder' : ''}`}
        onClick={() => setOpenState(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="mcp-pg-select-value" title={displayValue}>
          {displayValue}
        </span>
        <ChevronDown size={13} className={`mcp-pg-select-chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            className={`mcp-pg-select-menu font-mono ${isUpward ? 'dir-up' : 'dir-down'}`}
            style={menuStyle}
            role="listbox"
            onClick={(e) => e.stopPropagation()}
          >
            {allowUnset && (
              <button
                type="button"
                role="option"
                aria-selected={!hasValue}
                className={`mcp-pg-select-option muted ${!hasValue ? 'selected' : ''}`}
                onClick={() => {
                  onChange(undefined);
                  setOpenState(false);
                }}
              >
                <span className="mcp-pg-select-opt-text">-- Unset --</span>
                {!hasValue && <Check size={12} className="mcp-pg-select-check" />}
              </button>
            )}
            {options.map((opt) => {
              const strOpt = String(opt);
              const isSelected = hasValue && String(value) === strOpt;
              return (
                <button
                  key={strOpt}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`mcp-pg-select-option ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    onChange(opt);
                    setOpenState(false);
                  }}
                  title={strOpt}
                >
                  <span className="mcp-pg-select-opt-text">{strOpt}</span>
                  {isSelected && <Check size={12} className="mcp-pg-select-check" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
};

export const McpPlaygroundModal: React.FC<McpPlaygroundModalProps> = ({
  isOpen,
  server,
  onClose,
}) => {
  const toast = useToast();
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pendingSessionIdRef = useRef<string | null>(null);
  const connectAttemptRef = useRef(0);
  const [protocolVersion, setProtocolVersion] = useState<string>('');
  const [serverInfoName, setServerInfoName] = useState<string>('');
  const [connectLatencyMs, setConnectLatencyMs] = useState<number | null>(null);
  const [listToolsLatencyMs, setListToolsLatencyMs] = useState<number | null>(null);
  const [resolvedEnvKeys, setResolvedEnvKeys] = useState<string[]>([]);
  const [stderrLogs, setStderrLogs] = useState<string[]>([]);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Connection overrides
  const [transport, setTransport] = useState<'stdio' | 'sse'>('stdio');
  const [command, setCommand] = useState('');
  const [argsText, setArgsText] = useState('');
  const [url, setUrl] = useState('');
  const [envRows, setEnvRows] = useState<EnvEntryRow[]>([]);
  const [showEnvPanel, setShowEnvPanel] = useState(false);
  const [revealedEnvIds, setRevealedEnvIds] = useState<Record<string, boolean>>({});

  // Discovered tools & active tool execution
  const [tools, setTools] = useState<McpToolDefinition[]>([]);
  const [toolSearch, setToolSearch] = useState('');
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);
  const [isRefreshingTools, setIsRefreshingTools] = useState(false);

  // Tool argument inputs
  const [argInputMode, setArgInputMode] = useState<'form' | 'json'>('form');
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [complexFieldText, setComplexFieldText] = useState<Record<string, string>>({});
  const [jsonEditorText, setJsonEditorText] = useState('{}');
  const [jsonEditorError, setJsonEditorError] = useState<string | null>(null);

  // Tool call result & history
  const [isExecuting, setIsExecuting] = useState(false);
  const [callResult, setCallResult] = useState<McpPlaygroundToolCallResult | null>(null);
  const [outputTab, setOutputTab] = useState<'formatted' | 'raw' | 'stderr'>('formatted');
  const [callHistory, setCallHistory] = useState<CallHistoryEntry[]>([]);
  const [copiedOutput, setCopiedOutput] = useState(false);

  const disconnectActiveSession = useCallback(async () => {
    connectAttemptRef.current += 1;
    const idsToDisconnect = [sessionIdRef.current, pendingSessionIdRef.current].filter(
      (id): id is string => Boolean(id)
    );
    sessionIdRef.current = null;
    pendingSessionIdRef.current = null;
    setSessionId(null);
    for (const sid of new Set(idsToDisconnect)) {
      try {
        await window.electronAPI?.mcpPlaygroundDisconnect?.(sid);
      } catch {}
    }
    setStatus('disconnected');
  }, []);

  const handleCloseWithCleanup = useCallback(() => {
    void disconnectActiveSession();
    onClose();
  }, [disconnectActiveSession, onClose]);

  const { isRendered, isClosing, handleClose } = useModalTransition(
    isOpen,
    handleCloseWithCleanup,
    180
  );

  // Sync state when target server changes or modal opens
  useEffect(() => {
    if (!isOpen || !server) return;

    void disconnectActiveSession();
    setProtocolVersion('');
    setServerInfoName('');
    setConnectLatencyMs(null);
    setListToolsLatencyMs(null);
    setResolvedEnvKeys([]);
    setStderrLogs([]);
    setConnectError(null);
    setTools([]);
    setToolSearch('');
    setSelectedToolName(null);
    setCallResult(null);
    setCallHistory([]);
    setOutputTab('formatted');
    setArgInputMode('form');
    setJsonEditorText('{}');
    setJsonEditorError(null);

    setTransport(server.transport || 'stdio');
    setCommand(server.command || '');
    setArgsText((server.args || []).join(' '));
    setUrl(server.url || '');

    const keySet = new Set<string>([
      ...(server.envKeys || []),
      ...Object.keys(server.env || {}),
    ]);
    const initialRows: EnvEntryRow[] = Array.from(keySet).map((k, idx) => ({
      id: `env-${idx}-${k}`,
      key: k,
      value: '',
    }));
    setEnvRows(initialRows);
    setShowEnvPanel(false);
    setRevealedEnvIds({});
  }, [isOpen, server, disconnectActiveSession]);

  // Unmount safety cleanup
  useEffect(() => {
    return () => {
      connectAttemptRef.current += 1;
      const idsToDisconnect = [sessionIdRef.current, pendingSessionIdRef.current].filter(
        (id): id is string => Boolean(id)
      );
      sessionIdRef.current = null;
      pendingSessionIdRef.current = null;
      for (const sid of new Set(idsToDisconnect)) {
        void window.electronAPI?.mcpPlaygroundDisconnect?.(sid);
      }
    };
  }, []);

  const selectedTool = useMemo(
    () => tools.find((t) => t.name === selectedToolName) || null,
    [tools, selectedToolName]
  );

  const filteredTools = useMemo(() => {
    const q = toolSearch.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
    );
  }, [tools, toolSearch]);

  const populateToolForm = useCallback((tool: McpToolDefinition | null) => {
    const defaults = buildDefaultArgsForTool(tool);
    setFormValues(defaults);
    const complexMap: Record<string, string> = {};
    const props = tool?.inputSchema?.properties || {};
    for (const [k, prop] of Object.entries(props)) {
      const kind = normalizeSchemaType(prop);
      if (kind === 'object' || kind === 'array') {
        const val = defaults[k] !== undefined ? defaults[k] : (kind === 'array' ? [] : {});
        complexMap[k] = JSON.stringify(val, null, 2);
      }
    }
    setComplexFieldText(complexMap);
    setJsonEditorText(JSON.stringify(defaults, null, 2));
    setJsonEditorError(null);
  }, []);

  const handleSelectTool = (tool: McpToolDefinition) => {
    setSelectedToolName(tool.name);
    populateToolForm(tool);
  };

  const handleConnect = async () => {
    if (!server || !window.electronAPI?.mcpPlaygroundConnect) return;
    await disconnectActiveSession();

    const attemptId = ++connectAttemptRef.current;
    const clientSessionId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `pg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pendingSessionIdRef.current = clientSessionId;

    setStatus('connecting');
    setConnectError(null);
    setCallResult(null);

    const envOverrides: Record<string, string> = {};
    for (const row of envRows) {
      const k = row.key.trim();
      if (k && row.value.length > 0) {
        envOverrides[k] = row.value;
      }
    }

    try {
      const res = await window.electronAPI.mcpPlaygroundConnect({
        sessionId: clientSessionId,
        serverKey: server.id,
        serverName: server.name,
        transport,
        command: transport === 'stdio' ? command.trim() : undefined,
        args: transport === 'stdio' ? splitCommandArgs(argsText) : undefined,
        url: transport === 'sse' ? url.trim() : undefined,
        envOverrides,
        configPaths: server.configPaths,
        timeoutMs: 15000,
      });

      if (pendingSessionIdRef.current === clientSessionId) {
        pendingSessionIdRef.current = null;
      }

      // If the user closed the modal or restarted a connection while connecting, tear down immediately
      if (connectAttemptRef.current !== attemptId) {
        if (res.sessionId) {
          void window.electronAPI?.mcpPlaygroundDisconnect?.(res.sessionId);
        }
        return;
      }

      if (res.stderrLogs) {
        setStderrLogs(res.stderrLogs);
      }
      if (res.resolvedEnvKeys) {
        setResolvedEnvKeys(res.resolvedEnvKeys);
      }

      if (!res.success || !res.sessionId) {
        setStatus('error');
        setConnectError(res.error || 'Failed to establish MCP connection');
        return;
      }

      sessionIdRef.current = res.sessionId;
      setSessionId(res.sessionId);
      setStatus('connected');
      setProtocolVersion(res.protocolVersion || '2024-11-05');
      setServerInfoName(res.serverInfo?.name ? `${res.serverInfo.name}${res.serverInfo.version ? ` v${res.serverInfo.version}` : ''}` : '');
      setConnectLatencyMs(res.connectLatencyMs ?? null);
      setListToolsLatencyMs(res.listToolsLatencyMs ?? null);

      const discovered = res.tools || [];
      setTools(discovered);
      if (discovered.length > 0) {
        setSelectedToolName(discovered[0].name);
        populateToolForm(discovered[0]);
      } else {
        setSelectedToolName(null);
      }
    } catch (err: any) {
      if (pendingSessionIdRef.current === clientSessionId) {
        pendingSessionIdRef.current = null;
      }
      if (connectAttemptRef.current !== attemptId) {
        return;
      }
      setStatus('error');
      setConnectError(err?.message || 'Unexpected error while connecting to MCP server');
    }
  };

  const handleRefreshTools = async () => {
    if (!sessionId || !window.electronAPI?.mcpPlaygroundListTools) return;
    setIsRefreshingTools(true);
    try {
      const res = await window.electronAPI.mcpPlaygroundListTools(sessionId);
      if (res.stderrLogs) setStderrLogs(res.stderrLogs);
      if (res.success && res.tools) {
        setTools(res.tools);
        setListToolsLatencyMs(res.latencyMs);
        if (res.tools.length > 0 && !res.tools.some((t) => t.name === selectedToolName)) {
          setSelectedToolName(res.tools[0].name);
          populateToolForm(res.tools[0]);
        }
        toast.success(`Loaded ${res.tools.length} tools in ${res.latencyMs} ms`);
      } else {
        toast.error(res.error || 'Failed to refresh tools/list');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error calling tools/list');
    } finally {
      setIsRefreshingTools(false);
    }
  };

  const handleSwitchArgMode = (nextMode: 'form' | 'json') => {
    if (nextMode === argInputMode) return;
    if (nextMode === 'json') {
      setJsonEditorText(JSON.stringify(formValues, null, 2));
      setJsonEditorError(null);
      setArgInputMode('json');
      return;
    }

    try {
      const parsed = jsonEditorText.trim() ? JSON.parse(jsonEditorText) : {};
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setJsonEditorError('Arguments root must be a JSON object');
        return;
      }
      setFormValues(parsed);
      const nextComplex: Record<string, string> = {};
      const props = selectedTool?.inputSchema?.properties || {};
      for (const [k, prop] of Object.entries(props)) {
        const kind = normalizeSchemaType(prop);
        if ((kind === 'object' || kind === 'array') && parsed[k] !== undefined) {
          nextComplex[k] = JSON.stringify(parsed[k], null, 2);
        }
      }
      setComplexFieldText((prev) => ({ ...prev, ...nextComplex }));
      setJsonEditorError(null);
      setArgInputMode('form');
    } catch (err: any) {
      setJsonEditorError(err?.message || 'Invalid JSON syntax');
    }
  };

  const handleExecuteTool = useCallback(async () => {
    if (!sessionId || !selectedTool || !window.electronAPI?.mcpPlaygroundCallTool) return;

    let finalArgs: Record<string, unknown> = {};
    if (argInputMode === 'json') {
      try {
        const parsed = jsonEditorText.trim() ? JSON.parse(jsonEditorText) : {};
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          setJsonEditorError('Arguments JSON must be an object ({ ... })');
          return;
        }
        finalArgs = parsed;
        setJsonEditorError(null);
      } catch (err: any) {
        setJsonEditorError(err?.message || 'Invalid JSON syntax');
        return;
      }
    } else {
      const props = selectedTool.inputSchema?.properties || {};
      for (const [k, v] of Object.entries(formValues)) {
        const prop = props[k];
        const kind = normalizeSchemaType(prop);
        if (kind === 'object' || kind === 'array') {
          const text = complexFieldText[k];
          if (text !== undefined && text.trim() !== '') {
            try {
              finalArgs[k] = JSON.parse(text);
            } catch (err: any) {
              toast.error(`Field "${k}" contains invalid JSON: ${err.message}`);
              return;
            }
          }
        } else if (v !== undefined) {
          if (kind === 'string' && v === '' && !(selectedTool.inputSchema?.required || []).includes(k)) {
            continue;
          }
          finalArgs[k] = v;
        }
      }
    }

    setIsExecuting(true);
    try {
      const res = await window.electronAPI.mcpPlaygroundCallTool({
        sessionId,
        toolName: selectedTool.name,
        arguments: finalArgs,
        timeoutMs: 25000,
      });

      if (res.stderrLogs) {
        setStderrLogs(res.stderrLogs);
      }
      setCallResult(res);
      setOutputTab(res.success ? 'formatted' : res.rawResponse ? 'formatted' : 'stderr');
      setCallHistory((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          toolName: selectedTool.name,
          latencyMs: res.latencyMs,
          success: res.success,
          timestamp: new Date().toLocaleTimeString(),
          result: res,
        },
        ...prev.slice(0, 5),
      ]);
    } catch (err: any) {
      setCallResult({
        success: false,
        isError: true,
        latencyMs: 0,
        error: err?.message || 'Tool execution error',
      });
    } finally {
      setIsExecuting(false);
    }
  }, [sessionId, selectedTool, argInputMode, jsonEditorText, formValues, complexFieldText, toast]);

  // Keyboard shortcuts: Escape closes modal, Ctrl+Enter / Cmd+Enter runs active tool
  useEffect(() => {
    if (!isRendered) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && status === 'connected' && selectedTool && !isExecuting) {
        e.preventDefault();
        void handleExecuteTool();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isRendered, handleClose, status, selectedTool, isExecuting, handleExecuteTool]);

  if (!isRendered || !server) return null;

  const schemaProps = selectedTool?.inputSchema?.properties || {};
  const requiredFields = new Set(selectedTool?.inputSchema?.required || []);

  const getLatencyClass = (ms: number) => {
    if (ms < 200) return 'lat-fast';
    if (ms < 1000) return 'lat-mid';
    return 'lat-slow';
  };

  const handleCopyOutput = async () => {
    if (!callResult) return;
    const textToCopy = callResult.rawResponse
      ? JSON.stringify(callResult.rawResponse, null, 2)
      : callResult.error || '';
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedOutput(true);
      toast.success('Copied tool response to clipboard');
      setTimeout(() => setCopiedOutput(false), 1800);
    } catch {
      toast.error('Failed to copy output');
    }
  };

  return createPortal(
    <div
      className={`mcp-pg-overlay ${isClosing ? 'is-closing' : ''}`}
      onClick={handleClose}
    >
      <div
        className={`mcp-pg-card ${isClosing ? 'is-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="mcp-pg-header">
          <div className="mcp-pg-title-cluster">
            <div className="mcp-pg-icon-box">
              <CapabilityIcon
                type="mcp"
                category={server.category}
                name={server.name}
                size={19}
              />
            </div>
            <div className="mcp-pg-title-text">
              <div className="mcp-pg-title-row">
                <h3 className="mcp-pg-title">{server.name}</h3>
                <span className={`mcp-pg-transport-pill font-mono ${transport}`}>
                  {transport === 'sse' ? <Globe size={10} /> : <Terminal size={10} />}
                  <span>{transport.toUpperCase()}</span>
                </span>
                <span className={`mcp-pg-status-pill font-mono status-${status}`}>
                  <span className={`mcp-pg-status-dot status-${status}`} />
                  <span>
                    {status === 'connected'
                      ? `CONNECTED${protocolVersion ? ` (${protocolVersion})` : ''}`
                      : status === 'connecting'
                        ? 'CONNECTING...'
                        : status === 'error'
                          ? 'CONNECTION FAILED'
                          : 'DISCONNECTED'}
                  </span>
                </span>
              </div>
              <div className="mcp-pg-sub-telemetry font-mono">
                <span>MCP Interactive Playground & Tool Tester</span>
                {serverInfoName && <span className="mcp-pg-server-badge">{serverInfoName}</span>}
                {connectLatencyMs !== null && (
                  <span className={`mcp-pg-metric-chip ${getLatencyClass(connectLatencyMs)}`}>
                    <Clock size={10} />
                    <span>Handshake: {connectLatencyMs} ms</span>
                  </span>
                )}
                {listToolsLatencyMs !== null && (
                  <span className={`mcp-pg-metric-chip ${getLatencyClass(listToolsLatencyMs)}`}>
                    <Wrench size={10} />
                    <span>tools/list: {listToolsLatencyMs} ms</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mcp-pg-header-actions">
            {status === 'connected' ? (
              <>
                <button
                  type="button"
                  className="mcp-pg-btn secondary"
                  onClick={() => void handleConnect()}
                  title="Restart server & reconnect"
                >
                  <RotateCcw size={12} />
                  <span>Reconnect</span>
                </button>
                <button
                  type="button"
                  className="mcp-pg-btn danger"
                  onClick={() => void disconnectActiveSession()}
                  title="Terminate playground session"
                >
                  <Square size={11} />
                  <span>Disconnect</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                className="mcp-pg-btn primary"
                disabled={status === 'connecting'}
                onClick={() => void handleConnect()}
              >
                {status === 'connecting' ? (
                  <>
                    <Loader2 size={12} className="spin" />
                    <span>Spawning...</span>
                  </>
                ) : (
                  <>
                    <Play size={12} />
                    <span>Connect & Inspect</span>
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              className="mcp-pg-close-btn"
              onClick={handleClose}
              aria-label="Close Playground"
              title="Close (Esc)"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Target Transport & Environment Config Strip */}
        <div className="mcp-pg-config-bar">
          <div className="mcp-pg-config-inputs">
            {transport === 'stdio' ? (
              <>
                <div className="mcp-pg-inline-field cmd-field">
                  <span className="mcp-pg-inline-label font-mono">CMD</span>
                  <input
                    type="text"
                    className="mcp-pg-inline-input font-mono"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    placeholder="npx"
                  />
                </div>
                <div className="mcp-pg-inline-field args-field">
                  <span className="mcp-pg-inline-label font-mono">ARGS</span>
                  <input
                    type="text"
                    className="mcp-pg-inline-input font-mono"
                    value={argsText}
                    onChange={(e) => setArgsText(e.target.value)}
                    placeholder="-y @modelcontextprotocol/server-..."
                  />
                </div>
              </>
            ) : (
              <div className="mcp-pg-inline-field url-field">
                <span className="mcp-pg-inline-label font-mono">SSE / HTTP URL</span>
                <input
                  type="text"
                  className="mcp-pg-inline-input font-mono"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            )}

            <button
              type="button"
              className={`mcp-pg-env-toggle ${showEnvPanel ? 'open' : ''}`}
              onClick={() => setShowEnvPanel((prev) => !prev)}
            >
              <KeyRound size={12} />
              <span>Env Overrides ({envRows.length})</span>
              {resolvedEnvKeys.length > 0 && (
                <span className="mcp-pg-env-saved-dot" title={`Loaded ${resolvedEnvKeys.length} keys from config`} />
              )}
              <ChevronDown size={12} className={`mcp-pg-env-chevron ${showEnvPanel ? 'open' : ''}`} />
            </button>
          </div>

          <div className={`mcp-pg-env-drawer-wrap ${showEnvPanel ? 'open' : ''}`} aria-hidden={!showEnvPanel}>
            <div className="mcp-pg-env-drawer-inner">
              <div className="mcp-pg-env-drawer">
                <div className="mcp-pg-env-drawer-top">
                  <span className="mcp-pg-env-hint">
                    Non-empty values here override credentials during this playground test session only (not written to disk).
                  </span>
                  <button
                    type="button"
                    className="mcp-pg-add-env-btn"
                    onClick={() =>
                      setEnvRows((prev) => [
                        ...prev,
                        { id: `env-${Date.now()}`, key: '', value: '' },
                      ])
                    }
                  >
                    <Plus size={11} />
                    <span>Add Env Var</span>
                  </button>
                </div>
                {envRows.length === 0 ? (
                  <div className="mcp-pg-env-empty font-mono">No environment variables configured for this server.</div>
                ) : (
                  <div className="mcp-pg-env-rows">
                    {envRows.map((row) => {
                      const isResolvedOnDisk = row.key && resolvedEnvKeys.includes(row.key.trim());
                      const isRevealed = Boolean(revealedEnvIds[row.id]);
                      return (
                        <div key={row.id} className="mcp-pg-env-row">
                          <input
                            type="text"
                            className="mcp-pg-env-key font-mono"
                            placeholder="ENV_KEY"
                            value={row.key}
                            onChange={(e) =>
                              setEnvRows((prev) =>
                                prev.map((r) => (r.id === row.id ? { ...r, key: e.target.value } : r))
                              )
                            }
                          />
                          <div className="mcp-pg-env-val-wrap">
                            <input
                              type={isRevealed ? 'text' : 'password'}
                              className="mcp-pg-env-val font-mono"
                              placeholder={
                                isResolvedOnDisk
                                  ? 'Loaded securely from agent config (enter to override)...'
                                  : 'Enter temporary session value...'
                              }
                              value={row.value}
                              onChange={(e) =>
                                setEnvRows((prev) =>
                                  prev.map((r) => (r.id === row.id ? { ...r, value: e.target.value } : r))
                                )
                              }
                            />
                            <button
                              type="button"
                              className="mcp-pg-env-eye"
                              onClick={() =>
                                setRevealedEnvIds((prev) => ({ ...prev, [row.id]: !prev[row.id] }))
                              }
                              title={isRevealed ? 'Hide value' : 'Reveal value'}
                            >
                              {isRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                          </div>
                          {isResolvedOnDisk && (
                            <span className="mcp-pg-resolved-badge font-mono">CONFIGURED</span>
                          )}
                          <button
                            type="button"
                            className="mcp-pg-env-del"
                            onClick={() => setEnvRows((prev) => prev.filter((r) => r.id !== row.id))}
                            title="Remove row"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Connection Error Banner */}
        {connectError && (
          <div className="mcp-pg-error-banner">
            <AlertCircle size={14} className="mcp-pg-error-icon" />
            <span className="mcp-pg-error-text">{connectError}</span>
          </div>
        )}

        {/* Main Split Workspace */}
        <div className="mcp-pg-body">
          {/* Left: Tools Explorer */}
          <aside className="mcp-pg-tools-sidebar">
            <div className="mcp-pg-sidebar-header">
              <div className="mcp-pg-sidebar-title-row">
                <span className="mcp-pg-sidebar-title font-mono">TOOLS ({tools.length})</span>
                <button
                  type="button"
                  className="mcp-pg-refresh-btn"
                  disabled={status !== 'connected' || isRefreshingTools}
                  onClick={() => void handleRefreshTools()}
                  title="Re-run tools/list"
                >
                  <RefreshCw size={11} className={isRefreshingTools ? 'spin' : ''} />
                </button>
              </div>
              <div className="mcp-pg-tool-search-wrap">
                <Search size={12} className="mcp-pg-search-icon" />
                <input
                  type="text"
                  className="mcp-pg-tool-search-input"
                  placeholder="Filter tools..."
                  value={toolSearch}
                  onChange={(e) => setToolSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="mcp-pg-tools-list">
              {status !== 'connected' ? (
                <div className="mcp-pg-sidebar-empty">
                  <Wrench size={20} className="mcp-pg-empty-icon" />
                  <p>Click <strong>Connect & Inspect</strong> above to handshake with this server and discover its tools.</p>
                </div>
              ) : filteredTools.length === 0 ? (
                <div className="mcp-pg-sidebar-empty">
                  <p>{tools.length === 0 ? 'Server connected, but exposed 0 tools.' : 'No tools match your search.'}</p>
                </div>
              ) : (
                filteredTools.map((tool) => {
                  const reqCount = tool.inputSchema?.required?.length || 0;
                  const propCount = Object.keys(tool.inputSchema?.properties || {}).length;
                  const isActive = tool.name === selectedToolName;
                  return (
                    <button
                      type="button"
                      key={tool.name}
                      className={`mcp-pg-tool-item ${isActive ? 'active' : ''}`}
                      onClick={() => handleSelectTool(tool)}
                    >
                      <div className="mcp-pg-tool-item-top">
                        <span className="mcp-pg-tool-name font-mono">{tool.name}</span>
                        {reqCount > 0 ? (
                          <span className="mcp-pg-tool-arg-badge font-mono">{reqCount} req</span>
                        ) : propCount > 0 ? (
                          <span className="mcp-pg-tool-arg-badge opt font-mono">{propCount} opt</span>
                        ) : null}
                      </div>
                      {tool.description && (
                        <span className="mcp-pg-tool-desc">{tool.description}</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* Right: Argument Form + Result Telemetry */}
          <div className="mcp-pg-workspace">
            {selectedTool ? (
              <>
                <div className="mcp-pg-runner-card">
                  <div className="mcp-pg-runner-header">
                    <div className="mcp-pg-runner-info">
                      <div className="mcp-pg-runner-title-row">
                        <Wrench size={14} className="mcp-pg-wrench" />
                        <span className="mcp-pg-runner-name font-mono">{selectedTool.name}</span>
                      </div>
                      {selectedTool.description && (
                        <p className="mcp-pg-runner-desc">{selectedTool.description}</p>
                      )}
                    </div>

                    <div className="mcp-pg-runner-actions">
                      <div className="mcp-pg-mode-switch" role="group" aria-label="Argument editor mode">
                        <button
                          type="button"
                          className={`mcp-pg-mode-btn ${argInputMode === 'form' ? 'active' : ''}`}
                          onClick={() => handleSwitchArgMode('form')}
                        >
                          <FormInput size={11} />
                          <span>Form</span>
                        </button>
                        <button
                          type="button"
                          className={`mcp-pg-mode-btn ${argInputMode === 'json' ? 'active' : ''}`}
                          onClick={() => handleSwitchArgMode('json')}
                        >
                          <Code2 size={11} />
                          <span>Raw JSON</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        className="mcp-pg-btn secondary compact"
                        onClick={() => populateToolForm(selectedTool)}
                        title="Reset argument inputs to schema defaults"
                      >
                        Reset
                      </button>

                      <button
                        type="button"
                        className="mcp-pg-btn execute"
                        disabled={status !== 'connected' || isExecuting}
                        onClick={() => void handleExecuteTool()}
                        title="Execute tools/call (Ctrl+Enter)"
                      >
                        {isExecuting ? (
                          <>
                            <Loader2 size={12} className="spin" />
                            <span>Running...</span>
                          </>
                        ) : (
                          <>
                            <Play size={12} />
                            <span>Execute Tool</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="mcp-pg-args-body">
                    {jsonEditorError && (
                      <div className="mcp-pg-inline-json-err font-mono">
                        <AlertCircle size={12} />
                        <span>{jsonEditorError}</span>
                      </div>
                    )}

                    {argInputMode === 'json' ? (
                      <textarea
                        className="mcp-pg-raw-json-textarea font-mono"
                        value={jsonEditorText}
                        onChange={(e) => {
                          setJsonEditorText(e.target.value);
                          setJsonEditorError(null);
                        }}
                        rows={7}
                        spellCheck={false}
                        placeholder="{}"
                      />
                    ) : Object.keys(schemaProps).length === 0 ? (
                      <div className="mcp-pg-no-args font-mono">
                        This tool accepts no parameters. Click <strong>Execute Tool</strong> to invoke it.
                      </div>
                    ) : (
                      <div className="mcp-pg-form-grid">
                        {Object.entries(schemaProps).map(([propName, prop]) => {
                          const kind = normalizeSchemaType(prop);
                          const isRequired = requiredFields.has(propName);
                          const rawTypeLabel = Array.isArray(prop.type) ? prop.type.join(' | ') : prop.type || kind;

                          return (
                            <div key={propName} className="mcp-pg-form-field">
                              <div className="mcp-pg-field-label-row">
                                <label className="mcp-pg-field-name font-mono">{propName}</label>
                                <span className="mcp-pg-field-type font-mono">{rawTypeLabel}</span>
                                {isRequired && <span className="mcp-pg-field-req font-mono">REQUIRED</span>}
                              </div>
                              {prop.description && (
                                <p className="mcp-pg-field-desc">{prop.description}</p>
                              )}

                              {kind === 'enum' && Array.isArray(prop.enum) ? (
                                <PlaygroundEnumSelect
                                  options={prop.enum}
                                  value={formValues[propName]}
                                  allowUnset={!isRequired}
                                  onChange={(chosen) =>
                                    setFormValues((prev) => ({ ...prev, [propName]: chosen }))
                                  }
                                />
                              ) : kind === 'boolean' ? (
                                <div className="mcp-pg-bool-row">
                                  <button
                                    type="button"
                                    className={`mcp-pg-bool-btn ${formValues[propName] === true ? 'on' : ''}`}
                                    onClick={() =>
                                      setFormValues((prev) => ({
                                        ...prev,
                                        [propName]: !(prev[propName] === true),
                                      }))
                                    }
                                  >
                                    <span className="mcp-pg-bool-dot" />
                                    <span className="font-mono">{formValues[propName] === true ? 'true' : 'false'}</span>
                                  </button>
                                </div>
                              ) : kind === 'number' ? (
                                <input
                                  type="number"
                                  className="mcp-pg-input font-mono"
                                  value={formValues[propName] !== undefined ? String(formValues[propName]) : ''}
                                  placeholder={prop.default !== undefined ? String(prop.default) : '0'}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setFormValues((prev) => ({
                                      ...prev,
                                      [propName]: val === '' ? undefined : Number(val),
                                    }));
                                  }}
                                />
                              ) : kind === 'object' || kind === 'array' ? (
                                <textarea
                                  className="mcp-pg-textarea font-mono"
                                  rows={3}
                                  spellCheck={false}
                                  placeholder={kind === 'array' ? '[]' : '{}'}
                                  value={
                                    complexFieldText[propName] !== undefined
                                      ? complexFieldText[propName]
                                      : formValues[propName] !== undefined
                                        ? JSON.stringify(formValues[propName], null, 2)
                                        : ''
                                  }
                                  onChange={(e) => {
                                    const txt = e.target.value;
                                    setComplexFieldText((prev) => ({ ...prev, [propName]: txt }));
                                    try {
                                      if (txt.trim()) {
                                        const parsed = JSON.parse(txt);
                                        setFormValues((prev) => ({ ...prev, [propName]: parsed }));
                                      }
                                    } catch {}
                                  }}
                                />
                              ) : (
                                <input
                                  type="text"
                                  className="mcp-pg-input font-mono"
                                  value={formValues[propName] !== undefined ? String(formValues[propName]) : ''}
                                  placeholder={prop.default !== undefined ? String(prop.default) : `Enter ${propName}...`}
                                  onChange={(e) =>
                                    setFormValues((prev) => ({ ...prev, [propName]: e.target.value }))
                                  }
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Output & Telemetry Panel */}
                <div className="mcp-pg-output-card">
                  <div className="mcp-pg-output-header">
                    <div className="mcp-pg-output-status-cluster">
                      <span className="mcp-pg-output-heading font-mono">RESPONSE</span>
                      {callResult && (
                        <>
                          <span className={`mcp-pg-res-badge font-mono ${callResult.success ? 'ok' : 'err'}`}>
                            {callResult.success ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                            <span>{callResult.success ? 'SUCCESS' : 'TOOL ERROR'}</span>
                          </span>
                          <span className={`mcp-pg-metric-chip font-mono ${getLatencyClass(callResult.latencyMs)}`}>
                            <Zap size={10} />
                            <span>{callResult.latencyMs} ms</span>
                          </span>
                        </>
                      )}
                    </div>

                    <div className="mcp-pg-output-tabs-cluster">
                      <div className="mcp-pg-output-tabs font-mono">
                        <button
                          type="button"
                          className={`mcp-pg-out-tab ${outputTab === 'formatted' ? 'active' : ''}`}
                          onClick={() => setOutputTab('formatted')}
                        >
                          Formatted
                        </button>
                        <button
                          type="button"
                          className={`mcp-pg-out-tab ${outputTab === 'raw' ? 'active' : ''}`}
                          onClick={() => setOutputTab('raw')}
                        >
                          Raw JSON
                        </button>
                        <button
                          type="button"
                          className={`mcp-pg-out-tab ${outputTab === 'stderr' ? 'active' : ''}`}
                          onClick={() => setOutputTab('stderr')}
                        >
                          <ScrollText size={10} />
                          <span>Stderr ({stderrLogs.length})</span>
                        </button>
                      </div>

                      {callResult && (
                        <button
                          type="button"
                          className="mcp-pg-copy-out-btn font-mono"
                          onClick={() => void handleCopyOutput()}
                        >
                          {copiedOutput ? <Check size={11} className="text-emerald" /> : <Copy size={11} />}
                          <span>{copiedOutput ? 'Copied' : 'Copy'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {callHistory.length > 0 && (
                    <div className="mcp-pg-history-strip">
                      <span className="mcp-pg-history-label font-mono">RECENT:</span>
                      {callHistory.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          className={`mcp-pg-history-chip font-mono ${item.success ? 'ok' : 'err'}`}
                          onClick={() => {
                            setCallResult(item.result);
                            setOutputTab('formatted');
                          }}
                          title={`${item.toolName} at ${item.timestamp}`}
                        >
                          <span>{item.toolName}</span>
                          <span>{item.latencyMs}ms</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="mcp-pg-output-body">
                    {outputTab === 'stderr' ? (
                      stderrLogs.length === 0 ? (
                        <div className="mcp-pg-output-empty font-mono">No stderr messages emitted during this session.</div>
                      ) : (
                        <pre className="mcp-pg-output-pre font-mono">{stderrLogs.join('\n')}</pre>
                      )
                    ) : !callResult ? (
                      <div className="mcp-pg-output-empty font-mono">
                        Execute a tool call to inspect structured output and round-trip latency telemetry.
                      </div>
                    ) : outputTab === 'raw' ? (
                      <pre className="mcp-pg-output-pre font-mono">
                        {JSON.stringify(callResult.rawResponse ?? { error: callResult.error }, null, 2)}
                      </pre>
                    ) : (
                      <div className="mcp-pg-formatted-blocks">
                        {callResult.error && (
                          <div className="mcp-pg-call-err-box font-mono">{callResult.error}</div>
                        )}
                        {callResult.content && callResult.content.length > 0 ? (
                          callResult.content.map((block, idx) => {
                            if (block.type === 'text' && typeof block.text === 'string') {
                              return (
                                <pre key={idx} className="mcp-pg-output-pre font-mono">
                                  {formatJsonTextIfValid(block.text)}
                                </pre>
                              );
                            }
                            return (
                              <pre key={idx} className="mcp-pg-output-pre font-mono">
                                {JSON.stringify(block, null, 2)}
                              </pre>
                            );
                          })
                        ) : callResult.structuredContent !== undefined ? (
                          <pre className="mcp-pg-output-pre font-mono">
                            {JSON.stringify(callResult.structuredContent, null, 2)}
                          </pre>
                        ) : !callResult.error ? (
                          <pre className="mcp-pg-output-pre font-mono">
                            {JSON.stringify(callResult.rawResponse ?? {}, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="mcp-pg-workspace-placeholder">
                <div className="mcp-pg-placeholder-icon">
                  <Terminal size={24} />
                </div>
                <h4>{status === 'connected' ? 'Select a Tool to Execute' : 'MCP Interactive Playground'}</h4>
                <p>
                  {status === 'connected'
                    ? 'Pick any tool from the sidebar to generate its typed parameter form and inspect live output & latency.'
                    : 'Verify stdio binaries or SSE endpoints, inspect exposed tool schemas via tools/list, and test real tools/call requests safely.'}
                </p>
                {stderrLogs.length > 0 && (
                  <div className="mcp-pg-placeholder-logs">
                    <div className="mcp-pg-placeholder-log-title font-mono">STDERR OUTPUT</div>
                    <pre className="mcp-pg-output-pre font-mono">{stderrLogs.join('\n')}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .mcp-pg-overlay {
          position:fixed;
          inset:0;
          background:var(--bg-modal-overlay);
          backdrop-filter:blur(8px);
          -webkit-backdrop-filter:blur(8px);
          display:flex;
          align-items:center;
          justify-content:center;
          z-index:10050;
          padding:20px;
          box-sizing:border-box;
          animation:mcpPgFadeIn 0.16s ease-out forwards;
        }

        .mcp-pg-overlay.is-closing {
          animation:mcpPgFadeOut 0.16s ease-in forwards;
          pointer-events:none;
        }

        @keyframes mcpPgFadeIn {
          from { opacity:0; }
          to { opacity:1; }
        }

        @keyframes mcpPgFadeOut {
          from { opacity:1; }
          to { opacity:0; }
        }

        .mcp-pg-card {
          width:100%;
          max-width:1060px;
          height:min(88vh, 760px);
          background:var(--bg-surface);
          border:1px solid var(--border-subtle);
          border-radius:14px;
          box-shadow:var(--shadow-modal);
          display:flex;
          flex-direction:column;
          overflow:hidden;
          box-sizing:border-box;
          animation:mcpPgCardIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .mcp-pg-card.is-closing {
          animation:mcpPgCardOut 0.16s ease-in forwards;
        }

        @keyframes mcpPgCardIn {
          from { opacity:0; transform:scale(0.97) translateY(8px); }
          to { opacity:1; transform:scale(1) translateY(0); }
        }

        @keyframes mcpPgCardOut {
          from { opacity:1; transform:scale(1); }
          to { opacity:0; transform:scale(0.97); }
        }

        .mcp-pg-header {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:14px;
          padding:14px 18px;
          background:var(--bg-header);
          border-bottom:1px solid var(--border-subtle);
          flex-shrink:0;
          flex-wrap:wrap;
        }

        .mcp-pg-title-cluster {
          display:flex;
          align-items:center;
          gap:12px;
          min-width:0;
          flex:1;
        }

        .mcp-pg-icon-box {
          width:36px;
          height:36px;
          border-radius:9px;
          background:var(--status-cyan-dim);
          border:1px solid rgba(2, 132, 199, 0.32);
          display:flex;
          align-items:center;
          justify-content:center;
          flex-shrink:0;
        }

        .mcp-pg-title-text {
          display:flex;
          flex-direction:column;
          gap:3px;
          min-width:0;
        }

        .mcp-pg-title-row {
          display:flex;
          align-items:center;
          gap:8px;
          flex-wrap:wrap;
        }

        .mcp-pg-title {
          margin:0;
          font-size:15px;
          font-weight:700;
          color:var(--text-primary);
        }

        .mcp-pg-transport-pill {
          display:inline-flex;
          align-items:center;
          gap:4px;
          font-size:10px;
          font-weight:700;
          padding:2px 6px;
          border-radius:4px;
          background:var(--bg-pill);
          border:1px solid var(--border-subtle);
          color:var(--text-secondary);
        }

        .mcp-pg-status-pill {
          display:inline-flex;
          align-items:center;
          gap:5px;
          font-size:10px;
          font-weight:700;
          padding:2px 7px;
          border-radius:4px;
          background:var(--bg-pill);
          border:1px solid var(--border-subtle);
          color:var(--text-secondary);
        }

        .mcp-pg-status-pill.status-connected {
          background:var(--status-green-dim);
          border-color:rgba(16, 185, 129, 0.34);
          color:var(--status-green-text);
        }

        .mcp-pg-status-pill.status-connecting {
          background:var(--status-amber-dim);
          border-color:rgba(245, 158, 11, 0.34);
          color:var(--status-amber-text);
        }

        .mcp-pg-status-pill.status-error {
          background:var(--status-red-dim);
          border-color:rgba(239, 68, 68, 0.36);
          color:var(--status-red-text);
        }

        .mcp-pg-status-dot {
          width:6px;
          height:6px;
          border-radius:50%;
          background:var(--text-muted);
        }

        .mcp-pg-status-dot.status-connected {
          background:var(--status-green);
        }

        .mcp-pg-status-dot.status-connecting {
          background:var(--status-amber);
        }

        .mcp-pg-status-dot.status-error {
          background:var(--status-red);
        }

        .mcp-pg-sub-telemetry {
          display:flex;
          align-items:center;
          gap:8px;
          flex-wrap:wrap;
          font-size:10.5px;
          color:var(--text-muted);
        }

        .mcp-pg-server-badge {
          background:var(--bg-pill);
          border:1px solid var(--border-subtle);
          padding:1px 6px;
          border-radius:4px;
          color:var(--text-secondary);
        }

        .mcp-pg-metric-chip {
          display:inline-flex;
          align-items:center;
          gap:4px;
          padding:1px 6px;
          border-radius:4px;
          font-size:10px;
          font-weight:700;
          border:1px solid;
        }

        .mcp-pg-metric-chip.lat-fast {
          background:var(--status-green-dim);
          border-color:rgba(16, 185, 129, 0.32);
          color:var(--status-green-text);
        }

        .mcp-pg-metric-chip.lat-mid {
          background:var(--status-amber-dim);
          border-color:rgba(217, 119, 6, 0.32);
          color:var(--status-amber-text);
        }

        .mcp-pg-metric-chip.lat-slow {
          background:var(--status-red-dim);
          border-color:rgba(220, 38, 38, 0.34);
          color:var(--status-red-text);
        }

        .mcp-pg-header-actions {
          display:flex;
          align-items:center;
          gap:8px;
          flex-shrink:0;
        }

        .mcp-pg-btn {
          display:inline-flex;
          align-items:center;
          justify-content:center;
          gap:6px;
          height:30px;
          padding:0 12px;
          border-radius:6px;
          font-size:11.5px;
          font-weight:600;
          cursor:pointer;
          border:1px solid var(--border-hover);
          background:var(--bg-pill);
          color:var(--text-primary);
          transition:all 0.14s ease;
          white-space:nowrap;
        }

        .mcp-pg-btn.compact {
          height:28px;
          padding:0 10px;
          font-size:11px;
        }

        .mcp-pg-btn:disabled {
          opacity:0.55;
          cursor:not-allowed;
        }

        .mcp-pg-btn.secondary:hover:not(:disabled) {
          background:var(--bg-elevated-hover);
          border-color:var(--border-strong);
        }

        .mcp-pg-btn.primary {
          background:#0284c7;
          border-color:#0369a1;
          color:#ffffff;
          box-shadow:0 2px 8px rgba(2, 132, 199, 0.28);
        }

        .mcp-pg-btn.primary:hover:not(:disabled) {
          background:#0369a1;
        }

        .mcp-pg-btn.execute {
          height:28px;
          background:#7c3aed;
          border-color:#6d28d9;
          color:#ffffff;
          box-shadow:0 2px 8px rgba(124, 58, 237, 0.28);
        }

        .mcp-pg-btn.execute:hover:not(:disabled) {
          background:#6d28d9;
        }

        .mcp-pg-btn.danger {
          background:var(--status-red-dim);
          border-color:rgba(220, 38, 38, 0.36);
          color:var(--status-red-text);
        }

        .mcp-pg-btn.danger:hover:not(:disabled) {
          background:#dc2626;
          border-color:#b91c1c;
          color:#ffffff;
        }

        .mcp-pg-close-btn {
          width:30px;
          height:30px;
          border-radius:6px;
          border:1px solid var(--border-subtle);
          background:var(--bg-pill);
          color:var(--text-secondary);
          display:inline-flex;
          align-items:center;
          justify-content:center;
          cursor:pointer;
        }

        .mcp-pg-close-btn:hover {
          background:var(--bg-elevated-hover);
          color:var(--text-primary);
          border-color:var(--border-hover);
        }

        .mcp-pg-config-bar {
          padding:10px 18px;
          background:var(--bg-surface-alt);
          border-bottom:1px solid var(--border-subtle);
          display:flex;
          flex-direction:column;
          gap:10px;
          flex-shrink:0;
        }

        .mcp-pg-config-inputs {
          display:flex;
          align-items:center;
          gap:8px;
          flex-wrap:wrap;
        }

        .mcp-pg-inline-field {
          display:flex;
          align-items:center;
          height:30px;
          background:var(--bg-input);
          border:1px solid var(--border-hover);
          border-radius:6px;
          overflow:hidden;
        }

        .mcp-pg-inline-field.cmd-field {
          width:170px;
        }

        .mcp-pg-inline-field.args-field,
        .mcp-pg-inline-field.url-field {
          flex:1;
          min-width:220px;
        }

        .mcp-pg-inline-label {
          font-size:9.5px;
          font-weight:700;
          color:var(--text-secondary);
          background:var(--bg-pill);
          padding:0 8px;
          height:100%;
          display:inline-flex;
          align-items:center;
          border-right:1px solid var(--border-subtle);
          white-space:nowrap;
        }

        .mcp-pg-inline-input {
          flex:1;
          min-width:0;
          height:100%;
          background:transparent;
          border:none;
          outline:none;
          padding:0 9px;
          font-size:11.5px;
          color:var(--text-primary);
        }

        .mcp-pg-env-toggle {
          display:inline-flex;
          align-items:center;
          gap:6px;
          height:30px;
          padding:0 11px;
          border-radius:8px;
          background:var(--bg-pill);
          border:1px solid var(--border-subtle);
          color:var(--text-primary);
          font-size:11px;
          font-weight:600;
          cursor:pointer;
          white-space:nowrap;
          transition:background 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
        }

        .mcp-pg-env-toggle:hover {
          background:var(--bg-elevated-hover);
          border-color:var(--border-hover);
        }

        .mcp-pg-env-toggle.open {
          background:var(--bg-surface);
          border-color:var(--border-hover);
          color:var(--text-primary);
          box-shadow:var(--shadow-card);
        }

        .mcp-pg-env-chevron {
          transform:rotate(-90deg);
          transition:transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), color 0.14s ease;
          flex-shrink:0;
          color:var(--text-muted);
        }

        .mcp-pg-env-chevron.open {
          transform:rotate(0deg);
          color:var(--text-primary);
        }

        .mcp-pg-env-saved-dot {
          width:6px;
          height:6px;
          border-radius:50%;
          background:var(--status-green);
        }

        .mcp-pg-env-drawer-wrap {
          display:grid;
          grid-template-rows:0fr;
          opacity:0;
          margin-top:-10px;
          pointer-events:none;
          transition:grid-template-rows 0.2s cubic-bezier(0.16, 1, 0.3, 1),
                      opacity 0.16s ease,
                      margin-top 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .mcp-pg-env-drawer-wrap.open {
          grid-template-rows:1fr;
          opacity:1;
          margin-top:0;
          pointer-events:auto;
        }

        .mcp-pg-env-drawer-inner {
          overflow:hidden;
          min-height:0;
          padding:2px;
          margin:-2px;
        }

        .mcp-pg-env-drawer {
          background:var(--bg-surface);
          border:1px solid var(--border-hover);
          border-radius:8px;
          padding:11px 13px;
          box-shadow:var(--shadow-dropdown);
          display:flex;
          flex-direction:column;
          gap:9px;
          max-height:176px;
          overflow-y:auto;
          transform:translateY(-4px) scale(0.99);
          transition:transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .mcp-pg-env-drawer-wrap.open .mcp-pg-env-drawer {
          transform:translateY(0) scale(1);
        }

        .mcp-pg-env-drawer-top {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:8px;
        }

        .mcp-pg-env-hint {
          font-size:11px;
          color:var(--text-secondary);
        }

        .mcp-pg-add-env-btn {
          display:inline-flex;
          align-items:center;
          gap:4px;
          height:25px;
          padding:0 9px;
          border-radius:5px;
          background:var(--accent-purple-dim);
          border:1px solid rgba(124, 58, 237, 0.32);
          color:var(--accent-purple-text);
          font-size:10.5px;
          font-weight:600;
          cursor:pointer;
          white-space:nowrap;
          transition:all 0.14s ease;
        }

        .mcp-pg-add-env-btn:hover {
          background:rgba(124, 58, 237, 0.22);
          border-color:rgba(124, 58, 237, 0.55);
        }

        .mcp-pg-env-empty {
          font-size:11px;
          color:var(--text-muted);
          padding:4px 0;
        }

        .mcp-pg-env-rows {
          display:flex;
          flex-direction:column;
          gap:6px;
        }

        .mcp-pg-env-row {
          display:flex;
          align-items:center;
          gap:6px;
        }

        .mcp-pg-env-key {
          width:210px;
          height:28px;
          background:var(--bg-input);
          border:1px solid var(--border-hover);
          border-radius:5px;
          padding:0 8px;
          font-size:11px;
          color:var(--text-primary);
          outline:none;
          transition:border-color 0.14s ease, box-shadow 0.14s ease;
        }

        .mcp-pg-env-key:focus {
          border-color:var(--border-strong);
          box-shadow:0 0 0 2px rgba(148, 163, 184, 0.16);
        }

        .mcp-pg-env-val-wrap {
          flex:1;
          display:flex;
          align-items:center;
          height:28px;
          background:var(--bg-input);
          border:1px solid var(--border-hover);
          border-radius:5px;
          overflow:hidden;
          transition:border-color 0.14s ease, box-shadow 0.14s ease;
        }

        .mcp-pg-env-val-wrap:focus-within {
          border-color:var(--border-strong);
          box-shadow:0 0 0 2px rgba(148, 163, 184, 0.16);
        }

        .mcp-pg-env-val {
          flex:1;
          height:100%;
          border:none;
          background:transparent;
          padding:0 8px;
          font-size:11px;
          color:var(--text-primary);
          outline:none;
        }

        .mcp-pg-env-eye,
        .mcp-pg-env-del {
          background:transparent;
          border:none;
          color:var(--text-secondary);
          padding:0 6px;
          height:28px;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          cursor:pointer;
          border-radius:4px;
          transition:color 0.12s ease, background 0.12s ease;
        }

        .mcp-pg-env-eye:hover {
          color:var(--text-primary);
          background:var(--bg-elevated-hover);
        }

        .mcp-pg-env-del:hover {
          color:var(--status-red-text);
          background:var(--status-red-dim);
        }

        .mcp-pg-resolved-badge {
          font-size:9px;
          font-weight:700;
          color:var(--status-green-text);
          background:var(--status-green-dim);
          border:1px solid rgba(16, 185, 129, 0.3);
          padding:2px 6px;
          border-radius:4px;
          white-space:nowrap;
        }

        .mcp-pg-error-banner {
          display:flex;
          align-items:center;
          gap:8px;
          padding:8px 18px;
          background:var(--status-red-dim);
          border-bottom:1px solid rgba(220, 38, 38, 0.3);
          color:var(--status-red-text);
          font-size:12px;
          font-weight:500;
          flex-shrink:0;
        }

        .mcp-pg-error-icon {
          flex-shrink:0;
        }

        .mcp-pg-body {
          flex:1;
          min-height:0;
          display:grid;
          grid-template-columns:260px 1fr;
          background:var(--bg-surface-alt);
        }

        .mcp-pg-tools-sidebar {
          display:flex;
          flex-direction:column;
          min-height:0;
          background:var(--bg-surface);
          border-right:1px solid var(--border-subtle);
        }

        .mcp-pg-sidebar-header {
          padding:10px 12px;
          border-bottom:1px solid var(--border-subtle);
          display:flex;
          flex-direction:column;
          gap:8px;
          flex-shrink:0;
        }

        .mcp-pg-sidebar-title-row {
          display:flex;
          align-items:center;
          justify-content:space-between;
        }

        .mcp-pg-sidebar-title {
          font-size:10px;
          font-weight:700;
          letter-spacing:0.05em;
          color:var(--text-secondary);
        }

        .mcp-pg-refresh-btn {
          width:24px;
          height:24px;
          border-radius:5px;
          border:1px solid var(--border-subtle);
          background:var(--bg-pill);
          color:var(--text-primary);
          display:inline-flex;
          align-items:center;
          justify-content:center;
          cursor:pointer;
        }

        .mcp-pg-refresh-btn:disabled {
          opacity:0.45;
          cursor:not-allowed;
        }

        .mcp-pg-tool-search-wrap {
          position:relative;
          display:flex;
          align-items:center;
        }

        .mcp-pg-search-icon {
          position:absolute;
          left:8px;
          color:var(--text-muted);
          pointer-events:none;
        }

        .mcp-pg-tool-search-input {
          width:100%;
          height:28px;
          background:var(--bg-input);
          border:1px solid var(--border-hover);
          border-radius:6px;
          padding:0 10px 0 26px;
          font-size:11.5px;
          color:var(--text-primary);
          outline:none;
        }

        .mcp-pg-tool-search-input:focus {
          border-color:var(--border-strong);
          box-shadow:0 0 0 2px rgba(148, 163, 184, 0.14);
        }

        .mcp-pg-tools-list {
          flex:1;
          overflow-y:auto;
          padding:8px;
          display:flex;
          flex-direction:column;
          gap:4px;
        }

        .mcp-pg-sidebar-empty {
          padding:28px 14px;
          text-align:center;
          display:flex;
          flex-direction:column;
          align-items:center;
          gap:8px;
          color:var(--text-muted);
          font-size:11.5px;
          line-height:1.45;
        }

        .mcp-pg-empty-icon {
          color:var(--status-cyan-text);
          opacity:0.75;
        }

        .mcp-pg-tool-item {
          width:100%;
          text-align:left;
          display:flex;
          flex-direction:column;
          gap:3px;
          padding:8px 10px;
          border-radius:7px;
          background:transparent;
          border:1px solid transparent;
          cursor:pointer;
          transition:all 0.12s ease;
        }

        .mcp-pg-tool-item:hover {
          background:var(--bg-surface-hover);
          border-color:var(--border-subtle);
        }

        .mcp-pg-tool-item.active {
          background:var(--status-cyan-dim);
          border-color:rgba(2, 132, 199, 0.36);
        }

        .mcp-pg-tool-item-top {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:6px;
        }

        .mcp-pg-tool-name {
          font-size:12px;
          font-weight:700;
          color:var(--text-primary);
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }

        .mcp-pg-tool-item.active .mcp-pg-tool-name {
          color:var(--status-cyan-text);
        }

        .mcp-pg-tool-arg-badge {
          font-size:9px;
          font-weight:700;
          padding:1px 5px;
          border-radius:3px;
          background:var(--accent-purple-dim);
          color:var(--accent-purple-text);
          border:1px solid rgba(124, 58, 237, 0.28);
          flex-shrink:0;
        }

        .mcp-pg-tool-arg-badge.opt {
          background:var(--bg-pill);
          color:var(--text-secondary);
          border-color:var(--border-subtle);
        }

        .mcp-pg-tool-desc {
          font-size:10.5px;
          color:var(--text-muted);
          display:-webkit-box;
          -webkit-line-clamp:2;
          -webkit-box-orient:vertical;
          overflow:hidden;
          line-height:1.35;
        }

        .mcp-pg-workspace {
          display:flex;
          flex-direction:column;
          min-height:0;
          overflow-y:auto;
          padding:14px 16px;
          gap:12px;
        }

        .mcp-pg-runner-card,
        .mcp-pg-output-card {
          background:var(--bg-card);
          border:1px solid var(--border-subtle);
          border-radius:10px;
          box-shadow:var(--shadow-card);
          display:flex;
          flex-direction:column;
          overflow:hidden;
          flex-shrink:0;
        }

        .mcp-pg-output-card {
          flex:1;
          min-height:200px;
        }

        .mcp-pg-runner-header {
          padding:12px 14px;
          border-bottom:1px solid var(--border-subtle);
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:12px;
          flex-wrap:wrap;
        }

        .mcp-pg-runner-info {
          display:flex;
          flex-direction:column;
          gap:3px;
          min-width:0;
          flex:1;
        }

        .mcp-pg-runner-title-row {
          display:flex;
          align-items:center;
          gap:7px;
        }

        .mcp-pg-wrench {
          color:var(--accent-purple-text);
        }

        .mcp-pg-runner-name {
          font-size:13.5px;
          font-weight:700;
          color:var(--text-primary);
        }

        .mcp-pg-runner-desc {
          margin:0;
          font-size:11.5px;
          color:var(--text-secondary);
          line-height:1.4;
        }

        .mcp-pg-runner-actions {
          display:flex;
          align-items:center;
          gap:7px;
          flex-shrink:0;
        }

        .mcp-pg-mode-switch,
        .mcp-pg-output-tabs {
          display:inline-flex;
          align-items:center;
          background:var(--bg-toggle-group);
          border:1px solid var(--border-subtle);
          border-radius:6px;
          padding:2px;
          gap:2px;
        }

        .mcp-pg-mode-btn,
        .mcp-pg-out-tab {
          display:inline-flex;
          align-items:center;
          gap:4px;
          height:22px;
          padding:0 8px;
          border:none;
          border-radius:4px;
          background:transparent;
          color:var(--text-secondary);
          font-size:10.5px;
          font-weight:600;
          cursor:pointer;
        }

        .mcp-pg-mode-btn.active,
        .mcp-pg-out-tab.active {
          background:var(--bg-segment-active);
          color:var(--text-primary);
          box-shadow:var(--shadow-card);
        }

        .mcp-pg-args-body {
          padding:12px 14px;
          display:flex;
          flex-direction:column;
          gap:10px;
          max-height:240px;
          overflow-y:auto;
        }

        .mcp-pg-inline-json-err {
          display:flex;
          align-items:center;
          gap:6px;
          padding:6px 10px;
          border-radius:6px;
          background:var(--status-red-dim);
          color:var(--status-red-text);
          font-size:11px;
        }

        .mcp-pg-no-args {
          font-size:11.5px;
          color:var(--text-muted);
          padding:8px 0;
        }

        .mcp-pg-form-grid {
          display:grid;
          grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));
          gap:10px 14px;
        }

        .mcp-pg-form-field {
          display:flex;
          flex-direction:column;
          gap:4px;
        }

        .mcp-pg-field-label-row {
          display:flex;
          align-items:center;
          gap:6px;
        }

        .mcp-pg-field-name {
          font-size:11.5px;
          font-weight:700;
          color:var(--text-primary);
        }

        .mcp-pg-field-type {
          font-size:9.5px;
          color:var(--text-muted);
          background:var(--bg-pill);
          padding:1px 5px;
          border-radius:3px;
        }

        .mcp-pg-field-req {
          font-size:9px;
          font-weight:700;
          color:var(--status-red-text);
          background:var(--status-red-dim);
          padding:1px 4px;
          border-radius:3px;
        }

        .mcp-pg-field-desc {
          margin:0;
          font-size:10.5px;
          color:var(--text-muted);
          line-height:1.3;
        }

        .mcp-pg-input,
        .mcp-pg-textarea,
        .mcp-pg-raw-json-textarea {
          width:100%;
          box-sizing:border-box;
          background:var(--bg-input);
          border:1px solid var(--border-hover);
          border-radius:6px;
          padding:6px 9px;
          font-size:11.5px;
          color:var(--text-primary);
          outline:none;
        }

        .mcp-pg-input {
          height:30px;
        }

        .mcp-pg-input:focus,
        .mcp-pg-textarea:focus,
        .mcp-pg-raw-json-textarea:focus {
          border-color:var(--border-strong);
          box-shadow:0 0 0 2px rgba(148, 163, 184, 0.16);
        }

        .mcp-pg-select-wrap {
          position:relative;
          width:100%;
        }

        .mcp-pg-select-trigger {
          width:100%;
          height:32px;
          box-sizing:border-box;
          background:var(--bg-input);
          border:1px solid var(--border-hover);
          border-radius:8px;
          padding:0 10px;
          font-size:11.5px;
          color:var(--text-primary);
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:8px;
          cursor:pointer;
          outline:none;
          transition:border-color 0.14s ease, box-shadow 0.14s ease, background 0.14s ease;
        }

        .mcp-pg-select-trigger:hover {
          border-color:var(--border-strong);
          background:var(--bg-surface);
        }

        .mcp-pg-select-trigger.open,
        .mcp-pg-select-trigger:focus-visible {
          background:var(--bg-surface);
          border-color:var(--border-strong);
          box-shadow:var(--shadow-card);
        }

        .mcp-pg-select-trigger.placeholder .mcp-pg-select-value {
          color:var(--text-muted);
        }

        .mcp-pg-select-value {
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
          min-width:0;
          text-align:left;
        }

        .mcp-pg-select-chevron {
          color:var(--text-muted);
          flex-shrink:0;
          transition:transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), color 0.14s ease;
        }

        .mcp-pg-select-chevron.open {
          transform:rotate(180deg);
          color:var(--text-primary);
        }

        .mcp-pg-select-menu {
          background:var(--bg-surface);
          border:1px solid var(--border-hover);
          border-radius:8px;
          box-shadow:var(--shadow-dropdown);
          padding:4px;
          display:flex;
          flex-direction:column;
          gap:2px;
          overflow-y:auto;
          box-sizing:border-box;
        }

        .mcp-pg-select-menu.dir-down {
          transform-origin:top center;
          animation:mcpPgSelectDownIn 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .mcp-pg-select-menu.dir-up {
          transform-origin:bottom center;
          animation:mcpPgSelectUpIn 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes mcpPgSelectDownIn {
          from { opacity:0; transform:translateY(-4px) scale(0.98); }
          to { opacity:1; transform:translateY(0) scale(1); }
        }

        @keyframes mcpPgSelectUpIn {
          from { opacity:0; transform:translateY(4px) scale(0.98); }
          to { opacity:1; transform:translateY(0) scale(1); }
        }

        .mcp-pg-select-option {
          width:100%;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:8px;
          padding:6px 8px;
          border:none;
          border-radius:5px;
          background:transparent;
          color:var(--text-primary);
          font-size:11.5px;
          text-align:left;
          cursor:pointer;
          transition:background 0.12s ease, color 0.12s ease;
        }

        .mcp-pg-select-option.muted {
          color:var(--text-muted);
        }

        .mcp-pg-select-option:hover {
          background:var(--bg-surface-hover);
        }

        .mcp-pg-select-option.selected {
          background:var(--bg-elevated);
          color:var(--text-primary);
          font-weight:600;
        }

        .mcp-pg-select-opt-text {
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
          min-width:0;
        }

        .mcp-pg-select-check {
          flex-shrink:0;
          color:var(--text-primary);
        }

        .mcp-pg-bool-btn {
          display:inline-flex;
          align-items:center;
          gap:7px;
          height:28px;
          padding:0 10px;
          border-radius:6px;
          border:1px solid var(--border-hover);
          background:var(--bg-pill);
          color:var(--text-primary);
          font-size:11px;
          font-weight:600;
          cursor:pointer;
        }

        .mcp-pg-bool-dot {
          width:10px;
          height:10px;
          border-radius:50%;
          background:var(--bg-toggle-off);
        }

        .mcp-pg-bool-btn.on {
          background:var(--status-green-dim);
          border-color:rgba(16, 185, 129, 0.36);
          color:var(--status-green-text);
        }

        .mcp-pg-bool-btn.on .mcp-pg-bool-dot {
          background:var(--status-green);
        }

        .mcp-pg-output-header {
          padding:9px 14px;
          border-bottom:1px solid var(--border-subtle);
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          flex-wrap:wrap;
          background:var(--bg-surface);
        }

        .mcp-pg-output-status-cluster,
        .mcp-pg-output-tabs-cluster {
          display:flex;
          align-items:center;
          gap:8px;
        }

        .mcp-pg-output-heading {
          font-size:10px;
          font-weight:700;
          letter-spacing:0.05em;
          color:var(--text-secondary);
        }

        .mcp-pg-res-badge {
          display:inline-flex;
          align-items:center;
          gap:4px;
          font-size:10px;
          font-weight:700;
          padding:2px 6px;
          border-radius:4px;
          border:1px solid;
        }

        .mcp-pg-res-badge.ok {
          background:var(--status-green-dim);
          border-color:rgba(16, 185, 129, 0.34);
          color:var(--status-green-text);
        }

        .mcp-pg-res-badge.err {
          background:var(--status-red-dim);
          border-color:rgba(220, 38, 38, 0.34);
          color:var(--status-red-text);
        }

        .mcp-pg-copy-out-btn {
          display:inline-flex;
          align-items:center;
          gap:4px;
          height:26px;
          padding:0 9px;
          border-radius:5px;
          border:1px solid var(--border-hover);
          background:var(--bg-pill);
          color:var(--text-primary);
          font-size:10.5px;
          font-weight:600;
          cursor:pointer;
        }

        .mcp-pg-copy-out-btn:hover {
          background:var(--bg-elevated-hover);
        }

        .mcp-pg-history-strip {
          display:flex;
          align-items:center;
          gap:6px;
          padding:6px 14px;
          border-bottom:1px solid var(--border-subtle);
          background:var(--bg-surface-alt);
          overflow-x:auto;
        }

        .mcp-pg-history-label {
          font-size:9.5px;
          font-weight:700;
          color:var(--text-muted);
          flex-shrink:0;
        }

        .mcp-pg-history-chip {
          display:inline-flex;
          align-items:center;
          gap:5px;
          padding:2px 7px;
          border-radius:4px;
          border:1px solid var(--border-subtle);
          background:var(--bg-surface);
          color:var(--text-secondary);
          font-size:10px;
          cursor:pointer;
          white-space:nowrap;
        }

        .mcp-pg-history-chip.err {
          border-color:rgba(220, 38, 38, 0.32);
          color:var(--status-red-text);
        }

        .mcp-pg-output-body {
          flex:1;
          min-height:0;
          overflow-y:auto;
          padding:12px 14px;
          background:var(--bg-subtle-inset);
        }

        .mcp-pg-output-empty {
          font-size:11.5px;
          color:var(--text-muted);
          padding:16px 0;
          text-align:center;
        }

        .mcp-pg-formatted-blocks {
          display:flex;
          flex-direction:column;
          gap:8px;
        }

        .mcp-pg-call-err-box {
          padding:8px 10px;
          border-radius:6px;
          background:var(--status-red-dim);
          border:1px solid rgba(220, 38, 38, 0.32);
          color:var(--status-red-text);
          font-size:11.5px;
        }

        .mcp-pg-output-pre {
          margin:0;
          padding:10px 12px;
          border-radius:7px;
          background:var(--bg-surface);
          border:1px solid var(--border-subtle);
          color:var(--text-code);
          font-size:11.5px;
          line-height:1.5;
          white-space:pre-wrap;
          word-break:break-word;
          user-select:text !important;
          -webkit-user-select:text !important;
        }

        .mcp-pg-workspace-placeholder {
          flex:1;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          text-align:center;
          padding:28px;
          gap:10px;
        }

        .mcp-pg-placeholder-icon {
          width:48px;
          height:48px;
          border-radius:12px;
          background:var(--status-cyan-dim);
          border:1px solid rgba(2, 132, 199, 0.3);
          color:var(--status-cyan-text);
          display:flex;
          align-items:center;
          justify-content:center;
        }

        .mcp-pg-workspace-placeholder h4 {
          margin:0;
          font-size:15px;
          font-weight:700;
          color:var(--text-primary);
        }

        .mcp-pg-workspace-placeholder p {
          margin:0;
          max-width:440px;
          font-size:12px;
          color:var(--text-secondary);
          line-height:1.5;
        }

        .mcp-pg-placeholder-logs {
          width:100%;
          max-width:600px;
          text-align:left;
          margin-top:8px;
        }

        .mcp-pg-placeholder-log-title {
          font-size:10px;
          font-weight:700;
          color:var(--text-muted);
          margin-bottom:4px;
        }
      `}</style>
    </div>,
    document.body
  );
};
