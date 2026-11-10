import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import type { NativePlan } from '../../lib/hackathon/engine';
import './style.css';
function App() {
 const [tabId, setTab] = useState<number>(); const [plan, setPlan] = useState<NativePlan>(); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
 useEffect(() => { const requested = new URLSearchParams(location.search).get('tabId'); if (requested) setTab(Number(requested)); else void browser.tabs.query({ active: true, currentWindow: true }).then(tabs => setTab(tabs[0]?.id)); }, []);
 async function run(type: string) { setBusy(true); try { const response = await browser.runtime.sendMessage({ type, tabId, planId: plan?.id }); if (!response.ok) throw Error(response.error); if (type === 'demo') setNotice('Synthetic profile loaded.'); else { setPlan(response.data); setNotice(type === 'fill' ? 'Fill finished. Review the results. Submission is manual.' : 'Preview ready. Nothing has been written.'); } } catch (e) { setNotice(String(e)); } finally { setBusy(false); } }
 return <main><header><small>HACKERSQUAD · SYNTHETIC DEMO</small><h1>Job Apply Assistant</h1><p>You review. You submit.</p></header><button disabled={busy} onClick={() => void run('demo')}>Load synthetic applicant</button><button disabled={busy || tabId === undefined} onClick={() => void run('scan')}>Scan application</button><p role="status">{notice}</p>{plan && <section><h2>Fill preview</h2><p>{plan.url}</p>{plan.rows.map(r => <article key={`${r.documentId}:${r.field.ref}`}><strong>{r.field.descriptor.label || r.field.descriptor.name}</strong><p>{r.action ? 'value' in r.action ? r.action.value : r.field.descriptor.options[r.action.index]?.label : r.status}</p>{plan.state === 'finished' && r.action && <b>{plan.outcomes?.find(o => o.documentId === r.documentId && o.ref === r.field.ref)?.ok ? 'Verified write' : 'Not verified / left manual'}</b>}</article>)}<button disabled={busy || plan.state !== 'preview' || !plan.rows.some(r => r.action)} onClick={() => void run('fill')}>Fill previewed fields</button></section>}</main>;
}
createRoot(document.getElementById('root')!).render(<App />);
