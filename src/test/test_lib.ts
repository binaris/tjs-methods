import test from 'ava';
import { createClassValidator } from '../lib/common';

test('createClassValidator creates an ajv ValidateFunction for each method signature in the class', (t) => {
  const schema = {
    definitions: {
      Foo: {
        properties: {
          hello: {
            properties: {
              params: {
                properties: {
                  name: {
                    type: 'string',
                  },
                },
                required: ['name'],
              },
            },
          },
        },
      },
    },
  };
  const validators = createClassValidator(schema, 'Foo', 'params');
  t.true(validators.hello({ name: 'heh' }));
  t.false(validators.hello({}));
});

test('createClassValidator resolves refs', (t) => {
  const schema = {
    definitions: {
      Bar: {
        type: 'string',
      },
      Foo: {
        properties: {
          hello: {
            properties: {
              params: {
                properties: {
                  name: {
                    $ref: '#/definitions/Bar',
                  },
                },
                required: ['name'],
              },
            },
          },
        },
      },
    },
  };
  const validators = createClassValidator(schema, 'Foo', 'params');
  t.true(validators.hello({ name: 'heh' }));
  t.false(validators.hello({}));
});
