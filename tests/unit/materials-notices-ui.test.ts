import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { MaterialsPanel, type MaterialsController } from '../../entrypoints/home/materials';
import { ResumePreview } from '../../entrypoints/home/resume-preview';
import { emptyProfile } from '../../lib/profile';
import { defaultResumeLayout } from '../../lib/resume-preview';
import { buildMaterialsRequest, emptyMaterialsBrief, materialsReviewNotices, reviewMaterialsReply } from '../../lib/materials';

it('shows each missing fact once, links the preview to review notes, and retains the export review gate', async () => {
  const profile = emptyProfile(); const layout = defaultResumeLayout();
  const facts = [{ id: 'role', revision: 1, location: 'Example Labs', text: 'Example Labs | Engineering intern\nBuilt a Python prototype.' }];
  const brief = { ...emptyMaterialsBrief(), role: 'Engineer', careerDirection: 'Build software.', jobDescription: 'Build tools.' };
  const request = await buildMaterialsRequest(profile, facts, layout, brief);
  const response = reviewMaterialsReply(request, { schema: 1, kind: 'materials', requestId: request.id, sourceKey: request.sourceKey, expiresAt: request.expiresAt,
    summary: [], entries: [], coverLetter: [{ text: 'I built a Rust prototype.', sources: [{ id: 'role', revision: 1 }] }], missing: ['Graduation date is unconfirmed.', 'Graduation date is unconfirmed.'] });
  const model = { brief, draft: { schema: 1, revision: 1, request, response, reviewedFingerprint: null }, reviewNotices: materialsReviewNotices(request, response),
    view: 'resume', canExport: false, reviewChecked: false, generating: false, saving: false, stale: false, conflict: false, dirty: false,
    error: '', message: '', setBrief() {}, setView() {}, generate() {}, cancel() {}, edit() {}, review() {}, save() {}, reload() {},
  } as unknown as MaterialsController;
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(MaterialsPanel, { model, profileDirty: false, disabled: false }),
    React.createElement(ResumePreview, { profile, facts, layout, onChange() {}, dirty: false, disabled: false, materials: model }),
  ));
  const page = new DOMParser().parseFromString(html, 'text/html');
  const missingText = 'Graduation date is unconfirmed.';
  const warningText = 'Technology or credential absent from cited evidence: Rust';
  expect(page.body.textContent!.split(missingText)).toHaveLength(2);
  expect(page.body.textContent!.split(warningText)).toHaveLength(2);
  expect(page.querySelector('.resume-preview a[href="#materials-review"]')?.textContent).toBe('Review 2 document notes');
  expect(page.querySelectorAll('.resume-preview .preview-warning')).toHaveLength(0);
  const download = [...page.querySelectorAll('button')].find(button => button.textContent === 'Download Word');
  expect(download?.disabled).toBe(true);
  expect(page.querySelector<HTMLInputElement>('.materials-reviewed input')?.checked).toBe(false);
});
