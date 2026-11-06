// Bank accounts on the customer or supplier page: what awaits confirmation, what is confirmed, and the history.
import { getLocale, getTranslations } from 'next-intl/server';
import { CONFIRM_METHODS, canAddBank, canDecideBank, maskAccount, type BankRow } from '@/lib/bank';
import { addBank, confirmBank, rejectBank } from '../bank-actions';

export async function BankSection({ slug, partyId, role, accounts }: { slug: string; partyId: string; role: string; accounts: BankRow[] }) {
  const [t, locale] = await Promise.all([getTranslations('parties.bank'), getLocale()]);
  const date = (d: string | null) => (d ? new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const pending = accounts.filter((a) => a.status === 'pending'), confirmed = accounts.filter((a) => a.status === 'confirmed'), past = accounts.filter((a) => a.status === 'superseded' || a.status === 'rejected');
  const hidden = <><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="party_id" value={partyId} /></>;
  const Details = ({ a }: { a: BankRow }) => (
    <dl className="small grid gap-1" style={{ gridTemplateColumns: 'max-content minmax(0,1fr)', columnGap: 12 }}>
      {([['beneficiary', a.beneficiary], ['bankName', a.bank_name], ['bankAddress', a.bank_address], ['accountNo', a.account_no], ['swift', a.swift], ['bankCode', a.bank_code], ['branchCode', a.branch_code], ['currency', a.currency]] as const).filter(([, v]) => v).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt className="muted">{t(k)}</dt><dd className={k === 'accountNo' || k === 'swift' ? 'mono' : ''} style={{ overflowWrap: 'anywhere' }}>{v}</dd></div>)}
    </dl>
  );
  return (
    <div id="bank" className="card mt-4">
      <h2>{t('title')}</h2>
      <p className="muted small mt-1">{t('intro')}</p>
      {pending.map((a) => {
        const differs = confirmed.find((c) => (c.currency || '') === (a.currency || ''));
        return (
          <div key={a.id} className="mt-4" style={{ borderLeft: '3px solid var(--warn)', paddingLeft: 12 }}>
            <span className="pill warn">{t('pending')}</span>
            {differs && <div className="notice crit mt-2 small">{t('differs', { account: maskAccount(differs.account_no) })}</div>}
            <div className="mt-2"><Details a={a} /></div>
            <p className="muted small mt-2">{a.source === 'document' && a.source_file ? t('fromDoc', { file: a.source_file, who: a.added_by_name || '–', date: date(a.created_at) }) : t('byHand', { who: a.added_by_name || '–', date: date(a.created_at) })}</p>
            {canDecideBank(role) ? <>
              <div className="notice warn mt-2 small">{t('warning')}</div>
              <form action={confirmBank} className="mt-3">{hidden}<input type="hidden" name="id" value={a.id} />
                <label className="f"><span>{t('method')}</span><select className="input" name="method" required defaultValue=""><option value="" disabled>{t('methodPick')}</option>{CONFIRM_METHODS.map((m) => <option key={m} value={m}>{t(`methods.${m}`)}</option>)}</select></label>
                <label className="f"><span>{t('note')}</span><input className="input" name="note" required minLength={3} maxLength={300} placeholder={t('notePlaceholder')} /></label>
                <label className="flex items-start gap-2 small mb-3"><input type="checkbox" name="checked" required style={{ marginTop: 3 }} /><span>{t('attest')}</span></label>
                <div className="flex gap-2"><button className="btn primary">{t('confirm')}</button><button className="btn red" formAction={rejectBank} formNoValidate>{t('reject')}</button></div>
              </form>
            </> : <p className="small mt-2">{t('askManager')}</p>}
          </div>
        );
      })}
      {confirmed.map((a) => (
        <div key={a.id} className="mt-4">
          <span className="pill ok">{t('confirmed')}</span>
          <div className="mt-2"><Details a={a} /></div>
          <p className="muted small mt-2">{t('confirmedBy', { who: a.decided_by_name || '–', date: date(a.decided_at), method: a.confirm_method ? t(`methods.${a.confirm_method}`) : '' })}{a.confirm_note ? `: ${a.confirm_note}` : ''}</p>
        </div>
      ))}
      {!pending.length && !confirmed.length && <p className="muted small mt-3">{t('none')}</p>}
      {!!past.length && <details className="mt-4 small"><summary className="muted" style={{ cursor: 'pointer' }}>{t('history')} ({past.length})</summary>
        {past.map((a) => <div key={a.id} className="mt-3"><span className={`pill ${a.status === 'rejected' ? 'crit' : ''}`}>{t(a.status === 'rejected' ? 'rejected' : 'superseded')}</span><div className="mt-2"><Details a={a} /></div></div>)}
      </details>}
      {canAddBank(role) && <details className="mt-4"><summary className="small" style={{ cursor: 'pointer', color: 'var(--accent)' }}>{t('add')}</summary>
        <form action={addBank} className="mt-3">{hidden}
          <label className="f"><span>{t('beneficiary')}</span><input className="input" name="beneficiary" maxLength={160} /></label>
          <label className="f"><span>{t('bankName')}</span><input className="input" name="bank_name" maxLength={160} /></label>
          <label className="f"><span>{t('bankAddress')}</span><input className="input" name="bank_address" maxLength={240} /></label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="f"><span>{t('accountNo')}</span><input className="input" name="account_no" required minLength={4} maxLength={40} /></label>
            <label className="f"><span>{t('swift')}</span><input className="input" name="swift" maxLength={60} /></label>
            <label className="f"><span>{t('bankCode')}</span><input className="input" name="bank_code" maxLength={20} /></label>
            <label className="f"><span>{t('branchCode')}</span><input className="input" name="branch_code" maxLength={20} /></label>
            <label className="f"><span>{t('currency')}</span><input className="input" name="currency" maxLength={3} placeholder="USD" /></label>
          </div>
          <button className="btn">{t('addBtn')}</button>
        </form>
      </details>}
    </div>
  );
}
