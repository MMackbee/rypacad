/**
 * The parent's contract view of one child (owner, 2026-10-28; spec 4.3):
 * the same month and log hooks the athlete screen uses, with an explicit
 * athleteId, plus the one-time stamp on first open. Rules: a parent may
 * create, update and delete contractLogs for an athlete of their household
 * (firestore.rules contractLogs, logParentOwns).
 */
import { useEffect, useRef } from 'react';
import { useContract, usePracticeLog } from './index';

export function useParentContract(athleteId) {
  const contract = useContract({ athleteId });
  const log = usePracticeLog({ athleteId });
  const stamped = useRef(false);
  useEffect(() => {
    if (!contract.data?.needsStart || stamped.current) return;
    stamped.current = true;
    contract.ensureContractStart().catch(() => { stamped.current = false; });
  }, [contract.data?.needsStart]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    month: contract.data ?? null, loading: contract.loading, error: contract.error,
    logPractice: log.logPractice, removeLog: log.removeLog, ensureContractStart: contract.ensureContractStart,
    loggedToday: Boolean(log.data?.loggedToday), todayMinutes: log.data?.todayMinutes || 0,
    required: contract.data?.required ?? log.data?.contractMinutes ?? 20,
  };
}
