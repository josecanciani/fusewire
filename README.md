# FuseWire Client Library

Client-side component framework for building reactive web applications.

## Features

- Component-based architecture with lifecycle hooks
- Template compilation with `fw-if` and `fw-each` directives
- DOM morphing for efficient updates
- CSS scoping per component
- Nested component composition
- Server integration support (optional)

## Installation

```bash
npm install @fusewire/client
```

## Usage

```js
import { Component } from '@fusewire/client/component.js';
import { Reactor } from '@fusewire/client/reactor.js';

class Counter extends Component {
  static componentName = 'Counter';
  
  increment() {
    this.vars.count++;
    this.react();
  }
}

const reactor = new Reactor();
reactor.start(
  document.getElementById('app'),
  Counter,
  'main',
  { count: 0 }
);
```

## Documentation

See the [FuseWire documentation](https://github.com/josecanciani/fusewire-js) for full details.

## Development

```bash
# Run tests (Node.js with JSDOM)
npm test

# Run browser tests (Playwright)
npm run test:browser

# Run all tests
npm run test:all

# Run examples (starts local server)
npm run examples

# Lint code
npm run lint

# Format code
npm run format
```

## License

MIT
