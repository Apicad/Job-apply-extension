import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { scanNative } from '../lib/hackathon/page';
import { browserEnv } from '../lib/page/layout';
export default defineUnlistedScript(() => scanNative(document, browserEnv));
