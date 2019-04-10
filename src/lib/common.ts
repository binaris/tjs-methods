import { identity, pick, fromPairs } from 'lodash';
import * as Ajv from 'ajv';

export class ValidationError extends Error {
  public readonly name = 'ValidationError';
  constructor(message: string, public errors: any) {
    super(message);
  }
}

export interface ClassValidator {
  [method: string]: Ajv.ValidateFunction;
}

export class RequestError extends Error {
  public readonly name = 'RequestError';
  constructor(
    message: string,
    /**
     * The original error causing this request to fail
     * Inherits Error in case of network or parse errors
     * In case of an invalid HTTP response it will contain an object with the body/trimmed text of the response
     */
    public readonly cause: any,
    public readonly method: string,
    public readonly options: any
  ) {
    super(message);
  }
}

function createValidator(): Ajv.Ajv {
  const ajv = new Ajv({ useDefaults: true, allErrors: true });
  ajv.addMetaSchema(require('ajv/lib/refs/json-schema-draft-06.json'));
  ajv.addKeyword('coerce-date', {
    type: 'string',
    modifying: true,
    valid: true,
    compile: (onOrOff: boolean, parentSchema: any) => {
      if (parentSchema.format !== 'date-time') {
        throw new Error('Format should be date-time when using coerce-date');
      }
      if (onOrOff !== true) {
        return identity;
      }
      return (v: any, _dataPath?: string, obj?: object | any[], key?: string | number) => {
        if (obj === undefined || key === undefined) {
          throw new Error('Cannot coerce a date at root level');
        }
        (obj as any)[key] = new Date(v);
        return true;
      };
    },
  });
  return ajv;
}

export function createClassValidator(schema: { definitions: any }, className: string, field: string): ClassValidator {
  const ajv = createValidator();
  for (const [k, v] of Object.entries(schema.definitions)) {
    ajv.addSchema(v, `#/definitions/${k}`);
  }
  return fromPairs(Object.entries(schema.definitions[className].properties).map(([method, s]) => [
    method, ajv.compile((s as any).properties[field]),
  ]));
}

export function createReturnTypeValidator(schema: { definitions: any }, className: string): ClassValidator {
  const ajv = createValidator();
  for (const [k, v] of Object.entries(schema.definitions)) {
    ajv.addSchema(v, `#/definitions/${k}`);
  }
  return fromPairs(Object.entries(schema.definitions[className].properties).map(([method, s]) => [
    method, ajv.compile({ properties: pick((s as any).properties, 'returns') }),
  ]));
}

export function createInterfaceValidator(schema: { definitions: any }, ifaceName: string): Ajv.ValidateFunction {
  const ajv = createValidator();
  for (const [k, v] of Object.entries(schema.definitions)) {
    ajv.addSchema(v, `#/definitions/${k}`);
  }
  return ajv.compile(schema.definitions[ifaceName]);
}
