/**
 * Professional terminal logger and formatter for CLI and services
 */

import pc from 'picocolors';

class Logger {
  constructor() {
    this.silent = false;
    this.verbose = false;
  }

  setSilent(val) {
    this.silent = Boolean(val);
  }

  setVerbose(val) {
    this.verbose = Boolean(val);
  }

  timestamp() {
    return pc.gray(new Date().toLocaleTimeString());
  }

  info(msg, ...args) {
    if (this.silent) return;
    console.log(`${this.timestamp()} ${pc.blue('ℹ')} ${msg}`, ...args);
  }

  success(msg, ...args) {
    if (this.silent) return;
    console.log(`${this.timestamp()} ${pc.green('✔')} ${pc.green(msg)}`, ...args);
  }

  warn(msg, ...args) {
    if (this.silent) return;
    console.warn(`${this.timestamp()} ${pc.yellow('⚠')} ${pc.yellow(msg)}`, ...args);
  }

  error(msg, ...args) {
    if (this.silent) return;
    console.error(`${this.timestamp()} ${pc.red('✖')} ${pc.red(msg)}`, ...args);
  }

  debug(msg, ...args) {
    if (this.silent || !this.verbose) return;
    console.log(`${this.timestamp()} ${pc.magenta('⚙ [DEBUG]')} ${pc.gray(msg)}`, ...args);
  }

  otp(email, code, details = {}) {
    if (this.silent) return;
    const codeTag = pc.bgGreen(pc.black(pc.bold(` ${code} `)));
    const emailTag = pc.cyan(email);
    const confTag = details.confidence === 'HIGH' ? pc.green('[HIGH]') : pc.yellow(`[${details.confidence || 'MED'}]`);
    console.log(
      `${this.timestamp()} ${pc.bold('🔥 OTP FOUND:')} ${codeTag} for ${emailTag} ${confTag}`
    );
    if (details.subject) {
      console.log(`   ${pc.gray('└─ Subject:')} ${details.subject}`);
    }
  }

  banner() {
    if (this.silent) return;
    console.log(
      pc.cyan(`
╔═══════════════════════════════════════════════════════════════════════╗
║           SILENT OUTLOOK OAUTH2 OTP RETRIEVAL SERVICE                 ║
║   Direct Microsoft Azure OAuth2 + Graph API — Zero Browser Overhead   ║
╚═══════════════════════════════════════════════════════════════════════╝
`)
    );
  }

  table(rows) {
    if (this.silent || !rows || rows.length === 0) return;

    console.log('\n' + pc.bold(pc.white('SUMMARY RESULTS:')));
    console.log('─'.repeat(85));
    console.log(
      `${pc.bold('Status'.padEnd(10))} | ${pc.bold('Email'.padEnd(32))} | ${pc.bold('OTP'.padEnd(10))} | ${pc.bold('Subject'.padEnd(25))}`
    );
    console.log('─'.repeat(85));

    for (const r of rows) {
      const statusStr = r.success ? pc.green('SUCCESS'.padEnd(10)) : pc.red('FAILED'.padEnd(10));
      const emailStr = (r.email || 'unknown').slice(0, 32).padEnd(32);
      const otpStr = r.otp ? pc.bold(pc.green(r.otp.padEnd(10))) : pc.gray('NONE'.padEnd(10));
      const subjStr = (r.subject || r.error || '').slice(0, 25).padEnd(25);

      console.log(`${statusStr} | ${emailStr} | ${otpStr} | ${subjStr}`);
    }
    console.log('─'.repeat(85) + '\n');
  }
}

export const logger = new Logger();
