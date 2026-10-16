import { createFileRoute, redirect } from '@tanstack/react-router';

/** Stable owner export entry declared to RER; retain Slate's native authorization and transfer UI. */
export const Route = createFileRoute('/app/export')({
  beforeLoad: () => { throw redirect({ to: '/app/settings', search: { section: 'portability' }, replace: true }); },
});
