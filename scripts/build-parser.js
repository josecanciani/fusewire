import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jisonFile = join(__dirname, '../src/parser/fusewire-expr.jison');
const outFile = join(__dirname, '../src/parser/fusewire-expr.js');

console.log('Building Jison parser...');
execSync(`npx jison ${jisonFile} -o ${outFile} -m js`, { stdio: 'inherit' });

// The generated file defines a global/local `parser` variable.
// We need to append `export default parser;` to make it a standard ES module.
let code = readFileSync(outFile, 'utf8');
code = '// @ts-nocheck\n/* eslint-disable */\n/* oxlint-disable */\n' + code + '\nexport default fusewireExpr;\n';
writeFileSync(outFile, code);

console.log('Parser built and exported as ES module!');
