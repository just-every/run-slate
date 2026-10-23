import type {D1PlanCodec,ImportPlan,Json} from '../../../../modules/import-kit/src/d1/index.ts';

/** Preserve the complete native plan while enabling Kit's lossless dictionary
 * custody. Repeated column schemas and row values count as shared references. */
export const nativePlanCodec:D1PlanCodec={
  id:'slate-native-plan-v1',
  encode(plan){return plan as unknown as Json;},
  decode(payload){
    if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Invalid native import plan.');
    return payload as unknown as ImportPlan;
  },
};
