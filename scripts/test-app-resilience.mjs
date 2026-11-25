import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);

test('index.html contains pre-paint synchronous theme boot script and relative ./icon.png', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  assert.match(html, /href="\.\/icon\.png"/, 'Favicon must be relative ./icon.png for Electron file:// packaging');
  assert.doesNotMatch(html, /href="\/icon\.png"/, 'Absolute /icon.png breaks packaged Electron builds');
  assert.match(html, /localStorage\.getItem\('agentforge_theme'\)/);
  assert.match(html, /document\.documentElement\.dataset\.theme\s*=/);
});

test('src/index.css defines matching dark and light CSS token sets without scrollbar-width on .category-pills', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf-8');
  assert.match(css, /\[data-theme="dark"\]/);
  assert.match(css, /\[data-theme="light"\]/);

  const requiredTokens = [
    '--bg-app',
    '--bg-sidebar',
    '--bg-header',
    '--bg-surface',
    '--bg-card',
    '--bg-card-inner',
    '--bg-elevated',
    '--bg-input',
    '--bg-pill',
    '--bg-backdrop',
    '--border-subtle',
    '--border-hover',
    '--text-primary',
    '--text-secondary',
    '--text-muted',
    '--shadow-card',
    '--shadow-modal',
  ];

  const lightSection = css.split('[data-theme="light"]')[1] || '';
  for (const token of requiredTokens) {
    assert.ok(css.includes(`${token}:`), `Dark theme missing ${token}`);
    assert.ok(lightSection.includes(`${token}:`), `Light theme missing ${token}`);
  }

  // Chromium WebKit scrollbar rule: never set scrollbar-width on .category-pills
  const catPillIdx = css.indexOf('.category-pills::-webkit-scrollbar');
  assert.ok(catPillIdx > 0);
  const aroundCatPill = css.slice(Math.max(0, catPillIdx - 120), catPillIdx + 400);
  assert.doesNotMatch(aroundCatPill, /scrollbar-width\s*:/);
});

test('Every component <style> block has balanced braces and references CSS variables', () => {
  const compDir = path.join(ROOT, 'src/components');
  const files = fs.readdirSync(compDir).filter((f) => f.endsWith('.tsx'));
  assert.ok(files.length >= 25);

  for (const file of files) {
    const content = fs.readFileSync(path.join(compDir, file), 'utf-8');
    const styleMatch = content.match(/<style>\{`([\s\S]*?)`\}<\/style>/);
    if (!styleMatch) continue;
    const css = styleMatch[1];

    // Verify balanced curly braces inside CSS template
    let depth = 0;
    for (const ch of css) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      assert.ok(depth >= 0, `${file} has unmatched closing '}' in <style>`);
    }
    assert.equal(depth, 0, `${file} has unclosed '{' in <style>`);

    // Ensure main view/modal components do not hardcode #090d16 or #0d121f backgrounds
    assert.doesNotMatch(css, /background(?:-color)?\s*:\s*(?:#090d16|#0d121f|#121826|#131927)\b/i, `${file} still hardcodes dark background hex`);

    // Ensure 1px dividers/connectors never use faint bg-elevated/bg-pill and dark radial backdrops are tokenized
    assert.doesNotMatch(css, /height:\s*1px;\s*background:\s*var\(--bg-(?:elevated|pill)\)/, `${file} has invisible 1px divider`);
    assert.doesNotMatch(css, /radial-gradient\([^)]*rgba\(13,\s*19,\s*36/, `${file} has hardcoded dark radial modal overlay`);
    assert.doesNotMatch(css, /color:\s*#(?:8fa0b5|7f91a7|72849a|8da1b8|55677d)\b/i, `${file} has washed-out legacy hex text`);
  }
});

test('Light mode preserves surface hierarchy, domain variables, and valid 6-digit agent colors', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf-8');
  const lightSection = css.split('[data-theme="light"]')[1] || '';

  const getToken = (name) => {
    const m = lightSection.match(new RegExp(`${name}:\\s*([^;]+);`));
    return m ? m[1].trim() : '';
  };

  assert.notEqual(getToken('--bg-app'), '');
  assert.equal(getToken('--bg-card'), '#ffffff');
  assert.notEqual(getToken('--bg-card-inner'), '#ffffff', 'Light mode inner card wells must be distinct from #ffffff card surfaces');
  assert.notEqual(getToken('--bg-app'), getToken('--bg-card'), 'Light mode app canvas must separate from card surfaces');

  for (const token of [
    '--bg-modal-overlay',
    '--shadow-card-hover',
    '--domain-sky-fg',
    '--domain-emerald-fg',
    '--domain-purple-fg',
  ]) {
    assert.ok(css.includes(`${token}:`), `Dark theme missing ${token}`);
    assert.ok(lightSection.includes(`${token}:`), `Light theme missing ${token}`);
  }

  const capIcon = fs.readFileSync(path.join(ROOT, 'src/components/CapabilityIcon.tsx'), 'utf-8');
  assert.match(capIcon, /var\(--domain-/);
  assert.doesNotMatch(capIcon, /color:\s*'#(?:38bdf8|34d399|c084fc)'/i);

  const agentsTs = fs.readFileSync(path.join(ROOT, 'src/config/supportedAgents.ts'), 'utf-8');
  const colors = [...agentsTs.matchAll(/color:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(colors.length >= 12);
  for (const hex of colors) {
    assert.match(hex, /^#[0-9a-fA-F]{6}$/, `Agent color ${hex} must be 6-digit hex for alpha suffix templates`);
  }
  assert.doesNotMatch(agentsTs, /#(?:eab308|38bdf8)\b/i);
});

test('App.tsx guards saved agent selection with Array.isArray and validates NavTab', () => {
  const appTsx = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf-8');
  assert.match(appTsx, /VALID_NAV_TABS/);
  assert.match(appTsx, /Array\.isArray\(parsed\)/);
});

test('electron/main.ts wires recovery handlers, setTheme, checkForUpdates, and async env:checkDependencies', () => {
  const mainTs = fs.readFileSync(path.join(ROOT, 'electron/main.ts'), 'utf-8');
  assert.match(mainTs, /did-fail-load/);
  assert.match(mainTs, /render-process-gone/);
  assert.match(mainTs, /app:setTheme/);
  assert.match(mainTs, /app:checkForUpdates/);
  assert.match(mainTs, /if\s*\(\s*gotTheLock\s*\)/);
  assert.doesNotMatch(mainTs, /execSync\(/, 'env:checkDependencies should not use blocking execSync on startup');
});

test('ThemeContext and index.css implement View Transition switching without html.theme-snap animation flicker', () => {
  const themeCtx = fs.readFileSync(path.join(ROOT, 'src/context/ThemeContext.tsx'), 'utf-8');
  assert.match(themeCtx, /startViewTransition/);
  assert.match(themeCtx, /flushSync/);

  const css = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf-8');
  assert.match(css, /::view-transition-new\(root\)/);
  assert.match(css, /html\.theme-snap/);
  assert.ok(css.includes('--bg-card-gradient:'), 'Missing --bg-card-gradient token');
  assert.ok(css.includes('--bg-spotlight-card:'), 'Missing --bg-spotlight-card token');
  assert.ok(css.includes('--divider-shelf:'), 'Missing --divider-shelf token');

  const snapBlockMatch = css.match(/html\.theme-snap[^{]*\{([\s\S]*?)\}/);
  assert.ok(snapBlockMatch, 'Could not locate html.theme-snap CSS block');
  assert.doesNotMatch(snapBlockMatch[1], /animation\s*:|animation-duration\s*:/, 'html.theme-snap must never suppress CSS animations');
});

test('component inline stylesheets never pair low-alpha rgba backgrounds with white text', () => {
  const compDir = path.join(ROOT, 'src/components');
  const files = fs.readdirSync(compDir).filter((f) => f.endsWith('.tsx'));

  for (const file of files) {
    const src = fs.readFileSync(path.join(compDir, file), 'utf-8');
    const styleMatches = [...src.matchAll(/<style>\{`([\s\S]*?)`\}<\/style>/g)];
    for (const styleMatch of styleMatches) {
      const ruleBlocks = [...styleMatch[1].matchAll(/([^{}@]+)\{([^{}]*)\}/g)];
      for (const [, selector, declarations] of ruleBlocks) {
        const hasLowAlphaBg = /background(?:-color)?\s*:\s*rgba\([^)]*,\s*0?\.[012]\d*\s*\)/i.test(declarations);
        const hasWhiteColor = /(?:^|[;\s])color\s*:\s*(?:#fff(?:fff)?|white)\b/i.test(declarations);
        assert.ok(
          !(hasLowAlphaBg && hasWhiteColor),
          `${file} rule "${selector.trim()}" pairs low-alpha background with white text, unreadable in Light Mode`
        );
      }
    }
  }
});

test('Light mode eliminates white-on-white surfaces, fixes modal footer wrapping, and exposes MCP Playground IPC', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf-8');
  const lightSection = css.split('[data-theme="light"]')[1] || '';
  const getToken = (name) => {
    const m = lightSection.match(new RegExp(`${name}:\\s*([^;]+);`));
    return m ? m[1].trim() : '';
  };

  assert.notEqual(getToken('--bg-elevated'), '#ffffff', 'Light mode --bg-elevated must not blend with white cards');
  assert.notEqual(getToken('--bg-input'), '#ffffff', 'Light mode --bg-input must not blend with white surfaces');
  assert.ok(css.includes('--bg-segment-active:'), 'Both themes should define --bg-segment-active');
  assert.ok(css.includes('--border-segment-active:'), 'Both themes should define --border-segment-active');
  assert.ok(css.includes('--shadow-segment-active:'), 'Both themes should define --shadow-segment-active');
  assert.notEqual(getToken('--border-segment-active'), '', 'Light mode must specify --border-segment-active');

  for (const segView of ['SkillsView.tsx', 'McpServersView.tsx', 'PluginsView.tsx', 'AgentsManagerView.tsx']) {
    const src = fs.readFileSync(path.join(ROOT, 'src/components', segView), 'utf-8');
    const segControls = src.match(/\.segmented-controls\s*\{([^}]*)\}/);
    assert.ok(segControls, `${segView} missing .segmented-controls rule`);
    assert.match(segControls[1], /overflow\s*:\s*visible\b/, `${segView} .segmented-controls must be overflow: visible to prevent clipping`);
    assert.doesNotMatch(segControls[1], /overflow\s*:\s*hidden\b/, `${segView} .segmented-controls must not be overflow: hidden`);

    const pill = src.match(/\.segment-indicator-pill\s*\{([^}]*)\}/);
    assert.ok(pill, `${segView} missing .segment-indicator-pill rule`);
    assert.match(pill[1], /border\s*:\s*1px\s+solid\s+var\(--border-segment-active\)/, `${segView} pill must use --border-segment-active`);
    assert.match(pill[1], /box-sizing\s*:\s*border-box/, `${segView} pill must declare box-sizing: border-box`);

    // Verify subpixel border offset compensation in updateSegmentPill
    assert.match(src, /container\.clientLeft/, `${segView} updateSegmentPill must subtract container.clientLeft to align coordinate space`);
  }

  const agentDropTsx = fs.readFileSync(path.join(ROOT, 'src/components/AgentSelectorDropdown.tsx'), 'utf-8');
  assert.doesNotMatch(agentDropTsx, /className="target-dot"/, 'AgentSelectorDropdown should not render glowing target-dot circle');
  const agentMenuBlock = agentDropTsx.match(/\.agent-dropdown-menu\s*\{([^}]*)\}/);
  assert.ok(agentMenuBlock, 'Missing .agent-dropdown-menu rule');
  assert.match(agentMenuBlock[1], /width\s*:\s*100%/, 'Agent dropdown menu width must match trigger box width');
  const checkedBlock = agentDropTsx.match(/\.custom-checkbox\.checked\s*\{([^}]*)\}/);
  assert.ok(checkedBlock, 'Missing .custom-checkbox.checked rule');
  assert.match(checkedBlock[1], /color\s*:\s*#ffffff\b/i, 'AgentSelectorDropdown checked checkbox must keep crisp white checkmark');

  for (const modalView of ['PluginsView.tsx', 'SkillsView.tsx', 'McpServersView.tsx']) {
    const src = fs.readFileSync(path.join(ROOT, 'src/components', modalView), 'utf-8');
    const footerRight = src.match(/\.item-modal-footer-right\s*\{([^}]*)\}/);
    assert.ok(footerRight, `${modalView} missing .item-modal-footer-right rule`);
    assert.match(footerRight[1], /flex-wrap\s*:\s*wrap\b/, `${modalView} .item-modal-footer-right must wrap instead of clipping buttons`);
    assert.doesNotMatch(footerRight[1], /flex-wrap\s*:\s*nowrap\b/, `${modalView} .item-modal-footer-right must not force nowrap`);
  }

  assert.ok(fs.existsSync(path.join(ROOT, 'src/components/McpPlaygroundModal.tsx')));
  assert.ok(fs.existsSync(path.join(ROOT, 'electron/mcpPlayground.ts')));
  const mainTs = fs.readFileSync(path.join(ROOT, 'electron/main.ts'), 'utf-8');
  assert.match(mainTs, /mcp:playgroundConnect/);
  assert.match(mainTs, /mcp:playgroundCallTool/);
});

test('Grid cards avoid truncated footer source-badges and raw id slugs while preserving modal metadata', () => {
  for (const cardView of [
    'PluginsView.tsx',
    'SkillsView.tsx',
    'McpServersView.tsx',
    'RecentlyInstalledPackages.tsx',
  ]) {
    const src = fs.readFileSync(path.join(ROOT, 'src/components', cardView), 'utf-8');
    assert.doesNotMatch(
      src,
      /className="[^"]*\bsource-badge\b[^"]*"/,
      `${cardView} should not render truncated footer .source-badge pills on grid cards`
    );
  }

  const pluginsSrc = fs.readFileSync(path.join(ROOT, 'src/components/PluginsView.tsx'), 'utf-8');
  assert.doesNotMatch(
    pluginsSrc,
    /className="source-path-clean/,
    'PluginsView grid cards should not clutter footer with raw plugin.id slugs'
  );
  assert.match(pluginsSrc, /<div className="meta-k">SOURCE<\/div>/);
  assert.match(pluginsSrc, /selectedPluginForDetails\.sourceRegistry/);
});

test('MCP Playground aborts and cleans up session if disconnected mid-connect', async () => {
  const mcpPlaygroundPath = path.join(ROOT, 'dist-electron', 'mcpPlayground.js');
  if (!fs.existsSync(mcpPlaygroundPath)) {
    return;
  }
  const { connectPlayground, disconnectPlayground, getPlaygroundStatus } = require(mcpPlaygroundPath);

  const sessionId = 'test-mid-connect-cancel-' + Date.now();
  const connectPromise = connectPlayground({
    sessionId,
    serverKey: 'slow-mock',
    transport: 'stdio',
    command: process.execPath,
    args: ['-e', 'setTimeout(() => {}, 15000)'],
    timeoutMs: 10000,
  });

  // Allow process spawn, then cancel while initialize handshake is still pending
  await new Promise((r) => setTimeout(r, 150));
  const cancelled = await disconnectPlayground(sessionId);
  assert.equal(cancelled, true);

  const res = await connectPromise;
  assert.equal(res.success, false);
  assert.equal(getPlaygroundStatus(sessionId).connected, false);
});

test('McpServersView gates Playground entry points behind installedAgents check', () => {
  const mcpSrc = fs.readFileSync(path.join(ROOT, 'src/components/McpServersView.tsx'), 'utf-8');
  assert.match(mcpSrc, /server\.installedAgents\.length\s*>\s*0\s*&&\s*\([\s\S]{0,120}playground-btn/);
  assert.match(mcpSrc, /isInstalled\s*&&\s*\([\s\S]{0,600}Open in Playground/);
  assert.match(mcpSrc, /selectedMcpForDetails\.installedAgents\.length\s*>\s*0\s*&&\s*\([\s\S]{0,120}btn-playground/);
});
