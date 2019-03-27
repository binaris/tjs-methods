// tslint:disable
import * as http from 'http';
import * as Koa from 'koa';
import * as Router from 'koa-router';
import * as bodyParser from 'koa-bodyparser';
import { ValidationError } from './common';
import { validateClass } from './serverCommon';
import * as serverExec from './serverExec';
import {
  schema,
  InternalServerError,
  {{#exceptions}}
  {{name}},
  {{/exceptions}}
  {{#classes}}
  {{name}},
  {{/classes}}
  {{#enums}}
  {{name}},
  {{/enums}}
  {{#bypassTypes}}
  {{name}},
  {{/bypassTypes}}
} from './interfaces';

export {
  ValidationError,
};

{{#globals}}
{{#serverOnlyContext}}
export { ServerOnlyContext };
{{/serverOnlyContext}}
{{#serverContext}}
export type Context = {{{serverContext}}};
{{/serverContext}}
{{/globals}}
{{#classes}}
{{^attributes}}
export interface {{name}}Handler {
  {{#serverOnlyContext}}extractContext(ctx: Koa.Context): Promise<{{{serverOnlyContext}}}>;{{/serverOnlyContext}}
  {{#methods}}
  {{{name}}}({{#serverContext}}ctx: {{{serverContext}}}, {{/serverContext}}{{#parameters}}{{{name}}}{{#optional}}?{{/optional}}: {{{type}}}{{^last}}, {{/last}}{{/parameters}}): Promise<{{{returnType}}}>;
  {{/methods}}
}

export class {{name}}Router {
  public static readonly methods = [
    {{#methods}}
    '{{{name}}}',
    {{/methods}}
  ];

  protected readonly props = schema.definitions.{{{name}}}.properties;
  public readonly koaRouter: Router;

  constructor(
    protected readonly handler: {{{name}}}Handler,
    stackTraceInError = false,
  ) {
    this.koaRouter = new Router();
    this.koaRouter.use(bodyParser());
    const validator = validateClass(schema, '{{{name}}}');

    {{#methods}}
    this.koaRouter.post('/{{{name}}}', async (ctx) => {
      ctx.state.method = '{{{name}}}';
      const fn = this.handler.{{{name}}}.bind(this.handler);
      const { status, body: responseBody, context } = await serverExec.exec{{{className}}}{{{name}}}(
        (ctx.request as any).body,
        fn,
        {{#serverOnlyContext}}
        () => this.handler.extractContext(ctx),
        {{/serverOnlyContext}}
        stackTraceInError,
      );
      ctx.status = status;
      ctx.set('Content-Type', 'application/json');
      ctx.state.context = context;
      ctx.body = JSON.stringify(responseBody);
    });
    {{/methods}}
  }
}

export class {{name}}Server {
  protected readonly app: Koa;
  protected readonly router: {{name}}Router;

  public constructor(
    protected readonly handler: {{name}}Handler,
    stackTraceInError = false
  ) {
    this.app = new Koa();
    this.router = new {{name}}Router(handler, stackTraceInError);

    this.app.use(this.router.koaRouter.routes());
    this.app.use(this.router.koaRouter.allowedMethods());
  }

  public listen(port: number, host: string = 'localhost'): Promise<http.Server> {
    return new Promise((resolve, reject) => {
      const server = http.createServer(this.app.callback()).listen(port, host, () => resolve(server));
      server.once('error', reject);
    });
  }
}
{{/attributes}}
{{/classes}}
