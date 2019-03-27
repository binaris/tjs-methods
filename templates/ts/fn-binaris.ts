// tslint:disable
import { ValidationError } from './common';
import * as serverExec from './serverExec';
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
{{#serverOnlyContext}}
// TODO: type to binaris ctx when available
export type {{{name}}}ContextExtractor = (ctx: any) => Promise<{{{serverOnlyContext}}}>;
{{/serverOnlyContext}}

export interface {{{name}}}Handler {
  {{#methods}}
  {{{name}}}({{#serverContext}}ctx: {{{serverContext}}}, {{/serverContext}}{{#parameters}}{{{name}}}{{#optional}}?{{/optional}}: {{{type}}}{{^last}}, {{/last}}{{/parameters}}): Promise<{{{returnType}}}>;
  {{/methods}}
}

export class {{{name}}}Wrapper {
  {{#methods}}

  public static {{{name}}}(fn: {{{className}}}Handler['{{{name}}}']{{#serverOnlyContext}}, extractContext: {{{className}}}ContextExtractor{{/serverOnlyContext}}, stackTraceInError: boolean = false) {
    return async (body: any, ctx: any) => {
      const { status, body: responseBody, error } = await serverExec.exec{{{className}}}{{{name}}}(
        body,
        fn,
        {{#serverOnlyContext}}
        () => extractContext(ctx),
        {{/serverOnlyContext}}
        stackTraceInError,
      );
      if (status === 500) {
        // tslint:disable-next-line:no-console
        console.error(error);
      }

      return new ctx.HTTPResponse({
        statusCode: status,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(responseBody),
      });
    };
  }
  {{/methods}}
}
{{/attributes}}
{{/classes}}
