import { first, isPlainObject, flatMap, partition } from 'lodash';
import * as toposort from 'toposort';

type Pair = [string, any];

interface TypeDef {
  type?: string;
  format?: string;
  $ref?: string;
  anyOf?: TypeDef[];
  allOf?: TypeDef[];
  properties?: { [name: string]: TypeDef };
  required?: string[];
  items?: TypeDef | TypeDef[];
  enum?: any[];
  concordType?: string;
}

export function addCoersion(def: any): void {
  if (isPlainObject(def) && (def as any).format === 'date-time') {
    def['coerce-date'] = true;
  } else {
    const values = isPlainObject(def) ? Object.values(def) : Array.isArray(def) ? def : undefined;
    if (values === undefined) {
      return;
    }
    for (const value of values) {
      addCoersion(value);
    }
  }
}

export function typeToString(def: TypeDef): string {
  const { type, format, $ref, anyOf, allOf, properties, required, items, enum: defEnum, concordType } = def;
  if (typeof concordType === 'string') {
    return concordType;
  }
  if (typeof type === 'string') {
    if (defEnum) {
      return defEnum.map((d) => JSON.stringify(d)).join(' | ');
    }
    if (type === 'object') {
      if (isPlainObject(properties)) {
        const req = required || [];
        const propString = Object.entries(properties!).map(([n, p]) =>
          `${n}${req.includes(n) ? '' : '?'}: ${typeToString(p)};`).join(' ');
        return `{ ${propString} }`;
      }
      return '{}';
    }
    if (type === 'array') {
      if (Array.isArray(items)) {
        return `[${items.map(typeToString).join(', ')}]`;
      } else if (isPlainObject(items)) {
        return `${typeToString(items!)}[]`;
      } else {
        throw new Error(`Invalid type for items: ${items}`);
      }
    }
    if (type === 'integer') {
      return 'number';
    }
    if (type === 'string' && format === 'date-time') {
      return 'Date';
    }
    return type;
  }
  if (typeof $ref === 'string') {
    return $ref.replace(/#\/definitions\//, '');
  }
  if (Array.isArray(anyOf)) {
    return anyOf.map(typeToString).join(' | ');
  }
  if (Array.isArray(allOf)) {
    return allOf.map(typeToString).join(' & ');
  }
  // tslint:disable-next-line no-console
  console.error('Could not determine type, defaulting to Object', def);
  return 'Object';
}

export interface Parameter {
  name: string;
  type: string;
  optional: boolean;
  last: boolean;
}

export interface Method {
  name: string;
  className: string; /* Useful to have in templates */
  parameters: Parameter[];
  returnType: string;
  throws: string[];
}

export interface ClassSpec {
    name: string;
    attributes: Array<{
      name: string;
      type: string;
      optional: boolean;
    }>;
    methods: Method[];
}

export interface ServiceSpec {
  schema: string;
  classes: ClassSpec[];
  exceptions: ClassSpec[];
  clientContext?: ClassSpec;
  serverOnlyContext?: ClassSpec;
  serverContext?: string;
  bypassTypes?: Array<{ name: string; def: string; }>;
  enums?: Array<{ name: string; def: Array<{ key: string; value: string; }> }>;
}

export function findRefs(definition): string[] {
  if (isPlainObject(definition)) {
    const refs = flatMap(Object.values(definition), findRefs);
    if (definition.$ref) {
      return [definition.$ref, ...refs];
    }
    return refs;
  }
  if (Array.isArray(definition)) {
    return flatMap(definition, findRefs);
  }
  return [];
}

export function sortDefinitions(definitions): Pair[] {
  const order = toposort(flatMap(Object.entries(definitions), ([k, d]) =>
    findRefs(d).map((r) => [r.replace(/^#\/definitions\//, ''), k])
  ));
  return Object.entries(definitions).sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
}

function isMethod(m): boolean {
  return m && m.properties && m.properties.params && m.properties.returns;
}

function isString(p): boolean {
  return p && p.type === 'string';
}

function isException(s): boolean {
  const props = s && s.properties;
  return ['name', 'message', 'stack'].every((p) => isString(props[p]));
}

export function transformClassPair([className, { properties, required }]: Pair): ClassSpec {
  return {
    name: className,
    methods: Object.entries(properties)
    .filter(([_, method]: Pair) => isMethod(method))
    .map(([methodName, method]: Pair): Method => {
      const params = Object.entries(method.properties.params.properties);
      const order = method.properties.params.propertyOrder;
      const methRequired = method.properties.params.required || [];
      return {
        name: methodName,
        className,
        parameters: params
        .sort(([n1], [n2]) => order.indexOf(n1) - order.indexOf(n2))
        .map(([paramName, param], i) => ({
          name: paramName,
          type: typeToString(param as TypeDef),
          optional: !methRequired.includes(paramName),
          last: i === params.length - 1,
        })),
        returnType: typeToString(method.properties.returns).replace(/^null$/, 'void'),
        throws: method.properties.throws ? typeToString(method.properties.throws).split(' | ') : [],
      };
    }),
    attributes: Object.entries(properties)
    .filter(([_, method]: Pair) => !isMethod(method))
    .map(([attrName, attrDef]: Pair) => ({
      name: attrName,
      type: typeToString(attrDef),
      optional: !(required || []).includes(attrName),
    })),
  };
}

const validEnumKeyRegex = /^[a-z][a-z\d_-]*$/i;
const isValidEnumKeyRegex = (s) => validEnumKeyRegex.test(s);

export function transform(schema): ServiceSpec {
  const { definitions } = schema;
  addCoersion(definitions);
  const sortedDefinitions = sortDefinitions(definitions);
  const bypassTypeDefs = sortedDefinitions.filter(
    ([_, { anyOf, allOf }]: Pair) => anyOf || allOf);
  const possibleEnumTypeDefs = sortedDefinitions.filter(
    ([_, { enum: enumDef }]: Pair) => enumDef);
  const stringEnumTypeDefs = possibleEnumTypeDefs.filter(
    ([_, { enum: enumDef, type }]: Pair) => type === 'string' && enumDef.every(isValidEnumKeyRegex));
  const invalidTypeEnumTypeDefs = possibleEnumTypeDefs.filter(
    ([_, { type }]: Pair) => type !== 'string').map(first);
  const invalidStringEnumTypeDefs = possibleEnumTypeDefs.filter(
    ([_, { enum: enumDef }]: Pair) => enumDef.some((d) => !isValidEnumKeyRegex(d))).map(first);
  if (invalidTypeEnumTypeDefs.length > 0) {
    throw new Error(
      `Unsupported enum type definitions found (expected string values only): ${invalidTypeEnumTypeDefs}`);
  }
  if (invalidStringEnumTypeDefs.length > 0) {
    throw new Error(
      `Unsupported enum value found (does not match ${validEnumKeyRegex}): ${invalidStringEnumTypeDefs}`);
  }
  const enums = stringEnumTypeDefs.map(([name, { enum: enumDef }]) => ({
    name,
    def: enumDef.map((value) => ({ key: value.toUpperCase().replace(/-/g, '_'), value: `'${value}'` })),
  }));
  const bypassTypes = bypassTypeDefs.map(([name, v]) => ({ name, def: typeToString(v) }));
  const classDefinitions = sortedDefinitions.filter(([_, { properties }]: Pair) => properties);
  const [exceptionsWithName, classesWithName] = partition(classDefinitions, ([_, s]) => isException(s));
  const exceptions = exceptionsWithName.map(transformClassPair);
  const classes = classesWithName.map(transformClassPair);
  const clientContext = classes.find(({ name }) => name === 'ClientContext');
  const serverOnlyContext = classes.find(({ name }) => name === 'ServerOnlyContext');
  const serverContext = clientContext
    ? (serverOnlyContext ? 'ClientContext & ServerOnlyContext' : 'ClientContext')
    : (serverOnlyContext ? 'ServerOnlyContext' : undefined);
  return {
    schema: JSON.stringify(schema, undefined, 2),
    classes,
    exceptions,
    enums,
    bypassTypes,
    clientContext,
    serverOnlyContext,
    serverContext,
  };
}
