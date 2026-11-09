import { useEffect, useRef, useState } from 'react';
import { call, errorMessage, useAsync, type Access, type RoleOutcome, type UserRef } from '../api';
import { ConfirmDialog, ErrorState, Loading, Panel } from '../components';
import { useI18n } from '../i18n';
import { Icon } from '../icons';

type Confirm = { kind: 'takeover'; person: UserRef | null } | { kind: 'remove' | 'transfer'; person: UserRef };
type Message = { tone: 'ok' | 'error'; text: string };

const MIN_QUERY = 2;
const SEARCH_DELAY_MS = 300;

/**
 * Owner, managers and the role log. Every button here is also checked on the server; the UI only
 * hides what the caller's role would be refused.
 */
export function RolesPanel({ access, onAccessChanged }: { access: Access; onAccessChanged: () => Promise<void> }) {
  const roles = useAsync(() => call('getRoles'), []);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const { t, fmt } = useI18n();
  const r = t.roles;
  const nameOf = (p: UserRef | null) => p?.displayName ?? r.unavailable;

  const act = async (change: () => Promise<RoleOutcome>, okText: string) => {
    setBusy(true);
    setMessage(null);
    let next: Message;
    try {
      const outcome = await change();
      next = outcome.ok ? { tone: 'ok', text: okText } : { tone: 'error', text: r.errors[outcome.code] };
    } catch (err) {
      next = { tone: 'error', text: errorMessage(err) };
    }
    // Refresh in every case (a refusal usually means the roles changed elsewhere) and keep the
    // buttons disabled until both the roles and the caller's access are current again.
    await Promise.all([roles.reload(), onAccessChanged()]);
    setMessage(next);
    setBusy(false);
    setConfirm(null);
  };

  // The button that opened the dialog may be gone after the change, so focus the result instead.
  useEffect(() => {
    if (!busy && message) messageRef.current?.focus();
  }, [busy, message]);

  const view = roles.status === 'ready' ? roles.data : null;
  const known = new Set([...(view?.owner ? [view.owner.accountId] : []), ...(view?.managers.map((m) => m.accountId) ?? [])]);

  const confirmAction = () => {
    if (!confirm) return;
    if (confirm.kind === 'takeover') void act(() => call('claimOwnership', { expectOwner: confirm.person?.accountId ?? null }), r.claimed);
    else if (confirm.kind === 'remove') void act(() => call('removeManager', { accountId: confirm.person.accountId }), r.removed);
    else void act(() => call('transferOwnership', { accountId: confirm.person.accountId }), r.transferred);
  };

  return (
    <Panel title={r.title} icon="settings" description={r.desc}>
      <div aria-busy={busy}>
        <p className="small">{r.yourRole}: <strong>{r.role[access.role]}</strong></p>
        {roles.status === 'loading' && <Loading variant="inline" />}
        {roles.status === 'error' && <ErrorState message={roles.message} onRetry={roles.reload} />}

        {view && (
          <>
            <h3 className="section-title">{r.owner}</h3>
            {view.owner ? (
              <div className="role-row">
                <Person person={view.owner} />
                <span className="muted small">{r.ownerSince(fmt.dateTime(view.owner.since))}</span>
              </div>
            ) : (
              <p className="muted small">{r.noOwner}</p>
            )}
            {access.canClaimOwnership && (
              <div className="mt-3">
                {view.owner ? (
                  <>
                    <p className="footnote">{r.takeOverHelp}</p>
                    <button type="button" className="btn" disabled={busy} onClick={() => setConfirm({ kind: 'takeover', person: view.owner })}>{r.takeOver}</button>
                  </>
                ) : (
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act(() => call('claimOwnership', { expectOwner: null }), r.claimed)}>{r.becomeOwner}</button>
                )}
              </div>
            )}

            <h3 className="section-title mt-3">{r.managers}</h3>
            {view.managers.length === 0 && <p className="muted small">{r.noManagers}</p>}
            <ul className="role-list">
              {view.managers.map((m) => (
                <li key={m.accountId} className="role-row">
                  <Person person={m} />
                  <span className="muted small">{r.added(fmt.dateTime(m.addedAt))}</span>
                  {access.canManageRoles && (
                    <span className="role-actions">
                      {m.displayName && <button type="button" className="btn btn-sm" disabled={busy} aria-label={r.makeOwnerFor(m.displayName)} onClick={() => setConfirm({ kind: 'transfer', person: m })}>{r.makeOwner}</button>}
                      <button type="button" className="btn btn-sm btn-danger-subtle" disabled={busy} aria-label={r.removeFor(nameOf(m))} onClick={() => setConfirm({ kind: 'remove', person: m })}>{r.remove}</button>
                    </span>
                  )}
                </li>
              ))}
            </ul>

            {access.canManageRoles ? (
              <ManagerSearch known={known} ownerId={view.owner?.accountId ?? null} disabled={busy} onAdd={(p) => void act(() => call('addManager', { accountId: p.accountId }), r.addedOk(p.displayName ?? r.unavailable))} />
            ) : (
              view.owner && <p className="muted small mt-3">{r.ownerOnly}</p>
            )}

            <details className="disclosure mt-3">
              <summary><Icon name="chevronDown" size={14} /> {r.log}</summary>
              <div className="disclosure-body">
                {view.log.length === 0 ? (
                  <p className="muted small">{r.logEmpty}</p>
                ) : (
                  <>
                    <p className="footnote">{r.logShown(view.log.length)}</p>
                    <div className="table-wrap">
                      <table className="table compact">
                        <thead><tr><th>{r.colWhen}</th><th>{r.colWho}</th><th>{r.colAction}</th><th>{r.colWhom}</th></tr></thead>
                        <tbody>
                          {view.log.map((e, i) => (
                            <tr key={`${e.at}-${i}`}>
                              <td className="muted nowrap">{fmt.dateTime(e.at)}</td>
                              <td>{nameOf(e.actor)}</td>
                              <td>{r.action[e.action]}</td>
                              <td>{e.target.accountId === e.actor.accountId ? '—' : nameOf(e.target)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </details>
          </>
        )}
        {/* Always mounted, so screen readers announce each new result. */}
        <p ref={messageRef} tabIndex={-1} aria-live="polite" className={`mt-3 small ${message?.tone === 'error' ? 'text-danger' : 'text-success'}`}>{message?.text}</p>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === 'takeover' ? r.takeOverTitle : confirm?.kind === 'transfer' ? r.transferTitle : r.removeTitle}
        confirmLabel={confirm?.kind === 'takeover' ? r.takeOver : confirm?.kind === 'transfer' ? r.makeOwner : r.remove}
        busy={busy}
        onConfirm={confirmAction}
        onCancel={() => setConfirm(null)}
      >
        {confirm && <p>{(confirm.kind === 'takeover' ? r.takeOverBody : confirm.kind === 'transfer' ? r.transferBody : r.removeBody)(nameOf(confirm.person))}</p>}
      </ConfirmDialog>
    </Panel>
  );
}

/** Name and avatar as Jira shows them; a placeholder when Jira no longer shows the person. */
function Person({ person }: { person: UserRef }) {
  const { t } = useI18n();
  const [broken, setBroken] = useState(false);
  const name = person.displayName;
  const initials = name ? name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') : '?';
  return (
    <span className="person" title={name ? undefined : t.roles.unavailableHelp}>
      {person.avatarUrl && !broken ? (
        <img className="avatar" src={person.avatarUrl} alt="" width={24} height={24} referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        <span className="avatar avatar-initials" aria-hidden="true">{initials}</span>
      )}
      <span className={name ? undefined : 'muted'}>{name ?? t.roles.unavailable}</span>
    </span>
  );
}

/** Owner only: find people in Jira (as the owner sees them) and add one as a manager. */
function ManagerSearch({ known, ownerId, disabled, onAdd }: { known: Set<string>; ownerId: string | null; disabled: boolean; onAdd: (p: UserRef) => void }) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<{ status: 'idle' | 'loading' } | { status: 'ready'; users: UserRef[] } | { status: 'error'; text: string }>({ status: 'idle' });
  const latest = useRef(0);
  const { t } = useI18n();
  const r = t.roles;

  useEffect(() => {
    const q = query.trim();
    const id = ++latest.current;
    if (q.length < MIN_QUERY) {
      setState({ status: 'idle' });
      return;
    }
    setState({ status: 'loading' });
    const timer = window.setTimeout(() => {
      call('searchUsers', { query: q })
        .then((res) => {
          // Only the answer to the newest query is shown.
          if (id !== latest.current) return;
          setState(res.ok ? { status: 'ready', users: res.users } : { status: 'error', text: r.errors[res.code] });
        })
        .catch((err: unknown) => id === latest.current && setState({ status: 'error', text: errorMessage(err) }));
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [query, r]);

  return (
    <div className="mt-3">
      <h3 className="section-title">{r.addTitle}</h3>
      <label className="field">
        <span className="field-label">{r.searchLabel}</span>
        <input type="search" className="input" value={query} maxLength={50} placeholder={r.searchPlaceholder} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {/* Only a short status line is announced; the result list itself stays out of the live region. */}
      <p aria-live="polite" className={`small ${state.status === 'error' ? 'text-danger' : 'muted'}`}>
        {state.status === 'loading' && r.searching}
        {state.status === 'error' && state.text}
        {state.status === 'ready' && (state.users.length === 0 ? r.noResults : r.found(state.users.length))}
      </p>
      <div>
        {state.status === 'ready' && state.users.length > 0 && (
          <ul className="role-list">
            {state.users.map((u) => (
              <li key={u.accountId} className="role-row">
                <Person person={u} />
                <span className="role-actions">
                  {known.has(u.accountId) ? (
                    <span className="badge badge-neutral">{u.accountId === ownerId ? r.isOwner : r.alreadyManager}</span>
                  ) : (
                    <button type="button" className="btn btn-sm btn-primary" disabled={disabled} aria-label={r.addFor(u.displayName ?? r.unavailable)} onClick={() => onAdd(u)}>{r.add}</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
