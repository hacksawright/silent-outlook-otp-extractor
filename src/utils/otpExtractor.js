/**
 * Advanced OTP and Verification Code Extractor Engine
 * Combines contextual heuristics, HTML highlight detection, and regex patterns
 * to accurately extract 4-to-8 digit codes without false positives.
 */

import { OTP_PATTERNS, OTP_CONTEXT_KEYWORDS } from '../config/constants.js';
import { cleanHtml } from './htmlCleaner.js';

/**
 * Extracts OTP verification code from email subject and body content.
 *
 * @param {Object} options
 * @param {string} [options.subject=''] - Email subject line
 * @param {string} [options.body=''] - Email body content (HTML or plain text)
 * @param {string} [options.contentType='html'] - 'html' or 'text'
 * @returns {Object} Extraction result with confidence rating and metadata
 */
export function extractOtp({ subject = '', body = '', contentType = 'html' } = {}) {
  const safeSubject = subject || '';
  const rawBody = body || '';
  const cleanBody = contentType === 'html' ? cleanHtml(rawBody) : rawBody;

  // 1. Check Subject for Prefixed Codes (e.g., G-123456, M-123456)
  const subjPrefixedMatch = safeSubject.match(OTP_PATTERNS.PREFIXED_CODE);
  if (subjPrefixedMatch) {
    return {
      success: true,
      otp: subjPrefixedMatch[1],
      confidence: 'HIGH',
      matchedPattern: 'prefixed_subject',
      source: 'subject',
      allCandidates: [subjPrefixedMatch[1]],
      contextSnippet: safeSubject
    };
  }

  // 2. Check Subject for Contextual OTP (e.g., "Your code is 123456" or "123456 is your code")
  const subjContextMatch = safeSubject.match(OTP_PATTERNS.CONTEXTUAL_CODE);
  if (subjContextMatch) {
    const code = subjContextMatch[1];
    const codeIndex = subjContextMatch.index + subjContextMatch[0].lastIndexOf(code);
    if (!isFalsePositive(code, safeSubject, codeIndex, true)) {
      return {
        success: true,
        otp: code,
        confidence: 'HIGH',
        matchedPattern: 'contextual_subject',
        source: 'subject',
        allCandidates: [code],
        contextSnippet: safeSubject
      };
    }
  }

  // Subject pattern: "123456 is your verification code..."
  const leadingSubjectCode = safeSubject.match(/^\s*([0-9]{4,8})\s+(?:is\s+your|to\s+verify|verification|code|confirmation)/i);
  if (leadingSubjectCode) {
    const code = leadingSubjectCode[1];
    return {
      success: true,
      otp: code,
      confidence: 'HIGH',
      matchedPattern: 'leading_subject_code',
      source: 'subject',
      allCandidates: [code],
      contextSnippet: safeSubject
    };
  }

  // 3. Check for HTML Highlighted Tags (<strong>123456</strong>, <h1>654321</h1>, etc.)
  if (contentType === 'html' && rawBody) {
    const highlightMatches = [...rawBody.matchAll(new RegExp(OTP_PATTERNS.HTML_HIGHLIGHTED, 'gi'))];
    for (const match of highlightMatches) {
      const code = match[1];
      const codeIndex = match.index + match[0].lastIndexOf(code);
      if (isValidOtpCandidate(code) && !isFalsePositive(code, rawBody, codeIndex, true)) {
        return {
          success: true,
          otp: code,
          confidence: 'HIGH',
          matchedPattern: 'html_highlight',
          source: 'html_highlight',
          allCandidates: [code],
          contextSnippet: match[0]
        };
      }
    }
  }

  // 4. Check for Prefixed Codes in Body (e.g., G-123456, M-123456)
  const bodyPrefixedMatch = cleanBody.match(OTP_PATTERNS.PREFIXED_CODE);
  if (bodyPrefixedMatch) {
    return {
      success: true,
      otp: bodyPrefixedMatch[1],
      confidence: 'HIGH',
      matchedPattern: 'prefixed_body',
      source: 'body',
      allCandidates: [bodyPrefixedMatch[1]],
      contextSnippet: getSurroundingSnippet(cleanBody, bodyPrefixedMatch.index)
    };
  }

  // 5. Check for Contextual Phrase in Cleaned Body ("code is 123456", "one-time passcode: 4920")
  const bodyContextMatch = cleanBody.match(OTP_PATTERNS.CONTEXTUAL_CODE);
  if (bodyContextMatch) {
    const code = bodyContextMatch[1];
    const codeIndex = bodyContextMatch.index + bodyContextMatch[0].lastIndexOf(code);
    if (isValidOtpCandidate(code) && !isFalsePositive(code, cleanBody, codeIndex, true)) {
      return {
        success: true,
        otp: code,
        confidence: 'HIGH',
        matchedPattern: 'contextual_body',
        source: 'body',
        allCandidates: [code],
        contextSnippet: getSurroundingSnippet(cleanBody, codeIndex)
      };
    }
  }

  // 6. Generic Digit Scanner with Heuristic Scoring
  const combinedText = `${safeSubject}\n${cleanBody}`;
  const genericMatches = [...combinedText.matchAll(OTP_PATTERNS.GENERIC_DIGITS)].map((m) => ({
    code: m[1],
    index: m.index
  }));

  const candidateScores = [];

  for (const match of genericMatches) {
    const code = match.code;
    if (!isValidOtpCandidate(code)) continue;
    if (isFalsePositive(code, combinedText, match.index, false)) continue;

    // Window around the number: +-60 characters
    const start = Math.max(0, match.index - 60);
    const end = Math.min(combinedText.length, match.index + code.length + 60);
    const windowText = combinedText.substring(start, end).toLowerCase();

    let score = 0;

    // Direct OTP action phrases (weight +4)
    const strongPhrases = [
      'verification code',
      'security code',
      'confirm your',
      'one-time',
      'passcode',
      'enter the code',
      'use this code',
      'your code is',
      'otp'
    ];
    for (const phrase of strongPhrases) {
      if (windowText.includes(phrase)) score += 4;
    }

    // General context keywords (weight +1)
    for (const kw of OTP_CONTEXT_KEYWORDS) {
      if (windowText.includes(kw)) score += 1;
    }

    if (score >= 4) {
      candidateScores.push({
        code,
        score,
        snippet: getSurroundingSnippet(combinedText, match.index)
      });
    }
  }

  if (candidateScores.length > 0) {
    candidateScores.sort((a, b) => b.score - a.score);
    const best = candidateScores[0];
    const uniqueCandidates = [...new Set(candidateScores.map((c) => c.code))];

    return {
      success: true,
      otp: best.code,
      confidence: best.score >= 5 ? 'HIGH' : 'MEDIUM',
      matchedPattern: 'scored_context',
      source: 'body_scored',
      allCandidates: uniqueCandidates,
      contextSnippet: best.snippet
    };
  }

  // No legitimate OTP found
  return {
    success: false,
    otp: null,
    confidence: 'NONE',
    matchedPattern: 'none',
    source: null,
    allCandidates: [],
    contextSnippet: null
  };
}

/**
 * Validates if a number string is a plausible OTP
 * @param {string} code
 * @returns {boolean}
 */
function isValidOtpCandidate(code) {
  if (!code) return false;
  const digitsOnly = code.replace(/\D/g, '');
  if (digitsOnly.length < 4 || digitsOnly.length > 8) return false;

  // Filter out repeated single digits (e.g. 000000, 111111)
  if (/^(\d)\1+$/.test(digitsOnly) && digitsOnly.length > 4) {
    return false;
  }

  return true;
}

/**
 * Checks for known false positive patterns:
 * - Part of a date: e.g. 10/8/2026, 2026-10-08, 2026/10/08
 * - Part of an IP address: e.g. 13.140.177.110
 * - Part of a postal code address: e.g. "Redmond, WA 98052"
 * - Standalone year (1950-2040)
 *
 * @param {string} code
 * @param {string} fullText
 * @param {number} index
 * @param {boolean} hasDirectOtpContext - True if found immediately following an OTP keyword
 * @returns {boolean}
 */
function isFalsePositive(code, fullText, index, hasDirectOtpContext = false) {
  if (index == null || !fullText) return false;

  const charBefore = fullText[index - 1] || ' ';
  const charAfter = fullText[index + code.length] || ' ';

  // 1. Attached to slashes (dates: 10/8/2026)
  if (charBefore === '/' || charAfter === '/') {
    return true;
  }

  // 2. Attached to dots with digits (IP addresses or decimals like 13.140.177.110)
  if (charBefore === '.' && /\d/.test(fullText[index - 2] || '')) {
    return true;
  }
  if (charAfter === '.' && /\d/.test(fullText[index + code.length + 1] || '')) {
    return true;
  }

  // 3. Surrounded by hyphens (e.g. UUID part)
  if (charBefore === '-' && charAfter === '-') {
    return true;
  }

  // If directly preceded by an explicit OTP context ("verification code is: 123456"), we trust it!
  if (hasDirectOtpContext) {
    return false;
  }

  // 4. Date context in window
  const localWindow = fullText.substring(Math.max(0, index - 25), Math.min(fullText.length, index + code.length + 25));
  if (/\b(?:date|time|gmt|utc|am|pm)\b/i.test(localWindow) && /[\/:]/.test(localWindow)) {
    return true;
  }

  // 5. Postal/Zip code patterns (e.g., "WA 98052", "Redmond, WA 98052")
  if (/\b(?:[A-Z]{2}|zip|postal|suite|apt|box)\s+[0-9]{5}\b/i.test(localWindow)) {
    return true;
  }

  // 6. Standalone year check (1950 - 2040)
  const num = parseInt(code, 10);
  if (code.length === 4 && num >= 1950 && num <= 2040) {
    return true;
  }

  return false;
}

/**
 * Extracts a +-50 char window around an index for context snippet
 * @param {string} text
 * @param {number} index
 * @returns {string}
 */
function getSurroundingSnippet(text, index) {
  if (!text || index == null) return '';
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + 80);
  return text.substring(start, end).replace(/\s+/g, ' ').trim();
}
