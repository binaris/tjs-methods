import test from 'ava';
import { expect } from 'chai';
import { pass } from './utils';
import { transform, typeToString, findRefs } from '../transform';

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

test('findRefs finds all reffed types', pass, () => {
  const result = findRefs({
    properties: {
      x: {
        type: {
          $ref: '#/definitions/X',
        },
      },
      y: {
        type: 'array',
        items: {
          type: {
            $ref: '#/definitions/Y',
          },
        },
      },
      z: {
        type: 'method',
        parameters: [
          {
            name: 'z',
            type: {
              $ref: '#/definitions/Z',
            },
          },
        ],
        returnType: 'string',
      },
    },
  });
  expect(result).to.eql(['#/definitions/X', '#/definitions/Y', '#/definitions/Z']);
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

test('typeToString transforms ref into class name', pass, () => {
  const result = typeToString({ $ref: '#/definitions/User' });
  expect(result).to.equal('User');
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
  expect(result).to.equal('string | User');
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
  expect(result).to.equal('User & Abuser');
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

test('transform transforms a simple class with single attribute', pass, () => {
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
  expect(result).to.eql({
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
    clientContext: undefined,
    serverOnlyContext: undefined,
    serverContext: undefined,
    enums: [],
    bypassTypes: [],
  });
});

test('transform transforms a simple class with single method', pass, () => {
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
  expect(result).to.eql({
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
    clientContext: undefined,
    serverOnlyContext: undefined,
    serverContext: undefined,
    enums: [],
    bypassTypes: [],
  });
});

test('transform sorts output class by checking references', pass, () => {
  const result = transform({
    definitions: {
      A: {
        properties: {
          foo: {
            type: 'object',
            properties: {
              params: {
                properties: {
                  b: {
                    $ref: '#/definitions/B',
                  },
                },
                propertyOrder: ['b'],
              },
              returns: {
                type: 'string',
              },
            },
          },
        },
      },
      B: {
        properties: {
          bar: {
            type: 'object',
            properties: {
              params: {
                properties: {
                  c: {
                    $ref: '#/definitions/C',
                  },
                },
                propertyOrder: ['b'],
              },
              returns: {
                type: 'string',
              },
            },
          },
        },
      },
      C: {
        properties: {
          baz: {
            type: 'string',
          },
        },
      },
    },
  });
  expect(result.classes.map(({ name }) => name)).to.eql(['C', 'B', 'A']);
});

test('transform transforms exceptions', pass, () => {
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
  expect(result).to.eql({
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
    clientContext: undefined,
    serverOnlyContext: undefined,
    serverContext: undefined,
    enums: [],
    bypassTypes: [],
  });
});

test('transform returns a context class when given a Context interface', pass, () => {
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
  expect(result.clientContext).to.eql({
    name: 'ClientContext',
    attributes: [
      {
        name: 'foo',
        type: 'string',
        optional: false,
      },
    ],
    methods: [],
  });
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
