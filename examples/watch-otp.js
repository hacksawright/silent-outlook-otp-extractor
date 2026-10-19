/**
 * Example: Waiting / Polling for an OTP email that is expected to arrive
 * Useful when an automated script triggers an OTP on an external website
 * and waits up to 60 seconds for the code to arrive in the Outlook inbox.
 */

import { OutlookOtpService, parseAccountLine } from '../src/index.js';

async function main() {
  const service = new OutlookOtpService();

  const rawInput =
    'malichipuwallianna@outlook.com|M53vACKKkr70|M.C530_BAY.0.U.MsaArtifacts.-CsbmwqHTMDktRR7bZYEE5J6Z5lUEkQtytxX8XSfPiC7hHtAgMc6CNMXzyuBbvrHohBg6wDmADO39FDUs*fHDPh3pD1TJiPhxxJ*ossl46w2qOz95kJ2iXXR0CYoviKrNayfGWKr6ANcLzjlQZ4hYl4ZPHFjBPCPthwD74MiavlfqDMWdl2P7q9ZRRcSkCkwKZwMwOtHOvhYXm6kVic7ICKY7o6ucorVquMS!iIWRxAbs757ULDsZdLIZy2lRqldn8W7LxcnCTAQpgaITWgRlqWnWfS7FElmR5vUv2g00ehk9uUmaAiiE8NZk7IS5jQEDhjOYrFZIZt52GLXG8AP*I!JmwM*UiJqnl5HlL1ZOuV4NGukpgtcflcPwdxgeVUGb6kDtyTq*6oaZUFrEE1raIV5igVv3lVg0wwaPj9gLMF1lSHcKuso!P1Dhl0xXmIPrp0Hb7oTI!ooHB3U*b8h2IVo$|9e5f94bc-e8a4-4e73-b8be-63364c29d753|malichipuwallianna0k2@fviainboxes.com';

  const account = parseAccountLine(rawInput);

  console.log(`Waiting for new OTP to arrive for ${account.email}...`);

  const result = await service.waitForOtp(account, {
    waitTimeoutMs: 15000, // Wait up to 15 seconds in this demo
    pollIntervalMs: 3000, // Poll every 3 seconds
    top: 1
  });

  if (result.success && result.otp) {
    console.log(`\nSUCCESS! OTP: ${result.otp}`);
    console.log(`Subject: ${result.subject}`);
    console.log(`Sender: ${result.sender}`);
  } else {
    console.log(`\nStatus: ${result.error || 'No OTP arrived'}`);
  }
}

main().catch(console.error);
