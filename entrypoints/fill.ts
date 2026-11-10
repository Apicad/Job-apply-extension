import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { applyNative, verifyNative, consumeCommand } from '../lib/hackathon/page';
import { browserEnv } from '../lib/page/layout';
export default defineUnlistedScript(async () => {
 const command = consumeCommand(); if (!command) return [];
 const written = applyNative(document, browserEnv, command);
 // Read back after React and immediate page handlers have settled. Never retry a write.
 await new Promise(resolve => setTimeout(resolve, 100));
 const verified = verifyNative(document, browserEnv, command);
 return written.map(o => { const ok = o.ok && verified.some(v => v.ref === o.ref && v.ok); return { ...o, ok, status: o.status === 'refused' ? 'refused' : ok ? 'verified' : 'written-unverified' }; });
});
