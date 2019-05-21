import path from 'path';
import { tmpdir } from 'os';
import rmrf from 'rmfr';
import { mkdtemp } from 'mz/fs';
import { spawn } from '../utils';

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

  public get genDir(): string {
    return path.join(this.dir, 'gen');
  }

  public inModules(exec: string): string {
    return path.join(__dirname, '..', '..', 'node_modules', '.bin', exec);
  }

  public spawn(cmd, ...args) {
    return spawn(cmd, args, {
      cwd: this.dir,
      stdio: 'inherit',
    });
  }

  public spawnInGen(cmd, ...args) {
    return spawn(cmd, args, {
      cwd: this.genDir,
      stdio: 'inherit',
    });
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
