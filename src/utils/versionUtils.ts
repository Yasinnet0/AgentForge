/**
 * Utility functions for version comparison and semver normalization.
 * Prevents version downgrades (e.g., v2.9.2 -> v1.0.0) and ensures only
 * genuinely newer versions are flagged as updates.
 */

export function parseSemver(v?: string | null): [number, number, number] | null {
  if (!v) return null;
  const clean = v.replace(/^v/i, '').trim();
  const m = clean.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return null;
  return [
    parseInt(m[1] || '0', 10),
    parseInt(m[2] || '0', 10),
    parseInt(m[3] || '0', 10),
  ];
}

/**
 * Checks if upstreamVersion is strictly newer than installedVersion.
 * Returns FALSE if upstreamVersion is less than or equal to installedVersion,
 * or if upstreamVersion is a default unversioned placeholder (like 1.0.0) while
 * the installed package already has a higher release (like 2.9.2).
 */
export function isVersionNewer(
  installedVersion?: string | null,
  upstreamVersion?: string | null
): boolean {
  if (!installedVersion || !upstreamVersion) return false;

  const cleanInst = installedVersion.replace(/^v/i, '').trim().toLowerCase();
  const cleanUp = upstreamVersion.replace(/^v/i, '').trim().toLowerCase();

  // If versions are identical, there is no update
  if (cleanInst === cleanUp) return false;

  const instSemver = parseSemver(cleanInst);
  const upSemver = parseSemver(cleanUp);

  if (instSemver && upSemver) {
    // If upstream major is less than installed major, this is a downgrade -> NOT an update
    if (upSemver[0] < instSemver[0]) return false;
    if (upSemver[0] > instSemver[0]) return true;

    // Majors are equal, compare minor
    if (upSemver[1] < instSemver[1]) return false;
    if (upSemver[1] > instSemver[1]) return true;

    // Minors are equal, compare patch
    return upSemver[2] > instSemver[2];
  }

  // If installed has a real semver (e.g. 2.9.2) but upstream is generic '1.0.0' or 'latest'
  if (instSemver && (cleanUp === '1.0.0' || cleanUp === 'latest' || cleanUp === 'vlatest')) {
    // Upstream has no real newer version than a >= 2.0.0 installation
    return false;
  }

  // If installed is 'installed' or 'configured' and upstream is 'vlatest'
  if (cleanInst.includes('installed') || cleanInst.includes('configured')) {
    return false;
  }

  return false;
}

/**
 * Normalizes a binary command name for cross-platform comparison.
 * Handles Windows .cmd / .exe / .bat wrappers (e.g. 'npx.cmd' -> 'npx', 'uvx.exe' -> 'uvx')
 * as well as full executable paths.
 */
export function normalizeCommand(cmd?: string | null): string {
  if (!cmd) return '';
  return cmd
    .trim()
    .toLowerCase()
    .replace(/\.(cmd|exe|bat|ps1)$/i, '')
    .split(/[/\\]/)
    .pop() || '';
}

/**
 * Normalizes an array of argument strings for comparison.
 */
export function normalizeArgs(args?: string[] | null): string[] {
  if (!Array.isArray(args)) return [];
  return args.map((a) => (typeof a === 'string' ? a.trim() : String(a)));
}

/**
 * Checks if an upstream catalog MCP server represents an actual update
 * compared to an installed/scanned MCP server.
 *
 * CRITICAL RULE: Environment variables (such as GITHUB_PERSONAL_ACCESS_TOKEN,
 * API keys, or custom tokens) are user-configured credentials, NOT upstream code.
 * The presence of user tokens in the local configuration must NEVER cause an MCP
 * server to be flagged as having an update.
 */
export function isMcpUpdateAvailable(
  installed?: {
    command?: string;
    args?: string[];
    url?: string;
    transport?: string;
  } | null,
  catalog?: {
    command?: string;
    args?: string[];
    url?: string;
    transport?: string;
  } | null
): boolean {
  if (!installed || !catalog) return false;

  // 1. Check transport
  const instTransport = (installed.transport || 'stdio').toLowerCase();
  const catTransport = (catalog.transport || 'stdio').toLowerCase();
  if (instTransport !== catTransport) {
    return true;
  }

  // 2. For SSE / HTTP transports, check URL
  if (catTransport === 'sse') {
    const instUrl = (installed.url || '').trim().toLowerCase();
    const catUrl = (catalog.url || '').trim().toLowerCase();
    return Boolean(catUrl && instUrl !== catUrl);
  }

  // 3. For stdio transports, check normalized command
  const normInstCmd = normalizeCommand(installed.command);
  const normCatCmd = normalizeCommand(catalog.command);

  // If catalog specifies a command and they differ (e.g. npx -> uvx)
  if (normCatCmd && normInstCmd !== normCatCmd) {
    return true;
  }

  // 4. Compare arguments
  const instArgs = normalizeArgs(installed.args);
  const catArgs = normalizeArgs(catalog.args);

  if (catArgs.length > 0) {
    if (instArgs.length !== catArgs.length) {
      return true;
    }
    for (let i = 0; i < catArgs.length; i++) {
      if (instArgs[i] !== catArgs[i]) {
        return true;
      }
    }
  }

  // If command and args are equivalent, no update exists.
  // User's private env tokens do NOT constitute an update.
  return false;
}
