import { first, isPlainObject, partition, flatMap } from 'lodash';
import { Definition, PrimitiveType } from 'typescript-json-schema';

interface TypeDef extends Definition {
  concordType?: string;
}

interface ObjectTypeDef extends TypeDef {
  type: 'object';
  properties: Record<string, TypeDef>;
}

interface EnumTypeDef extends TypeDef {
  enum: any[];
}

interface StringEnumTypeDef extends EnumTypeDef {
  type: 'string';
  enum: string[];
}

interface ParamTypeDef extends TypeDef {
  properties: Record<string, TypeDef>;
  propertyOrder: string[];
}

interface MethodTypeDef {
  properties: {
    params: ParamTypeDef;
    returns: TypeDef;
    throws: TypeDef; // TODO: should be optional
  };
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

export function deepFind<T>(obj: any, f: (x: any) => x is T): T[] {
  if (f(obj)) {
    return [obj];
  }
  if (isPlainObject(obj)) {
    return flatMap(Object.values(obj), (x) => deepFind(x, f));
  }
  if (Array.isArray(obj)) {
    return flatMap(obj, (x) => deepFind(x, f));
  }
  return [];
}

export function findRefs(definition: any): string[] {
  return deepFind(definition, (obj: any): obj is { $ref: string } => obj && typeof obj.$ref === 'string')
    .map(({ $ref }) => $ref);
}

const deref = (ref: string) => ref.replace(/^#\/definitions\//, '');

const sanitizeTemplate = (s: string) => s.replace(/(\[\]|[<>\[\]]|(,\s*))/g, (m) => {
  switch (m) {
    case '<':
      return '_of_';
    case '[':
      return 'tuple_of_';
    case ']':
    case '>':
      return '_end';
    case '[]':
      return '_array';
    default:
      return '_';
  }
});
const parensTypeToString = (def: TypeDef) => `(${typeToString(def)})`;

export function typeToString(def: TypeDef): string {
  if (Object.keys(def).length === 0) {
    return 'any';
  }
  const { type, format, $ref, anyOf, allOf, properties, required, items, enum: defEnum, concordType } = def;
  if (typeof concordType === 'string') {
    return concordType;
  }
  if (typeof type === 'string') {
    if (defEnum !== undefined) {
      return (defEnum as PrimitiveType[]).map((d) => JSON.stringify(d)).join(' | ');
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
        return `Array<${typeToString(items!)}>`;
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
  if (Array.isArray(type)) {
    return type.map((elem) => parensTypeToString({ type: elem })).join(' | ');
  }
  if (typeof $ref === 'string') {
    return sanitizeTemplate(deref($ref));
  }
  if (Array.isArray(anyOf)) {
    return anyOf.map(parensTypeToString).join(' | ');
  }
  if (Array.isArray(allOf)) {
    return allOf.map(parensTypeToString).join(' & ');
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
  clientContext?: string | false;
  serverOnlyContext?: string | false;
  serverContext?: string;
}

export interface ServiceSpec {
  schema: string;
  classes: ClassSpec[];
  exceptions: ClassSpec[];
  globals: {
    clientContext: boolean;
    serverOnlyContext: boolean;
    serverContext?: string;
  };
  bypassTypes?: Array<{ name: string; def: string; }>;
  enums?: Array<{ name: string; def: Array<{ key: string; value: string; }> }>;
}

function isMethod(m: any): m is MethodTypeDef {
  return m && m.properties && m.properties.params && m.properties.returns;
}

function isString(p: any): boolean {
  return p && p.type === 'string';
}

function isException(s: any): boolean {
  const props = s && s.properties;
  return ['name', 'message', 'stack'].every((p) => isString(props[p]));
}

function maybeFalse(s: string): string | false {
  if (s === 'false') {
    return false;
  }
  return s;
}

export function transformClassPair(
  className: string,
  { properties, required }: ObjectTypeDef,
  globalContext?: { clientContext: boolean; serverOnlyContext: boolean }
): ClassSpec {
  const contextPart: Pick<ClassSpec, 'clientContext' | 'serverOnlyContext' | 'serverContext'> = {};
  if (properties.clientContext) {
    contextPart.clientContext = maybeFalse(typeToString(properties.clientContext));
  } else if (globalContext && globalContext.clientContext) {
    contextPart.clientContext = 'ClientContext';
  }
  if (properties.serverOnlyContext) {
    contextPart.serverOnlyContext = maybeFalse(typeToString(properties.serverOnlyContext));
  } else if (globalContext && globalContext.serverOnlyContext) {
    contextPart.serverOnlyContext = 'ServerOnlyContext';
  }
  const { clientContext, serverOnlyContext } = contextPart;
  if (clientContext || serverOnlyContext) {
    contextPart.serverContext = clientContext
      ? (serverOnlyContext ? `${clientContext} & ${serverOnlyContext}` : clientContext)
      : (serverOnlyContext ? serverOnlyContext : undefined);
  }

  const interfacePart = {
    name: className,
    methods: Object.entries(properties)
    .filter((kv): kv is [string, MethodTypeDef] => isMethod(kv[1]))
    .map(([methodName, method]): Method => {
      const params = Object.entries(method.properties.params.properties);
      const paramNames = Object.keys(method.properties.params.properties);
      if (paramNames.includes('ctx')) {
        throw new Error(`Invalid parameter name 'ctx' on interface '${className}'`);
      }
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
        // throws is either { $ref } or { anyOf: [ { $ref }, ...] }, findRefs will locate all of those
        throws: findRefs(method.properties.throws).map(deref),
      };
    }),
    attributes: Object.entries(properties)
    .filter(([name, method]) => !isMethod(method) && name !== 'clientContext' && name !== 'serverOnlyContext')
    .map(([attrName, attrDef]) => ({
      name: attrName,
      type: typeToString(attrDef),
      optional: !(required || []).includes(attrName),
    })),
  };

  return Object.keys(interfacePart.methods).length > 0
    ? {
      ...contextPart,
      ...interfacePart,
    }
    : interfacePart;
}

const validEnumKeyRegex = /^[a-z][a-z\d_-]*$/i;
const isValidEnumKeyRegex = (s: string) => validEnumKeyRegex.test(s);

export function transform(schema: TypeDef): ServiceSpec {
  const { definitions } = schema;
  if (definitions === undefined) {
    throw new Error('Got schema with empty definitions');
  }
  addCoersion(definitions);
  const definitionPairs = Object.entries(definitions).map(([k, v]) => [sanitizeTemplate(k), v]);
  const bypassTypeDefs = definitionPairs.filter(
    ([_, { anyOf, allOf }]) => anyOf || allOf);
  const possibleEnumTypeDefs = definitionPairs.filter(
    (kv): kv is [string, EnumTypeDef] => kv[1].enum !== undefined);
  const stringEnumTypeDefs = possibleEnumTypeDefs.filter(
    (kv): kv is [string, StringEnumTypeDef] => kv[1].type === 'string' && kv[1].enum.every(isValidEnumKeyRegex));
  const invalidTypeEnumTypeDefs = possibleEnumTypeDefs.filter(
    ([_, { type }]) => type !== 'string').map(first);
  const invalidStringEnumTypeDefs = possibleEnumTypeDefs.filter(
    ([_, { enum: enumDef }]) => enumDef.some((d) => !isValidEnumKeyRegex(d))).map(first);
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
  const classDefinitions = definitionPairs.filter((kv): kv is [string, ObjectTypeDef] =>
    kv[1].properties !== undefined);
  const [exceptionsWithName, classesWithName] = partition(classDefinitions, ([_, s]) => isException(s));
  const exceptions = exceptionsWithName.map(([name, def]) => transformClassPair(name, def));
  const clientContext = classesWithName.some(([name]) => name === 'ClientContext');
  const serverOnlyContext = classesWithName.some(([name]) => name === 'ServerOnlyContext');
  const classes = classesWithName.map(([name, def]) => transformClassPair(name, def, {
    clientContext,
    serverOnlyContext,
  }));
  const serverContext = clientContext
    ? (serverOnlyContext ? 'ClientContext & ServerOnlyContext' : 'ClientContext')
    : (serverOnlyContext ? 'ServerOnlyContext' : undefined);
  return {
    schema: JSON.stringify(schema, undefined, 2),
    classes,
    exceptions,
    enums,
    bypassTypes,
    globals: {
      clientContext,
      serverOnlyContext,
      serverContext,
    },
  };
}
