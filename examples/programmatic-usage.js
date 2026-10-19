/**
 * Example: Using OutlookOtpService programmatically in your own Node.js application
 */

import { OutlookOtpService, parseAccountLine } from '../src/index.js';

async function main() {
  const service = new OutlookOtpService();

  // 1. Single Account via raw pipe-delimited string
  const rawInput =
    'malichipuwallianna@outlook.com|M53vACKKkr70|M.C530_BAY.0.U.MsaArtifacts.-CsbmwqHTMDktRR7bZYEE5J6Z5lUEkQtytxX8XSfPiC7hHtAgMc6CNMXzyuBbvrHohBg6wDmADO39FDUs*fHDPh3pD1TJiPhxxJ*ossl46w2qOz95kJ2iXXR0CYoviKrNayfGWKr6ANcLzjlQZ4hYl4ZPHFjBPCPthwD74MiavlfqDMWdl2P7q9ZRRcSkCkwKZwMwOtHOvhYXm6kVic7ICKY7o6ucorVquMS!iIWRxAbs757ULDsZdLIZy2lRqldn8W7LxcnCTAQpgaITWgRlqWnWfS7FElmR5vUv2g00ehk9uUmaAiiE8NZk7IS5jQEDhjOYrFZIZt52GLXG8AP*I!JmwM*UiJqnl5HlL1ZOuV4NGukpgtcflcPwdxgeVUGb6kDtyTq*6oaZUFrEE1raIV5igVv3lVg0wwaPj9gLMF1lSHcKuso!P1Dhl0xXmIPrp0Hb7oTI!ooHB3U*b8h2IVo$|9e5f94bc-e8a4-4e73-b8be-63364c29d753|malichipuwallianna0k2@fviainboxes.com';

  console.log('--- 1. Single Account Extraction ---');
  const result = await service.getOtpForAccount(rawInput, { top: 1 });
  console.log('Result:', JSON.stringify(result, null, 2));

  // 2. Batch Processing from parsed array
  console.log('\n--- 2. Batch Processing with Concurrency ---');
  const accountList = [
    parseAccountLine(rawInput)
    // Add more accounts here...
  ];

  const batchResults = await service.processAccounts(accountList, {
    concurrency: 2,
    top: 1
  });

  console.log(`Processed ${batchResults.length} accounts.`);
}

main().catch(console.error);
