import test from 'ava';
import { zipObject, flatten, mapKeys } from 'lodash';
import { tmpdir } from 'os';
import * as glob from 'glob';
import { expect } from 'chai';
import { promisify } from 'util';
import * as path from 'path';
import { randomBytes } from 'crypto';
import * as rmrf from 'rmfr';
import { readFile, writeFile, mkdir } from 'mz/fs';
import { GeneratedCode, FrameworkMap } from '../types';
import { spawn } from '../utils';
import { pass } from './utils';

function mktemp(): string {
  return path.join(tmpdir(), `test-${randomBytes(20).toString('hex')}`);
}

class TestCase {
  constructor(
    public readonly schema: string,
    public readonly dir = mktemp()
  ) {
  }

  public async cleanup() {
    await rmrf(this.dir);
  }

  public async generate(frameworks: FrameworkMap): Promise<GeneratedCode> {
    await mkdir(this.dir);
    try {
      await mkdir(path.join(this.dir, 'gen'));
      const schemaPath = path.join(this.dir, 'schema.ts');
      await writeFile(schemaPath, this.schema);
      await spawn('node', [
        path.join(__dirname, '..', 'cli.js'),
        'node',
        'test@0.0.1',
        'schema.ts',
        '--nocompile',
        ...flatten(Object.entries(mapKeys(frameworks, (_, k) => `--${k}`))) as string[],
        '-o',
        'gen',
      ], {
        cwd: this.dir,
        stdio: 'inherit',
      });
      const paths = await promisify(glob)(path.join(this.dir, 'gen', 'src', '*'));
      const files = await Promise.all(paths.map((p) => path.basename(p)));
      const contents = await Promise.all(paths.map((p) => readFile(p, 'utf-8')));

      return {
        pkg: JSON.parse(await readFile(path.join(this.dir, 'gen', 'package.json'), 'utf-8')),
        code: zipObject(files, contents),
      } as any;
    } finally {
      await this.cleanup();
    }
  }
}

test('generate generates only client code when requested', pass, async () => {
  const { code, pkg } = await new TestCase(`
export interface Test {
  bar: {
    params: {
      a: number;
    };
    returns: string;
  };
}`
  ).generate({ client: 'fetch' });
  expect(Object.keys(code).sort()).to.eql([
    'client.ts',
    'common.ts',
    'interfaces.ts',
  ]);

  expect(pkg.dependencies.koa).to.be.a('undefined');
  expect(pkg.dependencies['node-fetch']).to.be.a('string');
});

test('generate generates only server code when requested', pass, async () => {
  const { code, pkg } = await new TestCase(`
export interface Test {
  bar: {
    params: {
      a: number;
    };
    returns: string;
  };
}`
  ).generate({ server: 'koa' });
  expect(Object.keys(code).sort()).to.eql([
    'common.ts',
    'interfaces.ts',
    'server.ts',
    'serverCommon.ts',
  ]);

  expect(pkg.dependencies.koa).to.be.a('string');
  expect(pkg.dependencies.request).to.be.a('undefined');
});

test('generate respects optional params', pass, async () => {
  const iface = `
export interface A {
  readonly optional?: number;
  readonly required: number;
}`;
  const { code } = await new TestCase(iface).generate({ server: 'koa' });
  expect(code['interfaces.ts']).to.contain(iface.trim());
});

test('generate respects optional attributes in return value', pass, async () => {
  const iface = `
export interface A {
  foo: {
    params: {
    };
    returns: {
      a?: number;
    };
  };
}`;
  const { code } = await new TestCase(iface).generate({ server: 'koa' });
  expect(code['interfaces.ts']).to.contain('foo(): Promise<{ a?: number; }>');
});

test('generate generates declarations of root level union types', pass, async () => {
  const iface = 'export type A = { a: number; } | { b: number; };';
  const { code } = await new TestCase(iface).generate({ server: 'koa' });
  expect(code['interfaces.ts']).to.contain(iface);
});

test('generate generates declarations of root level enums', pass, async () => {
  const iface = `
export enum A {
  A = 'a',
  B = 'b',
  C_1 = 'c-1',
}`;
  const { code } = await new TestCase(iface).generate({ server: 'koa' });
  expect(code['interfaces.ts']).to.contain(iface.trim());
});
