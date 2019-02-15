// tslint:disable
import fetch from 'node-fetch';
import { RequestInit } from 'node-fetch';
import AbortController from 'abort-controller';
import { createReturnTypeValidator, ClassValidator, ValidationError } from './common';
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

export interface Options extends Pick<RequestInit, 'agent' | 'redirect' | 'follow' | 'compress'> {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

{{#clientContext}}
export type Context = ClientContext;
{{/clientContext}}

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

  public constructor(protected readonly serverUrl: string, protected readonly options: Options = {}) {
    this.validators = {{{name}}}Client.validators;
  }
  {{#methods}}

  public async {{name}}({{#clientContext}}ctx: Context ,{{/clientContext}}{{#parameters}}{{name}}{{#optional}}?{{/optional}}: {{{type}}}, {{/parameters}}options?: Options): Promise<{{{returnType}}}> {
    const body = {
      args: {
        {{#parameters}}
        {{name}},
        {{/parameters}}
      },
      {{#clientContext}}
      context: ctx,
      {{/clientContext}}
    };

    const mergedOptions = {
      ...this.options,
      ...options,
    };

    if (mergedOptions.timeoutMs) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), mergedOptions.timeoutMs);
      (mergedOptions as any).signal = controller.signal;
      delete mergedOptions.timeoutMs;
    }

    const response = await fetch(`${this.serverUrl}/{{name}}`, {
      ...mergedOptions,
      headers: {
        ...mergedOptions.headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      method: 'POST',
    });
    const isJSON = (response.headers.get('content-type') || '').startsWith('application/json');
    if (response.status >= 200 && response.status < 300) {
      const validator = this.validators.{{{name}}};
      const wrapped = { returns: isJSON ? await response.json() : undefined }; // wrapped for coersion
      if (!validator(wrapped)) {
        throw new ValidationError('Failed to validate response', validator.errors);
      }
      return wrapped.returns as {{{returnType}}};
    } else if (!isJSON) {
      throw new Error(`${response.status} - ${response.statusText}`);
    } else if (response.status === 400) {
      const body = await response.json();
      if (body.name === 'ValidationError') {
        throw new ValidationError(body.message, body.errors);
      }
    } else if (response.status === 500) {
      const body = await response.json();
      {{#throws}}
      if (body.name === '{{.}}') {
        throw new {{.}}(body.message);
      }
      {{/throws}}
      throw new InternalServerError(body.message);
    }
    throw new Error(`${response.status} - ${response.statusText}`);
  }
  {{/methods}}
}
{{/attributes}}

{{/classes}}
