import { useCallback, useEffect, useId, useRef, useState } from 'react';
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  const menuId = useId();
  const detailId = `${menuId}-detail`;

  const closeMenu = useCallback((restore: boolean) => {
    restoreFocus.current = restore;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const trigger = buttonRef.current;
    menuRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeMenu(true);
    };
    const onPointer = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) closeMenu(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      if (restoreFocus.current) {
        restoreFocus.current = false;
        (buttonRef.current ?? trigger)?.focus();
      }
    };
  }, [open, closeMenu]);

  if (status.state === 'off') {
    return (
      <button ref={buttonRef} type="button" className="btn btn-ghost btn-sm" onClick={onEnable} title="Sign in to sync sets between devices">
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
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
      >
        {icon} {label}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className="sync-pop fade-in"
          role="menu"
          aria-label="Sync status"
          aria-describedby={(status.state === 'error' && status.error) || status.state !== 'error' ? detailId : undefined}
          tabIndex={-1}
        >
          {status.email && <div className="sync-email">{status.email}</div>}
          {status.state === 'error' && status.error && <p id={detailId} className="sync-error">{status.error}</p>}
          {status.state !== 'error' && (
            <p id={detailId} className="sync-note">Sets and progress sync to your private Firebase account across devices.</p>
          )}
          <div className="sync-pop-actions">
            {status.wrongAccount && (
              <button
                type="button"
                role="menuitem"
                className="btn btn-sm"
                onClick={() => {
                  closeMenu(true);
                  onSwitchAccount();
                }}
              >
                <UserRoundCog size={14} aria-hidden /> Switch account
              </button>
            )}
            {status.state === 'error' && !status.wrongAccount && (
              <button
                type="button"
                role="menuitem"
                className="btn btn-sm"
                onClick={() => {
                  closeMenu(true);
                  onEnable();
                }}
              >
                <RefreshCw size={14} aria-hidden /> Retry
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                closeMenu(true);
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
