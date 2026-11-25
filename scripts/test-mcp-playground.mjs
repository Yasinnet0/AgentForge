import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function loadPlaygroundModule() {
  const modPath = path.join(ROOT, 'dist-electron', 'mcpPlayground.js');
  return require(modPath);
}

test('connectPlayground connects over stdio, resolves config secrets safely, executes tools/call, and cleans up', async () => {
  const pg = loadPlaygroundModule();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentforge-pg-stdio-'));
  const serverScriptPath = path.join(tmpDir, 'mock-mcp-stdio.mjs');
  const configPath = path.join(tmpDir, 'mcp_config.json');

  const secretToken = 'af_test_secret_token_987654';
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      mcpServers: {
        demoStdio: {
          command: process.execPath,
          args: [serverScriptPath],
          env: { PLAYGROUND_API_SECRET: secretToken },
        },
      },
    }),
    'utf-8'
  );

  fs.writeFileSync(
    serverScriptPath,
    `
import readline from 'node:readline';

console.error('booting with secret ' + (process.env.PLAYGROUND_API_SECRET || 'none'));

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try { msg = JSON.parse(trimmed); } catch { return; }

  if (msg.method === 'initialize') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'mock-stdio-server', version: '1.0.0' },
      },
    }) + '\\n');
    return;
  }

  if (msg.method === 'tools/list') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        tools: [
          {
            name: 'echo_sum',
            description: 'Add two numbers and echo secret presence',
            inputSchema: {
              type: 'object',
              properties: {
                message: { type: 'string', description: 'Note to include' },
                a: { type: 'number', description: 'First operand' },
                b: { type: 'number', description: 'Second operand' },
              },
              required: ['a', 'b'],
            },
          },
        ],
      },
    }) + '\\n');
    return;
  }

  if (msg.method === 'tools/call') {
    const args = msg.params?.arguments || {};
    if (msg.params?.name === 'echo_sum') {
      const sum = Number(args.a || 0) + Number(args.b || 0);
      const hasSecret = process.env.PLAYGROUND_API_SECRET === '${secretToken}';
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          content: [{
            type: 'text',
            text: JSON.stringify({ sum, message: args.message || '', hasSecret }),
          }],
        },
      }) + '\\n');
      return;
    }
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32601, message: 'Unknown tool: ' + msg.params?.name },
    }) + '\\n');
  }
});
`,
    'utf-8'
  );

  try {
    const connectRes = await pg.connectPlayground({
      serverKey: 'demoStdio',
      serverName: 'Demo Stdio',
      transport: 'stdio',
      command: process.execPath,
      args: [serverScriptPath],
      configPaths: [configPath],
      timeoutMs: 8000,
    });

    assert.equal(connectRes.success, true, connectRes.error);
    assert.ok(connectRes.sessionId);
    assert.equal(connectRes.protocolVersion, '2024-11-05');
    assert.ok(connectRes.connectLatencyMs >= 0);
    assert.ok(connectRes.listToolsLatencyMs >= 0);
    assert.deepEqual(connectRes.resolvedEnvKeys, ['PLAYGROUND_API_SECRET']);
    assert.equal(connectRes.tools.length, 1);
    assert.equal(connectRes.tools[0].name, 'echo_sum');

    // Verify stderr redacts raw secret values before reaching UI
    const joinedLogs = (connectRes.stderrLogs || []).join('\n');
    assert.equal(joinedLogs.includes(secretToken), false, 'stderr logs must redact resolved secret tokens');
    assert.ok(joinedLogs.includes('***'));

    const status = pg.getPlaygroundStatus(connectRes.sessionId);
    assert.equal(status.connected, true);

    const callRes = await pg.callPlaygroundTool({
      sessionId: connectRes.sessionId,
      toolName: 'echo_sum',
      arguments: { message: 'hello-pg', a: 17, b: 25 },
    });

    assert.equal(callRes.success, true, callRes.error);
    assert.ok(callRes.latencyMs >= 0);
    assert.equal(callRes.content?.[0]?.type, 'text');
    const payload = JSON.parse(callRes.content[0].text);
    assert.equal(payload.sum, 42);
    assert.equal(payload.message, 'hello-pg');
    assert.equal(payload.hasSecret, true);

    const listRes = await pg.listPlaygroundTools(connectRes.sessionId);
    assert.equal(listRes.success, true);
    assert.equal(listRes.tools.length, 1);

    const badToolRes = await pg.callPlaygroundTool({
      sessionId: connectRes.sessionId,
      toolName: 'missing_tool',
      arguments: {},
    });
    assert.equal(badToolRes.success, false);
    assert.match(badToolRes.error || '', /Unknown tool/i);

    const disconnected = await pg.disconnectPlayground(connectRes.sessionId);
    assert.equal(disconnected, true);
    assert.equal(pg.getPlaygroundStatus(connectRes.sessionId).connected, false);
  } finally {
    pg.cleanupAllPlaygroundSessions();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('connectPlayground supports classic SSE transport and measures latency telemetry', async () => {
  const pg = loadPlaygroundModule();
  const sseClients = new Set();

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/sse') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      sseClients.add(res);
      res.write('event: endpoint\ndata: /messages\n\n');
      req.on('close', () => sseClients.delete(res));
      return;
    }

    if (req.method === 'POST' && req.url === '/messages') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const msg = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        res.writeHead(202).end();

        let reply = null;
        if (msg.method === 'initialize') {
          reply = {
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: 'mock-sse-server', version: '0.1.0' },
            },
          };
        } else if (msg.method === 'tools/list') {
          reply = {
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              tools: [
                {
                  name: 'ping_sse',
                  description: 'Returns pong over SSE',
                  inputSchema: {
                    type: 'object',
                    properties: { target: { type: 'string' } },
                    required: ['target'],
                  },
                },
              ],
            },
          };
        } else if (msg.method === 'tools/call') {
          reply = {
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              content: [{ type: 'text', text: `pong:${msg.params?.arguments?.target || ''}` }],
            },
          };
        }

        if (reply) {
          const frame = `event: message\ndata: ${JSON.stringify(reply)}\n\n`;
          for (const client of sseClients) {
            client.write(frame);
          }
        }
      });
      return;
    }

    res.writeHead(404).end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/sse`;

  try {
    const connectRes = await pg.connectPlayground({
      serverKey: 'demoSse',
      transport: 'sse',
      url: baseUrl,
      timeoutMs: 6000,
    });

    assert.equal(connectRes.success, true, connectRes.error);
    assert.ok(connectRes.sessionId);
    assert.equal(connectRes.tools.length, 1);
    assert.equal(connectRes.tools[0].name, 'ping_sse');

    const callRes = await pg.callPlaygroundTool({
      sessionId: connectRes.sessionId,
      toolName: 'ping_sse',
      arguments: { target: 'agentforge' },
    });

    assert.equal(callRes.success, true, callRes.error);
    assert.equal(callRes.content?.[0]?.text, 'pong:agentforge');
    assert.ok(callRes.latencyMs >= 0);

    await pg.disconnectPlayground(connectRes.sessionId);
  } finally {
    pg.cleanupAllPlaygroundSessions();
    for (const c of sseClients) c.end();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('connectPlayground and callPlaygroundTool reject invalid inputs and closed sessions gracefully', async () => {
  const pg = loadPlaygroundModule();

  const missingCmd = await pg.connectPlayground({
    serverKey: 'empty',
    transport: 'stdio',
    command: '',
  });
  assert.equal(missingCmd.success, false);
  assert.match(missingCmd.error || '', /command/i);

  const badProto = await pg.connectPlayground({
    serverKey: 'badProto',
    transport: 'sse',
    url: 'file:///etc/passwd',
  });
  assert.equal(badProto.success, false);
  assert.match(badProto.error || '', /protocol/i);

  const missingBinary = await pg.connectPlayground({
    serverKey: 'missingBin',
    transport: 'stdio',
    command: 'definitely_nonexistent_binary_agentforge_xyz',
    timeoutMs: 3000,
  });
  assert.equal(missingBinary.success, false);
  assert.ok(missingBinary.error);

  const staleCall = await pg.callPlaygroundTool({
    sessionId: 'nonexistent-session-id',
    toolName: 'foo',
  });
  assert.equal(staleCall.success, false);
  assert.match(staleCall.error || '', /not connected/i);
});
