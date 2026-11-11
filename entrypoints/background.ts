import { defineBackground } from '#imports';
import { browser } from 'wxt/browser';
import { keepStorageAwayFromPages } from '../lib/storage';
import { handle } from '../lib/hackathon/service';
import { handleSidebar, sidebarBusy, cancelForNavigation } from '../lib/sidebar/workflow';
import { record } from '../lib/hackathon/contracts';
export default defineBackground(() => {
 // Serializes all trusted mutations; persisted execution markers survive worker restart.
 let queue: Promise<unknown> = keepStorageAwayFromPages();
 browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL('/'))) return false;
  const result = queue.then(() => {
   if (record(message) && typeof message.type === 'string' && message.type.startsWith('sidebar-')) return handleSidebar(message);
   if (record(message) && typeof message.tabId === 'number' && sidebarBusy(message.tabId)) throw Error('Autofill is running in the sidebar. Stop it before using the review workspace.');
   return handle(message);
  });
  queue = result.catch(() => undefined);
  void result.then(data => sendResponse({ ok: true, data }), error => sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Operation failed.' }));
  return true;
 });
 void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
 browser.commands.onCommand.addListener((_command, tab) => { if (tab?.windowId !== undefined) void browser.sidePanel.open({ windowId: tab.windowId }); });
 browser.tabs.onUpdated.addListener((tabId, info) => { if (info.status === 'loading' || info.url) void cancelForNavigation(tabId); });
 browser.tabs.onRemoved.addListener(tabId => { void cancelForNavigation(tabId); });
});
