import { defineBackground } from '#imports';
import { browser } from 'wxt/browser';
import { keepStorageAwayFromPages } from '../lib/storage';
import { handle } from '../lib/hackathon/service';
export default defineBackground(() => {
 // Serializes all trusted mutations; persisted execution markers survive worker restart.
 let queue: Promise<unknown> = keepStorageAwayFromPages();
 browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL('/'))) return false;
  const result = queue.then(() => handle(message));
  queue = result.catch(() => undefined);
  void result.then(data => sendResponse({ ok: true, data }), error => sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Operation failed.' }));
  return true;
 });
 browser.commands.onCommand.addListener(() => { void browser.action.openPopup(); });
});
