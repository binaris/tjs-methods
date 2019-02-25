// tslint:disable
import * as Koa from 'koa';
import * as Router from 'koa-router';
import * as http from 'http';
import * as bodyParser from 'koa-bodyparser';
import * as errors from 'koa-json-error';
import { validate } from './koaMW';
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

{{#serverOnlyContext}}
export { ServerOnlyContext };
{{/serverOnlyContext}}
{{#serverContext}}
export type Context = {{{serverContext}}};
{{/serverContext}}

{{#classes}}
{{^attributes}}
export interface {{name}}Handler {
  {{#attributes}}
  readonly {{name}}: {{{type}}};
  {{/attributes}}
  {{#serverOnlyContext}}extractContext(ctx: Koa.Context): Promise<ServerOnlyContext>;{{/serverOnlyContext}}
  {{#methods}}
  {{name}}({{#serverContext}}ctx: Context, {{/serverContext}}{{#parameters}}{{name}}{{#optional}}?{{/optional}}: {{{type}}}{{^last}}, {{/last}}{{/parameters}}): Promise<{{{returnType}}}>;
  {{/methods}}
}

export class {{name}}Router {
  public static readonly methods = [
    {{#methods}}
    '{{name}}',
    {{/methods}}
  ];

  protected readonly props = schema.definitions.{{{name}}}.properties;
  public readonly koaRouter: Router;

  constructor(
    protected readonly handler: {{name}}Handler,
    stackTraceInError = false,
  ) {
    this.koaRouter = new Router();

    this.koaRouter.use(errors({
      postFormat: (e, { stack, knownError, name, ...rest }) => {
        const base = stackTraceInError ? { stack } : {};
        name = knownError ? name : 'InternalServerError';
        return { ...base, ...rest, name };
      },
    }));
    this.koaRouter.use(bodyParser());
    this.koaRouter.post('/:method', validate(schema, '{{name}}'));

    {{#methods}}
    this.koaRouter.post('/{{name}}', async (ctx) => {
      const { context: clientContextFromBody, args } = (ctx.request as any).body;
      const params = this.props.{{name}}.properties.params;
      const method = this.handler.{{name}}.bind(this.handler);
      try {
        ctx.set('Content-Type', 'application/json');
        {{#clientContext}}
        const clientContext = clientContextFromBody as ClientContext;
        {{/clientContext}}
        {{^clientContext}}
        const clientContext = {};
        {{/clientContext}}
        {{#serverOnlyContext}}
        const serverOnlyContext = await this.handler.extractContext(ctx);
        {{/serverOnlyContext}}
        {{^serverOnlyContext}}
        const serverOnlyContext = {};
        {{/serverOnlyContext}}
        const context = { ...clientContext, ...serverOnlyContext };
        ctx.state.context = context;
        {{#serverContext}}
        ctx.body = JSON.stringify(await method(context{{#parameters}}, args.{{{name}}}{{/parameters}}));
        {{/serverContext}}
        {{^serverContext}}
        ctx.body = JSON.stringify(await method({{#parameters}}args.{{{name}}}{{^last}}, {{/last}}{{/parameters}}));
        {{/serverContext}}
      } catch (err) {
        {{#throws}}
        if (err instanceof {{.}}) {
          ctx.throw(500, 'Internal Server Error', {
            ...err,
            knownError: true,
            expose: true,
            name: '{{.}}',
            message: err.message,
          });
        }
        {{/throws}}
        throw err;
      }
    });
    {{/methods}}
  }
}

export class {{name}}Server {
  protected readonly app: Koa;
  protected readonly router: {{name}}Router;

  public constructor(
    protected readonly handler: {{name}}Handler,
    stackTraceInError = false,
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
