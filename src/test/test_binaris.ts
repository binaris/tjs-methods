import test from 'ava';
import * as path from 'path';
import { writeFile } from 'mz/fs';
import { spawn } from '../utils';
import { pass, TestRunner } from './utils';

class TestCase extends TestRunner {
  public readonly runner: string;

  constructor(
    dir: string,
    public readonly functionName: string,
    public readonly schema: string,
    public readonly handler: string,
    public readonly tester: string,
  ) {
    super(dir);
    this.runner = `
import { TestClient } from './client';
import test from './test';

async function main() {
  const url = 'https://' + (process.env.BINARIS_INVOKE_ENDPOINT || 'run.binaris.com')
    + '/v2/run/' + process.env.BINARIS_ACCOUNT_ID;
  const client = new TestClient(url, {
    headers: {
      'X-Binaris-Api-Key': process.env.BINARIS_API_KEY!,
    },
  });
  await test(client);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;
  }

  public static async createAndRun(
    functionName: string,
    schema: string,
    handler: string,
    tester: string,
  ) {
    const dir = await TestRunner.mkTmpdDir();
    const instance = new this(
      dir,
      functionName,
      schema,
      handler,
      tester,
    );
    await instance.run();
  }

  public async setup() {
    await writeFile(path.join(this.dir, 'schema.ts'), this.schema);
    await spawn('node', [
      path.join(__dirname, '..', 'cli.js'),
      'node',
      'test@0.0.1',
      'schema.ts',
      '--client', 'fetch',
      '--server', 'binaris',
      '--nocompile',
      '-o',
      '.',
    ], {
      cwd: this.dir,
      stdio: 'inherit',
    });

    await writeFile(path.join(this.dir, 'src', 'run.ts'), this.runner);
    await writeFile(path.join(this.dir, 'binaris.yml'), JSON.stringify({
      functions: {
        [this.functionName]: {
          file: 'handler.js',
          entrypoint: 'handler',
          runtime: 'node8',
          executionModel: 'concurrent',
        },
      },
    }));
    await writeFile(path.join(this.dir, 'src', 'handler.ts'), this.handler);
    await writeFile(path.join(this.dir, 'src', 'test.ts'), `
import { expect, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';

use(chaiAsPromised);
${this.tester}`);

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

    await spawn(
      path.join(__dirname, '..', '..', 'node_modules', '.bin', 'bn'),
      ['deploy', this.functionName], {
      cwd: this.dir,
      stdio: 'inherit',
    });
  }

  public async exec(): Promise<void> {
    await spawn(
      'node', ['run.js'], {
      cwd: this.dir,
      stdio: 'inherit',
    });
  }
}

test('rpc can invoke over binaris', pass, async () => {
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
import { TestWrapper } from './server';

export const handler = TestWrapper.bar(async (a: number): Promise<string> => a.toString());
`;
  const tester = `
import { TestClient } from './client';

export default async function test(client: TestClient) {
  expect(await client.bar(3)).to.equal('3');
}
`;
  await TestCase.createAndRun('bar', schema, handler, tester);
});
