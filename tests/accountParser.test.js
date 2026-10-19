import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseAccountLine } from '../src/utils/accountParser.js';

describe('accountParser Unit Tests', () => {
  test('should parse standard 5-part pipe format', () => {
    const line = 'user@outlook.com|pass123|token_abc|client_xyz|rec@mail.com';
    const result = parseAccountLine(line);

    assert.equal(result.email, 'user@outlook.com');
    assert.equal(result.password, 'pass123');
    assert.equal(result.refreshToken, 'token_abc');
    assert.equal(result.clientId, 'client_xyz');
    assert.equal(result.recoveryEmail, 'rec@mail.com');
  });

  test('should parse 4-part pipe format (without recovery email)', () => {
    const line = 'user@outlook.com|pass123|token_abc|client_xyz';
    const result = parseAccountLine(line);

    assert.equal(result.email, 'user@outlook.com');
    assert.equal(result.password, 'pass123');
    assert.equal(result.refreshToken, 'token_abc');
    assert.equal(result.clientId, 'client_xyz');
    assert.equal(result.recoveryEmail, null);
  });

  test('should parse 3-part pipe format (EMAIL|REFRESH_TOKEN|CLIENT_ID)', () => {
    const line = 'user@outlook.com|token_abc|client_xyz';
    const result = parseAccountLine(line);

    assert.equal(result.email, 'user@outlook.com');
    assert.equal(result.refreshToken, 'token_abc');
    assert.equal(result.clientId, 'client_xyz');
  });

  test('should trim whitespace around pipes and fields', () => {
    const line = '  user@outlook.com  |  pass123  |  token_abc  |  client_xyz  |  rec@mail.com  ';
    const result = parseAccountLine(line);

    assert.equal(result.email, 'user@outlook.com');
    assert.equal(result.password, 'pass123');
    assert.equal(result.refreshToken, 'token_abc');
    assert.equal(result.clientId, 'client_xyz');
    assert.equal(result.recoveryEmail, 'rec@mail.com');
  });

  test('should ignore empty lines and comment lines', () => {
    assert.equal(parseAccountLine(''), null);
    assert.equal(parseAccountLine('   '), null);
    assert.equal(parseAccountLine('# this is a comment'), null);
    assert.equal(parseAccountLine('// another comment'), null);
  });

  test('should throw on invalid email address', () => {
    assert.throws(() => {
      parseAccountLine('not_an_email|pass|token|client|rec');
    }, /Invalid or missing email/);
  });

  test('should throw on insufficient fields (< 3 fields)', () => {
    assert.throws(() => {
      parseAccountLine('user@outlook.com|token_only');
    }, /Invalid format/);
  });
});
