// Orders export for people (xlsx, csv) and agents (json with the VIA envelope),
// plus the blank import template. Runs under the signed-in person's RLS.
import { NextResponse, type NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { me } from '@/lib/tenant';
import { listOrders } from '@/lib/orders';
import { LABELS, MILESTONES, isoOf } from '@/lib/core/path';

const TEMPLATE_HEADERS = ['PO', 'Customer', 'Factory', 'Factory country', 'Mill', 'Fibre', 'Style', 'Description', 'Category', 'Composition', 'Qty', 'FOB', 'Currency', 'Incoterm', 'POL', 'POD', 'ETD', 'In-store', 'Season'];

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('tenant') || '', fmt = req.nextUrl.searchParams.get('fmt') || 'json';
  const m = await me();
  if (!m) return NextResponse.json({ error: 'sign in' }, { status: 401 });
  const membership = m.memberships.find((x) => x.tenants.slug === slug);
  if (!membership && !m.isAdmin) return NextResponse.json({ error: 'no access' }, { status: 403 });
  const stamp = new Date().toISOString().slice(0, 10);
  if (fmt === 'template') {
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ['48812', 'Northline', 'Dongguan Huaxin Garment', 'CN', 'Shaoxing Yongli Textiles', '', 'SS27-TEE-014', 'Organic jersey tee', 'Tops', '100% cotton jersey 160gsm', 12000, 4.1, 'USD', 'FOB', 'Yantian', 'Felixstowe', stamp, '', 'SS27']]);
    return file(XLSX.write(bookOf(ws), { type: 'buffer', bookType: 'xlsx' }), `via-merch-import-template.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
  const tenantId = membership?.tenant_id;
  if (!tenantId) return NextResponse.json({ error: 'admins export from the workspace' }, { status: 403 });
  const orders = await listOrders(tenantId);
  const rows = orders.map((o) => ({ PO: o.po, Customer: o.customer?.name || '', Factory: o.factory?.name || '', Style: o.style || '', Description: o.description || '', Qty: o.qty, FOB: o.fob, Currency: o.currency, Health: o.health.state, 'ETD slip (days)': o.health.etdSlip, ...Object.fromEntries(MILESTONES.map((k) => [LABELS[k], o.health.p[k] ? isoOf(o.health.p[k].status === 'done' ? (o.health.p[k].actual as number) : o.health.p[k].f) : ''])), 'In-store': o.instore_date || '', Status: o.status }));
  if (fmt === 'json') return NextResponse.json({ '@context': 'https://getvia.xyz/schema/merch/v1', type: 'merch.orders.v1', generatedAt: new Date().toISOString(), generatedBy: 'VIA Merch', company: membership.tenants.name, count: rows.length, data: rows });
  const ws = XLSX.utils.json_to_sheet(rows);
  if (fmt === 'csv') return file(Buffer.from('﻿' + XLSX.utils.sheet_to_csv(ws)), `orders-${slug}-${stamp}.csv`, 'text/csv; charset=utf-8');
  return file(XLSX.write(bookOf(ws), { type: 'buffer', bookType: 'xlsx' }), `orders-${slug}-${stamp}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

function bookOf(ws: XLSX.WorkSheet) { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Orders'); return wb; }
function file(buf: Buffer, name: string, type: string) { return new NextResponse(new Uint8Array(buf), { headers: { 'content-type': type, 'content-disposition': `attachment; filename="${name}"` } }); }
