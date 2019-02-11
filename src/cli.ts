import { format } from 'util';
import { randomBytes } from 'crypto';
import { mkdir } from 'mz/fs';
import * as path from 'path';
import * as yargs from 'yargs';
import * as rmrf from 'rmfr';
import { generate } from './index';
import { Role, Runtime } from './types';
import { TSOutput } from './output';

function mktemp(): string {
  return path.join('/tmp', `generated-${randomBytes(20).toString('hex')}`);
}

interface Args {
  _: [Runtime];
  pattern: string;
  output?: string;
  role: Role;
  publish: boolean;
  'nocompile': boolean;
  'package': string;
  'publish-tag'?: string;
}

const tsSubcommand = (y: yargs.Argv) => y
  .positional('package', {
    type: 'string',
    describe: 'Generate an npm package with format of <packageName>@<version> (e.g. myservice@1.2.3)',
  })
  .positional('pattern', {
    type: 'string',
    describe: 'Files matching this pattern will be evaluated as input',
    normalize: true,
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
  });

const argv = yargs
  .command('$0 <runtime>', 'concord code generator', (y) => y
    .command(
      `${Runtime.node} <package> <pattern>`,
      'Generate code for node runtime (client)',
      (yy) => tsSubcommand(yy).option('role', {
        type: 'string',
        hidden: true,
        default: Role.CLIENT,
      })
    )
    .command(
      `${Runtime.node_koa} <package> <pattern>`,
      'Generate code for node_koa runtime (default node client | server)',
      (yy) => tsSubcommand(yy).option('role', {
        type: 'string',
        alias: 'r',
        default: Role.ALL,
        choices: Object.values(Role),
        describe: 'Generate specific role',
      })
    )
    .command(
      `${Runtime.browser} <package> <pattern>`,
      'Generate code for browser runtime (client)',
      (yy) => tsSubcommand(yy).option('role', {
        type: 'string',
        hidden: true,
        default: Role.CLIENT,
      })
    )
    .demandCommand()
  )
  .option('output',  {
    type: 'string',
    alias: 'o',
    describe: 'Directory to output generated files',
  })
  .option('nocompile',  {
    type: 'boolean',
    default: false,
    describe: 'Skip compilation (mostly for tests)',
  })
  .argv;

async function main({
    _: [runtime],
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
    const generated = await generate(runtime, pattern, role);
    await generator.write(runtime, name, version, generated, role);
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
