import test from 'ava';
import { expect } from 'chai';
import { pass } from './utils';
import { transform, typeToString } from '../transform';

const exceptionSchema = {
  properties: {
    message: {
      type: 'string',
    },
    name: {
      type: 'string',
    },
    stack: {
      type: 'string',
    },
  },
  propertyOrder: [
    'name',
    'message',
    'stack',
  ],
  required: [
    'message',
    'name',
  ],
  type: 'object',
};

test('typeToString transforms empty schema to any', pass, () => {
  const result = typeToString({});
  expect(result).to.equal('any');
});

test('typeToString transforms integer to number', pass, () => {
  const result = typeToString({ type: 'integer' });
  expect(result).to.equal('number');
});

test('typeToString passes through a string type', pass, () => {
  const result = typeToString({ type: 'string' });
  expect(result).to.equal('string');
});

test('typeToString transforms concordType to concordType', pass, () => {
  const result = typeToString({ type: 'string', concordType: 'LT' });
  expect(result).to.equal('LT');
});

test('typeToString transforms type array into pipe separated string', pass, () => {
  const result = typeToString({
    type: ['string', 'number'],
  });
  expect(result).to.equal('(string) | (number)');
});

test('typeToString transforms ref into class name', pass, () => {
  const result = typeToString({ $ref: '#/definitions/User' });
  expect(result).to.equal('User');
});

test('typeToString transforms template ref into valid class name', pass, () => {
  const result = typeToString({ $ref: '#/definitions/Foo<number, [string, boolean], null[], Bar<string>>' });
  expect(result).to.equal('Foo_of_number_tuple_of_string_boolean_end_null_array_Bar_of_string_end_end');
});

test('typeToString transforms date-time format into Date', pass, () => {
  const result = typeToString({ type: 'string', format: 'date-time' });
  expect(result).to.equal('Date');
});

test('typeToString transforms enum into pipe separated string', pass, () => {
  const result = typeToString({
    type: 'string',
    enum: ['a', 'b'],
  });
  expect(result).to.equal('"a" | "b"');
});

test('typeToString transforms boolean enum with single value to that value', pass, () => {
  const result = typeToString({ type: 'boolean', enum: [false] });
  expect(result).to.equal('false');
});

test('typeToString transforms anyOf into pipe separated string', pass, () => {
  const result = typeToString({
    anyOf: [
      {
        type: 'string',
      },
      {
        $ref: '#/definitions/User',
      },
    ],
  });
  expect(result).to.equal('(string) | (User)');
});

test('typeToString transforms allOf into ampersand separated string', pass, () => {
  const result = typeToString({
    allOf: [
      {
        $ref: '#/definitions/User',
      },
      {
        $ref: '#/definitions/Abuser',
      },
    ],
  });
  expect(result).to.equal('(User) & (Abuser)');
});

test('typeToString transforms object into TS interface', pass, () => {
  const result = typeToString({
    type: 'object',
    properties: {
      user: {
        $ref: '#/definitions/User',
      },
      created: {
        type: 'string',
        format: 'date-time',
      },
    },
    required: ['user'],
  });
  expect(result).to.equal('{ user: User; created?: Date; }');
});

test('typeToString transforms array with items as object into TS interface', pass, () => {
  const result = typeToString({
    type: 'array',
    items: {
      $ref: '#/definitions/User',
    },
  });
  expect(result).to.equal('User[]');
});

test('typeToString transforms array with items as array into TS interface', pass, () => {
  const result = typeToString({
    type: 'array',
    items: [
      {
        $ref: '#/definitions/User',
      },
      {
        type: 'string',
        format: 'date-time',
      },
    ],
  });
  expect(result).to.equal('[User, Date]');
});

test('transform transforms a simple class with single attribute', (t) => {
  const schema = {
    definitions: {
      Test: {
        properties: {
          x: {
            type: 'number',
          },
        },
      },
    },
  };
  const result = transform(schema);
  t.deepEqual({
    schema: JSON.stringify(schema, undefined, 2),
    exceptions: [],
    classes: [
      {
        name: 'Test',
        attributes: [
          {
            name: 'x',
            type: 'number',
            optional: true,
          },
        ],
        methods: [],
      },
    ],
    globals: {
      clientContext: false,
      serverOnlyContext: false,
      serverContext: undefined,
    },
    enums: [],
    bypassTypes: [],
  }, result);
});

test('transform transforms a simple class with single method', (t) => {
  const schema = {
    definitions: {
      Test: {
        properties: {
          add: {
            type: 'object',
            properties: {
              params: {
                type: 'object',
                properties: {
                  b: {
                    type: 'integer',
                  },
                  a: {
                    type: 'integer',
                  },
                },
                propertyOrder: ['a', 'b'],
              },
              returns: {
                type: 'integer',
              },
            },
          },
        },
      },
    },
  };
  const result = transform(schema);
  t.deepEqual({
    schema: JSON.stringify(schema, undefined, 2),
    exceptions: [],
    classes: [
      {
        name: 'Test',
        attributes: [],
        methods: [
          {
            className: 'Test',
            name: 'add',
            parameters: [
              {
                name: 'a',
                type: 'number',
                optional: true,
                last: false,
              },
              {
                name: 'b',
                type: 'number',
                optional: true,
                last: true,
              },
            ],
            returnType: 'number',
            throws: [],
          },
        ],
      },
    ],
    globals: {
      clientContext: false,
      serverOnlyContext: false,
      serverContext: undefined,
    },
    enums: [],
    bypassTypes: [],
  }, result);
});

test('transform transforms templated types', (t) => {
  const schema = {
    definitions: {
      Test: {
        properties: {
          add: {
            type: 'object',
            properties: {
              params: {
                type: 'object',
                properties: {},
              },
              returns: {
                $ref: '#/definitions/Foo<number>',
              },
            },
          },
        },
      },
      'Foo<number>': {
        properties: {
          foo: {
            type: 'number',
          },
        },
      },
    },
  };
  const result = transform(schema);
  t.deepEqual({
    schema: JSON.stringify(schema, undefined, 2),
    exceptions: [],
    classes: [
      {
        name: 'Test',
        attributes: [],
        methods: [
          {
            className: 'Test',
            name: 'add',
            parameters: [
            ],
            returnType: 'Foo_of_number_end',
            throws: [],
          },
        ],
      },
      {
        name: 'Foo_of_number_end',
        attributes: [
          {
            name: 'foo',
            type: 'number',
            optional: true,
          },
        ],
        methods: [],
      },
    ],
    globals: {
      clientContext: false,
      serverOnlyContext: false,
      serverContext: undefined,
    },
    enums: [],
    bypassTypes: [],
  }, result);
});

test('transform transforms exceptions', (t) => {
  const schema = {
    definitions: {
      Test: {
        properties: {
          add: {
            type: 'object',
            properties: {
              params: {
                type: 'object',
                properties: {},
              },
              returns: {
                type: 'integer',
              },
              throws: {
                $ref: '#/definitions/RuntimeError',
              },
            },
          },
        },
      },
      RuntimeError: exceptionSchema,
    },
  };
  const result = transform(schema);
  t.deepEqual({
    schema: JSON.stringify(schema, undefined, 2),
    exceptions: [
      {
        name: 'RuntimeError',
        attributes: [
          {
            name: 'message',
            type: 'string',
            optional: false,
          },
          {
            name: 'name',
            type: 'string',
            optional: false,
          },
          {
            name: 'stack',
            type: 'string',
            optional: true,
          },
        ],
        methods: [],
      },
    ],
    classes: [
      {
        name: 'Test',
        attributes: [],
        methods: [
          {
            className: 'Test',
            name: 'add',
            parameters: [
            ],
            returnType: 'number',
            throws: ['RuntimeError'],
          },
        ],
      },
    ],
    globals: {
      clientContext: false,
      serverOnlyContext: false,
      serverContext: undefined,
    },
    enums: [],
    bypassTypes: [],
  }, result);
});

test('transform returns a context class when given a Context interface', (t) => {
  const result = transform({
    definitions: {
      ClientContext: {
        properties: {
          foo: {
            type: 'string',
          },
        },
        required: ['foo'],
      },
    },
  });
  t.true(result.globals.clientContext);
});

test('transform throws when passed non string enum', pass, () => {
  expect(() =>
    transform({
      definitions: {
        OneTwoThree: {
          type: 'number',
          enum: [1, 2, 3],
        },
      },
    })
  ).to.throw('Unsupported enum type definitions found (expected string values only): OneTwoThree');
});

test('trasform throws when passed string enum with invalid value', pass, () => {
  expect(() =>
    transform({
      definitions: {
        InvalidStringEnum: {
          type: 'string',
          enum: ['1ss', 'sss'],
        },
      },
    })
  ).to.throw(/^Unsupported enum value found \(does not match .+\): InvalidStringEnum$/);
});

test('transform throws when calling a param `ctx`', (t) => {
  const schema = {
    definitions: {
      Test: {
        properties: {
          foo: {
            type: 'object',
            properties: {
              params: {
                type: 'object',
                properties: {
                  ctx: {
                    type: 'integer',
                  },
                },
                propertyOrder: ['ctx'],
              },
              returns: {
                type: 'integer',
              },
            },
          },
        },
      },
    },
  };
  t.throws(() => transform(schema), /Invalid parameter name 'ctx' on interface 'Test'/);
});
