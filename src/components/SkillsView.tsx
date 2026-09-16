import React, { useState, useEffect, useMemo } from 'react';
import { ScannedSkill, SupportedAgent } from '../types/agent';
import { 
  Sparkles, 
  Bot, 
  Terminal, 
  Boxes, 
  Server, 
  Cpu, 
  Compass, 
  FileCode2, 
  BookOpen, 
  Package,
  Layers
} from 'lucide-react';

interface SkillsViewProps {
  skills: ScannedSkill[];
  selectedAgents: SupportedAgent[];
  onImportSkill?: () => void;
  searchQuery?: string;
  highlightedId?: string | null;
}

const AGENT_ICON_MAP: Record<string, React.ElementType> = {
  Sparkles,
  Bot,
  Terminal,
  Cpu,
  Boxes,
  Compass,
  Server,
  Layers,
};

export const SkillsView: React.FC<SkillsViewProps> = ({
  skills,
  selectedAgents,
  onImportSkill,
  searchQuery = '',
  highlightedId,
}) => {
  const [visibleCount, setVisibleCount] = useState(48);

  // Pre-index skill search strings to prevent FPS drops during live search
  const indexedSkills = useMemo(() => {
    return skills.map((s) => ({
      item: s,
      searchStr: `${s.name} ${s.description} ${s.pluginName || ''} ${s.sourceAgentName}`.toLowerCase(),
    }));
  }, [skills]);

  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) return skills;
    const q = searchQuery.toLowerCase().trim();
    return indexedSkills
      .filter((s) => s.searchStr.includes(q))
      .map((s) => s.item);
  }, [skills, indexedSkills, searchQuery]);

  // Reset pagination on search query change
  useEffect(() => {
    setVisibleCount(48);
  }, [searchQuery]);

  // Ensure visible window covers the target item if user jumped to it
  useEffect(() => {
    if (highlightedId) {
      const idx = filteredSkills.findIndex((s) => s.id === highlightedId);
      if (idx !== -1 && idx >= visibleCount) {
        setVisibleCount(idx + 24);
      }
    }
  }, [highlightedId, filteredSkills, visibleCount]);

  // Scroll into view when highlightedId is present
  useEffect(() => {
    if (highlightedId) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`skill-${highlightedId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [highlightedId]);

  const displayedSkills = useMemo(() => {
    return filteredSkills.slice(0, visibleCount);
  }, [filteredSkills, visibleCount]);

  return (
    <div className="skills-view-container">
      {/* View Header */}
      <div className="skills-view-header">
        <div className="header-info">
          <div className="title-line">
            <h2 className="view-title">Active Agent Skills</h2>
            <span className="count-pill font-mono">{skills.length} INSTALLED</span>
          </div>
          <p className="view-desc">
            Workflow skills discovered in your selected agent(s) configuration roots.
          </p>
        </div>

        {onImportSkill && (
          <div className="header-controls">
            <button className="primary-action-btn" onClick={onImportSkill}>
              <Sparkles size={14} />
              <span>Import Skill</span>
            </button>
          </div>
        )}
      </div>

      {/* Content Area */}
      {selectedAgents.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-icon-wrap">
            <Bot size={28} />
          </div>
          <div className="empty-title">No Target Agents Selected</div>
          <div className="empty-desc">
            Use the agent selector in the top bar to select which AI agents you want to inspect and manage.
          </div>
        </div>
      ) : filteredSkills.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-icon-wrap">
            <Sparkles size={28} />
          </div>
          <div className="empty-title">
            {searchQuery ? 'No matching skills found' : 'No skills installed'}
          </div>
          <div className="empty-desc">
            {searchQuery
              ? `No skills match "${searchQuery}". Try a different search term.`
              : `No skills were discovered for ${selectedAgents.map((a) => a.name).join(', ')}.`}
          </div>
        </div>
      ) : (
        <>
          <div className="skills-grid">
            {displayedSkills.map((skill) => {
              const AgentIcon = AGENT_ICON_MAP[skill.sourceAgentIcon] || Bot;
              const isHighlighted = highlightedId === skill.id;

              return (
                <div
                  key={skill.id}
                  id={`skill-${skill.id}`}
                  className={`skill-card ${isHighlighted ? 'item-card-highlighted' : ''}`}
                >
                  {/* Card Top: Title & Agent Attribution Badge */}
                  <div className="skill-card-top">
                    <div className="skill-title-group">
                      <span className="skill-name">{skill.name}</span>
                    </div>

                    {/* Agent Attribution Badge */}
                    <div
                      className="agent-attribution-badge"
                      style={{
                        color: skill.sourceAgentColor,
                        backgroundColor: `${skill.sourceAgentColor}15`,
                        borderColor: `${skill.sourceAgentColor}35`,
                      }}
                      title={`Installed on ${skill.sourceAgentName}`}
                    >
                      <AgentIcon size={11} />
                      <span>{skill.sourceAgentName}</span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="skill-description">{skill.description}</p>

                  {/* Metadata tags */}
                  <div className="skill-card-footer">
                    <div className="skill-tags">
                      {skill.pluginName && (
                        <span className="meta-tag plugin-tag font-mono">
                          <Package size={10} />
                          {skill.pluginName}
                        </span>
                      )}
                      {skill.hasScripts && (
                        <span className="meta-tag scripts-tag font-mono">
                          <FileCode2 size={10} />
                          scripts
                        </span>
                      )}
                      {skill.hasReferences && (
                        <span className="meta-tag docs-tag font-mono">
                          <BookOpen size={10} />
                          docs
                        </span>
                      )}
                    </div>

                    <span className="source-path font-mono" title={skill.sourcePath}>
                      {skill.sourcePath.split(/[/\\]/).slice(-2).join('/')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredSkills.length > visibleCount && (
            <div className="load-more-wrap">
              <button
                className="load-more-btn font-mono"
                onClick={() => setVisibleCount((prev) => prev + 48)}
              >
                <span>Show more skills ({displayedSkills.length} of {filteredSkills.length})</span>
              </button>
            </div>
          )}
        </>
      )}

      <style>{`
        .skills-view-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .skills-view-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          background: #121826;
          border: 1px solid #1e283d;
          border-radius: 9px;
          padding: 14px 18px;
        }

        .header-info {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .title-line {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .view-title {
          font-size: 16px;
          font-weight: 700;
          color: #f8fafc;
        }

        .count-pill {
          font-size: 10px;
          font-weight: 700;
          color: #c084fc;
          background: rgba(192, 132, 252, 0.12);
          padding: 2px 7px;
          border-radius: 4px;
          border: 1px solid rgba(192, 132, 252, 0.25);
        }

        .view-desc {
          font-size: 11.5px;
          color: #8899ac;
        }

        .header-controls {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .primary-action-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: linear-gradient(135deg, #7c3aed, #6366f1);
          border: none;
          color: #ffffff;
          font-size: 11.5px;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }

        .primary-action-btn:hover {
          opacity: 0.92;
        }

        .skills-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 12px;
        }

        .skill-card {
          background: #121826;
          border: 1px solid #1e283d;
          border-radius: 9px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition: all 0.15s ease;
        }

        .skill-card:hover {
          border-color: #2e3e5c;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
          transform: translateY(-1px);
        }

        .skill-card-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .skill-title-group {
          display: flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
        }

        .skill-name {
          font-size: 13px;
          font-weight: 700;
          color: #f1f5f9;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .agent-attribution-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 2px 7px;
          border-radius: 5px;
          font-size: 10px;
          font-weight: 600;
          border: 1px solid;
          flex-shrink: 0;
          letter-spacing: -0.01em;
        }

        .skill-description {
          font-size: 11.5px;
          color: #94a3b8;
          line-height: 1.45;
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .skill-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding-top: 6px;
          border-top: 1px solid #192236;
          margin-top: auto;
        }

        .skill-tags {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-wrap: wrap;
        }

        .meta-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 9.5px;
          padding: 1px 5px;
          border-radius: 4px;
        }

        .plugin-tag {
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.1);
          border: 1px solid rgba(56, 189, 248, 0.25);
        }

        .scripts-tag {
          color: #10b981;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.25);
        }

        .docs-tag {
          color: #e2e8f0;
          background: rgba(226, 232, 240, 0.08);
          border: 1px solid rgba(226, 232, 240, 0.18);
        }

        .source-path {
          font-size: 9.5px;
          color: #55677d;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 110px;
        }

        .item-card-highlighted {
          border-color: rgba(192, 132, 252, 0.65) !important;
          background: rgba(192, 132, 252, 0.05) !important;
          box-shadow: 0 0 0 1px rgba(192, 132, 252, 0.4), 0 4px 16px rgba(168, 85, 247, 0.12) !important;
          animation: highlightCardSoft 1.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          z-index: 5;
        }

        @keyframes highlightCardSoft {
          0% {
            border-color: rgba(192, 132, 252, 0.8);
            box-shadow: 0 0 0 1.5px rgba(192, 132, 252, 0.45), 0 4px 16px rgba(168, 85, 247, 0.15);
          }
          60% {
            border-color: rgba(192, 132, 252, 0.5);
            box-shadow: 0 0 0 1px rgba(192, 132, 252, 0.25), 0 2px 8px rgba(168, 85, 247, 0.08);
          }
          100% {
            border-color: #1e283d;
            background: #121826;
            box-shadow: none;
          }
        }

        .load-more-wrap {
          display: flex;
          justify-content: center;
          margin-top: 14px;
        }

        .load-more-btn {
          background: #151d2e;
          border: 1px solid #23324d;
          color: #93c5fd;
          font-size: 11.5px;
          font-weight: 600;
          padding: 8px 20px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .load-more-btn:hover {
          background: #1e2c45;
          border-color: #3b5077;
          color: #ffffff;
        }
      `}</style>
    </div>
  );
};
