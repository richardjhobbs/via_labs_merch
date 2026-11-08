'use client';
// Add from a document: upload, then a review of what was read. Nothing is saved until the person presses Save.
import { useActionState, useRef, useState, type ReactNode } from 'react';
import { DrivePicker } from '@/components/drive-picker';
import { useTranslations } from 'next-intl';
import { readDocument, saveDocument, type ReadState } from '../actions';
import { PartyFields, type PartyDefaults } from '../party-fields';
import { maskAccount } from '@/lib/bank';
import type { DocDraft, ReadDoc } from '@/lib/documents';

type Existing = { id: string; name: string };

function Side({ prefix, title, party, kind, match, isUs, existing, children }: { prefix: string; title: string; party: ReadDoc['buyer']; kind: string; match: string | null; isUs: boolean; existing: Existing[]; children?: ReactNode }) {
  const t = useTranslations('parties.doc');
  const [use, setUse] = useState(!isUs && !!party.name);   // a side the document does not show starts unticked
  const [link, setLink] = useState(match || '');
  const defaults: PartyDefaults = { name: party.name, kind, country: party.country, city: party.city, address: party.address, contact_name: party.contact_name, contact_email: party.email, contact_phone: party.phone };
  return (
    <div className="card self-start">
      <h2>{title}</h2>
      <label className="flex items-center gap-2 mt-2 small"><input type="checkbox" name={`${prefix}use`} checked={use} onChange={(e) => setUse(e.target.checked)} />{t('addThis')}</label>
      {isUs && <p className="notice mt-2 small">{t('isUs', { name: party.name || '' })}</p>}
      {use && <>
        <label className="f mt-3"><span>{t('existing')}</span><select className="input" name={`${prefix}existing`} value={link} onChange={(e) => setLink(e.target.value)}><option value="">{t('newRecord')}</option>{existing.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        {link ? <p className="muted small">{t('linkNote')}</p> : <PartyFields prefix={prefix} defaults={defaults} />}
        {children}
      </>}
    </div>
  );
}

function Bank({ bank, confirmed }: { bank: NonNullable<ReadDoc['bank']>; confirmed: string[] }) {
  const t = useTranslations('parties.bank');
  const [save, setSave] = useState(true);
  const clean = (s: string | null) => (s || '').replace(/[\s-]/g, '').toUpperCase();
  const differs = confirmed.length > 0 && !confirmed.some((c) => clean(c) === clean(bank.account_no));
  const field = (name: string, label: string, value: string | null, max: number) => <label className="f"><span>{label}</span><input className="input" name={`bank_${name}`} maxLength={max} defaultValue={(value || '').slice(0, max)} /></label>;
  return (
    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--line2)' }}>
      <h3>{t('title')}</h3>
      {differs && <div className="notice crit mt-2 small">{t('differsDoc', { account: confirmed.map(maskAccount).join(', ') })}</div>}
      <label className="flex items-center gap-2 mt-2 small"><input type="checkbox" name="save_bank" checked={save} onChange={(e) => setSave(e.target.checked)} />{t('saveDoc')}</label>
      {save && <div className="mt-3">
        <p className="muted small mb-3">{t('docNote')}</p>
        {field('beneficiary', t('beneficiary'), bank.beneficiary, 160)}
        {field('bank_name', t('bankName'), bank.bank_name, 160)}
        {field('bank_address', t('bankAddress'), bank.bank_address, 240)}
        {field('account_no', t('accountNo'), bank.account_no, 40)}
        {field('swift', t('swift'), bank.swift, 60)}
        {field('bank_code', t('bankCode'), bank.bank_code, 20)}
        {field('branch_code', t('branchCode'), bank.branch_code, 20)}
        {field('currency', t('currency'), bank.currency, 3)}
      </div>}
    </div>
  );
}

function Review({ tenant, draft, existing, canBank, onReset }: { tenant: string; draft: DocDraft; existing: Existing[]; canBank: boolean; onReset: () => void }) {
  const t = useTranslations('parties.doc');
  const [state, action, pending] = useActionState<ReadState, FormData>(saveDocument, {});
  const { doc } = draft;
  const [makeOrder, setMakeOrder] = useState(doc.type !== 'company_profile');   // a profile has no order to create
  const money = (n: number | null) => (n == null ? '' : `${doc.currency || ''} ${n.toLocaleString('en', { maximumFractionDigits: 4 })}`.trim());
  const qty = doc.lines.reduce((a, l) => a + (l.qty || 0), 0);
  const single = doc.lines.length === 1 ? doc.lines[0] : null;
  const meta = { type: doc.type, number: doc.number, date: doc.date, lines: doc.lines, freight: doc.freight, total: doc.total, payment_terms: doc.payment_terms, lead_time_days: doc.lead_time_days, hs_code: doc.hs_code };
  return (
    <form action={action}>
      <input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="file_name" value={draft.file} /><input type="hidden" name="doc_meta" value={JSON.stringify(meta)} />
      <p className="notice">{t('review', { file: draft.file })}</p>
      <div className="grid gap-4 mt-4 md:grid-cols-2">
        <Side prefix="b_" title={t('buyer')} party={doc.buyer} kind="brand" match={draft.buyerMatch} isUs={draft.buyerIsUs} existing={existing} />
        <Side prefix="s_" title={t('seller')} party={doc.seller} kind="factory" match={draft.sellerMatch} isUs={draft.sellerIsUs} existing={existing}>{canBank && doc.bank?.account_no && <Bank bank={doc.bank} confirmed={draft.sellerConfirmed} />}</Side>
      </div>
      <div className="card mt-4">
        <h2>{t('order')}</h2>
        <label className="flex items-center gap-2 mt-2 small"><input type="checkbox" name="make_order" checked={makeOrder} onChange={(e) => setMakeOrder(e.target.checked)} />{t('makeOrder')}</label>
        {makeOrder && <>
          <div className="grid gap-3 mt-3 md:grid-cols-3">
            <label className="f"><span>{t('po')}</span><input className="input" name="po" required maxLength={60} defaultValue={doc.number || ''} /></label>
            <label className="f"><span>{t('etd')}</span><input className="input" name="etd" type="date" required defaultValue={draft.etd} /></label>
            <label className="f"><span>{t('incoterm')}</span><input className="input" name="incoterm" maxLength={10} defaultValue={doc.incoterm || ''} /></label>
            <label className="f"><span>{t('qty')}</span><input className="input" name="qty" inputMode="numeric" maxLength={12} defaultValue={qty || ''} /></label>
            <label className="f"><span>{t('price')}</span><input className="input" name="fob" inputMode="decimal" maxLength={14} defaultValue={single?.unit_price ?? ''} /></label>
            <label className="f"><span>{t('currency')}</span><input className="input" name="currency" maxLength={3} defaultValue={doc.currency || 'USD'} /></label>
          </div>
          <label className="f"><span>{t('description')}</span><textarea className="input" name="description" rows={2} maxLength={2000} defaultValue={doc.lines.map((l) => l.description).join('; ')} /></label>
          <p className="muted small">{t('etdHelp')}</p>
          <dl className="small mt-3 grid gap-1" style={{ gridTemplateColumns: 'max-content 1fr', columnGap: 12 }}>
            {([['freight', money(doc.freight)], ['total', money(doc.total)], ['terms', doc.payment_terms], ['hs', doc.hs_code]] as const).filter(([, v]) => v).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt className="muted">{t(k)}</dt><dd>{v}</dd></div>)}
          </dl>
        </>}
      </div>
      {state.error && <div className="notice crit mt-3">{state.error}</div>}
      <div className="flex gap-2 mt-3"><button className="btn primary" disabled={pending}>{pending ? t('saving') : t('save')}</button><button type="button" className="btn" onClick={onReset}>{t('another')}</button></div>
    </form>
  );
}

export function DocumentForm({ tenant, existing, canBank }: { tenant: string; existing: Existing[]; canBank: boolean }) {
  const t = useTranslations('parties.doc');
  const [state, action, pending] = useActionState<ReadState, FormData>(readDocument, {});
  const [dismissed, setDismissed] = useState<DocDraft | null>(null);
  const formRef = useRef<HTMLFormElement>(null), fileRef = useRef<HTMLInputElement>(null), driveRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState({ id: '', name: '' });
  if (state.draft && state.draft !== dismissed) return <Review key={state.draft.file} tenant={tenant} draft={state.draft} existing={existing} canBank={canBank} onReset={() => setDismissed(state.draft!)} />;
  return (
    <form action={action} className="card" ref={formRef}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="drive_file_id" ref={driveRef} defaultValue="" />
      <label className="f"><span>{t('file')}</span><input ref={fileRef} className="input" type="file" name="file" accept=".xls,.xlsx,.xlsm,.csv,.pdf,.png,.jpg,.jpeg,.webp" onChange={() => { if (driveRef.current) driveRef.current.value = ''; setPicked({ id: '', name: '' }); }} /></label>
      <div className="flex items-center gap-2 flex-wrap mb-3"><span className="small muted">{t('orDrive')}</span>
        <DrivePicker tenant={tenant} kind="doc" disabled={pending} onPick={(f) => { if (fileRef.current) fileRef.current.value = ''; if (driveRef.current) driveRef.current.value = f.id; setPicked(f); formRef.current?.requestSubmit(); }} />
        {picked.name && <span className="small">{picked.name}</span>}
      </div>
      {state.error && <div className="notice crit mb-3">{state.error}</div>}
      <button className="btn primary" disabled={pending}>{pending ? t('reading') : t('read')}</button>
    </form>
  );
}
