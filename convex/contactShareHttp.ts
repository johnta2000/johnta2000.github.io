import { httpAction } from './_generated/server';
import { serveContactShare } from './contactShareLogic';
export const endpoint = httpAction(async (_ctx, request) => serveContactShare(request, process.env.CONTACT_SHARE_GROUPS));
