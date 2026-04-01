# FuseWire Client-Only Examples

This directory contains standalone examples of the FuseWire client library running entirely in the browser without a server.

## Running the Examples

### Quick Start (Recommended)

From the fusewire root directory:

```bash
npm run examples
```

This will start a local web server and automatically open your browser to the examples page.

### Manual Options

**Option 1: Express (Recommended - same as parent project)**

```bash
cd lib/fusewire
node examples-server.js
```

Then open: http://localhost:8000/examples/client-only

**Option 2: Python HTTP Server**

```bash
cd examples/client-only
python3 -m http.server 8000
```

Then open: http://localhost:8000

**Option 2: Node.js http-server**

```bash
npx http-server -p 8000
```

Then open: http://localhost:8000/examples/client-only

**Option 3: VS Code Live Server**

1. Install the "Live Server" extension
2. Right-click on `index.html`
3. Select "Open with Live Server"

## What's Demonstrated

The Counter example shows:

- ✅ **Component lifecycle**: `init()`, `update()`, `destroy()` hooks
- ✅ **Template compilation**: Variable interpolation with `((variableName))`
- ✅ **CSS scoping**: Component-specific styles
- ✅ **Reactive rendering**: Updates via `this.react()`
- ✅ **DOM morphing**: Efficient updates without full re-renders
- ✅ **Instance management**: Component registry and lifecycle

## Example Structure

```
client-only/
├── index.html           # Entry point
├── components/
│   ├── Counter.js       # Component class
│   ├── Counter.html     # Template
│   └── Counter.css      # Scoped styles
└── README.md            # This file
```

## Note on idiomorph

The example includes a simple fallback for idiomorph (just using innerHTML). In production, you should:

1. Use the real idiomorph library for efficient DOM morphing
2. Bundle it with your application, or
3. Load it from a CDN like unpkg.com

Example with real idiomorph:

```html
<script type="importmap">
    {
        "imports": {
            "idiomorph": "https://unpkg.com/idiomorph@0.7.4/dist/idiomorph.esm.js"
        }
    }
</script>
```

## Why a Web Server?

Browsers block ES module imports over the `file://` protocol for security reasons (CORS policy). That's why you need to serve the examples through an HTTP server. The same requirement applies to the browser tests, which use Playwright with http-server.
