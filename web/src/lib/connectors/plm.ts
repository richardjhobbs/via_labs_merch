// PLM notification senders (docs/development-merchandising.md section 4, route one). These systems mail tech pack
// exports and sample requests on a brand's behalf, from their own domains, so they are not contacts of any
// party. When a company runs the development track, mail from these domains is read like mail from a known
// sender; the party is taken from the style code the mail names.
export const PLM_SENDERS: Record<string, string> = {
  'delogue.com': 'Delogue PLM', 'my.delogue.com': 'Delogue PLM',
  'centricsoftware.com': 'Centric PLM', 'centric8.com': 'Centric PLM',
  'ptc.com': 'PTC FlexPLM',
  'infor.com': 'Infor PLM', 'inforcloudsuite.com': 'Infor PLM',
  'techpacker.com': 'Techpacker',
  'backboneplm.com': 'Backbone PLM', 'bamboorose.com': 'Bamboo Rose',
  'worldfashionexchange.com': 'WFX', 'wfxcloud.com': 'WFX',
  'lectra.com': 'Lectra Kubix Link',
  'topo.cc': 'Topo',
};
export function plmOf(addr: string | null | undefined): string | null {
  const d = (addr || '').toLowerCase().split('@')[1] || '';
  if (!d) return null;
  for (const [dom, name] of Object.entries(PLM_SENDERS)) if (d === dom || d.endsWith('.' + dom)) return name;
  return null;
}
