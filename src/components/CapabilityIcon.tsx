import React from 'react';
import {
  Layout,
  Cpu,
  Database,
  GitBranch,
  Terminal,
  Bug,
  ShieldCheck,
  Brain,
  Compass,
  Box,
  Globe,
  Workflow,
  Sparkles,
  Cable,
  Package,
  Layers,
  FileCode2,
  Lock,
  LucideIcon,
} from 'lucide-react';

export interface CapabilityIconProps {
  type: 'skill' | 'mcp' | 'plugin';
  category?: string;
  name: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export interface DomainTheme {
  color: string;
  bg: string;
  border: string;
  glow: string;
}

/**
 * Returns a tasteful, subtle ambient theme based on domain.
 * Provides a quiet 8-10% tint for avatars and a crisp accent color for icons,
 * eliminating the "gray and dead" look without adding rainbow badge clutter.
 */
const domainThemeCache = new Map<string, DomainTheme>();

export function getDomainTheme(category?: string, type?: 'skill' | 'mcp' | 'plugin'): DomainTheme {
  const normCat = (category || '').toLowerCase().trim();
  const cacheKey = `${normCat}:${type || ''}`;
  const existing = domainThemeCache.get(cacheKey);
  if (existing) return existing;

  const resolve = (): DomainTheme => {
    // 1. Frontend & UI
  if (normCat.includes('frontend') || normCat.includes('ui')) {
    return {
      color: '#c084fc', // purple-400
      bg: 'rgba(168, 85, 247, 0.08)',
      border: 'rgba(168, 85, 247, 0.22)',
      glow: 'rgba(168, 85, 247, 0.16)',
    };
  }

  // 2. Backend, APIs & Developer Tools
  if (normCat.includes('backend') || normCat.includes('developer') || normCat.includes('engineering') || normCat.includes('desktop')) {
    return {
      color: '#a855f7', // purple-500
      bg: 'rgba(168, 85, 247, 0.08)',
      border: 'rgba(168, 85, 247, 0.22)',
      glow: 'rgba(168, 85, 247, 0.16)',
    };
  }

  // 3. Web, Cloud, Browser & Network
  if (normCat.includes('web') || normCat.includes('browser') || normCat.includes('cloud') || normCat.includes('devops') || normCat.includes('git')) {
    return {
      color: '#38bdf8', // sky-400
      bg: 'rgba(56, 189, 248, 0.08)',
      border: 'rgba(56, 189, 248, 0.22)',
      glow: 'rgba(56, 189, 248, 0.16)',
    };
  }

  // 4. Database & Storage
  if (normCat.includes('database') || normCat.includes('storage')) {
    return {
      color: '#34d399', // emerald-400
      bg: 'rgba(52, 211, 153, 0.08)',
      border: 'rgba(52, 211, 153, 0.22)',
      glow: 'rgba(52, 211, 153, 0.16)',
    };
  }

  // 5. AI, Reasoning & Multi-Agent
  if (normCat.includes('ai') || normCat.includes('agent') || normCat.includes('brain') || normCat.includes('prompt')) {
    return {
      color: '#fb923c', // orange-400
      bg: 'rgba(251, 146, 60, 0.08)',
      border: 'rgba(251, 146, 60, 0.22)',
      glow: 'rgba(251, 146, 60, 0.16)',
    };
  }

  // 6. Testing, Quality & Code Review
  if (normCat.includes('testing') || normCat.includes('quality') || normCat.includes('review') || normCat.includes('qa') || normCat.includes('debugging')) {
    return {
      color: '#818cf8', // indigo-400
      bg: 'rgba(99, 102, 241, 0.08)',
      border: 'rgba(99, 102, 241, 0.22)',
      glow: 'rgba(99, 102, 241, 0.16)',
    };
  }

  // 7. Security & Forensics
  if (normCat.includes('security') || normCat.includes('forensics')) {
    return {
      color: '#f43f5e', // rose-500
      bg: 'rgba(244, 63, 94, 0.08)',
      border: 'rgba(244, 63, 94, 0.22)',
      glow: 'rgba(244, 63, 94, 0.16)',
    };
  }

  // 8. Creative, 3D & Gaming
  if (normCat.includes('creative') || normCat.includes('3d') || normCat.includes('game') || normCat.includes('media')) {
    return {
      color: '#f472b6', // pink-400
      bg: 'rgba(244, 114, 182, 0.08)',
      border: 'rgba(244, 114, 182, 0.22)',
      glow: 'rgba(244, 114, 182, 0.16)',
    };
  }

  // 9. System, Automation & Productivity
  if (normCat.includes('system') || normCat.includes('automation') || normCat.includes('productivity') || normCat.includes('monitoring')) {
    return {
      color: '#2dd4bf', // teal-400
      bg: 'rgba(45, 212, 191, 0.08)',
      border: 'rgba(45, 212, 191, 0.22)',
      glow: 'rgba(45, 212, 191, 0.16)',
    };
  }

  // 10. Research & Science
  if (normCat.includes('research') || normCat.includes('science')) {
    return {
      color: '#a78bfa', // violet-400
      bg: 'rgba(167, 139, 250, 0.08)',
      border: 'rgba(167, 139, 250, 0.22)',
      glow: 'rgba(167, 139, 250, 0.16)',
    };
  }

  // Fallbacks by type
  if (type === 'mcp') {
    return {
      color: '#38bdf8',
      bg: 'rgba(56, 189, 248, 0.08)',
      border: 'rgba(56, 189, 248, 0.22)',
      glow: 'rgba(56, 189, 248, 0.16)',
    };
  }

  if (type === 'plugin') {
    return {
      color: '#c084fc',
      bg: 'rgba(168, 85, 247, 0.08)',
      border: 'rgba(168, 85, 247, 0.22)',
      glow: 'rgba(168, 85, 247, 0.16)',
    };
  }

    return {
      color: '#cbd5e1',
      bg: 'rgba(255, 255, 255, 0.04)',
      border: 'rgba(255, 255, 255, 0.09)',
      glow: 'rgba(255, 255, 255, 0.08)',
    };
  };

  const theme = resolve();
  domainThemeCache.set(cacheKey, theme);
  return theme;
}

const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  // Frontend & UI
  frontend: Layout,
  'ui / ux': Layout,
  'ui & styling': Layout,
  // Backend & APIs
  backend: Cpu,
  'backend & api': Cpu,
  'developer tools': Terminal,
  'engineering playbooks': FileCode2,
  // Database & Storage
  database: Database,
  // DevOps & Cloud
  'devops & git': GitBranch,
  'cloud & infrastructure': GitBranch,
  'devops & cloud': GitBranch,
  // Testing & Quality
  'testing & debugging': Bug,
  'testing & qa': Bug,
  'quality & review': Bug,
  // Security
  security: ShieldCheck,
  'security & forensics': Lock,
  // AI & Multi-Agent
  'ai & multi-agent': Brain,
  // Science & Research
  'research & science': Compass,
  // 3D & Gaming
  'game development & 3d': Box,
  'creative & 3d': Box,
  'creative & media': Box,
  // Browser & Web
  'browser & web': Globe,
  // System & Automation
  'system & automation': Workflow,
  'desktop & mobile': Layers,
  productivity: Workflow,
};

/**
 * Derives a clean two-letter monogram from an item name (e.g. "Clean Code Guard" -> "CC")
 */
function getMonogram(name: string): string {
  const words = name
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  if (words.length === 1 && words[0].length >= 2) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (name[0] || 'AF').toUpperCase();
}

const CapabilityIconComponent: React.FC<CapabilityIconProps> = ({
  type,
  category,
  name,
  size = 15,
  className = '',
  strokeWidth = 1.75,
}) => {
  const normCat = (category || '').toLowerCase().trim();
  const IconComp = CATEGORY_ICON_MAP[normCat];
  const theme = getDomainTheme(category, type);

  if (IconComp) {
    return (
      <IconComp
        size={size}
        strokeWidth={strokeWidth}
        className={className}
        style={{ color: theme.color }}
        aria-hidden="true"
      />
    );
  }

  // Type-specific modern fallbacks
  if (type === 'mcp') {
    return (
      <Cable
        size={size}
        strokeWidth={strokeWidth}
        className={className}
        style={{ color: theme.color }}
        aria-hidden="true"
      />
    );
  }

  if (type === 'plugin') {
    return (
      <Package
        size={size}
        strokeWidth={strokeWidth}
        className={className}
        style={{ color: theme.color }}
        aria-hidden="true"
      />
    );
  }

  // If a skill has a distinct name, give it a clean monogram
  if (name.length > 2) {
    const monogram = getMonogram(name);
    return (
      <span
        className={`capability-monogram font-mono ${className}`}
        style={{
          fontSize: `${Math.max(9, Math.round(size * 0.68))}px`,
          fontWeight: 700,
          letterSpacing: '0.04em',
          lineHeight: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
          color: theme.color,
        }}
        aria-hidden="true"
      >
        {monogram}
      </span>
    );
  }

  return (
    <Sparkles
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      style={{ color: theme.color }}
      aria-hidden="true"
    />
  );
};

export const CapabilityIcon = React.memo(CapabilityIconComponent);


