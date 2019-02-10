import { format } from 'util';
import { randomBytes } from 'crypto';
import { mkdir } from 'mz/fs';
import * as path from 'path';
import * as yargs from 'yargs';
import * as rmrf from 'rmfr';
import { generate } from './index';
import { Role } from './types';
import { TSOutput } from './output';

function mktemp(): string {
  return path.join('/tmp', `generated-${randomBytes(20).toString('hex')}`);
}

interface Args {
  pattern: string;
  output?: string;
  role: Role;
  publish: boolean;
  'nocompile': boolean;
  'package': string;
  'publish-tag'?: string;
}

const argv = yargs
  .command('$0 <package> <pattern>', 'concord code generator', (y) => y
    .positional('package',  {
      type: 'string',
      describe: 'Publish as npm package with format of <packageName>@<version> (e.g. myservice@1.2.3)',
    })
    .positional('pattern',  {
      type: 'string',
      describe: 'Files matching this pattern will be evaluated as input',
    })
  )
  .option('output',  {
    type: 'string',
    alias: 'o',
    describe: 'Directory to output generated files',
  })
  .option('role',  {
    type: 'string',
    alias: 'r',
    default: Role.ALL,
    choices: Object.values(Role),
    describe: 'Generate specific role',
  })
  .option('nocompile',  {
    type: 'boolean',
    default: false,
    describe: 'Skip compilation (mostly for tests)',
  })
  .option('publish',  {
    type: 'boolean',
    default: false,
    alias: 'p',
    describe: 'Publish as package to npm',
  })
  .option('publish-tag',  {
    type: 'string',
    alias: 't',
    describe: 'When `publish` is specified, publish to a specific tag (see `npm publish --tag`)',
  })
  .argv;

async function main({
  pattern,
  'package': pkgName,
  'nocompile': noCompile,
  output,
  role,
  publish,
  'publish-tag': tag,
}: Args) {
  const parts = pkgName.split('@');
  if (parts.length < 2) {
    throw new Error(`package param should have a @ character for version, got ${pkgName}`);
  }
  const name = parts.slice(0, -1).join('@');
  const version = parts[parts.length - 1];

  if (publish) {
    if (!role || role === Role.ALL) {
      throw new Error('Must specify `role` (client or server) option with `publish`');
    }
  }
  const genPath = output || mktemp();
  if (genPath !== output) {
    await mkdir(genPath);
  }
  try {
    const generator = await TSOutput.create(genPath);
    const generated = await generate(pattern, role);
    await generator.write(name, version, generated, role);
    if (!noCompile) {
      await generator.compile();
    }
    process.stdout.write(`Generated code in: ${genPath}\n`);
    if (publish) {
      await generator.publish(tag);
    }
  } finally {
    if (genPath !== output) {
      await rmrf(genPath);
    }
  }
}

main(argv as any).catch((err) => {
  process.stderr.write(`Failed to generate files:\n${format(err)}\n`);
  process.exit(1);
});
