import { useEffect, useRef, useState } from 'react';
import { Cloud, CloudAlert, CloudOff, LogOut, RefreshCw, UserRoundCog } from 'lucide-react';
import type { SyncStatus } from '../model';

interface SyncMenuProps {
  status: SyncStatus;
  onEnable: () => void;
  onSignOut: () => void;
  onSwitchAccount: () => void;
}

export function SyncMenu({ status, onEnable, onSignOut, onSwitchAccount }: SyncMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  if (status.state === 'off') {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={onEnable} title="Sign in to sync sets between devices">
        <CloudOff size={16} aria-hidden /> Sync
      </button>
    );
  }

  const icon =
    status.state === 'synced' ? (
      <Cloud size={16} aria-hidden className="sync-ok" />
    ) : status.state === 'error' ? (
      <CloudAlert size={16} aria-hidden className="sync-bad" />
    ) : (
      <Cloud size={16} aria-hidden className="sync-busy" />
    );
  const label =
    status.state === 'synced' ? 'Synced' : status.state === 'error' ? 'Sync error' : 'Syncing…';

  return (
    <div className="sync-wrap" ref={wrapRef}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {icon} {label}
      </button>
      {open && (
        <div className="sync-pop fade-in" role="dialog" aria-label="Sync status">
          {status.email && <div className="sync-email">{status.email}</div>}
          {status.state === 'error' && status.error && <p className="sync-error">{status.error}</p>}
          {status.state !== 'error' && (
            <p className="sync-note">Sets and progress sync to your private Firebase account across devices.</p>
          )}
          <div className="sync-pop-actions">
            {status.wrongAccount && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setOpen(false);
                  onSwitchAccount();
                }}
              >
                <UserRoundCog size={14} aria-hidden /> Switch account
              </button>
            )}
            {status.state === 'error' && !status.wrongAccount && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setOpen(false);
                  onEnable();
                }}
              >
                <RefreshCw size={14} aria-hidden /> Retry
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
            >
              <LogOut size={14} aria-hidden /> Turn off sync
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
