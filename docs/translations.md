# Blueprint: Internationalization (i18n)

## Overview

For global reach, FuseWire applications must support internationalization (i18n). This document outlines the planned design for the translation system in FuseWire, which encompasses both UI text translation (templates and JavaScript) and route translation (URLs).

## Translating UI Text

The framework will support robust translation files (e.g., `.po`, `.json`, or standard i18n libraries) to handle simple strings, variable interpolation, and pluralization.

### Translating in Templates (HTML)

To align with modern web development practices (similar to React's `{t('...')}`, Vue's `{{ $t('...') }}`, or Svelte's `{$_('...')}`), translation in templates will use standard interpolation with a function call. 

This requires expanding the template parser to support function calls, string literals, and basic object literals inside `(( ))`.

```html
<!-- Simple text replacement -->
<h1>(( t('welcome_message') ))</h1>

<!-- Translation with variable interpolation -->
<!-- Translated string: "Hello, {name}!" -->
<p>(( t('hello_user', { name: userName }) ))</p>

<!-- Pluralization support -->
<!-- Translated string: "You have {count} messages" -->
<span>(( t('unread_messages', { count: messageCount }) ))</span>
```

### Translating in JavaScript

Components will have access to a built-in translation method (e.g., `this.t()`) for translating strings dynamically inside component logic, alerts, or error messages.

```javascript
// Simple translation
const msg = this.t('action_success');

// With variables and pluralization
const summary = this.t('items_deleted', { count: deletedItems.length });
```

## Translating Routes (URLs)

FuseWire's `HistoryRouter` uses component variable names (canonical keys) as URL segments by default. For internationalized applications, these canonical keys need to be translated into localized strings in the browser URL.

### Core Concepts

1. **Canonical Keys:** The actual JavaScript variable names (e.g., `this.table`, `this.search`) and property names (e.g., `id`, `page`) used inside the component's code. Components *always* work with canonical keys.
2. **Localized Keys:** The translated string that appears in the URL (e.g., `tabla`, `buscar`).
3. **Transparent Mapping:** The `HistoryRouter` handles translating Localized Keys to Canonical Keys when parsing the URL, and Canonical Keys to Localized Keys when serializing the URL.

### Translating Component Route Keys

The framework will load translation definitions alongside the components. These could be backed by `.json`, `.po`, or another translation system, depending on the specific implementation details.

For example, a dashboard component might map its `this.table` child to the string `"tabla"` and `this.search` to `"buscar"`.

When `HistoryRouter` builds the URL for the `Dashboard` component in the `es-ar` locale, it will map the `this.table` variable to the `tabla` URL segment:
`#!/tabla:id=10` instead of `#!/table:id=10`.

### Translating Properties

The translation system will also allow mapping property names alongside route keys. So `table` could map to `tabla` and its property `page` to `pagina`.

Resulting URL: `#!/tabla:pagina=2`
The `Table` component still receives `routeSegment.getInt('page')` in its `update()` method. The `RouteSegment` abstraction completely hides the localized URL string from the component code.

### The Root "app" Key Configuration

The top-level component of a FuseWire application is wrapped by the internal `FuseWire/Root` component, and is assigned to the `this.app` variable. 

By default, if the top-level component participates in routing (i.e., its `routeState()` returns properties), its route key in the URL will be `app` (e.g., `#!/app:theme=dark`).

Because `FuseWire/Root` is a built-in framework component, it does not have an accompanying translation file in the user's workspace. To allow customizing or translating the `app` key, this will be configured at the `Reactor` or `HistoryRouter` level:

```javascript
// Example: Configuring the root route key per-locale or per-app
const reactor = new Reactor('MyWebApp', {
    router: new HistoryRouter({
        urlService: new HashUrlService(),
        rootRouteKey: 'aplicacion' // Overrides the default 'app'
    })
});
```

This ensures that developers have full control over the URL structure from the very first segment, without needing to create mock translation files for internal framework wrappers.

## Changing Languages Dynamically

Because components always work with translation keys and canonical routing keys, the application can switch languages dynamically without losing the current UI or route state:

1. User selects a new language.
2. The global configuration updates its active locale.
3. The reactor triggers a global re-render to update all `fw-t` directives and text.
4. The router calls `replaceUrl()`.
5. The tree is re-serialized using the new locale's translation mappings.
6. The URL updates instantly in the browser address bar (e.g., from `#!/table:page=2` to `#!/tabla:pagina=2`).
