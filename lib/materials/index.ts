export type { MaterialsBrief, MaterialsEntry, MaterialsRequest, MaterialsReplyWire, MaterialsReply, MaterialsSegment, MaterialsSource } from './types';
export { MATERIALS_LIFETIME_MS, MAX_MATERIALS_REPLY, emptyMaterialsBrief, normalizeMaterialsBrief, isMaterialsBrief, isMaterialsRequest, materialsSourceKey, buildMaterialsRequest, promptForMaterials } from './request';
export { parseMaterialsReply, isMaterialsReply, reviewMaterialsReply, materialsReviewNotices, materialResumeDocument } from './reply';
export { createCoverLetterDocx } from './cover-docx';
