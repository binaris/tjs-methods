import { isPlainObject } from 'lodash';
import { createClassValidator, createInterfaceValidator, ValidationError } from './common';

export function validateClass(schema: { definitions: any }, className: string) {
  const contextValidator = schema.definitions.ClientContext
    ? createInterfaceValidator(schema, 'ClientContext') : undefined;
  const validators = createClassValidator(schema, className, 'params');
  return (method: string, body: any): void => {
    const validator = validators[method];
    if (!validator) {
      throw new ValidationError('Bad Request', [{ message: 'Method not supported', method }]);
    }
    if (!isPlainObject(body)) {
      throw new ValidationError('Bad Request', [{ message: 'Could not parse body', method }]);
    }

    const { context, args } = body;

    if (contextValidator && !contextValidator(context)) {
      throw new ValidationError('Bad Request', contextValidator.errors);
    }
    if (!validator(args)) {
      throw new ValidationError('Bad Request', validator.errors);
    }
  };
}

export function validateMethod(schema: { definitions: any }, className: string, method: string) {
  const classValidator = validateClass(schema, className);
  return (body: any) => {
    classValidator(method, body);
  };
}
