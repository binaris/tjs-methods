import test from 'ava';
import * as path from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import * as rmrf from 'rmfr';
import { writeFile, mkdir } from 'mz/fs';
import { exec } from 'mz/child_process';
import { spawn } from '../utils';
import { pass } from './utils';

function mktemp(): string {
  return path.join(tmpdir(), `test-${randomBytes(20).toString('hex')}`);
}

class TestCase {
  public readonly main: string;
  constructor(
    public readonly schema: string,
    public readonly handler: string,
    public readonly tester: string,
    main?: string,
    public readonly dir = mktemp()
  ) {
    this.main = main || `
import { AddressInfo } from 'net';
import { TestServer } from './server';
import { TestClient } from './client';
import Handler from './handler';
import test from './test';

async function main() {
  const h = new Handler();

  const server = new TestServer(h, true);
  const listener = await server.listen(0, '127.0.0.1');
  const { address, port } = (listener.address() as AddressInfo);
  const client = new TestClient('http://' + address + ':' + port);
  await test(client);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;
  }

  public async setup() {
    await mkdir(this.dir);
    await mkdir(path.join(this.dir, 'src'));
    const schemaPath = path.join(this.dir, 'schema.ts');
    await writeFile(schemaPath, this.schema);
    await writeFile(path.join(this.dir, 'src', 'main.ts'), this.main);
    await writeFile(path.join(this.dir, 'src', 'handler.ts'), this.handler);
    await writeFile(path.join(this.dir, 'src', 'test.ts'), `
import { expect, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';

use(chaiAsPromised);
${this.tester}`);

    await spawn('node', [
      path.join(__dirname, '..', 'cli.js'),
      'node',
      'test@0.0.1',
      'schema.ts',
      '--client', 'fetch',
      '--server', 'koa',
      '--nocompile',
      '-o',
      '.',
    ], {
      cwd: this.dir,
      stdio: 'inherit',
    });

    await spawn('npm', [
      'install',
      'chai',
      'chai-as-promised',
      '@types/chai',
      '@types/chai-as-promised',
    ], {
      cwd: this.dir,
      stdio: 'inherit',
    });

    await spawn('npm', ['install'], {
      cwd: this.dir,
      stdio: 'inherit',
    });

    await spawn(
      path.join(__dirname, '..', '..', 'node_modules', '.bin', 'tsc'),
      [], {
      cwd: this.dir,
      stdio: 'inherit',
    });
  }

  public async cleanup() {
    await rmrf(this.dir);
  }

  public async exec(): Promise<{ stdout: string, stderr: string }> {
    const testPath = path.join(this.dir, 'main.js');
    const [stdout, stderr] = await exec(`node ${testPath}`);
    return { stdout: stdout.toString(), stderr: stderr.toString() };
  }

  public async run(): Promise<{ stdout: string, stderr: string }> {
    try {
      await this.setup();
      return await this.exec();
    } finally {
      await this.cleanup();
    }
  }
}

test('rpc creates valid TS client / server code', pass, async () => {
  const schema = `
export interface Test {
  bar: {
    params: {
      a: number;
    };
    returns: string;
  };
}`;
  const handler = `
export default class Handler {
  public async bar(a: number): Promise<string> {
    return a.toString();
  }
}
`;
  const tester = `
import { TestClient } from './client';

export default async function test(client: TestClient) {
 expect(await client.bar(3)).to.equal('3');
}
`;
  await new TestCase(schema, handler, tester).run();
});

test('supports optional parameters', pass, async () => {
    const schema = `
export interface Test {
  bar: {
    params: {
      b: string;
      a: number;
      c?: string;
      d?: string;
    };
    returns: string;
  };
}`;
    const handler = `
export default class Handler {
  public async bar(b: string, a: number, c?: string, d?: string): Promise<string> {
    return d ? \`\${d} \${b} \${a}\` : \`\${a}\`;
  }
}
`;
    const tester = `
import { TestClient } from './client';
export default async function test(client: TestClient) {
 expect(await client.bar('hello', 3, undefined, 'x')).to.equal('x hello 3');
 expect(await client.bar('hello', 3)).to.equal('3');
}
`;
    await new TestCase(schema, handler, tester).run();
  });

test('rpc supports the void return type', pass, async () => {
  const schema = `
export interface Test {
  bar: {
    params: {
      a: string;
    };
    returns: null;
  };
}`;
  const handler = `
export default class Handler {
  public async bar(a: string): Promise<void> {
  }
}
`;
  const tester = `
import { TestClient } from './client';

export default async function test(client: TestClient) {
 expect(await client.bar('heh')).to.be.undefined;
}
`;
  await new TestCase(schema, handler, tester).run();
});

test('rpc supports empty params', pass, async () => {
  const schema = `
export interface Test {
  bar: {
    params: {
    };
    returns: string;
  };
}`;
  const handler = `
export default class Handler {
  public async bar(): Promise<string> {
    return 'heh';
  }
}
`;
  const tester = `
import { TestClient } from './client';

export default async function test(client: TestClient) {
 expect(await client.bar()).to.be.eql('heh');
}
`;
  await new TestCase(schema, handler, tester).run();
});

test('rpc works with $reffed schemas', pass, async () => {
  const schema = `
export interface User {
  name: string;
}

export interface Test {
  authenticate: {
    params: {
      token: string;
    };
    returns: User;
  };
}`;
  const handler = `
import { User } from './interfaces';

export default class Handler {
  public async authenticate(token: string): Promise<User> {
    return { name: 'Vova' };
  }
}
`;
  const tester = `
import { TestClient } from './client';

export default async function test(client: TestClient) {
 expect(await client.authenticate('token')).to.eql({ name: 'Vova' });
}
`;
  await new TestCase(schema, handler, tester).run();
});

test('rpc coerces Date in param and return', pass, async () => {
  const schema = `
export interface Test {
dateIncrement: {
  params: {
    d: Date;
  };
  returns: Date;
};
}`;
  const handler = `
export default class Handler {
  public async dateIncrement(d: Date): Promise<Date> {
    return new Date(d.getTime() + 1);
  }
}
`;
  const tester = `
import { TestClient } from './client';

export default async function test(client: TestClient) {
  const d = new Date();
  expect(await client.dateIncrement(d)).to.eql(new Date(d.getTime() + 1));
}
`;
  await new TestCase(schema, handler, tester).run();
});

test('rpc constructs Error classes from and only from declared errors', pass, async () => {
  const schema = `
export class RuntimeError extends Error {}

export interface Test {
raise: {
  params: {
    exc: string;
  };
  returns: null;
  throws: RuntimeError;
};
}`;
  const handler = `
import { RuntimeError } from './interfaces';

export default class Handler {
public async raise(exc: string): Promise<void> {
  if (exc === 'RuntimeError') {
    throw new RuntimeError('heh');
  }
  throw new Error('ho');
}
}
`;
  const tester = `
import { RuntimeError, InternalServerError } from './interfaces';
import { TestClient } from './client';

export default async function test(client: TestClient) {
await expect(client.raise('RuntimeError')).to.eventually.be.rejectedWith(RuntimeError, 'heh');
await expect(client.raise('UnknownError')).to.eventually.be.rejectedWith(InternalServerError);
}
`;
  await new TestCase(schema, handler, tester).run();
});

test('rpc constructs Error classes from and only from declared errors when multiple errors possible',
  pass, async () => {
  const schema = `
export class RuntimeError extends Error {}
export class WalktimeError extends Error {}

export interface Test {
raise: {
  params: {
    exc: string;
  };
  returns: null;
  throws: RuntimeError | WalktimeError;
};
}`;
  const handler = `
import { RuntimeError, WalktimeError } from './interfaces';

export default class Handler {
public async raise(exc: string): Promise<void> {
  if (exc === 'RuntimeError') {
    throw new RuntimeError('heh');
  }
  if (exc === 'WalktimeError') {
    throw new WalktimeError('hoh');
  }
  throw new Error('ho');
}
}
`;
  const tester = `
import { RuntimeError, WalktimeError, InternalServerError } from './interfaces';
import { TestClient } from './client';

export default async function test(client: TestClient) {
await expect(client.raise('RuntimeError')).to.eventually.be.rejectedWith(RuntimeError, 'heh');
await expect(client.raise('WalktimeError')).to.eventually.be.rejectedWith(WalktimeError, 'hoh');
await expect(client.raise('UnknownError')).to.eventually.be.rejectedWith(InternalServerError);
}
`;
  await new TestCase(schema, handler, tester).run();
});

test('rpc supports the ServerOnlyContext interface', pass, async () => {
  const schema = `
export interface ServerOnlyContext {
ip: string;
}

export interface Test {
hello: {
  params: {
    name: string;
  };
  returns: string;
};
}`;
  const handler = `
import * as koa from 'koa';
import { Context } from './server';

export default class Handler {
public async extractContext(_: koa.Context): Promise<Context> {
  return { ip: 'test' };
}

public async hello({ ip }: Context, name: string): Promise<string> {
  return 'Hello, ' + name + ' from ' + ip;
}
}
`;
  const tester = `
import { TestClient } from './client';

export default async function test(client: TestClient) {
const result = await client.hello('vova');
expect(result).to.equal('Hello, vova from test');
}
`;
  await new TestCase(schema, handler, tester).run();
});

test('rpc supports the ClientContext interface', pass, async () => {
  const schema = `
export interface ClientContext {
debugId: string;
}

export interface Test {
hello: {
  params: {
    name: string;
  };
  returns: string;
};
}`;
  const handler = `
import * as koa from 'koa';
import { Context } from './server';

export default class Handler {
public async hello({ debugId }: Context, name: string): Promise<string> {
  return 'Hello, ' + name + ' d ' + debugId;
}
}
`;
  const tester = `
import { TestClient, Context } from './client';

export default async function test(client: TestClient) {
const result = await client.hello({ debugId: '666' } as Context, 'vova');
expect(result).to.equal('Hello, vova d 666');
}
`;
  await new TestCase(schema, handler, tester).run();
});

test('rpc supports the combination of ClientContext and ServerOnlyContext', pass, async () => {
  const schema = `
export interface ClientContext {
debugId: string;
}

export interface ServerOnlyContext {
ip: string;
}

export interface Test {
hello: {
  params: {
    name: string;
  };
  returns: string;
};
}`;
  const handler = `
import * as koa from 'koa';
import { Context, ServerOnlyContext } from './server';

export default class Handler {
public async extractContext(_: koa.Context): Promise<ServerOnlyContext> {
  return { ip: 'test' };
}

public async hello({ debugId, ip }: Context, name: string): Promise<string> {
  return 'Hello, ' + name + ' d ' + debugId + ' from ' + ip;
}
}
`;
  const tester = `
import { TestClient, Context } from './client';

export default async function test(client: TestClient) {
const result = await client.hello({ debugId: '666' } as Context, 'vova');
expect(result).to.equal('Hello, vova d 666 from test');
}
`;
  await new TestCase(schema, handler, tester).run();
});

const dummySchema = `
export interface Test {
bar: {
  params: {
    /**
     * @minLength 1
     */
    a: string;
  };
  returns: string;
};
}`;

const dummyMain = `
import test from './test';

async function main() {
try {
  await test();
  process.exit(0);
} catch(err) {
  console.error(err);
  process.exit(1);
}
}

main();
  `;

test('rpc forwards network errors', pass, async () => {
  // TODO: potential race condition if port reopens by other process immediately after close
  const tester = `
import { TestClient } from './client';
import { AddressInfo } from 'net';
import * as http from 'http';

export default async function test() {
const server = http.createServer();
await new Promise((resolve, reject) => {
  server.listen(0, '127.0.0.1', resolve);
  server.once('error', reject);
});
const { address, port } = (server.address() as AddressInfo);
const client = new TestClient('http://' + address + ':' + port);
server.close();
await expect(client.bar('heh')).to.eventually.be.rejectedWith(/connect ECONNREFUSED/);
}
`;
  await new TestCase(dummySchema, '', tester, dummyMain).run();
});

test('rpc handles empty 500 responses', pass, async () => {
  const tester = `
import { TestClient } from './client';
import { AddressInfo } from 'net';
import * as http from 'http';

export default async function test() {
const server = http.createServer((req, res) => {
    res.statusCode = 500;
    res.statusMessage = 'sorry';
    res.end();
});
await new Promise((resolve, reject) => {
  server.listen(0, '127.0.0.1', resolve);
  server.once('error', reject);
});
const { address, port } = (server.address() as AddressInfo);
const client = new TestClient('http://' + address + ':' + port);
await expect(client.bar('heh')).to.eventually.be.rejectedWith(Error, '500 - sorry');
}
`;
  await new TestCase(dummySchema, '', tester, dummyMain).run();
});

test('rpc handles non-json 500 responses', pass, async () => {
  const tester = `
import { TestClient } from './client';
import { AddressInfo } from 'net';
import * as http from 'http';

export default async function test() {
const server = http.createServer((req, res) => {
    res.statusCode = 500;
    res.statusMessage = 'Internal Server Error';
    res.end('Internal Server Error');
});
await new Promise((resolve, reject) => {
  server.listen(0, '127.0.0.1', resolve);
  server.once('error', reject);
});
const { address, port } = (server.address() as AddressInfo);
const client = new TestClient('http://' + address + ':' + port);
await expect(client.bar('heh')).to.eventually.be.rejectedWith(Error, '500 - Internal Server Error');
}
`;
  await new TestCase(dummySchema, '', tester, dummyMain).run();
});

test('rpc throws 400 errors on validation issues', pass, async () => {
  const handler = `
export default class Handler {
public async bar(name: string): Promise<string> {
  return 'Hello, ' + name;
}
}
`;
  const tester = `
import { TestClient, ValidationError } from './client';

export default async function test(client: TestClient) {
await expect(client.bar('')).to.eventually.be.rejectedWith(ValidationError, 'Bad Request');
}
`;
  await new TestCase(dummySchema, handler, tester).run();
});

test('rpc throws an abort error on timeout', pass, async () => {
  const handler = `
export default class Handler {
  public async bar(name: string): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return 'Hello, ' + name;
  }
}
`;
  const tester = `
import { TestClient } from './client';

export default async function test(client: TestClient) {
  await expect(client.bar('yay', { timeoutMs: 100 })).to.eventually.be.rejectedWith(
    Error, 'Request aborted due to timeout on method "bar"');
}
`;
  await new TestCase(dummySchema, handler, tester).run();
});

test('rpc supports custom headers', pass, async () => {
  const schema = `
export interface ServerOnlyContext {
  debugId: string;
}

export interface Test {
  bar: {
    params: {};
    returns: string;
  };
}
`;
  const handler = `
import * as koa from 'koa';
import { Context, ServerOnlyContext } from './server';

export default class Handler {
  public async extractContext(ctx: koa.Context): Promise<ServerOnlyContext> {
    return { debugId: ctx.get('Debug-Id')! };
  }

  public async bar({ debugId }: ServerOnlyContext): Promise<string> {
    return debugId;
  }
}
`;
  const tester = `
import { TestClient } from './client';

export default async function test(client: TestClient) {
  const res = await client.bar({ headers: { 'Debug-Id': 'yay' } });
  expect(res).to.eql('yay');
}
`;
  await new TestCase(schema, handler, tester).run();
});
