// Full datasets run only via verify:scale before release.
export const fullScale = process.env.IMPORT_KIT_SCALE === '1';
export const effectCount = fullScale ? 34000 : 8;
