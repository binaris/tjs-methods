export enum Runtime {
  node = 'node',
  node_koa = 'node_koa',
  browser = 'browser',
}

export enum Role {
  ALL = 'all',
  CLIENT = 'client',
  SERVER = 'server',
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
