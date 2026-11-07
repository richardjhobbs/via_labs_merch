# Compliance coverage: what lands on a merchandising desk, and how VIA Merch carries it

Founder brief, 7 November 2026: beyond bank and fund ESG covenants, cover every compliance requirement that can reach a merch operator (factory, buying office, trading company, brand), with one generic, scalable system. Regulatory status and sources: `docs/compliance-landscape.md` (researched the same day, with confidence flags).

## One model, three settings

Everything is a **programme** (who set it: bank, fund, customer, certifier, auditor, authority, industry scheme, ourselves) holding **requirements**. A requirement has an owner (role or person), the evidence that proves it, how it is reported (figure, yes or no, document, statement), an optional severity, and three settings:

| Setting | Values | Covers |
|---|---|---|
| Trigger | `schedule` (monthly to annual, or once by a deadline) | ESG KPIs, questionnaires, monitoring reports, corrective actions with a deadline |
| | `per_order` (each matching open PO, N days before or after a milestone forecast, kept in step as the forecast moves) | Test reports before final QC, label checks at PP, traceability packs before ETD, transaction certificates after ETD, CPSC certificate data per shipment |
| | `expiry` (from the expiry date of the last accepted certificate, reminded up to a year ahead) | Certificates, licences, permits, audits valid for a period |
| Applies to | `company` | What we report ourselves |
| | `suppliers` (every supplier matching kinds, tiers, countries) | A code of conduct cascaded to tier 1 and 2; certificates collected from every mill; a buying office collecting factory audits |
| Filters | supplier filter `{kinds, tiers, countries}`; order filter `{customers, factory countries, category text}` | A brand's rules only on its orders; children's product rules only on kids orders; EU rules only on EU customers' orders |

A customer programme's per-order rules apply to that customer's orders by default. Tasks are generated ahead (120 days, or the renewal lead), reminded by email at the lead time, a week out and the day before, and suppliers who hold the evidence get a gated request from the agent.

## Scenarios

| Scenario | Who sets it | How it is modelled | Template |
|---|---|---|---|
| Bank or fund ESG covenants, sustainability-linked loan KPIs | Bank, passed down from a DFI | `loan`; schedule, quarterly to annual | Bank or fund ESG covenants |
| Brand code of conduct, supplier manual | Brand or retailer | `customer`; annual acceptance; cascade to suppliers; audit on expiry | Brand code of conduct |
| Restricted substances and product testing | Brand | `customer`; per order before final QC; mill chemical inventory fanned out | Brand RSL and testing |
| Supply chain mapping and traceability | Brand | annual map; per order origin documents | Supply chain mapping |
| Social audits: amfori BSCI, SMETA, WRAP, SLCP, Higg, Better Work | Scheme or brand | `audit` or `industry`; expiry or annual; a factory does it, an office collects it from each factory | One per scheme |
| Audit findings and corrective action plans | Auditor | Upload the report: each finding becomes a once requirement with deadline and severity | Read a document |
| Building and fire safety (RSC, Pakistan Accord) | Brands and unions | `industry`; quarterly remediation progress | Building and fire safety |
| Certifications: OEKO-TEX, GOTS, GRS, RCS, OCS, RWS, Better Cotton | Standard owner | `certification`; expiry for scope certificates (own and suppliers'); per order transaction certificates | One per standard |
| ZDHC wastewater and chemicals | ZDHC and brands | `industry`; semiannual wastewater, monthly InCheck, fanned out to wet processors | ZDHC |
| Selling into the EU: REACH, GPSR, textile labelling, forced labour | EU | `regulation`; per order tests and label checks; semiannual SVHC check | Selling into the EU |
| Selling into the US: UFLPA, CPSIA, Prop 65, FTC labels, CPSC eFiling | US | `regulation`; per order before ETD or final QC; category filter for children's products | Selling into the US |
| Customer due diligence and sustainability data (CSDDD, CSRD, LkSG) | Large customers | annual questionnaire and risk review | Customer due diligence |
| UK Modern Slavery Act statement | UK | annual statement | UK Modern Slavery Act |
| Factory licences and permits (Bangladesh, and any country) | Local authorities | `licence`; expiry per licence, monthly ETP records | Bangladesh licences; Site licences |
| Internal policies (HR, anti-bribery, environmental policy reviews) | Ourselves | `internal`; schedule | Add by hand |

## Partners, destination, evidence reading (added 7 November 2026)

- **Partners.** An owner or manager invites people at a customer or supplier from that party's page (role `partner`, scoped to the party; migration 0011). They sign in to a portal that shows only the compliance tasks for their company and the programmes their company set, with approved reports. They supply figures, documents and certificates themselves; the submission is checked by the compliance lead like any other. The database enforces the scope: `merch.my_tenants()` excludes partners, so every member policy shuts them out, and `partner_task_ok()` opens only their records. They also get reminder emails for what their company owes.
- **Destination.** Orders carry a destination country (import column `Destination`, the buyer's country on a document, editable on the order). Market rules filter by it: the EU template applies to EU and EEA destinations, the US template to US ones.
- **Reading evidence.** On a task, upload a bill, meter log, test report, certificate or licence; the agent reads the figure and validity dates into the form, flags mismatches, and the file is attached as evidence. The person checks and submits.
- **Templates in six languages**, added in the reader's language.
- **Ledger guard.** `ledger_append` accepts only members of the company (or a support grant), with the actor id equal to the caller.

## Not covered yet

- Tariffs, duties and customs valuation: out of scope.
- Partners reading evidence with the agent: the portal takes uploads; reading values from them is for the company's own team.
