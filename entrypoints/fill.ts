import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { applyNative, consumeCommand } from '../lib/hackathon/page';
import { browserEnv } from '../lib/page/layout';
export default defineUnlistedScript(() => { const command = consumeCommand(); return command ? applyNative(document, browserEnv, command) : []; });
