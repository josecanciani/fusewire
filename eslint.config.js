import jsdoc from 'eslint-plugin-jsdoc';

export default [
    {
        ignores: ['src/lib/**'],
    },
    {
        files: ['src/**/*.js'],
        plugins: { jsdoc },
        settings: {
            jsdoc: {
                preferredTypes: {
                    object: false,
                },
            },
        },
        rules: {
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
                        'Element',
                        'Node',
                        'Document',
                        'Window',
                        'Event',
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
                    contexts: ['FunctionDeclaration', 'MethodDefinition'],
                },
            ],
        },
    },
];
