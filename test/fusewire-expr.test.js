import { describe, it } from 'node:test';
import assert from 'node:assert';
import parser from '../src/parser/fusewire-expr.js';

describe('FuseWire Expression Parser', () => {
    it('parses a basic variable', () => {
        const ast = parser.parse('user.name');
        assert.deepStrictEqual(ast, { type: 'VarPath', value: 'user.name' });
    });

    it('parses a negation', () => {
        const ast = parser.parse('!isVisible');
        assert.deepStrictEqual(ast, { type: 'Negation', expr: { type: 'VarPath', value: 'isVisible' } });
    });

    it('parses a string', () => {
        const ast = parser.parse("'bg-primary'");
        assert.deepStrictEqual(ast, { type: 'String', value: 'bg-primary' });
    });

    it('parses a ternary', () => {
        const ast = parser.parse("isActive ? 'active' : 'inactive'");
        assert.deepStrictEqual(ast, {
            type: 'Ternary',
            condition: { type: 'VarPath', value: 'isActive' },
            trueExpr: { type: 'String', value: 'active' },
            falseExpr: { type: 'String', value: 'inactive' }
        });
    });

    it('parses a nested ternary', () => {
        const ast = parser.parse("a ? '1' : b ? '2' : '3'");
        assert.deepStrictEqual(ast, {
            type: 'Ternary',
            condition: { type: 'VarPath', value: 'a' },
            trueExpr: { type: 'String', value: '1' },
            falseExpr: {
                type: 'Ternary',
                condition: { type: 'VarPath', value: 'b' },
                trueExpr: { type: 'String', value: '2' },
                falseExpr: { type: 'String', value: '3' }
            }
        });
    });

    it('parses a for-each loop', () => {
        const ast = parser.parse("item in items");
        assert.deepStrictEqual(ast, {
            type: 'ForEach',
            item: { type: 'VarPath', value: 'item' },
            list: { type: 'VarPath', value: 'items' }
        });
    });
});
