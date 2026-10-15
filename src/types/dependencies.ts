export interface DependencyInstallSnippets {
  windows: string;
  mac: string;
  linux: string;
}

export interface DependencyCheckInfo {
  binary: string;
  name: string;
  installed: boolean;
  path?: string;
  version?: string;
  installSnippets: DependencyInstallSnippets;
  description: string;
  docsUrl: string;
  isCritical?: boolean;
}

export type DependencyReport = Record<string, DependencyCheckInfo>;
