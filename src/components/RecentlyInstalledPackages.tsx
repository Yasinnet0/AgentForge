import React from 'react';
import { MoreVertical, ExternalLink, PackageCheck } from 'lucide-react';

interface InstalledPackage {
  id: string;
  name: string;
  version: string;
  type: 'MCP SERVER' | 'SKILL BUNDLE' | 'AGENT';
  source: 'COMMUNITY' | 'OFFICIAL';
  installedDate: string;
  status: 'Active' | 'Idle' | 'Updating';
}

export const RecentlyInstalledPackages: React.FC = () => {
  const packages: InstalledPackage[] = [];

  return (
    <div className="packages-container">
      <div className="packages-header">
        <div className="packages-title-row">
          <PackageCheck size={16} className="title-icon" />
          <span className="packages-title">Recently Installed Packages</span>
        </div>
        {packages.length > 0 && (
          <button className="view-all-btn">
            <span>View all</span>
            <ExternalLink size={12} />
          </button>
        )}
      </div>

      {packages.length > 0 ? (
        <div className="packages-table-wrapper">
          <table className="packages-table">
            <thead>
              <tr>
                <th>PACKAGE NAME</th>
                <th>TYPE</th>
                <th>SOURCE</th>
                <th>INSTALLED DATE</th>
                <th>STATUS</th>
                <th style={{ textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((pkg) => (
                <tr key={pkg.id}>
                  <td>
                    <div className="package-name-cell">
                      <span className="pkg-name font-mono">{pkg.name}</span>
                      <span className="pkg-version font-mono">{pkg.version}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${pkg.type === 'MCP SERVER' ? 'badge-blue' : 'badge-purple'}`}>
                      {pkg.type}
                    </span>
                  </td>
                  <td>
                    <span className="pkg-source font-mono">{pkg.source}</span>
                  </td>
                  <td>
                    <span className="pkg-date font-mono">{pkg.installedDate}</span>
                  </td>
                  <td>
                    <div className="status-cell">
                      <span className="status-label">{pkg.status}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="row-action-btn" title="Options">
                      <MoreVertical size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="packages-empty-state">
          <div className="empty-pkg-icon-wrap">
            <PackageCheck size={22} />
          </div>
          <div className="empty-pkg-title">No packages installed</div>
          <div className="empty-pkg-desc">Installed skills, MCP servers, and context packages will appear here</div>
        </div>
      )}

      <style>{`
        .packages-container {
          background: #121826;
          border: 1px solid #1e283d;
          border-radius: 9px;
          padding: 16px;
        }

        .packages-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .packages-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .title-icon {
          color: #818cf8;
        }

        .packages-title {
          font-size: 13.5px;
          font-weight: 700;
          color: #f1f5f9;
        }

        .view-all-btn {
          background: transparent;
          border: none;
          color: #6366f1;
          font-size: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          transition: color 0.15s ease;
        }

        .view-all-btn:hover {
          color: #818cf8;
        }

        .packages-table-wrapper {
          overflow-x: auto;
        }

        .packages-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .packages-table th {
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.05em;
          padding: 8px 12px;
          border-bottom: 1px solid #1c2638;
          font-family: var(--font-mono);
        }

        .packages-table td {
          padding: 11px 12px;
          border-bottom: 1px solid #172033;
          font-size: 12.5px;
        }

        .packages-table tr:last-child td {
          border-bottom: none;
        }

        .packages-table tr:hover td {
          background: #151e30;
        }

        .package-name-cell {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .pkg-name {
          font-weight: 600;
          color: #f8fafc;
        }

        .pkg-version {
          font-size: 11px;
          color: #718298;
          background: #0d121f;
          padding: 1px 6px;
          border-radius: 4px;
          border: 1px solid #1c2638;
        }

        .pkg-source {
          font-size: 10.5px;
          color: #94a3b8;
        }

        .pkg-date {
          font-size: 11.5px;
          color: #718298;
        }

        .status-cell {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .status-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #10b981;
        }

        .status-label {
          color: #34d399;
          font-size: 12px;
          font-weight: 500;
        }

        .row-action-btn {
          background: transparent;
          border: none;
          color: #64748b;
          width: 26px;
          height: 26px;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .row-action-btn:hover {
          background: #1c263c;
          color: #f1f5f9;
        }

        .packages-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 36px 20px;
          border: 1px dashed #1e283d;
          border-radius: 8px;
          background: rgba(13, 18, 31, 0.5);
          text-align: center;
          gap: 6px;
        }

        .empty-pkg-icon-wrap {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          background: rgba(129, 140, 248, 0.08);
          border: 1px solid rgba(129, 140, 248, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #818cf8;
          margin-bottom: 4px;
        }

        .empty-pkg-title {
          font-size: 13.5px;
          font-weight: 600;
          color: #f1f5f9;
        }

        .empty-pkg-desc {
          font-size: 12px;
          color: #64748b;
          max-width: 320px;
        }
      `}</style>
    </div>
  );
};
