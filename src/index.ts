import { readFile } from 'mz/fs';
import { zip, fromPairs, merge } from 'lodash';
import * as glob from 'glob';
import * as ts from 'typescript';
import * as tjs from 'typescript-json-schema';
import * as mustache from 'mustache';
import { promisify } from 'util';
import * as path from 'path';
import { GeneratedCode, Package, Role } from './types';
import { transform } from './transform';

const tmplPath = (name) => path.join(__dirname, '..', 'templates', 'ts', name);
const libPath = path.join(__dirname, '..', 'src', 'lib');

function getLib(role: Role): string[] {
  switch (role) {
    case Role.ALL:
    case Role.SERVER:
      return ['common.ts', 'koaMW.ts'];
    case Role.CLIENT:
      return ['common.ts'];
  }
}

function getTemplateNames(role: Role) {
  switch (role) {
    case Role.SERVER:
      return ['interfaces', 'server'];
    case Role.CLIENT:
      return ['interfaces', 'client'];
    case Role.ALL:
      return ['interfaces', 'client', 'server'];
  }
}

function getPackage(role: Role): Package {
  // @types packages could have been peer dependencies but we decided
  // to put these here to simplify usage of generate code

  const base = {
    dependencies: {
      ajv: '^6.5.5',
      lodash: '^4.17.11',
    },
    devDependencies: {
      '@types/lodash': '^4.14.118',
      '@types/node': '^10.12.6',
    },
  };

  const serverOnly = {
    dependencies: {
      '@types/koa': '^2.0.46',
      '@types/koa-bodyparser': '^5.0.1',
      '@types/koa-router': '7.0.35',
      koa: '^2.5.1',
      'koa-bodyparser': '^4.2.1',
      'koa-json-error': '^3.1.2',
      'koa-router': '^7.4.0',
    },
    devDependencies: {
      '@types/koa-json-error': '^3.1.2',
    },
    // Only peer dependency and common in typescript packages
    // It's left as a peerDependency and not a dependency because it depends on node version
    peerDependencies: {
      '@types/node': '>=8.0.0',
    },
  };

  const clientOnly = {
    dependencies: {
      '@types/request': '^2.48.1',
      '@types/request-promise-native': '^1.0.15',
      request: '^2.88.0',
      'request-promise-native': '^1.0.5',
    },
  };

  switch (role) {
    case Role.SERVER:
      return merge(base, serverOnly);
    case Role.CLIENT:
      return merge(base, clientOnly);
    case Role.ALL:
      return merge(base, clientOnly, serverOnly);
  }
}

export async function generate(filePattern: string, role: Role = Role.ALL): Promise<GeneratedCode> {
  const paths = await promisify(glob)(filePattern);
  const settings: tjs.PartialArgs = {
    required: true,
    noExtraProps: true,
    propOrder: true,
    validationKeywords: ['concordType'],
    include: paths,
  };

  const compilerOptions: ts.CompilerOptions = {
    strictNullChecks: true,
    target: ts.ScriptTarget.ESNext,
    noEmit: true,
    emitDecoratorMetadata: true,
    experimentalDecorators: true,
    module: ts.ModuleKind.CommonJS,
    allowUnusedLabels: true,
  };

  const libFiles = getLib(role);
  const libContents = await Promise.all(libFiles.map((n) => readFile(path.join(libPath, n), 'utf-8')));

  const program = ts.createProgram(paths, compilerOptions);
  const schema = tjs.generateSchema(program, '*', settings, paths);
  const spec = transform(schema);
  const genFiles = getTemplateNames(role).map((n) => `${n}.ts`);
  const templates = await Promise.all(genFiles.map((n) => readFile(tmplPath(n), 'utf-8')));
  const rendered = templates.map((t) => mustache.render(t, spec));
  return {
    pkg: getPackage(role),
    code: fromPairs(zip([...libFiles, ...genFiles], [...libContents, ...rendered])),
  };
}
