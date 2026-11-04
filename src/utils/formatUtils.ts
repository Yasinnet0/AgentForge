export interface AuthorDisplayInfo {
  displayText: string;
  url?: string;
  isLink: boolean;
}

/**
 * Intelligently formats author metadata.
 * If the author is a GitHub repository or profile URL (e.g. https://github.com/owner/repo/tree/...),
 * it extracts the clean "owner/repo" or "@owner" display text while preserving the full URL,
 * preventing layout expansion and horizontal scroll in modal headers and cards.
 */
export function formatAuthor(rawAuthor?: string): AuthorDisplayInfo {
  if (!rawAuthor || !rawAuthor.trim()) {
    return { displayText: 'Community', isLink: false };
  }

  const trimmed = rawAuthor.trim();

  // Match GitHub URLs:
  // e.g. https://github.com/Suraj1235/open-dynamic-workflows/tree/main/...
  // or https://github.com/Suraj1235/open-dynamic-workflows
  // or https://github.com/Suraj1235
  // or github.com/Suraj1235/open-dynamic-workflows
  const githubMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^\/\s#?]+)(?:\/([^\/\s#?]+))?/i
  );

  if (githubMatch) {
    const owner = githubMatch[1];
    const repo = githubMatch[2]?.replace(/\.git$/i, '');
    const url = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;

    if (owner && repo) {
      return {
        displayText: `${owner}/${repo}`,
        url,
        isLink: true,
      };
    }
    if (owner) {
      return {
        displayText: `@${owner}`,
        url,
        isLink: true,
      };
    }
  }

  // Generic URL (e.g. https://gitlab.com/owner/repo or https://example.com/author)
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname.replace(/^www\./i, '');
      const pathSegments = parsed.pathname.split('/').filter(Boolean);
      let short = host;
      if (pathSegments.length > 0) {
        short += '/' + pathSegments.slice(0, 2).join('/');
      }
      return {
        displayText: short,
        url: trimmed,
        isLink: true,
      };
    } catch {
      return {
        displayText: trimmed.replace(/^https?:\/\/(?:www\.)?/i, '').replace(/\/+$/, ''),
        url: trimmed,
        isLink: true,
      };
    }
  }

  // Name with email, e.g. "John Doe <john@doe.com>"
  const emailMatch = trimmed.match(/^([^<]+)<[^>]+>$/);
  if (emailMatch) {
    return {
      displayText: emailMatch[1].trim(),
      isLink: false,
    };
  }

  return {
    displayText: trimmed,
    isLink: false,
  };
}

