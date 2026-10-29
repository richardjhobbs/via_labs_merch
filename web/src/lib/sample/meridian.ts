// Sample world for a buying-office company: the demo's Meridian Sourcing data
// (five client brands, seventeen suppliers across three tiers, 38 live POs).
// ETD is given as days from the day the sample is loaded, so it never goes stale.
export const SAMPLE_BRANDS = [
  { code: 'NL', name: 'Northline', country: 'GB', segment: 'Outdoor', lang: 'en', channel: 'portal', policy: { audits: ['amfori BSCI', 'SMETA'], minGrade: 'C', certs: ['OEKO-TEX'], restricted: ['XUAR cotton'], dpp: true } },
  { code: 'CV', name: 'Casa Verano', country: 'ES', segment: 'Womenswear', lang: 'es', channel: 'email_gmail', policy: { audits: ['amfori BSCI'], minGrade: 'C', certs: ['OEKO-TEX'], restricted: ['XUAR cotton'], dpp: true, blockExpiredAudit: true } },
  { code: 'OK', name: 'Oakfield & Co', country: 'US', segment: 'Menswear', lang: 'en', channel: 'email_gmail', policy: { audits: ['WRAP', 'SMETA'], minGrade: 'C', certs: [], restricted: ['XUAR cotton'], uflpa: true, lc: true } },
  { code: 'KO', name: 'Kōen', country: 'JP', segment: 'DTC basics', lang: 'ja', channel: 'email_gmail', policy: { audits: ['SMETA'], minGrade: 'B', certs: ['GOTS', 'OCS'], restricted: ['XUAR cotton'], dpp: true } },
  { code: 'LA', name: 'Little Atlas', country: 'DE', segment: 'Kidswear', lang: 'de', channel: 'portal', policy: { audits: ['amfori BSCI'], minGrade: 'B', certs: ['OEKO-TEX', 'GOTS'], restricted: ['XUAR cotton'], dpp: true, childSafety: true } },
] as const;

export const SAMPLE_SUPPLIERS = [
  { code: 'HX', name: 'Dongguan Huaxin Garment', short: 'Huaxin', country: 'CN', city: 'Dongguan', tier: 1, type: 'Cut & sew, wovens and jersey', lang: 'zh', channel: 'wecom', contact: 'Ms Chen', score: { otd: 86, quality: 94, compliance: 82, response: 3.1 } },
  { code: 'HP', name: 'Hai Phong Garment JSC', short: 'Hai Phong', country: 'VN', city: 'Hai Phong', tier: 1, type: 'Outerwear, technical shells', lang: 'vi', channel: 'zalo', contact: 'Mr Tuan', score: { otd: 93, quality: 96, compliance: 91, response: 2.2 } },
  { code: 'DA', name: 'Dhaka Apex Knit', short: 'Apex', country: 'BD', city: 'Gazipur', tier: 1, type: 'Knits, fleece, sweats', lang: 'bn', channel: 'whatsapp', contact: 'Mr Hasan', score: { otd: 88, quality: 91, compliance: 89, response: 4.5 } },
  { code: 'TC', name: 'Tirupur Cotton Mills', short: 'Tirupur', country: 'IN', city: 'Tiruppur', tier: 1, type: 'Vertical knit & woven, organic', lang: 'ta', channel: 'email_gmail', contact: 'Mr Raj', score: { otd: 90, quality: 92, compliance: 74, response: 5.2 } },
  { code: 'JS', name: 'Jiaxing Silk Garments', short: 'Jiaxing', country: 'CN', city: 'Jiaxing', tier: 1, type: 'Silk and viscose wovens', lang: 'zh', channel: 'email_gmail', contact: 'Ms Lin', score: { otd: 81, quality: 88, compliance: 85, response: 3.8 } },
  { code: 'NJ', name: 'Ningbo Jinyuan Apparel', short: 'Jinyuan', country: 'CN', city: 'Ningbo', tier: 1, type: 'Bottoms, chinos, garment dye', lang: 'zh', channel: 'wecom', contact: 'Mr Zhou', score: { otd: 95, quality: 95, compliance: 90, response: 2.6 } },
  { code: 'KD', name: 'Karachi Denim Works', short: 'Karachi Denim', country: 'PK', city: 'Karachi', tier: 1, type: 'Denim, laundry', lang: 'ur', channel: 'whatsapp', contact: 'Mr Siddiqui', score: { otd: 84, quality: 90, compliance: 87, response: 4.1 } },
  { code: 'IZ', name: 'Izmir Örme Tekstil', short: 'Izmir', country: 'TR', city: 'Izmir', tier: 1, type: 'Nearshore knits, short runs', lang: 'tr', channel: 'whatsapp', contact: 'Ms Demir', score: { otd: 94, quality: 93, compliance: 92, response: 1.9 } },
  { code: 'BR', name: 'Braga Malhas Lda', short: 'Braga', country: 'PT', city: 'Braga', tier: 1, type: 'Premium jersey, kidswear', lang: 'pt', channel: 'email_gmail', contact: 'Sr Costa', score: { otd: 97, quality: 97, compliance: 95, response: 1.6 } },
  { code: 'SY', name: 'Shaoxing Yongli Textiles', short: 'Yongli', country: 'CN', city: 'Shaoxing', tier: 2, type: 'Fabric mill: jersey, poplin, dye house', lang: 'zh', channel: 'wecom', contact: 'Mr Xu', score: { otd: 79, quality: 90, compliance: 78, response: 4 } },
  { code: 'NM', name: 'Nam Dinh Textile Co', short: 'Nam Dinh', country: 'VN', city: 'Nam Dinh', tier: 2, type: 'Fabric mill: nylon, recycled poly', lang: 'vi', channel: 'email_gmail', contact: 'Ms Hoa', score: { otd: 91, quality: 92, compliance: 88, response: 3 } },
  { code: 'AM', name: 'Ahmedabad Spinning & Weaving', short: 'Ahmedabad', country: 'IN', city: 'Ahmedabad', tier: 2, type: 'Spinning and weaving, organic yarn', lang: 'en', channel: 'email_gmail', contact: 'Mr Patel', score: { otd: 87, quality: 89, compliance: 90, response: 3.5 } },
  { code: 'KF', name: 'Karachi Fibre & Yarn', short: 'KF Yarn', country: 'PK', city: 'Faisalabad', tier: 2, type: 'Denim yarn and fabric', lang: 'ur', channel: 'email_gmail', contact: 'Mr Iqbal', score: { otd: 85, quality: 88, compliance: 86, response: 3.9 } },
  { code: 'GJ', name: 'Gujarat Organic Cotton Co-op', short: 'Gujarat co-op', country: 'IN', city: 'Gujarat', tier: 3, type: 'Organic cotton (GOTS, transaction certified)', lang: 'en', channel: 'email_gmail', contact: 'Ms Desai', score: { compliance: 93, response: 6 } },
  { code: 'TX', name: 'West Texas Cotton Ginners', short: 'Texas gin', country: 'US', city: 'Lubbock', tier: 3, type: 'Upland cotton, US Cotton Trust Protocol', lang: 'en', channel: 'email_gmail', contact: 'Mr Hale', score: { compliance: 95, response: 5 } },
  { code: 'XS', name: 'Unverified spinner via Yongli', short: 'Unknown spinner', country: 'CN', city: 'Unknown', tier: 3, type: 'Cotton lint, origin unverified', lang: 'zh', channel: null, contact: null, score: { compliance: 20 }, unverified: true },
  { code: 'RP', name: 'Recycled PET chip (via Nam Dinh)', short: 'rPET', country: 'VN', city: 'Binh Duong', tier: 3, type: 'Recycled polyester chip (GRS)', lang: 'vi', channel: 'email_gmail', contact: 'Ms Lan', score: { compliance: 92, response: 4 } },
] as const;

// brand, factory, mill, fibre, po, style, desc, category, composition, qty, fob, etd (days from today)
export const SAMPLE_LINES: [string, string, string, string, string, string, string, string, string, number, number, number][] = [
  ['NL', 'HX', 'SY', 'XS', '48812', 'SS27-TEE-014', 'Organic jersey tee, 3 colours', 'Tops', '100% cotton jersey 160gsm', 12000, 4.10, 44],
  ['NL', 'HX', 'SY', 'TX', '48813', 'SS27-TEE-015', 'Organic jersey tee, stripe', 'Tops', '100% cotton yarn-dyed stripe', 8400, 4.35, 37],
  ['NL', 'HP', 'NM', 'RP', '48820', 'SS27-SHL-002', '3L shell jacket', 'Outerwear', '100% recycled polyamide 3L', 3200, 38.50, 45],
  ['NL', 'HP', 'NM', 'RP', '48821', 'SS27-SHL-003', '2.5L packable shell', 'Outerwear', '100% recycled polyester 2.5L', 4100, 27.90, 52],
  ['NL', 'DA', 'AM', 'GJ', '48825', 'SS27-FLC-007', 'Grid fleece half-zip', 'Midlayer', '100% recycled polyester grid fleece', 9600, 11.20, 31],
  ['NL', 'DA', 'AM', 'GJ', '48826', 'SS27-FLC-008', 'Grid fleece full-zip', 'Midlayer', '100% recycled polyester grid fleece', 6200, 13.40, 38],
  ['NL', 'HP', 'NM', 'RP', '48830', 'SS27-TRS-011', 'Stretch hiking trouser', 'Bottoms', '88% recycled nylon 12% elastane', 5400, 16.80, 45],
  ['CV', 'TC', 'AM', 'GJ', 'C7201', 'V27-DRS-104', 'Linen midi dress', 'Dresses', '100% linen', 4800, 14.60, 23],
  ['CV', 'TC', 'AM', 'GJ', 'C7202', 'V27-DRS-105', 'Linen mini dress', 'Dresses', '100% linen', 5200, 12.90, 30],
  ['CV', 'JS', 'SY', 'XS', 'C7203', 'V27-BLS-220', 'Silk blouse, print', 'Tops', '100% silk crepe de chine', 2600, 22.40, 51],
  ['CV', 'JS', 'SY', 'XS', 'C7204', 'V27-BLS-221', 'Silk blouse, solid', 'Tops', '100% silk crepe de chine', 3100, 19.80, 44],
  ['CV', 'TC', 'AM', 'GJ', 'C7210', 'V27-SKT-031', 'Cotton poplin skirt', 'Bottoms', '100% organic cotton poplin', 4400, 9.70, 30],
  ['CV', 'TC', 'AM', 'GJ', 'C7211', 'V27-SHT-044', 'Poplin shirt, long sleeve', 'Tops', '100% organic cotton poplin', 6000, 10.40, 37],
  ['CV', 'DA', 'AM', 'GJ', 'C7215', 'V27-KNT-012', 'Cotton rib tank', 'Tops', '95% organic cotton 5% elastane', 7800, 5.20, 44],
  ['CV', 'IZ', 'AM', 'GJ', 'C7220', 'V27-KNT-030', 'Fine-gauge knit polo', 'Tops', '100% organic cotton', 1800, 14.20, 7],
  ['OK', 'NJ', 'SY', 'TX', 'OK-5531', 'OC27-CHN-01', 'Garment-dyed chino', 'Bottoms', '98% cotton 2% elastane twill', 7200, 13.90, 4],
  ['OK', 'NJ', 'SY', 'TX', 'OK-5532', 'OC27-CHN-02', 'Slim chino', 'Bottoms', '98% cotton 2% elastane twill', 6400, 13.50, 38],
  ['OK', 'TC', 'AM', 'TX', 'OK-5540', 'OC27-OXF-10', 'Oxford shirt, button-down', 'Tops', '100% cotton oxford', 9000, 11.80, -6],
  ['OK', 'TC', 'AM', 'TX', 'OK-5541', 'OC27-OXF-11', 'Oxford shirt, stripe', 'Tops', '100% cotton oxford stripe', 5600, 12.30, 44],
  ['OK', 'HX', 'SY', 'XS', 'OK-5550', 'OC27-JKT-05', 'Harrington jacket', 'Outerwear', '100% cotton twill, check lining', 3600, 24.60, 35],
  ['OK', 'DA', 'AM', 'TX', 'OK-5551', 'OC27-SWT-07', 'Crew sweatshirt, 400gsm', 'Tops', '100% cotton loopback', 8800, 9.90, 45],
  ['OK', 'KD', 'KF', 'TX', 'OK-5560', 'OC27-DNM-01', 'Selvedge straight jean', 'Bottoms', '100% cotton 13.5oz selvedge', 4200, 18.70, 51],
  ['OK', 'KD', 'KF', 'TX', 'OK-5561', 'OC27-DNM-02', 'Slim stretch jean', 'Bottoms', '98% cotton 2% elastane 11oz', 6800, 14.90, 58],
  ['KO', 'BR', 'AM', 'GJ', 'K-1101', 'KO27-TEE-01', 'Heavyweight organic tee', 'Tops', '100% organic cotton 220gsm', 3000, 9.80, 16],
  ['KO', 'BR', 'AM', 'GJ', 'K-1102', 'KO27-TEE-02', 'Long-sleeve organic tee', 'Tops', '100% organic cotton 220gsm', 2400, 11.20, 23],
  ['KO', 'TC', 'AM', 'GJ', 'K-1110', 'KO27-SWT-01', 'Organic loopback hoodie', 'Tops', '100% organic cotton loopback', 2800, 17.40, 44],
  ['KO', 'IZ', 'AM', 'GJ', 'K-1120', 'KO27-PNT-01', 'Organic sweatpant', 'Bottoms', '100% organic cotton loopback', 2200, 13.10, 24],
  ['KO', 'TC', 'AM', 'GJ', 'K-1121', 'KO27-SHT-01', 'Organic overshirt', 'Tops', '100% organic cotton twill', 1600, 15.90, 51],
  ['LA', 'BR', 'AM', 'GJ', 'L-2201', 'LA27-BDY-01', 'Baby bodysuit 3-pack', 'Baby', '100% organic cotton interlock', 9000, 6.40, 20],
  ['LA', 'BR', 'AM', 'GJ', 'L-2202', 'LA27-SLP-01', 'Kids sleepsuit', 'Baby', '100% organic cotton interlock', 6000, 7.90, 27],
  ['LA', 'DA', 'AM', 'GJ', 'L-2210', 'LA27-TEE-04', 'Kids graphic tee', 'Kids', '100% organic cotton jersey', 12000, 3.20, 37],
  ['LA', 'DA', 'AM', 'GJ', 'L-2211', 'LA27-SWT-02', 'Kids zip hoodie', 'Kids', '80% organic cotton 20% recycled poly', 7000, 8.60, 44],
  ['LA', 'IZ', 'AM', 'GJ', 'L-2220', 'LA27-DRS-01', 'Girls jersey dress', 'Kids', '100% organic cotton jersey', 3200, 7.20, 24],
  ['LA', 'HP', 'NM', 'RP', 'L-2230', 'LA27-JKT-01', 'Kids rain jacket', 'Outerwear', '100% recycled polyester PU coated', 4500, 14.50, 52],
  ['NL', 'KD', 'KF', 'TX', '48840', 'SS27-DNM-03', 'Climbing jean', 'Bottoms', '98% cotton 2% elastane denim', 3800, 17.20, 66],
  ['NL', 'IZ', 'AM', 'GJ', '48845', 'SS27-TEE-020', 'Merino-blend trail tee', 'Tops', '52% merino 48% Tencel', 2600, 15.80, 20],
  ['CV', 'HX', 'SY', 'XS', 'C7230', 'V27-SHT-060', 'Viscose camp shirt', 'Tops', '100% viscose', 3400, 10.90, 58],
  ['OK', 'NJ', 'SY', 'TX', 'OK-5570', 'OC27-SHT-20', 'Corduroy overshirt', 'Tops', '100% cotton 8-wale cord', 3000, 16.40, 65],
];

// Story overrides: milestone -> expected (days from today) or late (plan passed, nothing reported)
export const SAMPLE_STORY: Record<string, Partial<Record<string, { expected?: number; late?: true }>>> = {
  '48812': { fabric: { expected: 1 } },
  '48830': { fit: { late: true } },
  'C7203': { labdip: { late: true } },
  'OK-5550': { pp: { late: true } },
};

export const POL: Record<string, string> = { CN: 'Yantian', VN: 'Hai Phong', BD: 'Chittagong', IN: 'Tuticorin', PK: 'Karachi', TR: 'Izmir', PT: 'Leixões' };
export const POD: Record<string, string> = { NL: 'Felixstowe', CV: 'Valencia', OK: 'Los Angeles', KO: 'Tokyo', LA: 'Hamburg' };
