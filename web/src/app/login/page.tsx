import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase/server';
import { LoginForm } from './login-form';

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; reason?: string }> }) {
  const { next = '/app', reason } = await searchParams;
  if (await currentUser()) redirect(next.startsWith('/') ? next : '/app');
  const t = await getTranslations('login');
  return (
    <main className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--paper)' }}>
      <div className="card w-full" style={{ maxWidth: 400 }}>
        <div className="flex items-center gap-2 mb-4"><span className="font-semibold" style={{ fontSize: 18 }}>VIA</span><span className="muted small">Merch</span></div>
        <h1 style={{ fontSize: 20 }}>{t('title')}</h1>
        {reason === 'idle' && <div className="notice warn mt-3">{t('idle')}</div>}
        {reason === 'ended' && <div className="notice warn mt-3">{t('ended')}</div>}
        <p className="muted small mt-2 mb-4">{t('intro')}</p>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
