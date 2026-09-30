import React, { useState, useMemo } from 'react';
import { 
  CheckSquare, 
  Square, 
  Copy, 
  Check, 
  Code
} from 'lucide-react';

// Types
export interface MarkdownViewerProps {
  content: string;
  className?: string;
}

export interface MarkdownBlock {
  type: 'heading' | 'code' | 'blockquote' | 'tasks' | 'ul' | 'ol' | 'hr' | 'paragraph';
  level?: number;
  lang?: string;
  content?: string;
  items?: Array<{ text: string; checked?: boolean }>;
}

// Frontmatter Parser
function parseFrontmatter(rawYaml: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = rawYaml.split(/\r?\n/);
  let currentArrayKey: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('- ') && currentArrayKey) {
      const val = trimmed.slice(2).trim().replace(/^["']|["']$/g, '');
      if (!Array.isArray(result[currentArrayKey])) {
        result[currentArrayKey] = [];
      }
      result[currentArrayKey].push(val);
      continue;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx !== -1) {
      const key = trimmed.slice(0, colonIdx).trim();
      const rawVal = trimmed.slice(colonIdx + 1).trim();

      if (!rawVal) {
        currentArrayKey = key;
        result[key] = [];
      } else {
        currentArrayKey = null;
        result[key] = rawVal.replace(/^["']|["']$/g, '');
      }
    }
  }

  return result;
}

// Inline Formatter
export function renderInlineMarkdown(text: string): React.ReactNode[] {
  if (!text) return [];
  const regex = /(`[^`]+`|\*\*\*[^*]+\*\*\*|___[^_]+___|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\[[^\]]+\]\([^)]+\)|\*[^*]+\*|_[^_]+_)/g;
  const parts = text.split(regex);

  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="skill-inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (
      (part.startsWith('***') && part.endsWith('***')) ||
      (part.startsWith('___') && part.endsWith('___'))
    ) {
      return (
        <strong key={i} className="skill-bold-italic">
          <em>{part.slice(3, -3)}</em>
        </strong>
      );
    }
    if (
      (part.startsWith('**') && part.endsWith('**')) ||
      (part.startsWith('__') && part.endsWith('__'))
    ) {
      return (
        <strong key={i} className="skill-bold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (
      (part.startsWith('*') && part.endsWith('*')) ||
      (part.startsWith('_') && part.endsWith('_'))
    ) {
      return (
        <em key={i} className="skill-italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith('~~') && part.endsWith('~~')) {
      return <del key={i} className="skill-del">{part.slice(2, -2)}</del>;
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={i}
          href={linkMatch[2]}
          target="_blank"
          rel="noreferrer"
          className="skill-link"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// Block Parser
function parseMarkdownBlocks(markdownText: string): MarkdownBlock[] {
  const lines = markdownText.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({
        type: 'code',
        lang: lang || 'text',
        content: codeLines.join('\n')
      });
      continue;
    }

    if (!trimmed) {
      i++;
      continue;
    }

    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        content: headingMatch[2].trim()
      });
      i++;
      continue;
    }

    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i].startsWith('>') || (lines[i].trim() && !lines[i].startsWith('#')))) {
        if (!lines[i].trim()) break;
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({
        type: 'blockquote',
        content: quoteLines.join('\n')
      });
      continue;
    }

    const taskMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (taskMatch) {
      const taskItems: Array<{ text: string; checked: boolean }> = [];
      while (i < lines.length) {
        const tm = lines[i].match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
        if (tm) {
          taskItems.push({
            checked: tm[1].toLowerCase() === 'x',
            text: tm[2]
          });
          i++;
        } else {
          break;
        }
      }
      blocks.push({
        type: 'tasks',
        items: taskItems
      });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const listItems: Array<{ text: string }> = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        listItems.push({ text: lines[i].replace(/^[-*]\s+/, '') });
        i++;
      }
      blocks.push({
        type: 'ul',
        items: listItems
      });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const listItems: Array<{ text: string }> = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        listItems.push({ text: lines[i].replace(/^\d+\.\s+/, '') });
        i++;
      }
      blocks.push({
        type: 'ol',
        items: listItems
      });
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('>') &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !/^(\-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({
      type: 'paragraph',
      content: paraLines.join(' ')
    });
  }

  return blocks;
}

// Code Block Component
const CodeBlockItem: React.FC<{ code: string; lang: string }> = ({ code, lang }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="skill-code-card">
      <div className="skill-code-header">
        <div className="skill-code-lang">
          <Code size={12} />
          <span>{lang || 'plaintext'}</span>
        </div>
        <button
          type="button"
          className="skill-copy-btn"
          onClick={handleCopy}
          title="Copy code"
        >
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="skill-code-body font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
};

// Main Markdown Viewer
export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({
  content,
  className = ''
}) => {
  const parsedData = useMemo(() => {
    if (!content || !content.trim()) return null;

    let frontmatter: Record<string, any> | null = null;
    let markdownBody = content;

    if (content.startsWith('---')) {
      const endIdx = content.indexOf('\n---', 3);
      if (endIdx !== -1) {
        const rawFm = content.slice(3, endIdx).trim();
        markdownBody = content.slice(endIdx + 4).trim();
        frontmatter = parseFrontmatter(rawFm);
      }
    }

    const blocks = parseMarkdownBlocks(markdownBody);
    return { frontmatter, blocks };
  }, [content]);

  if (!parsedData) {
    return (
      <div className={`skill-viewer-container empty ${className}`}>
        <p className="text-slate-500 italic text-xs">No content to preview.</p>
      </div>
    );
  }

  const { frontmatter, blocks } = parsedData;

  return (
    <div className={`skill-viewer-container ${className}`}>
      {frontmatter && Object.keys(frontmatter).length > 0 && (
        <div className="skill-meta-strip">
          {frontmatter.name && (
            <span className="meta-pill-slug font-mono">
              {frontmatter.name}
            </span>
          )}
          {frontmatter.category && (
            <span className="meta-pill-category">
              {frontmatter.category}
            </span>
          )}
          {frontmatter.tags && Array.isArray(frontmatter.tags) && frontmatter.tags.length > 0 && (
            <div className="meta-tags-inline">
              {frontmatter.tags.map((t: string, idx: number) => (
                <span key={idx} className="meta-tag-item">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="skill-reading-body">
        {blocks.map((block, idx) => {
          switch (block.type) {
            case 'heading': {
              const textNodes = renderInlineMarkdown(block.content || '');
              if (block.level === 1) return <h1 key={idx} className="skill-h1">{textNodes}</h1>;
              if (block.level === 2) return <h2 key={idx} className="skill-h2">{textNodes}</h2>;
              if (block.level === 3) return <h3 key={idx} className="skill-h3">{textNodes}</h3>;
              return <h4 key={idx} className="skill-h4">{textNodes}</h4>;
            }

            case 'code':
              return <CodeBlockItem key={idx} code={block.content || ''} lang={block.lang || ''} />;

            case 'blockquote':
              return (
                <blockquote key={idx} className="skill-blockquote">
                  {renderInlineMarkdown(block.content || '')}
                </blockquote>
              );

            case 'tasks':
              return (
                <div key={idx} className="skill-task-list">
                  {block.items?.map((item, itemIdx) => (
                    <div key={itemIdx} className={`skill-task-item ${item.checked ? 'completed' : ''}`}>
                      <div className="task-icon-wrap">
                        {item.checked ? (
                          <CheckSquare size={13} className="text-purple-400" />
                        ) : (
                          <Square size={13} className="text-slate-500" />
                        )}
                      </div>
                      <span className="task-text">{renderInlineMarkdown(item.text)}</span>
                    </div>
                  ))}
                </div>
              );

            case 'ul':
              return (
                <ul key={idx} className="skill-ul">
                  {block.items?.map((item, itemIdx) => (
                    <li key={itemIdx} className="skill-li">
                      <span className="skill-bullet-dot" />
                      <span className="li-content">{renderInlineMarkdown(item.text)}</span>
                    </li>
                  ))}
                </ul>
              );

            case 'ol':
              return (
                <ol key={idx} className="skill-ol">
                  {block.items?.map((item, itemIdx) => (
                    <li key={itemIdx} className="skill-ol-li">
                      <span className="number-index font-mono">{itemIdx + 1}.</span>
                      <span className="li-content">{renderInlineMarkdown(item.text)}</span>
                    </li>
                  ))}
                </ol>
              );

            case 'hr':
              return <hr key={idx} className="skill-hr" />;

            case 'paragraph':
            default:
              return (
                <p key={idx} className="skill-paragraph">
                  {renderInlineMarkdown(block.content || '')}
                </p>
              );
          }
        })}
      </div>

      <style>{`
        .skill-viewer-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
          color: #e2e8f0;
          font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
          font-size: 13px;
          line-height: 1.6;
          user-select: text !important;
          -webkit-user-select: text !important;
        }

        .skill-meta-strip {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
          margin-bottom: 4px;
        }

        .meta-pill-slug {
          font-size: 11px;
          font-weight: 600;
          color: #c084fc;
          background: rgba(124, 58, 237, 0.12);
          border: 1px solid rgba(124, 58, 237, 0.3);
          padding: 2px 8px;
          border-radius: 4px;
        }

        .meta-pill-category {
          font-size: 11px;
          font-weight: 600;
          color: #93c5fd;
          background: rgba(59, 130, 246, 0.12);
          border: 1px solid rgba(59, 130, 246, 0.25);
          padding: 2px 8px;
          border-radius: 4px;
        }

        .meta-tags-inline {
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .meta-tag-item {
          font-size: 10.5px;
          color: #64748b;
          font-family: var(--font-mono, monospace);
        }

        .skill-reading-body {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .skill-h1 {
          font-size: 18px;
          font-weight: 700;
          color: #f8fafc;
          border-bottom: 1px solid #1e293b;
          padding-bottom: 6px;
          margin-top: 6px;
          margin-bottom: 2px;
          letter-spacing: -0.01em;
        }

        .skill-h2 {
          font-size: 15px;
          font-weight: 700;
          color: #e2e8f0;
          margin-top: 10px;
          margin-bottom: 2px;
          letter-spacing: -0.01em;
        }

        .skill-h3 {
          font-size: 13.5px;
          font-weight: 600;
          color: #cbd5e1;
          margin-top: 6px;
          margin-bottom: 2px;
        }

        .skill-h4 {
          font-size: 12.5px;
          font-weight: 600;
          color: #94a3b8;
          margin-top: 4px;
          margin-bottom: 2px;
        }

        .skill-paragraph {
          margin: 0;
          color: #cbd5e1;
        }

        .skill-bold {
          font-weight: 700;
          color: #ffffff;
        }

        .skill-italic {
          font-style: italic;
          color: #cbd5e1;
        }

        .skill-bold-italic {
          font-weight: 700;
          color: #ffffff;
        }

        .skill-inline-code {
          background: rgba(99, 102, 241, 0.12);
          border: 1px solid rgba(99, 102, 241, 0.25);
          color: #c084fc;
          padding: 1px 5px;
          border-radius: 4px;
          font-size: 11.5px;
          font-family: var(--font-mono, monospace);
        }

        .skill-del {
          text-decoration: line-through;
          color: #64748b;
        }

        .skill-link {
          color: #60a5fa;
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        .skill-link:hover {
          color: #93c5fd;
        }

        .skill-ul, .skill-ol {
          display: flex;
          flex-direction: column;
          gap: 5px;
          padding-left: 2px;
          margin: 0;
          list-style: none;
        }

        .skill-li, .skill-ol-li {
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }

        .skill-bullet-dot {
          width: 5px;
          height: 5px;
          background: #818cf8;
          border-radius: 50%;
          margin-top: 7px;
          flex-shrink: 0;
        }

        .number-index {
          color: #a78bfa;
          font-size: 11.5px;
          font-weight: 600;
          min-width: 16px;
          line-height: 1.6;
        }

        .li-content {
          flex: 1;
        }

        .skill-task-list {
          display: flex;
          flex-direction: column;
          gap: 5px;
          margin: 2px 0;
        }

        .skill-task-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 2px 4px;
          border-radius: 4px;
        }

        .skill-task-item.completed .task-text {
          color: #64748b;
          text-decoration: line-through;
        }

        .task-icon-wrap {
          margin-top: 3px;
          flex-shrink: 0;
        }

        .skill-blockquote {
          border-left: 3px solid #7c3aed;
          background: rgba(124, 58, 237, 0.06);
          border-radius: 0 5px 5px 0;
          padding: 7px 12px;
          margin: 4px 0;
          color: #cbd5e1;
          font-style: italic;
        }

        .skill-code-card {
          background: #060911;
          border: 1px solid #1a253a;
          border-radius: 6px;
          overflow: hidden;
          margin: 5px 0;
        }

        .skill-code-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #0b101c;
          border-bottom: 1px solid #151f33;
          padding: 4px 10px;
        }

        .skill-code-lang {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 500;
          color: #818cf8;
          text-transform: lowercase;
        }

        .skill-copy-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          background: transparent;
          border: none;
          color: #64748b;
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.12s;
        }

        .skill-copy-btn:hover {
          background: #141d30;
          color: #f1f5f9;
        }

        .skill-code-body {
          padding: 10px 12px;
          margin: 0;
          font-size: 11.5px;
          line-height: 1.55;
          color: #93c5fd;
          overflow-x: auto;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .skill-hr {
          border: none;
          border-top: 1px solid #1e293b;
          margin: 6px 0;
        }
      `}</style>
    </div>
  );
};
