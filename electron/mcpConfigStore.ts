import fs from 'fs';
import path from 'path';

export type JsoncParseResult =
  | { ok: true; data: Record<string, any>; wasEmpty?: boolean }
  | { ok: false; error: string };

export interface NormalizedMcpEntry {
  key: string;
  command?: string;
  args: string[];
  url?: string;
  transport: 'stdio' | 'sse';
  env: Record<string, string>;
  disabled: boolean;
}

const PLACEHOLDER_VALUE_PATTERNS = [
  /^<.*>$/,
  /^your[_-]/i,
  /your_token/i,
  /your_api_key/i,
  /replace[_-]?me/i,
  /^changeme$/i,
  /^\*+$/,
  /^xxx+$/i,
];

function isPlaceholderSecret(val: unknown): boolean {
  if (typeof val !== 'string') return val === undefined || val === null;
  const trimmed = val.trim();
  if (trimmed === '') return true;
  return PLACEHOLDER_VALUE_PATTERNS.some((re) => re.test(trimmed));
}

/**
 * Strips UTF-8 BOM, JSONC comments (// and /* *\/), and trailing commas outside string literals,
 * then parses JSON safely. Never throws; returns structured success/error.
 */
export function parseJsoncSafe(rawText: string): JsoncParseResult {
  if (typeof rawText !== 'string') {
    return { ok: false, error: 'Config content is not a string' };
  }

  const withoutBom = rawText.replace(/^\uFEFF/, '');
  if (!withoutBom.trim()) {
    return { ok: true, data: {}, wasEmpty: true };
  }

  // Pass 1: Strip comments while preserving string literals verbatim
  let noComments = '';
  let inString = false;
  let stringQuote = '"';
  let inSingleLineComment = false;
  let inMultiLineComment = false;

  for (let i = 0; i < withoutBom.length; i++) {
    const ch = withoutBom[i];
    const next = withoutBom[i + 1];

    if (inSingleLineComment) {
      if (ch === '\n' || ch === '\r') {
        inSingleLineComment = false;
        noComments += ch;
      }
      continue;
    }

    if (inMultiLineComment) {
      if (ch === '*' && next === '/') {
        inMultiLineComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      noComments += ch;
      if (ch === '\\' && i + 1 < withoutBom.length) {
        i++;
        noComments += withoutBom[i];
      } else if (ch === stringQuote) {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      stringQuote = '"';
      noComments += ch;
    } else if (ch === '/' && next === '/') {
      inSingleLineComment = true;
      i++;
    } else if (ch === '/' && next === '*') {
      inMultiLineComment = true;
      i++;
    } else {
      noComments += ch;
    }
  }

  if (inString) {
    return { ok: false, error: 'Unterminated string literal in JSON/JSONC' };
  }

  // Pass 2: Strip trailing commas before '}' or ']' ONLY outside string literals
  let sanitized = '';
  inString = false;
  for (let i = 0; i < noComments.length; i++) {
    const ch = noComments[i];

    if (inString) {
      sanitized += ch;
      if (ch === '\\' && i + 1 < noComments.length) {
        i++;
        sanitized += noComments[i];
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      sanitized += ch;
      continue;
    }

    if (ch === ',') {
      let j = i + 1;
      while (j < noComments.length && /\s/.test(noComments[j])) {
        j++;
      }
      if (j < noComments.length && (noComments[j] === '}' || noComments[j] === ']')) {
        continue; // Drop trailing comma
      }
    }

    sanitized += ch;
  }

  try {
    const parsed = JSON.parse(sanitized);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'MCP config root must be a JSON object' };
    }
    return { ok: true, data: parsed as Record<string, any> };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Invalid JSON syntax' };
  }
}

function normalizeServerFields(key: string, val: any, forceDisabled?: boolean): NormalizedMcpEntry {
  let command = val?.command;
  let args: string[] = Array.isArray(val?.args) ? [...val.args] : [];

  // OpenCode array command format: ["npx", "-y", "..."]
  if (Array.isArray(val?.command)) {
    command = val.command[0];
    args = val.command.slice(1);
  }

  const url = val?.url || val?.options?.url;
  const transport: 'stdio' | 'sse' = url || val?.type === 'sse' || val?.type === 'remote' ? 'sse' : 'stdio';
  const rawEnv = val?.env && typeof val.env === 'object'
    ? val.env
    : val?.environment && typeof val.environment === 'object'
    ? val.environment
    : {};

  const disabled = forceDisabled !== undefined
    ? forceDisabled
    : Boolean(val?.disabled) || val?.enabled === false;

  return {
    key,
    command: typeof command === 'string' ? command : undefined,
    args,
    url: typeof url === 'string' ? url : undefined,
    transport,
    env: { ...rawEnv },
    disabled,
  };
}

/**
 * Extracts normalized MCP server entries across all 12 supported agent schema styles
 * (mcpServers, servers, mcp.servers, OpenCode native mcp map, Zed context_servers, Continue experimental array).
 */
export function listMcpServersFromObject(configObj: Record<string, any>): NormalizedMcpEntry[] {
  if (!configObj || typeof configObj !== 'object' || Array.isArray(configObj)) {
    return [];
  }

  const seen = new Set<string>();
  const results: NormalizedMcpEntry[] = [];

  const pushEntry = (key: string, val: any, forceDisabled?: boolean) => {
    if (!key || !val || typeof val !== 'object' || seen.has(key)) return;
    seen.add(key);
    results.push(normalizeServerFields(key, val, forceDisabled));
  };

  // 1. Standard mcpServers / servers + disabled companions
  const activeDicts = [configObj.mcpServers, configObj.servers, configObj.context_servers, configObj.mcp?.servers];
  for (const dict of activeDicts) {
    if (dict && typeof dict === 'object' && !Array.isArray(dict)) {
      for (const [k, v] of Object.entries(dict)) {
        pushEntry(k, v);
      }
    }
  }

  // 2. OpenCode native `mcp` object when keys are direct server objects (not `servers` / `disabledServers`)
  if (configObj.mcp && typeof configObj.mcp === 'object' && !Array.isArray(configObj.mcp)) {
    for (const [k, v] of Object.entries<any>(configObj.mcp)) {
      if (k === 'servers' || k === 'disabledServers') continue;
      if (v && typeof v === 'object' && ('command' in v || 'url' in v || 'type' in v || 'environment' in v || 'enabled' in v)) {
        pushEntry(k, v);
      }
    }
  }

  // 3. Continue `experimental.modelContextProtocolServers` (array or map)
  const continueExp = configObj.experimental?.modelContextProtocolServers;
  if (Array.isArray(continueExp)) {
    for (const item of continueExp) {
      if (item && typeof item === 'object' && typeof item.name === 'string') {
        pushEntry(item.name, item);
      }
    }
  } else if (continueExp && typeof continueExp === 'object') {
    for (const [k, v] of Object.entries(continueExp)) {
      pushEntry(k, v);
    }
  }

  // 4. Explicit disabled dictionaries
  const disabledDicts = [
    configObj.disabledMcpServers,
    configObj.disabledServers,
    configObj.disabled_context_servers,
    configObj.mcp?.disabledServers,
  ];
  for (const dict of disabledDicts) {
    if (dict && typeof dict === 'object' && !Array.isArray(dict)) {
      for (const [k, v] of Object.entries(dict)) {
        pushEntry(k, v, true);
      }
    }
  }

  return results;
}

/**
 * Merges incoming MCP server settings with existing config while preserving user API secrets,
 * OpenCode `environment` keys, and Windows `.cmd`/`.exe` command wrappers.
 */
export function mergeMcpServerConfig(
  existingConfig: any,
  incomingConfig: any,
  platform: NodeJS.Platform = process.platform
): Record<string, any> {
  const finalConfig: Record<string, any> = {
    ...(incomingConfig && typeof incomingConfig === 'object' ? incomingConfig : {}),
  };

  const existingEnv =
    existingConfig?.env && typeof existingConfig.env === 'object'
      ? existingConfig.env
      : existingConfig?.environment && typeof existingConfig.environment === 'object'
      ? existingConfig.environment
      : undefined;

  const incomingEnv =
    incomingConfig?.env && typeof incomingConfig.env === 'object'
      ? incomingConfig.env
      : incomingConfig?.environment && typeof incomingConfig.environment === 'object'
      ? incomingConfig.environment
      : undefined;

  if (existingEnv || incomingEnv) {
    const mergedEnv: Record<string, string> = { ...(incomingEnv || {}) };
    if (existingEnv) {
      for (const [k, v] of Object.entries(existingEnv)) {
        if (typeof v !== 'string' || v.trim() === '') continue;
        if (isPlaceholderSecret(mergedEnv[k])) {
          mergedEnv[k] = v;
        }
      }
    }

    if (existingConfig?.environment && !incomingConfig?.env) {
      finalConfig.environment = mergedEnv;
      delete finalConfig.env;
    } else {
      finalConfig.env = mergedEnv;
    }
  }

  // Preserve Windows .cmd/.exe/.bat wrappers if command basename matches
  if (platform === 'win32' && typeof existingConfig?.command === 'string' && typeof incomingConfig?.command === 'string') {
    const normOld = existingConfig.command.toLowerCase().replace(/\.(cmd|exe|bat)$/i, '').trim();
    const normNew = incomingConfig.command.toLowerCase().replace(/\.(cmd|exe|bat)$/i, '').trim();
    if (normOld === normNew) {
      finalConfig.command = existingConfig.command;
    }
  }

  return finalConfig;
}

type ContainerResolution =
  | {
      kind: 'dict';
      active: Record<string, any>;
      disabled: Record<string, any>;
      opencodeNative?: false;
    }
  | {
      kind: 'continue-array';
      list: any[];
    }
  | {
      kind: 'opencode-native';
      mcp: Record<string, any>;
    };

function isOpencodeNativeMcpMap(mcpObj: any): boolean {
  if (!mcpObj || typeof mcpObj !== 'object' || Array.isArray(mcpObj)) return false;
  if ('servers' in mcpObj || 'disabledServers' in mcpObj) return false;
  return Object.values(mcpObj).some(
    (v: any) => v && typeof v === 'object' && ('command' in v || 'url' in v || 'type' in v || 'environment' in v || 'enabled' in v)
  );
}

function resolveAgentContainers(agentId: string | undefined, configObj: Record<string, any>): ContainerResolution {
  // Continue experimental array format
  if (Array.isArray(configObj.experimental?.modelContextProtocolServers)) {
    return {
      kind: 'continue-array',
      list: configObj.experimental.modelContextProtocolServers,
    };
  }

  // Zed context_servers
  if (
    agentId === 'zed' &&
    !configObj.mcpServers &&
    !configObj.servers
  ) {
    if (!configObj.context_servers || typeof configObj.context_servers !== 'object') {
      configObj.context_servers = {};
    }
    if (!configObj.disabled_context_servers || typeof configObj.disabled_context_servers !== 'object') {
      configObj.disabled_context_servers = {};
    }
    return {
      kind: 'dict',
      active: configObj.context_servers,
      disabled: configObj.disabled_context_servers,
    };
  }
  if (configObj.context_servers && typeof configObj.context_servers === 'object' && !configObj.mcpServers) {
    if (!configObj.disabled_context_servers || typeof configObj.disabled_context_servers !== 'object') {
      configObj.disabled_context_servers = {};
    }
    return {
      kind: 'dict',
      active: configObj.context_servers,
      disabled: configObj.disabled_context_servers,
    };
  }

  // OpenCode native mcp dictionary (each server directly under configObj.mcp)
  if (isOpencodeNativeMcpMap(configObj.mcp)) {
    return {
      kind: 'opencode-native',
      mcp: configObj.mcp,
    };
  }

  // Nested mcp.servers container
  if (configObj.mcp && typeof configObj.mcp === 'object') {
    if (!configObj.mcp.servers || typeof configObj.mcp.servers !== 'object') configObj.mcp.servers = {};
    if (!configObj.mcp.disabledServers || typeof configObj.mcp.disabledServers !== 'object') configObj.mcp.disabledServers = {};
    return {
      kind: 'dict',
      active: configObj.mcp.servers,
      disabled: configObj.mcp.disabledServers,
    };
  }

  // Standard mcpServers / servers
  if (!configObj.mcpServers && !configObj.servers) {
    configObj.mcpServers = {};
  }
  const active = (configObj.mcpServers !== undefined && typeof configObj.mcpServers === 'object')
    ? configObj.mcpServers
    : configObj.servers;

  if (!configObj.disabledMcpServers && !configObj.disabledServers) {
    configObj.disabledMcpServers = {};
  }
  const disabled = (configObj.disabledMcpServers !== undefined && typeof configObj.disabledMcpServers === 'object')
    ? configObj.disabledMcpServers
    : configObj.disabledServers;

  return { kind: 'dict', active, disabled };
}

function toOpenCodeServerEntry(merged: Record<string, any>, existing: any): Record<string, any> {
  const commandArr = typeof merged.command === 'string'
    ? [merged.command, ...(Array.isArray(merged.args) ? merged.args : [])]
    : Array.isArray(merged.command)
    ? merged.command
    : undefined;

  const entry: Record<string, any> = {
    ...(existing && typeof existing === 'object' ? existing : {}),
    type: merged.url ? 'remote' : 'local',
    enabled: existing?.enabled !== undefined ? existing.enabled : true,
  };

  if (commandArr) entry.command = commandArr;
  if (merged.url) entry.url = merged.url;
  const envData = merged.environment || merged.env;
  if (envData && Object.keys(envData).length > 0) {
    entry.environment = envData;
  }
  return entry;
}

export function applyMcpInstallToObject(
  agentId: string | undefined,
  configObj: Record<string, any>,
  serverKey: string,
  serverConfig: Record<string, any>,
  platform: NodeJS.Platform = process.platform
): Record<string, any> {
  const containers = resolveAgentContainers(agentId, configObj);

  if (containers.kind === 'continue-array') {
    const idx = containers.list.findIndex((item) => item && item.name === serverKey);
    const existing = idx >= 0 ? containers.list[idx] : undefined;
    const merged = {
      name: serverKey,
      ...mergeMcpServerConfig(existing, serverConfig, platform),
    };
    if (idx >= 0) {
      containers.list[idx] = merged;
    } else {
      containers.list.push(merged);
    }
    return configObj;
  }

  if (containers.kind === 'opencode-native') {
    const existing = containers.mcp[serverKey];
    const normalizedExisting = existing ? normalizeServerFields(serverKey, existing) : undefined;
    const merged = mergeMcpServerConfig(normalizedExisting, serverConfig, platform);
    containers.mcp[serverKey] = toOpenCodeServerEntry(merged, existing);
    return configObj;
  }

  const existingConfig = containers.active[serverKey] || containers.disabled[serverKey];
  const finalConfig = mergeMcpServerConfig(existingConfig, serverConfig, platform);

  if (containers.disabled[serverKey]) {
    containers.disabled[serverKey] = finalConfig;
  } else {
    containers.active[serverKey] = finalConfig;
  }

  return configObj;
}

export function applyMcpUninstallToObject(
  configObj: Record<string, any>,
  serverKey: string
): { modified: boolean } {
  let modified = false;

  const dicts = [
    configObj.mcp?.servers,
    configObj.mcp?.disabledServers,
    configObj.mcp,
    configObj.mcpServers,
    configObj.servers,
    configObj.context_servers,
    configObj.disabled_context_servers,
    configObj.disabledMcpServers,
    configObj.disabledServers,
    !Array.isArray(configObj.experimental?.modelContextProtocolServers)
      ? configObj.experimental?.modelContextProtocolServers
      : null,
  ];

  for (const dict of dicts) {
    if (dict && typeof dict === 'object' && !Array.isArray(dict) && serverKey in dict) {
      if (dict === configObj.mcp && (serverKey === 'servers' || serverKey === 'disabledServers')) {
        continue;
      }
      delete dict[serverKey];
      modified = true;
    }
  }

  if (Array.isArray(configObj.experimental?.modelContextProtocolServers)) {
    const prevLen = configObj.experimental.modelContextProtocolServers.length;
    configObj.experimental.modelContextProtocolServers = configObj.experimental.modelContextProtocolServers.filter(
      (item: any) => item?.name !== serverKey
    );
    if (configObj.experimental.modelContextProtocolServers.length !== prevLen) {
      modified = true;
    }
  }

  return { modified };
}

export function applyMcpToggleToObject(
  agentId: string | undefined,
  configObj: Record<string, any>,
  serverKey: string,
  enabled: boolean
): { modified: boolean } {
  const containers = resolveAgentContainers(agentId, configObj);

  if (containers.kind === 'continue-array') {
    const entry = containers.list.find((item) => item && item.name === serverKey);
    if (!entry) return { modified: false };
    if (enabled) {
      delete entry.disabled;
    } else {
      entry.disabled = true;
    }
    return { modified: true };
  }

  if (containers.kind === 'opencode-native') {
    const entry = containers.mcp[serverKey];
    if (!entry || typeof entry !== 'object') return { modified: false };
    entry.enabled = enabled;
    if (enabled) {
      delete entry.disabled;
    }
    return { modified: true };
  }

  if (enabled) {
    const serverDef = containers.disabled[serverKey] || containers.active[serverKey];
    if (!serverDef) return { modified: false };
    const cleanedDef = { ...serverDef };
    delete cleanedDef.disabled;
    containers.active[serverKey] = cleanedDef;
    delete containers.disabled[serverKey];
    return { modified: true };
  } else {
    const serverDef = containers.active[serverKey];
    if (serverDef) {
      containers.disabled[serverKey] = {
        ...serverDef,
        disabled: true,
      };
      delete containers.active[serverKey];
      return { modified: true };
    }
    if (containers.disabled[serverKey]) {
      return { modified: true };
    }
    return { modified: false };
  }
}

export function readMcpConfigFile(filePath: string): JsoncParseResult & { exists: boolean } {
  if (!filePath || !fs.existsSync(filePath)) {
    return { exists: false, ok: true, data: {} };
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseJsoncSafe(raw);
  return { ...parsed, exists: true };
}

export function writeJsonAtomicWithBackup(filePath: string, data: Record<string, any>): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  // Preserve a .bak copy of the previous valid config before modifying
  if (fs.existsSync(filePath)) {
    try {
      fs.copyFileSync(filePath, `${filePath}.bak`);
    } catch (err) {
      console.warn(`Could not create .bak backup for ${filePath}:`, err);
    }
  }

  const serialized = JSON.stringify(data, null, 2) + '\n';
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, serialized, 'utf-8');
  fs.renameSync(tempPath, filePath);
}

export function backupCorruptConfigFile(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const backupPath = `${filePath}.corrupt-${Date.now()}.bak`;
    fs.copyFileSync(filePath, backupPath);
    return backupPath;
  } catch {
    return null;
  }
}
