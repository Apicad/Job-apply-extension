export type { MaterialsBrief, MaterialsEntry, MaterialsRequest, MaterialsReplyWire, MaterialsReply } from './types';
export { MATERIALS_LIFETIME_MS, MAX_MATERIALS_REPLY, emptyMaterialsBrief, normalizeMaterialsBrief, isMaterialsBrief, isMaterialsRequest, materialsSourceKey, buildMaterialsRequest, promptForMaterials } from './request';
export { parseMaterialsReply, isMaterialsReply, reviewMaterialsReply, materialResumeDocument } from './reply';
export { createCoverLetterDocx } from './cover-docx';
