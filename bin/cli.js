#!/usr/bin/env node

/**
 * CLI executable for Silent Microsoft Outlook OAuth2 OTP Retrieval Service
 */

import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import { OutlookOtpService, logger, parseAccountLine } from '../src/index.js';

const program = new Command();

program
  .name('outlook-otp')
  .description('Retrieve OTP verification codes from Outlook/Hotmail accounts via Microsoft Graph API')
  .version('1.0.0')
  .option('-f, --file <path>', 'Path to file containing pipe-delimited account credentials')
  .option('-i, --input <string>', 'Raw single account credential string (EMAIL|PASSWORD|REFRESH_TOKEN|CLIENT_ID|RECOVERY_EMAIL)')
  .option('-o, --output <path>', 'Output file path (.json or .csv)')
  .option('-c, --concurrency <number>', 'Number of accounts to process concurrently', '5')
  .option('-w, --wait <seconds>', 'Wait/poll for incoming OTP up to N seconds (default: 0 for instant check)', '0')
  .option('--interval <seconds>', 'Polling interval in seconds when waiting', '3')
  .option('--top <number>', 'Number of latest emails to inspect', '1')
  .option('--folder <name>', 'Mailbox folder to check', 'inbox')
  .option('--ui, --gui', 'Launch the interactive Web GUI interface in browser')
  .option('--port <number>', 'Port for Web GUI (default: 3000)', '3000')
  .option('--json', 'Output strictly JSON to stdout (suppresses logs and banners)')
  .option('-v, --verbose', 'Enable verbose debug logging')
  .action(async (options) => {
    try {
      if (options.ui || options.gui) {
        process.env.PORT = options.port || '3000';
        logger.banner();
        logger.info(`Starting Outlook OTP Web GUI on http://localhost:${process.env.PORT}...`);
        await import('../server.js');
        return;
      }

      if (options.json) {
        logger.setSilent(true);
      }
      if (options.verbose) {
        logger.setVerbose(true);
      }

      logger.banner();

      const service = new OutlookOtpService();
      const waitSeconds = parseInt(options.wait, 10) || 0;
      const pollIntervalMs = (parseInt(options.interval, 10) || 3) * 1000;
      const concurrency = parseInt(options.concurrency, 10) || 5;
      const top = parseInt(options.top, 10) || 1;
      const folder = options.folder || 'inbox';

      let results = [];

      if (options.input) {
        // Single Account Mode
        const account = parseAccountLine(options.input);
        if (!account) {
          logger.error('Provided input string was empty or invalid.');
          process.exit(1);
        }

        logger.info(`Processing single account: ${account.email}`);

        let res;
        if (waitSeconds > 0) {
          res = await service.waitForOtp(account, {
            waitTimeoutMs: waitSeconds * 1000,
            pollIntervalMs,
            top,
            folder
          });
        } else {
          res = await service.getOtpForAccount(account, { top, folder });
          if (res.success && res.otp) {
            logger.otp(res.email, res.otp, res);
          } else {
            logger.warn(`[${res.email}] ${res.error || 'No OTP retrieved'}`);
          }
        }

        results = [res];
      } else if (options.file) {
        // File Batch Mode
        const filePath = path.resolve(process.cwd(), options.file);
        if (!fs.existsSync(filePath)) {
          logger.error(`File does not exist: ${filePath}`);
          process.exit(1);
        }

        if (waitSeconds > 0) {
          logger.info(`Running in Poll/Wait mode for accounts in ${options.file}...`);
        }

        const batchRes = await service.processFile(filePath, {
          concurrency,
          top,
          folder
        });
        results = batchRes.results;
      } else {
        // Fallback: check if accounts.txt exists in current directory
        const defaultFile = path.resolve(process.cwd(), 'accounts.txt');
        if (fs.existsSync(defaultFile)) {
          logger.info(`No --file or --input specified. Using local accounts.txt...`);
          const batchRes = await service.processFile(defaultFile, {
            concurrency,
            top,
            folder
          });
          results = batchRes.results;
        } else {
          logger.error('No input provided. Please specify --input "EMAIL|..." or --file accounts.txt');
          program.help();
          process.exit(1);
        }
      }

      // Output formatting
      if (options.json) {
        // Pure JSON to stdout
        console.log(JSON.stringify(results, null, 2));
      } else {
        logger.table(results);
      }

      // Save to file if --output requested
      if (options.output) {
        const outPath = path.resolve(process.cwd(), options.output);
        saveOutputFile(outPath, results);
        logger.success(`Results successfully exported to: ${outPath}`);
      }

      const hasFailures = results.some((r) => !r.success || !r.otp);
      process.exit(hasFailures && results.length === 1 ? 1 : 0);
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ error: err.message }));
      } else {
        logger.error(`Execution error: ${err.message}`);
        if (options.verbose && err.stack) {
          console.error(err.stack);
        }
      }
      process.exit(1);
    }
  });

/**
 * Saves results to JSON or CSV based on file extension
 */
function saveOutputFile(filePath, results) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.csv') {
    const headers = ['Email', 'Status', 'OTP', 'Confidence', 'Subject', 'Sender', 'ReceivedAt', 'Error'];
    const escapeCsv = (val) => `"${String(val || '').replace(/"/g, '""')}"`;

    const rows = results.map((r) => [
      escapeCsv(r.email),
      escapeCsv(r.success ? 'SUCCESS' : 'FAILED'),
      escapeCsv(r.otp || ''),
      escapeCsv(r.confidence || ''),
      escapeCsv(r.subject || ''),
      escapeCsv(r.sender || ''),
      escapeCsv(r.receivedAt || ''),
      escapeCsv(r.error || '')
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    fs.writeFileSync(filePath, csvContent, 'utf-8');
  } else {
    // Default to JSON
    fs.writeFileSync(filePath, JSON.stringify(results, null, 2), 'utf-8');
  }
}

program.parse(process.argv);
