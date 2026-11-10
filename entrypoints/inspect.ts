import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { inspectNative, consumeCommand } from '../lib/hackathon/page';
import { browserEnv } from '../lib/page/layout';
export default defineUnlistedScript(() => { const command = consumeCommand(); return command ? inspectNative(document, browserEnv, command) : false; });
