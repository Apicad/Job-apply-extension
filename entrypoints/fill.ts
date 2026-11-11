import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { applyNativeAsync, settleNativeVerification, consumeCommand } from '../lib/hackathon/page';
import { browserEnv } from '../lib/page/layout';
export default defineUnlistedScript(async () => {
 const command = consumeCommand(); if (!command) return [];
 const written = await applyNativeAsync(document, browserEnv, command);
 return settleNativeVerification(document, browserEnv, command, written);
});
