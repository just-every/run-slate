import { createFileRoute, redirect } from '@tanstack/react-router';
export const Route = createFileRoute('/app/records/')({
  beforeLoad: () => { throw redirect({ to: '/app/search', replace: true }); },
});
