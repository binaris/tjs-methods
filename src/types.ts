export enum Runtime {
  node = 'node',
  browser = 'browser',
}

export interface FrameworkMap {
  client?: string;
  server?: string;
}

export interface Package {
  dependencies: {
    [name: string]: string;
  };
  devDependencies: {
    [name: string]: string;
  };
  peerDependencies?: {
    [name: string]: string;
  };
}

export interface GeneratedCode {
  pkg: Package;
  code: {
    [name: string]: string;
  };
}
