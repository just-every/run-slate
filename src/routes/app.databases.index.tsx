import { createFileRoute, redirect } from '@tanstack/react-router';
export const Route = createFileRoute('/app/databases/')({
  beforeLoad: () => { throw redirect({ to: '/app/search', replace: true }); },
});
