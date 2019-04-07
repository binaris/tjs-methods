// tslint:disable
import { createReturnTypeValidator, ClassValidator, ValidationError, RequestError } from './common';
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

export interface Options extends Pick<RequestInit,
  'cache'
  | 'credentials'
  | 'mode'
  | 'redirect'
  | 'referrer'
  | 'referrerPolicy'
  | 'integrity'
  | 'keepalive'
  | 'window'
  > {
  headers?: Record<string, string>;
}

{{#globals}}
{{#clientContext}}
export type Context = ClientContext;
{{/clientContext}}
{{/globals}}

{{#classes}}
{{^attributes}}
export interface {{name}} {
  {{#methods}}
  {{name}}({{#clientContext}}ctx: Context ,{{/clientContext}}{{#parameters}}{{name}}{{#optional}}?{{/optional}}: {{{type}}}{{^last}}, {{/last}}{{/parameters}}): Promise<{{{returnType}}}>;
  {{/methods}}
}

export class {{name}}Client {
  public static readonly methods = [
    {{#methods}}
    '{{name}}',
    {{/methods}}
  ];
  public static readonly validators: ClassValidator = createReturnTypeValidator(schema, '{{{name}}}');

  protected readonly props = schema.definitions.{{{name}}}.properties;

  public readonly validators: ClassValidator; // We don't have class name in method scope because mustache sux

  public constructor(public readonly serverUrl: string, protected readonly options: Options = {}) {
    this.validators = {{{name}}}Client.validators;
  }
  {{#methods}}

  public async {{name}}({{#clientContext}}ctx: Context ,{{/clientContext}}{{#parameters}}{{name}}{{#optional}}?{{/optional}}: {{{type}}}, {{/parameters}}options?: Options): Promise<{{{returnType}}}> {
    const body = {
      {{#clientContext}}
      ctx,
      {{/clientContext}}
      {{#parameters}}
      {{name}},
      {{/parameters}}
    };

    const mergedOptions = {
      ...this.options,
      ...options,
    };
    let response: Response;
    let responseBody: any;
    let isJSON: boolean;
    try {
      response = await fetch(`${this.serverUrl}/{{name}}`, {
        ...mergedOptions,
        headers: {
          ...mergedOptions.headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        method: 'POST',
      });
      isJSON = (response.headers.get('content-type') || '').startsWith('application/json');
      // don't try parsing the response if the status is not a know concord status
      // TODO: verify this closes the request at some point
      if (isJSON && (response.status >= 200 && response.status < 300 || response.status === 400 || response.status === 500)) {
        responseBody = await response.json();
      }
    } catch (err) {
      throw new RequestError(err.message, err, '{{name}}', { serverUrl: this.serverUrl, ...this.options, ...options });
    }
    if (response.status >= 200 && response.status < 300) {
      const validator = this.validators.{{{name}}};
      const wrapped = { returns: responseBody }; // wrapped for coersion
      if (!validator(wrapped)) {
        throw new ValidationError('Failed to validate response', validator.errors);
      }
      return wrapped.returns as {{{returnType}}};
    } else if (!isJSON) {
      // fall through to throw
    } else if (response.status === 400) {
      if (responseBody.name === 'ValidationError') {
        throw new ValidationError(responseBody.message, responseBody.errors);
      }
    } else if (response.status === 500) {
      {{#throws}}
      if (responseBody.name === '{{.}}') {
        throw new {{.}}(responseBody.message);
      }
      {{/throws}}
      throw new InternalServerError(responseBody.message);
    }
    throw new RequestError(`${response.status} - ${response.statusText}`, undefined, '{{name}}', { serverUrl: this.serverUrl, ...this.options, ...options });
  }
  {{/methods}}
}
{{/attributes}}

{{/classes}}
