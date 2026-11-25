import { spawn, ChildProcess } from 'child_process';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import os from 'os';
import path from 'path';
import { performance } from 'perf_hooks';
import { listMcpServersFromObject, readMcpConfigFile } from './mcpConfigStore';

export interface McpToolSchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  default?: unknown;
  items?: McpToolSchemaProperty;
  properties?: Record<string, McpToolSchemaProperty>;
  required?: string[];
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, McpToolSchemaProperty>;
    required?: string[];
    additionalProperties?: boolean | Record<string, unknown>;
  };
}

export interface McpPlaygroundConnectParams {
  sessionId?: string;
  serverKey: string;
  serverName?: string;
  transport: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  envOverrides?: Record<string, string>;
  configPaths?: string[];
  timeoutMs?: number;
}

export interface McpPlaygroundConnectResult {
  success: boolean;
  sessionId?: string;
  transport: 'stdio' | 'sse';
  protocolVersion?: string;
  serverInfo?: { name?: string; version?: string };
  capabilities?: Record<string, unknown>;
  tools?: McpToolDefinition[];
  connectLatencyMs?: number;
  listToolsLatencyMs?: number;
  resolvedEnvKeys?: string[];
  stderrLogs?: string[];
  error?: string;
}

export interface McpPlaygroundToolCallParams {
  sessionId: string;
  toolName: string;
  arguments?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface McpPlaygroundToolCallResult {
  success: boolean;
  isError?: boolean;
  content?: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
    [key: string]: unknown;
  }>;
  structuredContent?: unknown;
  rawResponse?: unknown;
  latencyMs: number;
  stderrLogs?: string[];
  error?: string;
}

export interface McpPlaygroundStatusResult {
  connected: boolean;
  sessionId: string;
  transport?: 'stdio' | 'sse';
  stderrLogs?: string[];
}

interface PendingRpcRequest {
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

interface PlaygroundSession {
  sessionId: string;
  transport: 'stdio' | 'sse';
  child?: ChildProcess;
  sseRequest?: http.ClientRequest;
  sseResponse?: http.IncomingMessage;
  postUrl?: string;
  mcpSessionId?: string;
  httpMode?: 'sse' | 'streamable';
  extraHeaders?: Record<string, string>;
  pending: Map<string | number, PendingRpcRequest>;
  nextId: number;
  stderrLogs: string[];
  secretValues: string[];
  closed: boolean;
  idleTimer?: NodeJS.Timeout;
  sendRpc: (method: string, params: Record<string, unknown> | undefined, timeoutMs: number) => Promise<any>;
  sendNotify: (method: string, params?: Record<string, unknown>) => void;
}

const MAX_SESSIONS = 5;
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_STDERR_LINES = 80;
const MCP_PROTOCOL_VERSION = '2024-11-05';
const WIN_CMD_WRAPPERS = new Set(['npx', 'npm', 'pnpm', 'pnpx', 'yarn', 'bunx']);

const activeSessions = new Map<string, PlaygroundSession>();
const inFlightConnectIds = new Set<string>();
const cancelledConnectIds = new Set<string>();

function roundMs(ms: number): number {
  return Math.round(ms * 10) / 10;
}

function expandHomePath(targetPath: string): string {
  if (!targetPath) return '';
  if (targetPath.startsWith('~')) {
    return path.join(os.homedir(), targetPath.slice(1));
  }
  return targetPath;
}

function quoteWinCmdArg(arg: string): string {
  if (arg === '') return '""';
  if (!/[\s"&|<>^()%]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

function shouldUseWinCmdShell(command: string): boolean {
  if (process.platform !== 'win32') return false;
  const trimmed = command.trim();
  const baseName = path.basename(trimmed).toLowerCase();
  const baseWithoutExt = baseName.replace(/\.(cmd|bat|exe)$/i, '');
  return /\.(cmd|bat)$/i.test(trimmed) || WIN_CMD_WRAPPERS.has(baseName) || WIN_CMD_WRAPPERS.has(baseWithoutExt);
}

function resolveServerEnvFromConfigs(
  serverKey: string,
  serverName: string | undefined,
  configPaths: string[] | undefined,
  envOverrides: Record<string, string> | undefined
): Record<string, string> {
  const merged: Record<string, string> = {};
  const candidateKeys = new Set(
    [serverKey, serverName]
      .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
      .map((k) => k.trim().toLowerCase())
  );

  if (Array.isArray(configPaths)) {
    for (const rawPath of configPaths) {
      if (!rawPath || typeof rawPath !== 'string') continue;
      const expanded = expandHomePath(rawPath.trim());
      if (!expanded) continue;
      const parsed = readMcpConfigFile(expanded);
      if (!parsed.ok) continue;
      const entries = listMcpServersFromObject(parsed.data);
      for (const entry of entries) {
        if (!candidateKeys.has(entry.key.toLowerCase())) continue;
        for (const [k, v] of Object.entries(entry.env || {})) {
          if (typeof v === 'string' && v.length > 0 && !(merged[k] && merged[k].length > 0)) {
            merged[k] = v;
          }
        }
      }
    }
  }

  if (envOverrides && typeof envOverrides === 'object') {
    for (const [rawKey, rawVal] of Object.entries(envOverrides)) {
      const k = rawKey.trim();
      if (!k || typeof rawVal !== 'string') continue;
      // Only overwrite a resolved disk secret if override is non-empty
      if (rawVal.length > 0 || !(k in merged)) {
        if (rawVal.length > 0) {
          merged[k] = rawVal;
        }
      }
    }
  }

  return merged;
}

function appendStderrLog(session: PlaygroundSession, chunkText: string): void {
  const lines = chunkText.split(/\r?\n/);
  for (let line of lines) {
    line = line.trimEnd();
    if (!line) continue;
    for (const secret of session.secretValues) {
      if (secret.length >= 6 && line.includes(secret)) {
        line = line.split(secret).join('***');
      }
    }
    session.stderrLogs.push(line);
  }
  if (session.stderrLogs.length > MAX_STDERR_LINES) {
    session.stderrLogs.splice(0, session.stderrLogs.length - MAX_STDERR_LINES);
  }
}

function rejectAllPending(session: PlaygroundSession, reason: string): void {
  for (const [, pending] of session.pending.entries()) {
    clearTimeout(pending.timer);
    pending.reject(new Error(reason));
  }
  session.pending.clear();
}

function handleJsonRpcPayload(session: PlaygroundSession, message: any): void {
  if (!message || typeof message !== 'object') return;
  if (Array.isArray(message)) {
    for (const item of message) {
      handleJsonRpcPayload(session, item);
    }
    return;
  }

  const msgId = message.id;
  if (msgId !== undefined && msgId !== null && session.pending.has(msgId)) {
    const pending = session.pending.get(msgId)!;
    session.pending.delete(msgId);
    clearTimeout(pending.timer);
    if (message.error) {
      const errMsg = message.error.message || JSON.stringify(message.error);
      pending.reject(new Error(errMsg));
    } else {
      pending.resolve(message.result);
    }
  }
}

function resetIdleTimer(session: PlaygroundSession): void {
  if (session.idleTimer) {
    clearTimeout(session.idleTimer);
  }
  session.idleTimer = setTimeout(() => {
    void disconnectPlayground(session.sessionId);
  }, IDLE_TIMEOUT_MS);
  if (typeof session.idleTimer.unref === 'function') {
    session.idleTimer.unref();
  }
}

function evictOldestIfNeeded(): void {
  while (activeSessions.size >= MAX_SESSIONS) {
    const oldestKey = activeSessions.keys().next().value;
    if (!oldestKey) break;
    void disconnectPlayground(oldestKey);
  }
}

function parseSseFrames(
  buffer: string,
  onEvent: (eventName: string, data: string) => void
): string {
  let remaining = buffer;
  while (true) {
    const match = /\r?\n\r?\n/.exec(remaining);
    if (!match) break;

    const rawEvent = remaining.slice(0, match.index);
    remaining = remaining.slice(match.index + match[0].length);

    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of rawEvent.split(/\r?\n/)) {
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (dataLines.length > 0) {
      onEvent(eventName, dataLines.join('\n'));
    }
  }
  return remaining;
}

function postJsonRpcHttp(
  targetUrl: string,
  payload: unknown,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const transport = parsed.protocol === 'https:' ? https : http;
    const bodyStr = JSON.stringify(payload);

    const req = transport.request(
      parsed,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'Content-Length': Buffer.byteLength(bodyStr),
          ...headers,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf-8'),
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`HTTP POST timed out after ${timeoutMs}ms`));
    });
    req.on('error', (err) => {
      reject(err);
    });
    req.write(bodyStr);
    req.end();
  });
}

function createStdioSession(
  sessionId: string,
  command: string,
  args: string[],
  resolvedEnv: Record<string, string>
): { session: PlaygroundSession; spawnReady: Promise<void> } {
  const mergedProcessEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...resolvedEnv,
  };

  let child: ChildProcess;
  if (shouldUseWinCmdShell(command)) {
    const cmdLine = [quoteWinCmdArg(command.trim()), ...args.map(quoteWinCmdArg)].join(' ');
    child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', cmdLine], {
      env: mergedProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      windowsVerbatimArguments: true,
    });
  } else {
    child = spawn(command.trim(), args, {
      env: mergedProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  }

  const session: PlaygroundSession = {
    sessionId,
    transport: 'stdio',
    child,
    pending: new Map(),
    nextId: 1,
    stderrLogs: [],
    secretValues: Object.values(resolvedEnv).filter((v) => v && v.length >= 6),
    closed: false,
    sendRpc: (method, params, timeoutMs) => {
      return new Promise((resolve, reject) => {
        if (session.closed || !child.stdin || !child.stdin.writable) {
          reject(new Error('MCP stdio process is not running'));
          return;
        }
        const id = session.nextId++;
        const timer = setTimeout(() => {
          session.pending.delete(id);
          reject(new Error(`RPC request "${method}" timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        session.pending.set(id, { resolve, reject, timer });
        const payload = JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          ...(params !== undefined ? { params } : {}),
        });
        child.stdin.write(`${payload}\n`, 'utf-8');
      });
    },
    sendNotify: (method, params) => {
      if (session.closed || !child.stdin || !child.stdin.writable) return;
      const payload = JSON.stringify({
        jsonrpc: '2.0',
        method,
        ...(params !== undefined ? { params } : {}),
      });
      child.stdin.write(`${payload}\n`, 'utf-8');
    },
  };

  let stdoutBuffer = Buffer.alloc(0);

  const processStdoutBuffer = () => {
    while (stdoutBuffer.length > 0) {
      // Skip leading whitespace before checking Content-Length or newline JSON
      let trimOffset = 0;
      while (
        trimOffset < stdoutBuffer.length &&
        (stdoutBuffer[trimOffset] === 0x0d || stdoutBuffer[trimOffset] === 0x0a || stdoutBuffer[trimOffset] === 0x20)
      ) {
        trimOffset++;
      }
      if (trimOffset > 0) {
        stdoutBuffer = stdoutBuffer.subarray(trimOffset);
      }
      if (stdoutBuffer.length === 0) break;

      const headAscii = stdoutBuffer.subarray(0, Math.min(32, stdoutBuffer.length)).toString('ascii');
      if (/^Content-Length:\s*/i.test(headAscii)) {
        let sepIndex = stdoutBuffer.indexOf('\r\n\r\n');
        let sepLen = 4;
        if (sepIndex === -1) {
          sepIndex = stdoutBuffer.indexOf('\n\n');
          sepLen = 2;
        }
        if (sepIndex === -1) break;

        const headerText = stdoutBuffer.subarray(0, sepIndex).toString('ascii');
        const lenMatch = headerText.match(/Content-Length:\s*(\d+)/i);
        if (!lenMatch) {
          stdoutBuffer = stdoutBuffer.subarray(sepIndex + sepLen);
          continue;
        }
        const contentLen = parseInt(lenMatch[1], 10);
        const bodyStart = sepIndex + sepLen;
        if (stdoutBuffer.length < bodyStart + contentLen) break;

        const jsonSlice = stdoutBuffer.subarray(bodyStart, bodyStart + contentLen).toString('utf-8');
        stdoutBuffer = stdoutBuffer.subarray(bodyStart + contentLen);
        try {
          handleJsonRpcPayload(session, JSON.parse(jsonSlice));
        } catch {}
        continue;
      }

      const nlIndex = stdoutBuffer.indexOf('\n');
      if (nlIndex === -1) break;
      const line = stdoutBuffer.subarray(0, nlIndex).toString('utf-8').replace(/\r$/, '').trim();
      stdoutBuffer = stdoutBuffer.subarray(nlIndex + 1);
      if (line.startsWith('{') || line.startsWith('[')) {
        try {
          handleJsonRpcPayload(session, JSON.parse(line));
        } catch {}
      }
    }
  };

  const spawnReady = new Promise<void>((resolve, reject) => {
    let settled = false;
    child.once('spawn', () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    });
    child.on('error', (err) => {
      appendStderrLog(session, `Process spawn error: ${err.message}`);
      session.closed = true;
      rejectAllPending(session, `Failed to start command "${command}": ${err.message}`);
      if (!settled) {
        settled = true;
        reject(new Error(`Failed to start command "${command}": ${err.message}`));
      }
    });
    child.on('exit', (code, signal) => {
      session.closed = true;
      const detail = session.stderrLogs.length > 0 ? ` (${session.stderrLogs[session.stderrLogs.length - 1]})` : '';
      const msg = `MCP process exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'none'})${detail}`;
      rejectAllPending(session, msg);
      if (!settled) {
        settled = true;
        reject(new Error(msg));
      }
    });
  });

  child.stdout?.on('data', (chunk: Buffer) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
    processStdoutBuffer();
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    appendStderrLog(session, chunk.toString('utf-8'));
  });

  return { session, spawnReady };
}

async function createSseOrStreamableSession(
  sessionId: string,
  rawUrl: string,
  resolvedEnv: Record<string, string>,
  timeoutMs: number,
  onSessionCreated?: (session: PlaygroundSession) => void
): Promise<PlaygroundSession> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl.trim());
  } catch {
    throw new Error(`Invalid SSE/HTTP URL: "${rawUrl}"`);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(`Unsupported URL protocol "${parsedUrl.protocol}". Only http:// and https:// are allowed.`);
  }

  const extraHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(resolvedEnv)) {
    if (k.toLowerCase().startsWith('header_') && v) {
      extraHeaders[k.slice(7)] = v;
    }
  }

  const session: PlaygroundSession = {
    sessionId,
    transport: 'sse',
    postUrl: parsedUrl.toString(),
    httpMode: 'sse',
    extraHeaders,
    pending: new Map(),
    nextId: 1,
    stderrLogs: [],
    secretValues: Object.values(resolvedEnv).filter((v) => v && v.length >= 6),
    closed: false,
    sendRpc: async (method, params, reqTimeoutMs) => {
      if (session.closed) {
        throw new Error('MCP SSE session is disconnected');
      }
      const id = session.nextId++;
      const payload = {
        jsonrpc: '2.0',
        id,
        method,
        ...(params !== undefined ? { params } : {}),
      };

      const headers: Record<string, string> = { ...extraHeaders };
      if (session.mcpSessionId) {
        headers['mcp-session-id'] = session.mcpSessionId;
      }

      if (session.httpMode === 'streamable') {
        const res = await postJsonRpcHttp(session.postUrl!, payload, headers, reqTimeoutMs);
        const sid = res.headers['mcp-session-id'];
        if (typeof sid === 'string' && sid) {
          session.mcpSessionId = sid;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          throw new Error(`HTTP ${res.statusCode}: ${res.body.slice(0, 300)}`);
        }
        const ctype = String(res.headers['content-type'] || '').toLowerCase();
        if (ctype.includes('text/event-stream')) {
          let resolved: any = undefined;
          let foundError: string | null = null;
          parseSseFrames(res.body + '\n\n', (_ev, data) => {
            try {
              const msg = JSON.parse(data);
              if (msg?.id === id) {
                if (msg.error) foundError = msg.error.message || JSON.stringify(msg.error);
                else resolved = msg.result;
              }
            } catch {}
          });
          if (foundError) throw new Error(foundError);
          if (resolved !== undefined) return resolved;
          throw new Error(`No matching JSON-RPC result received in streamable response for "${method}"`);
        }

        const parsedBody = JSON.parse(res.body);
        if (parsedBody?.error) {
          throw new Error(parsedBody.error.message || JSON.stringify(parsedBody.error));
        }
        return parsedBody?.result;
      }

      // Classic SSE mode: wait for response via open event stream (or direct JSON response)
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          session.pending.delete(id);
          reject(new Error(`SSE RPC request "${method}" timed out after ${reqTimeoutMs}ms`));
        }, reqTimeoutMs);

        session.pending.set(id, { resolve, reject, timer });

        postJsonRpcHttp(session.postUrl!, payload, headers, reqTimeoutMs)
          .then((res) => {
            const sid = res.headers['mcp-session-id'];
            if (typeof sid === 'string' && sid) {
              session.mcpSessionId = sid;
            }
            if (res.statusCode >= 400) {
              if (session.pending.has(id)) {
                session.pending.delete(id);
                clearTimeout(timer);
                reject(new Error(`SSE POST failed with HTTP ${res.statusCode}: ${res.body.slice(0, 240)}`));
              }
              return;
            }
            const ctype = String(res.headers['content-type'] || '').toLowerCase();
            if (ctype.includes('application/json') && res.body.trim()) {
              try {
                handleJsonRpcPayload(session, JSON.parse(res.body));
              } catch {}
            }
          })
          .catch((err) => {
            if (session.pending.has(id)) {
              session.pending.delete(id);
              clearTimeout(timer);
              reject(err);
            }
          });
      });
    },
    sendNotify: (method, params) => {
      if (session.closed || !session.postUrl) return;
      const payload = {
        jsonrpc: '2.0',
        method,
        ...(params !== undefined ? { params } : {}),
      };
      const headers: Record<string, string> = { ...extraHeaders };
      if (session.mcpSessionId) {
        headers['mcp-session-id'] = session.mcpSessionId;
      }
      postJsonRpcHttp(session.postUrl, payload, headers, 4000).catch(() => {});
    },
  };

  // Attempt classic SSE GET first; seamlessly fall back to Streamable HTTP when GET returns 404/405/400/JSON
  await new Promise<void>((resolve, reject) => {
    const httpMod = parsedUrl.protocol === 'https:' ? https : http;
    let settled = false;
    let sseBuffer = '';

    const handshakeTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        req.destroy();
        reject(new Error(`Timed out waiting for SSE endpoint handshake from ${parsedUrl.toString()}`));
      }
    }, Math.min(timeoutMs, 8000));

    const req = httpMod.request(
      parsedUrl,
      {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream, application/json',
          'Cache-Control': 'no-cache',
          ...extraHeaders,
        },
      },
      (res) => {
        session.sseResponse = res;
        const status = res.statusCode || 0;
        const ctype = String(res.headers['content-type'] || '').toLowerCase();

        if (status === 404 || status === 405 || status === 400 || ctype.includes('application/json')) {
          res.resume();
          session.httpMode = 'streamable';
          session.postUrl = parsedUrl.toString();
          clearTimeout(handshakeTimer);
          if (!settled) {
            settled = true;
            resolve();
          }
          return;
        }

        if (status >= 400) {
          res.resume();
          clearTimeout(handshakeTimer);
          if (!settled) {
            settled = true;
            reject(new Error(`SSE connection failed with HTTP ${status}`));
          }
          return;
        }

        res.setEncoding('utf-8');
        res.on('data', (chunk: string) => {
          sseBuffer += chunk;
          sseBuffer = parseSseFrames(sseBuffer, (eventName, data) => {
            if (eventName === 'endpoint') {
              try {
                session.postUrl = new URL(data.trim(), parsedUrl).toString();
                session.httpMode = 'sse';
                clearTimeout(handshakeTimer);
                if (!settled) {
                  settled = true;
                  resolve();
                }
              } catch (err: any) {
                clearTimeout(handshakeTimer);
                if (!settled) {
                  settled = true;
                  reject(new Error(`Invalid SSE endpoint URI "${data}": ${err.message}`));
                }
              }
            } else if (eventName === 'message') {
              try {
                handleJsonRpcPayload(session, JSON.parse(data));
              } catch {}
            }
          });
        });

        res.on('error', (err) => {
          appendStderrLog(session, `SSE stream error: ${err.message}`);
          session.closed = true;
          rejectAllPending(session, `SSE stream interrupted: ${err.message}`);
          clearTimeout(handshakeTimer);
          if (!settled) {
            settled = true;
            reject(err);
          }
        });

        res.on('close', () => {
          if (session.httpMode === 'sse') {
            session.closed = true;
            rejectAllPending(session, 'SSE stream closed by server');
          }
        });
      }
    );

    session.sseRequest = req;
    onSessionCreated?.(session);
    if (cancelledConnectIds.has(sessionId)) {
      clearTimeout(handshakeTimer);
      req.destroy();
      settled = true;
      reject(new Error('Connection cancelled by user.'));
      return;
    }
    req.on('error', (err) => {
      clearTimeout(handshakeTimer);
      if (!settled) {
        settled = true;
        reject(new Error(`Failed to connect to ${parsedUrl.toString()}: ${err.message}`));
      }
    });
    req.end();
  });

  return session;
}

export async function connectPlayground(
  params: McpPlaygroundConnectParams
): Promise<McpPlaygroundConnectResult> {
  const timeoutMs = typeof params.timeoutMs === 'number' && params.timeoutMs > 0 ? params.timeoutMs : 12000;
  const resolvedEnv = resolveServerEnvFromConfigs(
    params.serverKey,
    params.serverName,
    params.configPaths,
    params.envOverrides
  );
  const resolvedEnvKeys = Object.keys(resolvedEnv);
  const sessionId =
    typeof params.sessionId === 'string' && params.sessionId.trim().length > 0
      ? params.sessionId.trim()
      : crypto.randomUUID();
  let session: PlaygroundSession | null = null;
  inFlightConnectIds.add(sessionId);

  const ensureNotCancelled = async () => {
    if (cancelledConnectIds.has(sessionId)) {
      throw new Error('Connection cancelled.');
    }
  };

  try {
    await ensureNotCancelled();
    evictOldestIfNeeded();

    const startConnect = performance.now();
    if (params.transport === 'stdio') {
      const cmd = (params.command || '').trim();
      if (!cmd) {
        return {
          success: false,
          transport: 'stdio',
          resolvedEnvKeys,
          error: 'No stdio executable command specified for this MCP server.',
        };
      }
      const created = createStdioSession(sessionId, cmd, Array.isArray(params.args) ? params.args : [], resolvedEnv);
      session = created.session;
      activeSessions.set(sessionId, session);
      resetIdleTimer(session);
      await ensureNotCancelled();
      await created.spawnReady;
    } else {
      const url = (params.url || '').trim();
      if (!url) {
        return {
          success: false,
          transport: 'sse',
          resolvedEnvKeys,
          error: 'No SSE / HTTP endpoint URL specified for this MCP server.',
        };
      }
      session = await createSseOrStreamableSession(
        sessionId,
        url,
        resolvedEnv,
        timeoutMs,
        (createdSession) => {
          session = createdSession;
          activeSessions.set(sessionId, createdSession);
          resetIdleTimer(createdSession);
        }
      );
    }

    await ensureNotCancelled();

    const initResult = await session.sendRpc(
      'initialize',
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'AgentForge Playground', version: '0.3.0' },
      },
      timeoutMs
    );
    await ensureNotCancelled();
    const connectLatencyMs = roundMs(performance.now() - startConnect);

    session.sendNotify('notifications/initialized', {});

    const startList = performance.now();
    const toolsResult = await session.sendRpc('tools/list', {}, timeoutMs);
    await ensureNotCancelled();
    const listToolsLatencyMs = roundMs(performance.now() - startList);

    const rawTools = Array.isArray(toolsResult?.tools) ? toolsResult.tools : [];
    const tools: McpToolDefinition[] = rawTools.map((t: any) => ({
      name: String(t?.name || ''),
      description: typeof t?.description === 'string' ? t.description : undefined,
      inputSchema: t?.inputSchema && typeof t.inputSchema === 'object' ? t.inputSchema : undefined,
    }));

    return {
      success: true,
      sessionId,
      transport: params.transport,
      protocolVersion: typeof initResult?.protocolVersion === 'string' ? initResult.protocolVersion : MCP_PROTOCOL_VERSION,
      serverInfo: initResult?.serverInfo && typeof initResult.serverInfo === 'object' ? initResult.serverInfo : undefined,
      capabilities: initResult?.capabilities && typeof initResult.capabilities === 'object' ? initResult.capabilities : undefined,
      tools,
      connectLatencyMs,
      listToolsLatencyMs,
      resolvedEnvKeys,
      stderrLogs: [...session.stderrLogs],
    };
  } catch (err: any) {
    const stderrLogs = session ? [...session.stderrLogs] : [];
    if (session || activeSessions.has(sessionId)) {
      await disconnectPlayground(sessionId);
    }
    return {
      success: false,
      transport: params.transport,
      resolvedEnvKeys,
      stderrLogs,
      error: err?.message || 'Failed to connect to MCP server',
    };
  } finally {
    inFlightConnectIds.delete(sessionId);
    cancelledConnectIds.delete(sessionId);
  }
}

export async function listPlaygroundTools(
  sessionId: string
): Promise<{ success: boolean; tools?: McpToolDefinition[]; latencyMs: number; stderrLogs?: string[]; error?: string }> {
  const start = performance.now();
  const session = activeSessions.get(sessionId);
  if (!session || session.closed) {
    return {
      success: false,
      latencyMs: roundMs(performance.now() - start),
      error: 'MCP playground session is not connected.',
    };
  }

  try {
    resetIdleTimer(session);
    const result = await session.sendRpc('tools/list', {}, 12000);
    const rawTools = Array.isArray(result?.tools) ? result.tools : [];
    const tools: McpToolDefinition[] = rawTools.map((t: any) => ({
      name: String(t?.name || ''),
      description: typeof t?.description === 'string' ? t.description : undefined,
      inputSchema: t?.inputSchema && typeof t.inputSchema === 'object' ? t.inputSchema : undefined,
    }));
    return {
      success: true,
      tools,
      latencyMs: roundMs(performance.now() - start),
      stderrLogs: [...session.stderrLogs],
    };
  } catch (err: any) {
    return {
      success: false,
      latencyMs: roundMs(performance.now() - start),
      stderrLogs: [...session.stderrLogs],
      error: err?.message || 'Failed to list MCP tools',
    };
  }
}

export async function callPlaygroundTool(
  params: McpPlaygroundToolCallParams
): Promise<McpPlaygroundToolCallResult> {
  const start = performance.now();
  const session = activeSessions.get(params.sessionId);
  if (!session || session.closed) {
    return {
      success: false,
      latencyMs: roundMs(performance.now() - start),
      error: 'MCP playground session is not connected.',
    };
  }

  const timeoutMs = typeof params.timeoutMs === 'number' && params.timeoutMs > 0 ? params.timeoutMs : 20000;

  try {
    resetIdleTimer(session);
    const result = await session.sendRpc(
      'tools/call',
      {
        name: params.toolName,
        arguments: params.arguments || {},
      },
      timeoutMs
    );
    const latencyMs = roundMs(performance.now() - start);
    const isError = Boolean(result?.isError);
    const content = Array.isArray(result?.content) ? result.content : undefined;

    return {
      success: !isError,
      isError,
      content,
      structuredContent: result?.structuredContent,
      rawResponse: result,
      latencyMs,
      stderrLogs: [...session.stderrLogs],
      ...(isError ? { error: 'Tool returned an execution error response.' } : {}),
    };
  } catch (err: any) {
    return {
      success: false,
      isError: true,
      latencyMs: roundMs(performance.now() - start),
      stderrLogs: [...session.stderrLogs],
      error: err?.message || 'Tool execution failed',
    };
  }
}

export function getPlaygroundStatus(sessionId: string): McpPlaygroundStatusResult {
  const session = activeSessions.get(sessionId);
  if (!session || session.closed) {
    return { connected: false, sessionId };
  }
  return {
    connected: true,
    sessionId,
    transport: session.transport,
    stderrLogs: [...session.stderrLogs],
  };
}

export async function disconnectPlayground(sessionId: string): Promise<boolean> {
  if (inFlightConnectIds.has(sessionId)) {
    cancelledConnectIds.add(sessionId);
  }
  const session = activeSessions.get(sessionId);
  if (!session) return inFlightConnectIds.has(sessionId);
  activeSessions.delete(sessionId);
  session.closed = true;

  if (session.idleTimer) {
    clearTimeout(session.idleTimer);
    session.idleTimer = undefined;
  }

  rejectAllPending(session, 'MCP playground session disconnected');

  if (session.sseResponse) {
    try {
      session.sseResponse.destroy();
    } catch {}
  }
  if (session.sseRequest) {
    try {
      session.sseRequest.destroy();
    } catch {}
  }

  if (session.child) {
    const child = session.child;
    try {
      child.stdin?.end();
    } catch {}
    if (process.platform === 'win32' && child.pid) {
      try {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
        killer.on('error', () => {});
      } catch {}
    } else {
      try {
        child.kill('SIGTERM');
      } catch {}
    }
  }

  return true;
}

export function cleanupAllPlaygroundSessions(): void {
  for (const sessionId of Array.from(activeSessions.keys())) {
    void disconnectPlayground(sessionId);
  }
}
