import { defineBackground } from '#imports';

// The background service worker. Chrome starts it when an event arrives and
// shuts it down when idle, so nothing here may rely on in-memory state.
export default defineBackground(() => {});
