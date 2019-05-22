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

function createValidator(removeAdditional: boolean): Ajv.Ajv {
  const ajv = new Ajv({ useDefaults: true, allErrors: true, removeAdditional });
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
  const ajv = createValidator(false);
  for (const [k, v] of Object.entries(schema.definitions)) {
    ajv.addSchema(v, `#/definitions/${k}`);
  }
  return fromPairs(Object.entries(schema.definitions[className].properties).map(([method, s]) => [
    method, ajv.compile((s as any).properties[field]),
  ]));
}

export function createReturnTypeValidator(
  schema: { definitions: any },
  className: string,
  removeAdditional: boolean
): ClassValidator {
  const ajv = createValidator(removeAdditional);
  for (const [k, v] of Object.entries(schema.definitions)) {
    ajv.addSchema(v, `#/definitions/${k}`);
  }
  return fromPairs(Object.entries(schema.definitions[className].properties).map(([method, s]) => [
    method, ajv.compile({ properties: pick((s as any).properties, 'returns') }),
  ]));
}

export function createInterfaceValidator(schema: { definitions: any }, ifaceName: string): Ajv.ValidateFunction {
  const ajv = createValidator(false);
  for (const [k, v] of Object.entries(schema.definitions)) {
    ajv.addSchema(v, `#/definitions/${k}`);
  }
  return ajv.compile(schema.definitions[ifaceName]);
}

export function verifySchemaNestedAnyOf(
  schema: { [key: string]: any },
  ctx: string,
  inRestricted: boolean,
  root: { [key: string]: any }
) {
  // console.log(ctx);
  if (schema.definitions) {
    for (const [name, def] of Object.entries(schema.definitions)) {
      verifySchemaNestedAnyOf(def, ctx + '.' + name, false, root);
    }
    return;
  }
  if (schema.$ref) {
    verifySchemaNestedAnyOf(root.definitions[schema.$ref.replace('#/definitions/', '')], ctx, inRestricted, root);
    return;
  }
  if (schema.additionalProperties === false && inRestricted) {
    throw new Error('Found additionalProperties === false inside anyOf/oneOf: ' + ctx);
  }
  if (schema.anyOf) {
    // heuristic for functions that return object or null
    // removing additional properties can't break "null"
    if (schema.anyOf.length === 2 && schema.anyOf.some((entry: any) => entry.type === 'null')) {
      return;
    }
    for (const [idx, item] of schema.anyOf.entries()) {
      verifySchemaNestedAnyOf(item, ctx + '#anyOf.' + idx, true, root);
    }
    return;
  }
  if (schema.oneOf) {
    for (const [idx, item] of schema.oneOf.entries()) {
      verifySchemaNestedAnyOf(item, ctx + '#oneOf.' + idx, true, root);
    }
    return;
  }
  if (schema.type === 'object' && schema.properties) {
    const isMethod = Object.keys(schema.properties).length === 3 &&
      schema.properties.returns && schema.properties.params && schema.properties.throws;
    for (const [prop, def] of Object.entries(schema.properties)) {
      // heuristic for throws (not converted by ajv)
      if (isMethod && prop === 'throws') {
        continue;
      }
      verifySchemaNestedAnyOf(def, ctx + '.' + prop, false, root);
    }
    return;
  }
  if (schema.type === 'array') {
    verifySchemaNestedAnyOf(schema.items, ctx + '.items', false, root);
    return;
  }
}
