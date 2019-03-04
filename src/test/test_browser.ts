import test from 'ava';
import * as path from 'path';
import { launch } from 'puppeteer';
import { spawn as origSpawn } from 'child_process';
import { writeFile, mkdir } from 'mz/fs';
import { spawn } from '../utils';
import { pass, TestRunner } from './utils';

class TestCase extends TestRunner {
  public readonly main: string;
  constructor(
    dir: string,
    public readonly schema: string,
    public readonly handler: string,
    public readonly tester: string,
  ) {
    super(dir);
    this.main = `
import { AddressInfo } from 'net';
import * as http from 'http';
import * as koa from 'koa';
import * as cors from '@koa/cors';
import { TestRouter } from './server';
import Handler from './handler';

async function main() {
  const h = new Handler();

  const router = new TestRouter(h, true);
  const app = new koa();
  app.use(cors());
  app.use(router.koaRouter.routes());
  app.use(router.koaRouter.allowedMethods());
  const listener = await new Promise<http.Server>((resolve, reject) => {
    const server = http.createServer(app.callback()).listen(0, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
  const { address, port } = (listener.address() as AddressInfo);
  console.log('listening on:', 'http://' + address + ':' + port);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;
  }

  public static async createAndRun(
    schema: string,
    handler: string,
    tester: string,
  ) {
    const dir = await TestRunner.mkTmpdDir();
    const instance = new this(
      dir,
      schema,
      handler,
      tester,
    );
    await instance.run();
  }

  public async setup() {
    await writeFile(path.join(this.dir, 'schema.ts'), this.schema);
    await spawn('cp', [
      '-r',
      path.join(__dirname, '..', '..', 'webpack-test'),
      this.dir,
    ], {
      stdio: 'inherit',
    });

    await spawn('npm', [
      'init',
      '-y',
    ], {
      cwd: path.join(this.dir, 'webpack-test'),
      stdio: 'inherit',
    });

    await spawn('node', [
      path.join(__dirname, '..', 'cli.js'),
      'node',
      'test-server@0.0.1',
      'schema.ts',
      '--nocompile',
      '--server',
      'koa',
      '-o',
      './server',
    ], {
      cwd: path.join(this.dir),
      stdio: 'inherit',
    });

    await writeFile(path.join(this.dir, 'server', 'src', 'main.ts'), this.main);
    await writeFile(path.join(this.dir, 'server', 'src', 'handler.ts'), this.handler);

    await spawn('npm', [
      'install',
      '@koa/cors',
      '@types/koa__cors',
    ], {
      cwd: path.join(this.dir, 'server'),
      stdio: 'inherit',
    });

    await spawn('npm', ['install'], {
      cwd: path.join(this.dir, 'server'),
      stdio: 'inherit',
    });

    await spawn(
      path.join(__dirname, '..', '..', 'node_modules', '.bin', 'tsc'),
      [], {
      cwd: path.join(this.dir, 'server'),
      stdio: 'inherit',
    });

    await spawn('node', [
      path.join(__dirname, '..', 'cli.js'),
      'browser',
      'test-client@0.0.1',
      'schema.ts',
      '-o',
      './client',
    ], {
      cwd: path.join(this.dir),
      stdio: 'inherit',
    });

    await spawn('npm', [
      'install',
      path.join(this.dir, 'client'),
    ], {
      cwd: path.join(this.dir, 'webpack-test'),
      stdio: 'inherit',
    });
  }

  public async exec() {
    const webpack = origSpawn(
      path.join(__dirname, '..', '..', 'node_modules', '.bin', 'webpack-dev-server'),
      {
        cwd: path.join(this.dir, 'webpack-test'),
      },
    );
    const server = origSpawn('node', ['main.js'], {
      cwd: path.join(this.dir, 'server'),
    });

    try {
      // Hacky and ugly way to get the listen ports.
      // It's done this way to avoid a possible race when passing in a pre allocated port.
      let webpackPort: number | undefined;

      const serverUrl = await new Promise((resolve, reject) => {
        server.on('exit', () => {
          reject();
        });
        server.stdout.on('data', (buff: Buffer) => {
          const data = buff.toString();
          {
            const m = data.match(/listening on:\s(\S+)/);
            if (m) {
              resolve(m[1]);
            }
          }
        });
      });

      await new Promise((resolve, reject) => {
        webpack.on('exit', () => {
          reject();
        });
        webpack.stdout.on('data', (buff: Buffer) => {
          const data = buff.toString();
          {
            const m = data.match(/http:\/\/localhost:(\d+)/);
            if (m) {
              webpackPort = parseInt(m[1], 10);
            }
          }
          {
            const m = data.match(/Compiled successfully./);
            if (m) {
              resolve();
            }
          }
        });
      });

      // tslint:disable-next-line:no-console
      console.log({ webpackPort, serverUrl });

      const browser = await launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.goto(`http://localhost:${webpackPort}`);
      await page.evaluate(`(async () => {
        const client = new TestClient('${serverUrl}');
        ${this.tester}
      })()`);
      await browser.close();
    } finally {
      webpack.kill();
      server.kill();
    }
  }
}

test('browser works with node_koa', pass, async () => {
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
const result = await client.bar(666);
if (result !== '666') {
  throw new Error('Expected result to equal 666, got: ' + result);
}
`;
  await TestCase.createAndRun(schema, handler, tester);
});
