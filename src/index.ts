import { readFile } from 'mz/fs';
import { isArray, zip, fromPairs, merge, mergeWith } from 'lodash';
import * as glob from 'glob';
import * as ts from 'typescript';
import * as tjs from 'typescript-json-schema';
import * as mustache from 'mustache';
import { promisify } from 'util';
import * as path from 'path';
import { GeneratedCode, Package, FrameworkMap, Runtime } from './types';
import { transform } from './transform';

const tmplPath = (name) => path.join(__dirname, '..', 'templates', 'ts', name);
const libPath = path.join(__dirname, '..', 'src', 'lib');

// @types packages could have been peer dependencies but we decided
// to put these here to simplify usage of generate code
const packageSpec = {
  base: {
    dependencies: {
      ajv: '^6.5.5',
      lodash: '^4.17.11',
    },
    devDependencies: {
      '@types/lodash': '^4.14.118',
      '@types/node': '^10.12.6',
    },
  },
  serverOnly: {
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
  },
  nodeClientOnly: {
    dependencies: {
      'node-fetch': '^2.3.0',
      '@types/node-fetch': '^2.1.4',
    },
  },
};

export interface Generator {
  pkg: Package;
  libs: string[];
  templateNames: Record<string, string>;
}

function getGenerator(runtime: Runtime, kind: string, framework: string): Generator {
  const { base, serverOnly, nodeClientOnly } = packageSpec;
  switch (runtime) {
    case Runtime.browser:
      return {
        pkg: base,
        libs: ['common.ts'],
        templateNames: {
          'interfaces.ts': 'interfaces.ts',
          'client-browser.ts': 'client.ts',
        },
      };
    case Runtime.node:
      if (kind === 'client' && framework === 'fetch') {
        return {
          pkg: merge(base, nodeClientOnly),
          libs: ['common.ts'],
          templateNames: {
            'interfaces.ts': 'interfaces.ts',
            'client-node.ts': 'client.ts',
          },
        };
      } else if (kind === 'server' && framework === 'koa') {
        return {
          pkg: merge(base, serverOnly),
          libs: ['common.ts', 'koaMW.ts'],
          templateNames: {
            'interfaces.ts': 'interfaces.ts',
            'server.ts': 'server.ts',
          },
        };
      }
      break;
  }
  throw new Error(`No generator for ${runtime} ${kind} ${framework}`);
}

export async function generate(
  runtime: Runtime,
  filePattern: string,
  frameworks: FrameworkMap
): Promise<GeneratedCode> {
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

  const { libs, templateNames, pkg } = mergeWith(
    {},
    ...Object.entries(frameworks)
      .filter(([_, framework]) => framework !== undefined)
      .map(([kind, framework]) => getGenerator(runtime, kind, framework)),
    (a, b) => isArray(a) ? a.concat(b) : undefined
  );
  const libContents = await Promise.all(libs.map((n) => readFile(path.join(libPath, n), 'utf-8')));

  const program = ts.createProgram(paths, compilerOptions);
  const schema = tjs.generateSchema(program, '*', settings, paths);
  const spec = transform(schema);
  const templates = await Promise.all(Object.keys(templateNames).map((n) => readFile(tmplPath(n), 'utf-8')));
  const rendered = templates.map((t) => mustache.render(t, spec));
  return {
    pkg,
    code: fromPairs(zip([...libs, ...Object.values(templateNames)], [...libContents, ...rendered])),
  };
}
