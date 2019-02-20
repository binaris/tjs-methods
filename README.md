[![CircleCI](https://circleci.com/gh/binaris/concord.svg?style=svg)](https://circleci.com/gh/binaris/concord)

# concord

*concord* transforms Typescript interfaces into usable client / server code.

It simplifies the process of writing clients and servers and lets you concord your code faster.
Instead of describing REST APIs, `concord` abstracts away REST and HTTP and gives you a simple typescript interface.

Behind the scenes it uses simple HTTP POST with JSON payload and is validated using JSONSchema.
The heavy lifting is done by [typescript-json-schema](https://github.com/YousefED/typescript-json-schema).

### Usage
1. Create the interface file.

    *`interface.ts`*
    ```typescript
    export interface Example {
      add: {
        params: {
          a: number;
          b: number;
        };
        returns: number;
      };
    }
    ```
1. Compile the schema.
    ```bash
    mkdir -p ./generated && concord -o ./generated node --client fetch --server koa example@0.0.1 interface.ts
    ```
1. Write the server code.

    *`server.ts`*
    ```typescript
    import { ExampleServer } from './generated/server';

    class Handler {
      public async add(a: number, b: number): Promise<number> {
        return a + b;
      }
    }

    const h = new Handler();

    const server = new ExampleServer(h);
    server.listen(8080);
    ```
1. Write the client code.

    *`client.ts`*
    ```typescript
    import { ExampleClient } from './generated/client';

    async function main() {
      const client = new ExampleClient('http://localhost:8080');
      try {
        const x = await client.add(1, 2);
        console.log(x);
      } catch (err) {
        console.error(err);
      }
    }

    main();
    ```
1. Run (make sure `tsconfig.json` is properly configured for node and is present in the current directory)
    TODO: Test this process
    ```bash
    tsc
    ./server.js &
    ./client.js
    ```
    Alternatively with `ts-node`:
    ```bash
    ts-node ./server.ts &
    ts-node ./client.ts
    ```


## Advanced usage
### Creating an npm package
Concord can create an npm package for you and publish it if instead of specifying an output dir you give it a publish target.
In the following example `concord` will publish the generated server files to npm as example-client@0.0.1:
```bash
concord node --publish --client fetch example-client@0.0.1 interface.ts
```

### Generating code for different runtimes
The first positional argument given to the `concord` CLI is `runtime`, currently supported runtimes are `node` and `browser`.\
The node `node` runtime supports a `koa` server and a `fetch` client.\
Run `concord <runtime> --help` for more details.


### Calling with curl # TODO

### Calling with httpie # TODO

### Object params
Complex nested object types are supported.

`Date` parameter types or return type are validated by JSON schema and cast into back to `Date` objects when deserialized.
```typescript
export interface User {
  name: string;
  createdAt: Date;
}

export interface Example {
  lastSeen: {
    params: {
      u: User;
    };
    returns: Date;
  };
}
```

### Context
Some use cases require context to be passed on to handlers (i.e. for authentication / extracting the request IP).

There are 2 types of contexts in `concord`, `ClientContext` and `ServerOnlyContext`.

* `ClientContext` is prepended to the client call signature and is exported as `Context` from the generated client file.
* `ServerOnlyContext` is extracted by the server using a custom provided function that accepts a request object (depends on the runtime) and returns a context object.  Handler methods receive a context which is an intersection of `ClientContext` and `ServerOnlyContext` and is exported as `Context` from the generated server code.

To use contexts simply add them to your interfaces file.

*`interface.ts`*
```typescript
export interface ClientContext {
  token: string;
}

export interface ServerOnlyContext {
  ip: string;
}

export interface Example {
  hello: {
    params: {
      name: string;
    };
    returns: integer;
  };
}
```

*`server.ts`*
```typescript
import * as koa from 'koa';
import { ExampleServer, Context, ServerOnlyContext } from './generated/server';

export class Handler {
  public async extractContext({ ip }: koa.Context): Promise<ServerOnlyContext> {
    return { ip };
  }

  public async hello({ token, ip }: Context, name: string): Promise<string> {
    return `Hello, ${name} from ${ip}, token: ${token}`;
  }
}

const h = new Handler();

const server = new ExampleServer(h);
server.listen(8080);
```

*`client.ts`*
```typescript
import { ExampleClient, Context } from './generated/client';

async function main() {
  const client = new ExampleClient('http://localhost:8080');
  await client.hello({ token: 'abc' }, 'baba'); // Hello, baba from 127.0.0.1, token: abc
}

main();
```

### Generating only client / server
```bash
concord -o ./generated_client node --client fetch example-client@0.0.1 interfaces.ts
concord -o ./generated_server node --server koa example-server@0.0.1 interfaces.ts
```

### Mounting the app with a different prefix and adding custom middleware
*`server.ts`*
```typescript
// ...
import { ExampleRouter } from './generated/server';

// ... implement Handler class ...
const h = new Handler();
const router = new ExampleRouter(h);
const app = new Koa();

const baseRouter = new Router(); // koa-router
baseRouter.use('/prefix',  router.koaRouter.routes(),  router.koaRouter.allowedMethods());
app.use(baseRouter.routes());
app.use(async function myCustomMiddleware(ctx: koa.Context, next) {
  // ... implement middlware ...
});
// ... app.listen(), etc ...
```


### Exceptions # TODO

### JSON Schema attributes
Use annotations to specify JSON Schema attributes.
```typescript
export interface Example {
  add: {
    params: {
      /**
      * @minmum 0
      */
      a: integer;
      /**
      * @minmum 0
      */
      b: integer;
    };
    returns: integer;
  };
}
```

### Integers
Define `integer` as `number`, it'll be reflected in the generated JSON schema while the generated Typescript code will be typed as `number`.
```typescript
export type integer = number;

export interface Example {
  add: {
    params: {
      a: integer;
      b: integer;
    };
    returns: integer;
  };
}
```

### Void return type
When null is the only return type on a method, as in `returns: null`, it will compile to `Promise<void>`.

Defining `returns: null | SomethingElse` on a method will compile to `Promise<null | SomethingElse>` return type.

## Comparison to other tools
#### OpenAPI (Swagger)
[OpenAPI](https://www.openapis.org/) provides an easy way to write descriptive REST APIs.
`concord` on the other hand, spares you from even thinking about REST and lets you focus on your buisness logic.

Both projects use JSON Schema for input validation. OpenAPI let's you write pure JSON schema while `concord` interfaces are written in typescript.

#### Protobuf / Thrift
`protobuf` and `thrift` have ATM more efficient serialization.
They both enforce backwards compatibility better with field numbering? (TODO)
In the future we could add binary serialization to `concord` but we default to JSON for readability.

`concord` provides advanced type validation with JSON schema.

`concord` uses [mustache](link-needed) templates which are easy to customize to support any language / framework.
