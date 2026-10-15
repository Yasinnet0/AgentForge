import { DependencyCheckInfo, DependencyReport } from '../types/dependencies';

export const KNOWN_DEPENDENCIES_META: Record<string, Omit<DependencyCheckInfo, 'installed' | 'path' | 'version'>> = {
  uv: {
    binary: 'uv',
    name: 'Astral uv',
    description: 'Extremely fast Python package installer and runner. Essential for uvx-based Model Context Protocol servers and isolated Python tools.',
    docsUrl: 'https://docs.astral.sh/uv/',
    isCritical: true,
    installSnippets: {
      windows: 'winget install astral-sh.uv',
      mac: 'brew install uv',
      linux: 'curl -LsSf https://astral.sh/uv/install.sh | sh',
    },
  },
  python3: {
    binary: 'python3',
    name: 'Python 3.10+',
    description: 'Modern Python runtime required for execution of scientific, AI agent, and automation scripts.',
    docsUrl: 'https://www.python.org/downloads/',
    isCritical: true,
    installSnippets: {
      windows: 'winget install Python.Python.3.12',
      mac: 'brew install python@3.12',
      linux: 'sudo apt-get install -y python3 python3-pip',
    },
  },
  node: {
    binary: 'node',
    name: 'Node.js LTS',
    description: 'JavaScript runtime engine required to run Node-based MCP servers and modern development tools.',
    docsUrl: 'https://nodejs.org/',
    isCritical: true,
    installSnippets: {
      windows: 'winget install OpenJS.NodeJS.LTS',
      mac: 'brew install node',
      linux: 'sudo apt-get install -y nodejs npm',
    },
  },
  npx: {
    binary: 'npx',
    name: 'npm / npx',
    description: 'Node Package Execute CLI used to dynamically execute packaged stdio and SSE MCP servers directly from npm.',
    docsUrl: 'https://docs.npmjs.com/cli/commands/npx',
    isCritical: true,
    installSnippets: {
      windows: 'winget install OpenJS.NodeJS.LTS',
      mac: 'brew install node',
      linux: 'sudo apt-get install -y npm',
    },
  },
  docker: {
    binary: 'docker',
    name: 'Docker Desktop / Engine',
    description: 'Container virtualization engine required for sandboxed containers, isolated databases, and Docker MCP servers.',
    docsUrl: 'https://www.docker.com/products/docker-desktop/',
    isCritical: false,
    installSnippets: {
      windows: 'winget install Docker.DockerDesktop',
      mac: 'brew install --cask docker',
      linux: 'sudo apt-get install -y docker.io && sudo systemctl enable --now docker',
    },
  },
  git: {
    binary: 'git',
    name: 'Git Version Control',
    description: 'Distributed version control system required for repository inspection, cloning skill kits, and staging changes.',
    docsUrl: 'https://git-scm.com/',
    isCritical: true,
    installSnippets: {
      windows: 'winget install Git.Git',
      mac: 'brew install git',
      linux: 'sudo apt-get install -y git',
    },
  },
  go: {
    binary: 'go',
    name: 'Go Language (Golang)',
    description: 'High-performance Go compiler and runtime required for Golang-based MCP servers and native extensions.',
    docsUrl: 'https://go.dev/dl/',
    isCritical: false,
    installSnippets: {
      windows: 'winget install GoLang.Go',
      mac: 'brew install go',
      linux: 'sudo apt-get install -y golang-go',
    },
  },
};

/**
 * Derives required system binaries for an MCP server, skill, or plugin.
 */
export function getRequiredDependencies(item: {
  command?: string;
  args?: string[];
  tags?: string[];
  category?: string;
  description?: string;
  name?: string;
  hasScripts?: boolean;
}): string[] {
  const deps = new Set<string>();

  const cmd = (item.command || '').trim().toLowerCase();
  const name = (item.name || '').toLowerCase();
  const desc = (item.description || '').toLowerCase();
  const tags = (item.tags || []).map((t) => t.toLowerCase());

  // Command based rules
  if (cmd === 'uvx' || cmd === 'uv') {
    deps.add('uv');
    deps.add('python3');
  } else if (cmd === 'npx' || cmd === 'node') {
    deps.add('node');
    deps.add('npx');
  } else if (cmd === 'docker') {
    deps.add('docker');
  } else if (cmd === 'go') {
    deps.add('go');
  } else if (cmd === 'python' || cmd === 'python3') {
    deps.add('python3');
  } else if (cmd === 'git') {
    deps.add('git');
  }

  // Docker explicit mentions
  if (name.includes('docker') || tags.includes('docker') || desc.includes('docker container') || desc.includes('docker daemon')) {
    deps.add('docker');
  }

  // Go explicit mentions
  if (tags.includes('golang') || tags.includes('go-sdk') || name.startsWith('go-') || name.endsWith('-go')) {
    deps.add('go');
  }

  // Python explicit mentions for skills
  if (
    tags.includes('python') ||
    tags.includes('pip') ||
    tags.includes('pytorch') ||
    tags.includes('tensorflow') ||
    tags.includes('scikit') ||
    desc.includes('python 3') ||
    desc.includes('python script')
  ) {
    deps.add('python3');
  }

  // uv explicit mentions
  if (tags.includes('uv') || tags.includes('uvx') || desc.includes('astral uv') || desc.includes('uv package manager')) {
    deps.add('uv');
    deps.add('python3');
  }

  // Git tools
  if (cmd === 'git' || tags.includes('git-hooks') || tags.includes('git-advanced') || name.includes('git repository mcp')) {
    deps.add('git');
  }

  return Array.from(deps);
}

export interface DependencyStatusResult {
  status: 'ready' | 'missing' | 'none' | 'checking';
  requiredBinaries: string[];
  missingBinaries: string[];
  firstMissing?: string;
}

export function evaluateDependencyStatus(
  requiredBinaries: string[],
  report: DependencyReport | null
): DependencyStatusResult {
  if (!requiredBinaries || requiredBinaries.length === 0) {
    return {
      status: 'none',
      requiredBinaries: [],
      missingBinaries: [],
    };
  }

  if (!report) {
    return {
      status: 'checking',
      requiredBinaries,
      missingBinaries: [],
    };
  }

  const missing: string[] = [];

  for (const bin of requiredBinaries) {
    const info = report[bin];
    if (!info || !info.installed) {
      missing.push(bin);
    }
  }

  if (missing.length === 0) {
    return {
      status: 'ready',
      requiredBinaries,
      missingBinaries: [],
    };
  }

  return {
    status: 'missing',
    requiredBinaries,
    missingBinaries: missing,
    firstMissing: missing[0],
  };
}

export function getCurrentPlatform(): 'windows' | 'mac' | 'linux' {
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('win')) return 'windows';
    if (ua.includes('mac')) return 'mac';
    if (ua.includes('linux')) return 'linux';
  }
  return 'windows';
}

export function getInstallSnippetForPlatform(binary: string, platform?: 'windows' | 'mac' | 'linux'): string {
  const p = platform || getCurrentPlatform();
  const meta = KNOWN_DEPENDENCIES_META[binary];
  if (!meta) {
    if (p === 'windows') return `winget install ${binary}`;
    if (p === 'mac') return `brew install ${binary}`;
    return `sudo apt install ${binary}`;
  }
  return meta.installSnippets[p] || meta.installSnippets.windows;
}
