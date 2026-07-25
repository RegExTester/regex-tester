// Loads the canonical OpenAPI document and compiles ajv (2020-12 dialect)
// validators for its component schemas. Every response assertion in the
// suite MUST go through `validate()` here rather than a hand-written schema,
// so a change to the canonical spec automatically tightens the tests.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// tests/contract/src/schema.js -> repo root -> docs/open-api/...
const SPEC_PATH = path.resolve(__dirname, '../../../docs/open-api/regex-tester-api.v1.yaml');

const spec = yaml.load(fs.readFileSync(SPEC_PATH, 'utf8'));

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(spec, 'openapi.yaml');

const validators = new Map();

function getValidator(schemaName) {
  let validateFn = validators.get(schemaName);
  if (!validateFn) {
    validateFn = ajv.compile({ $ref: `openapi.yaml#/components/schemas/${schemaName}` });
    validators.set(schemaName, validateFn);
  }
  return validateFn;
}

/**
 * Validate `payload` against the named schema from the canonical OpenAPI
 * document (e.g. "RegexResult", "VersionResult", "Capabilities",
 * "ProblemDetails").
 *
 * @returns {{ valid: boolean, errors: import('ajv').ErrorObject[] | null }}
 */
export function validate(schemaName, payload) {
  const validateFn = getValidator(schemaName);
  const valid = validateFn(payload);
  return { valid, errors: valid ? null : validateFn.errors };
}

/** The full, dereferenceable canonical OpenAPI document as a plain object. */
export function getSpec() {
  return spec;
}
