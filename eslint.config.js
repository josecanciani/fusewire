import jsdoc from 'eslint-plugin-jsdoc';

export default [
    {
        ignores: ['src/lib/**', 'src/vendor/**'],
    },
    {
        // All source files are ES modules — strict mode is always active.
        // These rules enforce that invariant statically at lint time.
        files: ['src/**/*.js', 'htdocs/**/*.js', 'test/**/*.js'],
        languageOptions: {
            // Tell ESLint these are ES modules so it applies strict-mode semantics
            sourceType: 'module',
        },
        rules: {
            // ESM files are always strict; ban the redundant directive
            strict: ['error', 'never'],
            // Octal literals (e.g. 0755) are a SyntaxError in strict mode
            'no-octal': 'error',
            // Octal escape sequences in strings (e.g. '\251') are also forbidden
            'no-octal-escape': 'error',
            // `with` is a SyntaxError in strict mode
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'WithStatement',
                    message: '`with` statements are forbidden (SyntaxError in strict mode / ESM).',
                },
            ],
        },
    },
    {
        files: ['src/**/*.js', 'htdocs/**/*.js'],
        plugins: { jsdoc },
        settings: {
            jsdoc: {
                preferredTypes: {
                    object: 'Use a more specific type (e.g. structured typedef) instead of generic "object".',
                    Object: 'Use a more specific type (e.g. structured typedef) instead of generic "Object".',
                    Function: 'Use a more specific type with parameter signatures instead of generic "Function".',
                    function: 'Use a more specific type with parameter signatures instead of generic "function".',
                    any: 'Use a more specific type (e.g., string, number, Component) or a union type instead of "any".',
                },
            },
        },
        rules: {
            'jsdoc/require-jsdoc': [
                'error',
                {
                    require: {
                        FunctionDeclaration: true,
                        MethodDefinition: true,
                        ClassDeclaration: true,
                        ArrowFunctionExpression: true,
                        FunctionExpression: true,
                        ClassExpression: true,
                    },
                },
            ],

            // Require @param for all parameters
            'jsdoc/require-param': 'error',
            'jsdoc/require-param-description': 'error',
            'jsdoc/require-param-type': 'error',

            // Require @returns for functions that return values
            'jsdoc/require-returns': 'error',
            'jsdoc/require-returns-type': 'error',
            'jsdoc/require-returns-description': 'error',

            // Ban generic types - require specific types
            'jsdoc/check-types': 'error',
            'jsdoc/no-undefined-types': [
                'error',
                {
                    definedTypes: [
                        // DOM globals (browser built-ins, not project types)
                        'HTMLElement',
                        'HTMLDivElement',
                        'HTMLInputElement',
                        'Element',
                        'Node',
                        'Document',
                        'Window',
                        'Event',
                        'MouseEvent',
                        'ResizeObserver',
                        'Console',
                    ],
                },
            ],

            // Enforce valid JSDoc syntax
            'jsdoc/check-tag-names': 'error',
            'jsdoc/check-param-names': 'error',
            'jsdoc/valid-types': 'error',

            // Require description on functions
            'jsdoc/require-description': [
                'error',
                {
                    contexts: [
                        'FunctionDeclaration',
                        'MethodDefinition',
                        'ArrowFunctionExpression',
                        'FunctionExpression'
                    ],
                },
            ],

        },
    },
];
