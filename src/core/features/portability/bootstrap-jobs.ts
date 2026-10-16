/** Local dev runs cron before first-run setup. Its successful heartbeat is
 * runtime bookkeeping; failures and all other job records remain protected. */
export const emptyBootstrapJobsSelect = `SELECT NOT EXISTS(
  SELECT 1 FROM core_job_failures
  WHERE NOT (id='schedule:last-run' AND kind='schedule' AND attempts=0
    AND state='succeeded' AND error_code='')
) AS empty`;
