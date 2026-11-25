import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const store = require('../dist-electron/mcpConfigStore.js');

test('parseJsoncSafe handles BOM, comments, trailing commas, and preserves string literals with ,}', () => {
  const raw = `\uFEFF// Global header comment
  {
    /* Multi-line
       comment */
    "theme": "light",
    "mcpServers": {
      "regex-demo": {
        "command": "node",
        "args": ["-e", "console.log('foo,}')"], // inline comment
        "env": {
          "TOKEN": "ghp_realSecret123", // token
        },
      },
    },
  }`;

  const res = store.parseJsoncSafe(raw);
  assert.equal(res.ok, true);
  assert.equal(res.data.theme, 'light');
  assert.equal(res.data.mcpServers['regex-demo'].args[1], "console.log('foo,}')");
  assert.equal(res.data.mcpServers['regex-demo'].env.TOKEN, 'ghp_realSecret123');
});

test('parseJsoncSafe handles empty files and rejects invalid or non-object roots without wiping data', () => {
  const emptyRes = store.parseJsoncSafe('   \n  ');
  assert.equal(emptyRes.ok, true);
  assert.deepEqual(emptyRes.data, {});

  const arrayRes = store.parseJsoncSafe('[1, 2, 3]');
  assert.equal(arrayRes.ok, false);

  const nullRes = store.parseJsoncSafe('null');
  assert.equal(nullRes.ok, false);

  const badSyntaxRes = store.parseJsoncSafe('{ "mcpServers": { broken }');
  assert.equal(badSyntaxRes.ok, false);

  const unterminatedRes = store.parseJsoncSafe('{ "a": "hello');
  assert.equal(unterminatedRes.ok, false);
});

test('mergeMcpServerConfig preserves non-empty API secrets over placeholders and Windows wrappers', () => {
  const existing = {
    command: 'npx.cmd',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_LiveSecretToken999',
      CUSTOM_API_KEY: 'custom-user-key',
    },
  };

  const incoming = {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github@latest'],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: '<YOUR_TOKEN>',
      NEW_OPTIONAL_FLAG: 'enabled',
    },
  };

  const mergedWin = store.mergeMcpServerConfig(existing, incoming, 'win32');
  assert.equal(mergedWin.command, 'npx.cmd');
  assert.equal(mergedWin.env.GITHUB_PERSONAL_ACCESS_TOKEN, 'ghp_LiveSecretToken999');
  assert.equal(mergedWin.env.CUSTOM_API_KEY, 'custom-user-key');
  assert.equal(mergedWin.env.NEW_OPTIONAL_FLAG, 'enabled');

  // If incoming replaces with a real non-placeholder value, accept it
  const incomingOverride = {
    command: 'npx',
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_ExplicitOverrideValue' },
  };
  const mergedOverride = store.mergeMcpServerConfig(existing, incomingOverride, 'linux');
  assert.equal(mergedOverride.command, 'npx');
  assert.equal(mergedOverride.env.GITHUB_PERSONAL_ACCESS_TOKEN, 'ghp_ExplicitOverrideValue');
});

test('Multi-agent containers preserve unrelated settings for Zed, OpenCode, and Continue', () => {
  // 1. Zed settings.json
  const zedConfig = {
    theme: 'One Light',
    tab_size: 2,
    context_servers: {
      github: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_ZedSecret' },
      },
    },
  };

  store.applyMcpInstallToObject('zed', zedConfig, 'github', {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github@new'],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
  });
  assert.equal(zedConfig.theme, 'One Light');
  assert.equal(zedConfig.context_servers.github.env.GITHUB_PERSONAL_ACCESS_TOKEN, 'ghp_ZedSecret');

  const toggleZedOff = store.applyMcpToggleToObject('zed', zedConfig, 'github', false);
  assert.equal(toggleZedOff.modified, true);
  assert.equal(zedConfig.context_servers.github, undefined);
  assert.ok(zedConfig.disabled_context_servers.github);

  const zedList = store.listMcpServersFromObject(zedConfig);
  assert.equal(zedList.length, 1);
  assert.equal(zedList[0].disabled, true);

  // 2. OpenCode native mcp dictionary with command[] and environment
  const opencodeConfig = {
    model: 'anthropic/claude-sonnet',
    mcp: {
      postgres: {
        type: 'local',
        command: ['npx', '-y', '@modelcontextprotocol/server-postgres'],
        environment: { POSTGRES_URL: 'postgres://user:pass@localhost/db' },
        enabled: true,
      },
    },
  };

  store.applyMcpInstallToObject('opencode', opencodeConfig, 'postgres', {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres@latest'],
    env: { POSTGRES_URL: 'YOUR_API_KEY' },
  });
  assert.equal(opencodeConfig.model, 'anthropic/claude-sonnet');
  assert.equal(opencodeConfig.mcp.postgres.environment.POSTGRES_URL, 'postgres://user:pass@localhost/db');

  store.applyMcpToggleToObject('opencode', opencodeConfig, 'postgres', false);
  assert.equal(opencodeConfig.mcp.postgres.enabled, false);

  const ocList = store.listMcpServersFromObject(opencodeConfig);
  assert.equal(ocList[0].command, 'npx');
  assert.equal(ocList[0].disabled, true);

  // 3. Continue experimental.modelContextProtocolServers array format
  const continueConfig = {
    models: [{ title: 'Claude' }],
    experimental: {
      modelContextProtocolServers: [
        { name: 'sqlite', command: 'uvx', args: ['mcp-server-sqlite'], env: { DB_KEY: 'secret-db' } },
      ],
    },
  };
  store.applyMcpInstallToObject('continue', continueConfig, 'sqlite', {
    command: 'uvx',
    args: ['mcp-server-sqlite', '--db', './test.db'],
    env: { DB_KEY: '' },
  });
  assert.equal(continueConfig.experimental.modelContextProtocolServers.length, 1);
  assert.equal(continueConfig.experimental.modelContextProtocolServers[0].env.DB_KEY, 'secret-db');
});

test('writeJsonAtomicWithBackup and backupCorruptConfigFile protect disk files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentforge-mcp-test-'));
  try {
    const configPath = path.join(tmpDir, 'mcp_config.json');
    fs.writeFileSync(configPath, '{"mcpServers":{"old":{"command":"npx"}}}', 'utf-8');

    store.writeJsonAtomicWithBackup(configPath, { mcpServers: { updated: { command: 'uvx' } } });
    assert.ok(fs.existsSync(`${configPath}.bak`), '.bak snapshot should be created');
    const bakData = JSON.parse(fs.readFileSync(`${configPath}.bak`, 'utf-8'));
    assert.ok(bakData.mcpServers.old);

    const corruptPath = path.join(tmpDir, 'broken.json');
    fs.writeFileSync(corruptPath, '{ "mcpServers": { bad json ', 'utf-8');
    const readRes = store.readMcpConfigFile(corruptPath);
    assert.equal(readRes.ok, false);
    const corruptBak = store.backupCorruptConfigFile(corruptPath);
    assert.ok(corruptBak && fs.existsSync(corruptBak));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
