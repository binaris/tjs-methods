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

export class TimeoutError extends Error {
  public readonly name = 'TimeoutError';
  constructor(message: string, public readonly method: string, public readonly options: any) {
    super(message);
  }
}

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
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
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
      serverUrl: this.serverUrl,
      ...this.options,
      ...options,
    };

    const { fetchImplementation, timeoutMs, headers, serverUrl, ...fetchOptions } = mergedOptions;

    const fetchImpl = fetchImplementation || fetch;

    if (timeoutMs) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      (fetchOptions as any).signal = controller.signal;
    }

    let response: Response;
    let responseBody: any;
    let responseText: string | undefined;
    let isJSON: boolean;
    try {
      response = await fetchImpl(`${serverUrl}/{{name}}`, {
        ...fetchOptions,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        method: 'POST',
      });
      isJSON = (response.headers.get('content-type') || '').startsWith('application/json');
      if (isJSON) {
        responseBody = await response.json();
      } else {
        responseText = await response.text();
      }
    } catch (err) {
      if (err.message === 'The user aborted a request.') {
        throw new TimeoutError('Request aborted due to timeout', '{{name}}', mergedOptions);
      }
      throw new RequestError(err.message, err, '{{name}}', mergedOptions);
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
    throw new RequestError(`${response.status} - ${response.statusText}`,
      { responseText: responseText && responseText.slice(0, 256), responseBody },
      '{{name}}',
      mergedOptions);
  }
  {{/methods}}
}
{{/attributes}}

{{/classes}}
