// Shared by New style and the Edit form on the style file.
import { getTranslations } from 'next-intl/server';
import type { StyleRow } from '@/lib/styles';

export async function StyleFields({ s, customers, currency }: { s?: StyleRow | null; customers: { id: string; name: string }[]; currency: string }) {
  const t = await getTranslations('styles');
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
      <label className="f"><span>{t('fCode')}</span><input className="input" name="code" required maxLength={60} defaultValue={s?.code || ''} placeholder="e.g. 2201" readOnly={!!s} /></label>
      <label className="f"><span>{t('fName')}</span><input className="input" name="name" maxLength={200} defaultValue={s?.name || ''} /></label>
      <label className="f"><span>{t('fCustomer')}</span><select className="input" name="customer_id" defaultValue={s?.customer?.id || ''}><option value="">—</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="f"><span>{t('fSeason')}</span><input className="input" name="season" maxLength={40} defaultValue={s?.season || ''} placeholder="SS27" /></label>
      <label className="f"><span>{t('fCategory')}</span><input className="input" name="category" maxLength={80} defaultValue={s?.category || ''} placeholder={t('fCategoryHint')} /></label>
      <label className="f"><span>{t('fTargetPrice')}</span><div className="flex gap-1"><input className="input" name="currency" maxLength={3} defaultValue={s?.currency || currency} style={{ width: 64 }} /><input className="input" name="target_price" inputMode="decimal" defaultValue={s?.target_price ?? ''} /></div></label>
      <label className="f"><span>{t('fTargetDelivery')}</span><input className="input" type="date" name="target_delivery" defaultValue={s?.target_delivery || ''} /></label>
      <label className="f"><span>{t('fPlmRef')}</span><input className="input" name="plm_ref" maxLength={200} defaultValue={s?.plm_ref || ''} placeholder={t('fPlmRefHint')} /></label>
      <label className="f" style={{ gridColumn: '1 / -1' }}><span>{t('fDescription')}</span><textarea className="input" name="description" rows={2} maxLength={2000} defaultValue={s?.description || ''} /></label>
    </div>
  );
}
