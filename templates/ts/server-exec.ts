validator('{{{name}}}', body);
const { context: clientContextFromBody, args } = body;

{{#clientContext}}
const clientContext = clientContextFromBody as ClientContext;
{{/clientContext}}
{{^clientContext}}
const clientContext = {};
{{/clientContext}}
{{#serverOnlyContext}}
const serverOnlyContext = await extractContext(ctx);
{{/serverOnlyContext}}
{{^serverOnlyContext}}
const serverOnlyContext = {};
{{/serverOnlyContext}}
const context = { ...clientContext, ...serverOnlyContext };
{{#serverContext}}
return {
 status: 200,
 body: await fn(context{{#parameters}}, args.{{{name}}}{{/parameters}}),
};
{{/serverContext}}
{{^serverContext}}
return {
  status: 200,
  body: await fn({{#parameters}}args.{{{name}}}{{^last}}, {{/last}}{{/parameters}}),
};
{{/serverContext}}
} catch (error) {
const { stack, message, ...rest } = error;
const processedError = stackTraceInError ? { stack: stack.toString(), ...rest } : rest;
if (error instanceof ValidationError) {
  return {
    status: 400,
    body: {
      name: 'ValidationError',
      message,
      errors: error.errors,
    },
  };
}
{{#throws}}
if (error instanceof {{{.}}}) {
  return {
    status: 500,
    body: {
      ...processedError,
      message,
      name: '{{{.}}}',
    },
  };
}
{{/throws}}
return {
  status: 500,
  body: {
    ...processedError,
    message,
    name: 'InternalServerError',
  },
};
