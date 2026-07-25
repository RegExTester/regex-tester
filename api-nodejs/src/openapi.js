import { readFileSync, globSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

const definition = {
  openapi: '3.1.1',
  info: {
    title: 'RegEx Tester API',
    description:
      'REST API for testing JavaScript regular expressions. Accepts a pattern, input text, and option flags; returns all matches with their groups and captures. Supports URL-based sharing via Base64Url-encoded query parameters.',
    contact: {
      name: 'RegEx Tester',
      url: 'https://regextester.github.io/',
    },
    version: 'v1',
  },
};

/**
 * Extract @openapi YAML blocks from JSDoc comments in a file.
 */
function extractOpenApiBlocks(content) {
  const blocks = [];
  const regex = /\/\*\*[\s\S]*?\*\//g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const comment = match[0];
    const markerIndex = comment.indexOf('@openapi');
    if (markerIndex === -1) continue;

    const afterMarker = comment
      .slice(markerIndex + '@openapi'.length, comment.lastIndexOf('*/'))
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, ''))
      .join('\n');

    blocks.push(afterMarker);
  }
  return blocks;
}

/**
 * Deep-merge source into target (objects are merged recursively).
 */
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (
      source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
      target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
    ) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// Collect all source files
const apiFiles = [
  ...globSync('controllers/*.js', { cwd: __dirname }).map(f => resolve(__dirname, f)),
  resolve(__dirname, 'schemas.js'),
];

// Parse all @openapi blocks and merge into the definition
const doc = { ...definition, paths: {} };
for (const filePath of apiFiles) {
  const content = readFileSync(filePath, 'utf-8');
  for (const yamlBlock of extractOpenApiBlocks(content)) {
    const parsed = yaml.load(yamlBlock);
    if (parsed && typeof parsed === 'object') {
      // Controller blocks author bare path keys (e.g. `/api/version:`) rather than nesting
      // under `paths:`; fold those into `doc.paths` so the generated document is valid OpenAPI.
      const normalized = {};
      for (const key of Object.keys(parsed)) {
        if (key.startsWith('/')) {
          normalized.paths = normalized.paths || {};
          normalized.paths[key] = parsed[key];
        } else {
          normalized[key] = parsed[key];
        }
      }
      deepMerge(doc, normalized);
    }
  }
}

export const openApiDocument = doc;
