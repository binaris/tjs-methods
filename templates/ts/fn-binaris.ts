// tslint:disable
import { ValidationError } from './common';
import { validateMethod } from './serverCommon';
import {
  schema,
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
// TODO: type to binaris ctx when available
export type ContextExtractor = (ctx: any) => Promise<ServerOnlyContext>;
{{/serverOnlyContext}}
{{#serverContext}}
export type Context = {{{serverContext}}};
{{/serverContext}}
{{#classes}}
{{^attributes}}

export interface {{{name}}}Handler {
  {{#methods}}
  {{{name}}}({{#serverContext}}ctx: Context, {{/serverContext}}{{#parameters}}{{{name}}}{{#optional}}?{{/optional}}: {{{type}}}{{^last}}, {{/last}}{{/parameters}}): Promise<{{{returnType}}}>;
  {{/methods}}
}

export class {{{name}}}Wrapper {
  {{#methods}}

  public static {{{name}}}(fn: {{{className}}}Handler['{{{name}}}']{{#serverOnlyContext}}, extractContext: ContextExtractor{{/serverOnlyContext}}, stackTraceInError: boolean = false) {
    const validator = validateMethod(schema, '{{{className}}}', '{{{name}}}');
    return async (body: any, ctx: any) => {
      try {
        validator(body);
        const { context: clientContextFromBody, args } = body;

        {{#clientContext}}
        const clientContext = clientContextFromBody as ClientContext;
        {{/clientContext}}
        {{^clientContext}}
        const clientContext = {};
        {{/clientContext}}
        {{#serverOnlyContext}}
        const serverOnlyContext = await extractContext(ctx);
        {{/serverOnlyContext}}
        {{^serverOnlyContext}}
        const serverOnlyContext = {};
        {{/serverOnlyContext}}
        const context = { ...clientContext, ...serverOnlyContext };
        {{#serverContext}}
        return await fn(context{{#parameters}}, args.{{{name}}}{{/parameters}});
        {{/serverContext}}
        {{^serverContext}}
        return await fn({{#parameters}}args.{{{name}}}{{^last}}, {{/last}}{{/parameters}});
        {{/serverContext}}
      } catch (error) {
        const { stack, message, ...rest } = error;
        const processedError = stackTraceInError ? { stack: stack.toString(), ...rest } : rest;
        if (error instanceof ValidationError) {
          return new ctx.HTTPResponse({
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: 'ValidationError',
              message,
              errors: error.errors,
            }),
          });
        }
        // tslint:disable-next-line:no-console
        console.error(error);
        {{#throws}}
        if (error instanceof {{{.}}}) {
          return new ctx.HTTPResponse({
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ...processedError,
              message,
              name: '{{{.}}}',
            }),
          });
        }
        {{/throws}}
        return new ctx.HTTPResponse({
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...processedError,
            message,
            name: 'InternalServerError',
          }),
        });
      }
    };
  }
  {{/methods}}
}
{{/attributes}}
{{/classes}}
