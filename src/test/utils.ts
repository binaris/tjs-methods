import * as path from 'path';
import { tmpdir } from 'os';
import * as rmrf from 'rmfr';
import { mkdtemp } from 'mz/fs';

export async function pass(t, fn) {
  await fn();
  t.pass();
}

export async function mkTestDir() {
  return mkdtemp(path.join(tmpdir(), 'concord-test-'), { encoding: 'utf8' });
}

export class TestRunner {
  constructor(
    public readonly dir: string,
  ) {}

  public static async mkTmpdDir(): Promise<string> {
    return mkdtemp(path.join(tmpdir(), 'concord-test-'), { encoding: 'utf8' });
  }

  public async setup(): Promise<void> {
    // Override in subclass
  }

  public async cleanup(): Promise<void> {
    await rmrf(this.dir);
  }

  public async exec(): Promise<void> {
    throw new Error('Not implemented');
  }

  public async run(): Promise<void> {
    try {
      await this.setup();
      await this.exec();
    } finally {
      await this.cleanup();
    }
  }
}
