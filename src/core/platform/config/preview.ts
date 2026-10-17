import { OWNER_SIGNIN_PATH } from "../../features/session/paths";

/** RER supplies this declared path only to a preview's app Worker. */
export const isPreviewWorker = (env: { RER_PREVIEW_OWNER_SIGNIN?: string }): boolean =>
  env.RER_PREVIEW_OWNER_SIGNIN === OWNER_SIGNIN_PATH;
