import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import jsBeautify from "js-beautify";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, "../src");
const htdocsDir = join(__dirname, "../htdocs");

/**
 * Code style tests - enforce consistent formatting
 *
 * This prevents accidental formatting changes from tools like oxfmt
 * that might not respect our project conventions.
 */
describe("Code Style", () => {
    function getAllFiles(dir, extension) {
        const files = [];
        if (!existsSync(dir)) return files;
        const entries = readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...getAllFiles(fullPath, extension));
            } else if (entry.name.endsWith(extension)) {
                files.push(fullPath);
            }
        }

        return files;
    }

    const sourceFiles = [
        ...getAllFiles(srcDir, ".js"),
        ...getAllFiles(htdocsDir, ".js"),
    ];

    describe("Indentation", () => {
        it("uses 4 spaces for indentation (not tabs)", () => {
            for (const file of sourceFiles) {
                const content = readFileSync(file, "utf-8");
                const lines = content.split("\n");

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    // Check if line starts with tab character
                    if (line.startsWith("\t")) {
                        assert.fail(
                            `${file}:${i + 1} uses tab indentation. Use 4 spaces instead.\nLine: ${line.substring(0, 50)}...`,
                        );
                    }
                }
            }
        });
    });

    describe("JSDoc Types", () => {
        it("does not use {*} wildcard type (use specific types instead)", () => {
            for (const file of sourceFiles) {
                const content = readFileSync(file, "utf-8");
                const lines = content.split("\n");

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    // Match {*} in JSDoc @param, @returns, @type annotations
                    if (line.match(/@(?:param|returns|type)\s+\{\*\}/)) {
                        assert.fail(
                            `${file}:${i + 1} uses {*} wildcard type. Use a specific type instead.\nLine: ${line.trim()}`,
                        );
                    }
                }
            }
        });
    });

    describe("JSDoc Descriptions", () => {
        it("requires a description for all JSDoc blocks", () => {
            for (const file of sourceFiles) {
                // Skip vendor files for this check
                if (file.includes("vendor/")) continue;

                const content = readFileSync(file, "utf-8");
                const lines = content.split("\n");

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (line === "/**") {
                        // Look at the next line
                        const nextLine = lines[i + 1]?.trim();
                        if (
                            nextLine &&
                            nextLine.startsWith("*") &&
                            nextLine.includes("@")
                        ) {
                            // If it starts directly with a tag, it's missing a description
                            // (unless it's a one-line comment which we handled via '/**')
                            assert.fail(
                                `${file}:${i + 1} JSDoc block is missing a description.\nLine: ${lines[i + 1].trim()}`,
                            );
                        }
                    }
                    if (
                        line.startsWith("/**") &&
                        line.endsWith("*/") &&
                        line.includes("@")
                    ) {
                        // Single line JSDoc like /** @type {string} */
                        assert.fail(
                            `${file}:${i + 1} JSDoc block is missing a description.\nLine: ${line}`,
                        );
                    }
                }
            }
        });
    });

    describe("String Quotes", () => {
        it("prefers single quotes for strings (informational check)", () => {
            // This is a simplified check - just flag obvious cases
            // Regexes and special cases are allowed to use double quotes

            for (const file of sourceFiles) {
                const content = readFileSync(file, "utf-8");

                // Only check for import/export statements with double quotes
                const importExportPattern = /^(import|export).*["]/gm;
                const matches = content.match(importExportPattern);

                if (matches && matches.length > 0) {
                    const lines = content.split("\n");
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].match(/^(import|export).*["]/)) {
                            assert.fail(
                                `${file}:${i + 1} uses double quotes in import/export. Use single quotes.\nLine: ${lines[i].trim()}`,
                            );
                        }
                    }
                }
            }
        });
    });

    describe("HTML Formatter Preserves Template Syntax", () => {
        const configPath = join(__dirname, "../.jsbeautifyrc");
        const config = existsSync(configPath)
            ? JSON.parse(readFileSync(configPath, "utf-8")).html
            : {};
        const beautifyHtml = jsBeautify.html;

        const templatePatterns = [
            { input: "<span>((title))</span>", expected: "((title))" },
            { input: "<p>((item.name))</p>", expected: "((item.name))" },
            {
                input: '<button onclick="((this)).click()">Go</button>',
                expected: "((this)).click()",
            },
            {
                input: '<input oninput="((this)).update(event)" />',
                expected: "((this)).update(event)",
            },
            {
                input: '<p fw-if="visible">text</p>',
                expected: 'fw-if="visible"',
            },
            {
                input: '<li fw-each="item in items">((item))</li>',
                expected: 'fw-each="item in items"',
            },
            {
                input: '<input value="((count))" />',
                expected: 'value="((count))"',
            },
            {
                input: '<div data-id="((id))">((content))</div>',
                expected: "((content))",
            },
        ];

        for (const { input, expected } of templatePatterns) {
            it(`preserves ${expected}`, () => {
                const output = beautifyHtml(input, config);
                assert.ok(
                    output.includes(expected),
                    `html-beautify stripped template syntax.\nInput:    ${input}\nOutput:   ${output}\nExpected: ${expected}`,
                );
            });
        }

        const examplesDir = join(__dirname, "../htdocs");
        it("preserves ((this)) in all htdocs HTML files", () => {
            const htmlFiles = getAllFiles(examplesDir, ".html");
            for (const file of htmlFiles) {
                const original = readFileSync(file, "utf-8");
                const formatted = beautifyHtml(original, config);
                const originalRefs = original.match(/\(\(this\)\)/g);
                const formattedRefs = formatted.match(/\(\(this\)\)/g);
                assert.strictEqual(
                    formattedRefs && formattedRefs.length,
                    originalRefs && originalRefs.length,
                    `html-beautify changed ((this)) count in ${file}`,
                );
            }
        });
    });
});
