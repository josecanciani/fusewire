import { describe, it } from 'node:test';
import assert from 'node:assert';
import { RouteSegment, RouteEncoder, MinimalRouteEncoder } from '../src/route-segment.js';

describe('RouteSegment', () => {
    describe('constructor', () => {
        it('creates segment with key and empty properties', () => {
            const seg = new RouteSegment('dashboard');
            assert.strictEqual(seg.key, 'dashboard');
            assert.strictEqual(seg.get('anything'), null);
        });

        it('creates segment with key and properties', () => {
            const props = new Map([['id', '42'], ['view', 'grid']]);
            const seg = new RouteSegment('table', props);
            assert.strictEqual(seg.key, 'table');
            assert.strictEqual(seg.get('id'), '42');
            assert.strictEqual(seg.get('view'), 'grid');
        });
    });

    describe('get', () => {
        it('returns raw string value', () => {
            const seg = new RouteSegment('x', new Map([['color', 'blue']]));
            assert.strictEqual(seg.get('color'), 'blue');
        });

        it('returns null for missing property', () => {
            const seg = new RouteSegment('x');
            assert.strictEqual(seg.get('missing'), null);
        });
    });

    describe('getString', () => {
        it('returns value when present', () => {
            const seg = new RouteSegment('x', new Map([['name', 'alice']]));
            assert.strictEqual(seg.getString('name'), 'alice');
        });

        it('returns default when property is missing', () => {
            const seg = new RouteSegment('x');
            assert.strictEqual(seg.getString('name', 'fallback'), 'fallback');
        });

        it('returns empty string as default when no fallback provided', () => {
            const seg = new RouteSegment('x');
            assert.strictEqual(seg.getString('name'), '');
        });
    });

    describe('getInt', () => {
        it('parses integer value', () => {
            const seg = new RouteSegment('x', new Map([['page', '7']]));
            assert.strictEqual(seg.getInt('page'), 7);
        });

        it('returns default for missing property', () => {
            const seg = new RouteSegment('x');
            assert.strictEqual(seg.getInt('page', 1), 1);
        });

        it('returns default for non-numeric value', () => {
            const seg = new RouteSegment('x', new Map([['page', 'abc']]));
            assert.strictEqual(seg.getInt('page', 1), 1);
        });

        it('returns 0 as default when no fallback provided', () => {
            const seg = new RouteSegment('x');
            assert.strictEqual(seg.getInt('page'), 0);
        });

        it('parses negative integers', () => {
            const seg = new RouteSegment('x', new Map([['offset', '-3']]));
            assert.strictEqual(seg.getInt('offset'), -3);
        });
    });

    describe('getFloat', () => {
        it('parses float value', () => {
            const seg = new RouteSegment('x', new Map([['ratio', '3.14']]));
            assert.strictEqual(seg.getFloat('ratio'), 3.14);
        });

        it('returns default for missing property', () => {
            const seg = new RouteSegment('x');
            assert.strictEqual(seg.getFloat('ratio', 1.0), 1.0);
        });

        it('returns default for non-numeric value', () => {
            const seg = new RouteSegment('x', new Map([['ratio', 'abc']]));
            assert.strictEqual(seg.getFloat('ratio', 0.5), 0.5);
        });
    });

    describe('getBool', () => {
        it('parses "true" as true', () => {
            const seg = new RouteSegment('x', new Map([['active', 'true']]));
            assert.strictEqual(seg.getBool('active'), true);
        });

        it('parses "1" as true', () => {
            const seg = new RouteSegment('x', new Map([['active', '1']]));
            assert.strictEqual(seg.getBool('active'), true);
        });

        it('parses "false" as false', () => {
            const seg = new RouteSegment('x', new Map([['active', 'false']]));
            assert.strictEqual(seg.getBool('active'), false);
        });

        it('parses "0" as false', () => {
            const seg = new RouteSegment('x', new Map([['active', '0']]));
            assert.strictEqual(seg.getBool('active'), false);
        });

        it('returns default for missing property', () => {
            const seg = new RouteSegment('x');
            assert.strictEqual(seg.getBool('active', true), true);
        });

        it('returns default for unrecognised value', () => {
            const seg = new RouteSegment('x', new Map([['active', 'yes']]));
            assert.strictEqual(seg.getBool('active', false), false);
        });
    });

    describe('toString', () => {
        it('serializes key-only segment', () => {
            const seg = new RouteSegment('dashboard');
            assert.strictEqual(seg.toString(), 'dashboard');
        });

        it('serializes segment with properties', () => {
            const seg = new RouteSegment('table', new Map([['id', '10'], ['view', 'grid']]));
            assert.strictEqual(seg.toString(), 'table:id=10;view=grid');
        });

        it('encodes spaces as plus signs', () => {
            const seg = new RouteSegment('search', new Map([['q', 'hello world']]));
            assert.strictEqual(seg.toString(), 'search:q=hello+world');
        });

        it('encodes structural characters (slashes)', () => {
            const seg = new RouteSegment('path', new Map([['dir', 'a/b']]));
            assert.strictEqual(seg.toString(), 'path:dir=a%2Fb');
        });

        it('encodes semicolons (ambiguous in values)', () => {
            const seg = new RouteSegment('x', new Map([['v', 'a;b']]));
            assert.strictEqual(seg.toString(), 'x:v=a%3Bb');
        });

        it('leaves colons and equals unencoded (unambiguous in values)', () => {
            const seg = new RouteSegment('x', new Map([['v', 'a:b=c']]));
            assert.strictEqual(seg.toString(), 'x:v=a:b=c');
        });

        it('encodes percent signs', () => {
            const seg = new RouteSegment('x', new Map([['v', '100%']]));
            assert.strictEqual(seg.toString(), 'x:v=100%25');
        });

        it('accepts a custom encoder', () => {
            const seg = new RouteSegment('search', new Map([['q', 'hello world']]));
            const strict = { encode: (v) => encodeURIComponent(v), decode: (v) => decodeURIComponent(v) };
            assert.strictEqual(seg.toString(strict), 'search:q=hello%20world');
        });
    });

    describe('tokenize', () => {
        it('parses empty path', () => {
            const result = RouteSegment.tokenize('');
            assert.deepStrictEqual(result, []);
        });

        it('parses root-only path', () => {
            const result = RouteSegment.tokenize('/');
            assert.deepStrictEqual(result, []);
        });

        it('parses single segment without properties', () => {
            const result = RouteSegment.tokenize('/dashboard');
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].key, 'dashboard');
            assert.strictEqual(result[0].get('id'), null);
        });

        it('parses single segment with properties', () => {
            const result = RouteSegment.tokenize('/dashboard:id=123;view=grid');
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].key, 'dashboard');
            assert.strictEqual(result[0].get('id'), '123');
            assert.strictEqual(result[0].get('view'), 'grid');
        });

        it('parses multiple segments', () => {
            const result = RouteSegment.tokenize('/dashboard:id=1/table:id=10/row:id=5');
            assert.strictEqual(result.length, 3);
            assert.strictEqual(result[0].key, 'dashboard');
            assert.strictEqual(result[0].get('id'), '1');
            assert.strictEqual(result[1].key, 'table');
            assert.strictEqual(result[1].get('id'), '10');
            assert.strictEqual(result[2].key, 'row');
            assert.strictEqual(result[2].get('id'), '5');
        });

        it('decodes plus signs as spaces', () => {
            const result = RouteSegment.tokenize('/search:q=hello+world');
            assert.strictEqual(result[0].get('q'), 'hello world');
        });

        it('decodes percent-encoded values (backward compat)', () => {
            const result = RouteSegment.tokenize('/search:q=hello%20world');
            assert.strictEqual(result[0].get('q'), 'hello world');
        });

        it('accepts a custom encoder for decoding', () => {
            // A trivial encoder that uses base64 for values
            const b64 = {
                encode: (v) => btoa(v),
                decode: (v) => atob(v),
            };
            const seg = new RouteSegment('x', new Map([['msg', 'hello']]));
            const serialized = seg.toString(b64);
            assert.strictEqual(serialized, 'x:msg=aGVsbG8=');
            const parsed = RouteSegment.tokenize('/' + serialized, b64);
            assert.strictEqual(parsed[0].get('msg'), 'hello');
        });

        it('roundtrips through toString and tokenize', () => {
            const original = new RouteSegment('table', new Map([['id', '42'], ['sort', 'name']]));
            const serialized = original.toString();
            const parsed = RouteSegment.tokenize('/' + serialized);
            assert.strictEqual(parsed.length, 1);
            assert.strictEqual(parsed[0].key, 'table');
            assert.strictEqual(parsed[0].get('id'), '42');
            assert.strictEqual(parsed[0].get('sort'), 'name');
        });

        it('roundtrips values with special characters', () => {
            const original = new RouteSegment('search', new Map([['q', 'a=b;c/d']]));
            const serialized = original.toString();
            const parsed = RouteSegment.tokenize('/' + serialized);
            assert.strictEqual(parsed[0].get('q'), 'a=b;c/d');
        });

        it('roundtrips values with spaces and punctuation', () => {
            const original = new RouteSegment('search', new Map([['q', 'Hello from the URL!']]));
            const serialized = original.toString();
            assert.strictEqual(serialized, 'search:q=Hello+from+the+URL!');
            const parsed = RouteSegment.tokenize('/' + serialized);
            assert.strictEqual(parsed[0].get('q'), 'Hello from the URL!');
        });

        it('roundtrips values with percent signs', () => {
            const original = new RouteSegment('x', new Map([['v', '100% done']]));
            const serialized = original.toString();
            const parsed = RouteSegment.tokenize('/' + serialized);
            assert.strictEqual(parsed[0].get('v'), '100% done');
        });

        it('roundtrips with a custom encoder', () => {
            const strict = {
                encode: (v) => encodeURIComponent(v),
                decode: (v) => decodeURIComponent(v),
            };
            const original = new RouteSegment('search', new Map([['q', 'hello world; a=b']]));
            const serialized = original.toString(strict);
            const parsed = RouteSegment.tokenize('/' + serialized, strict);
            assert.strictEqual(parsed[0].get('q'), 'hello world; a=b');
        });
    });
});

describe('RouteEncoder', () => {
    it('throws when encode() is not implemented', () => {
        const encoder = new RouteEncoder();
        assert.throws(() => encoder.encode('x'), /must be implemented/);
    });

    it('throws when decode() is not implemented', () => {
        const encoder = new RouteEncoder();
        assert.throws(() => encoder.decode('x'), /must be implemented/);
    });
});

describe('MinimalRouteEncoder', () => {
    /** @type {MinimalRouteEncoder} */
    let encoder;

    /** @returns {MinimalRouteEncoder} */
    function createEncoder() {
        return new MinimalRouteEncoder();
    }

    describe('encode', () => {
        it('leaves plain text unchanged', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.encode('hello'), 'hello');
        });

        it('encodes spaces as plus signs', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.encode('hello world'), 'hello+world');
        });

        it('leaves hash signs unchanged', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.encode('#0d6efd'), '#0d6efd');
        });

        it('leaves exclamation marks unchanged', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.encode('Hello!'), 'Hello!');
        });

        it('leaves parentheses unchanged', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.encode('foo(bar)'), 'foo(bar)');
        });

        it('encodes literal plus signs', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.encode('a+b'), 'a%2Bb');
        });

        it('encodes forward slashes', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.encode('a/b'), 'a%2Fb');
        });

        it('encodes semicolons', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.encode('a;b'), 'a%3Bb');
        });

        it('leaves colons unchanged', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.encode('a:b'), 'a:b');
        });

        it('leaves equals signs unchanged', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.encode('a=b'), 'a=b');
        });

        it('encodes percent signs', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.encode('100%'), '100%25');
        });

        it('encodes only ambiguous characters in mixed input', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.encode('a/b:c;d=e%f'), 'a%2Fb:c%3Bd=e%25f');
        });
    });

    describe('decode', () => {
        it('decodes percent-encoded sequences', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.decode('a%2Fb:c%3Bd=e%25f'), 'a/b:c;d=e%f');
        });

        it('decodes plus signs as spaces', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.decode('hello+world'), 'hello world');
        });

        it('passes through unencoded text', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.decode('hello'), 'hello');
        });

        it('decodes full percent-encoding (backward compat)', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.decode('hello%20world'), 'hello world');
        });

        it('decodes encoded plus signs', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.decode('a%2Bb'), 'a+b');
        });
    });

    describe('round-trip', () => {
        it('round-trips plain text', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.decode(encoder.encode('hello')), 'hello');
        });

        it('round-trips text with spaces', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.decode(encoder.encode('hello world')), 'hello world');
        });

        it('round-trips text with structural characters', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.decode(encoder.encode('a/b:c;d=e')), 'a/b:c;d=e');
        });

        it('round-trips text with percent signs', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.decode(encoder.encode('100% done')), '100% done');
        });

        it('round-trips text with embedded percent-sequences', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.decode(encoder.encode('already%20encoded')), 'already%20encoded');
        });

        it('round-trips text with literal plus signs', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.decode(encoder.encode('a+b c')), 'a+b c');
        });

        it('round-trips Unicode text', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.decode(encoder.encode('cafe\u0301')), 'cafe\u0301');
        });

        it('round-trips empty string', () => {
            encoder = createEncoder();
            assert.strictEqual(encoder.decode(encoder.encode('')), '');
        });
    });
});
