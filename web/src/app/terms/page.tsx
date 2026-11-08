// Terms of service for VIA Merch. A company's signed agreement with VIA Labs takes precedence where the
// two differ. Draft for legal review before Google verification is submitted.
import type { Metadata } from 'next';
import { LegalPage, type LegalSection } from '@/components/legal-page';

export const metadata: Metadata = { title: 'Terms of service · VIA Merch' };
const UPDATED = '8 November 2026';

const S: LegalSection[] = [
  { h: 'About these terms', p: [
    'These terms govern the use of VIA Merch (merch.getvia.xyz), provided by VIA Labs Pte. Ltd., Singapore ("VIA Labs", "we", "us"), by a company that has an account ("the customer") and by the people it invites ("users"). If the customer has a signed agreement with VIA Labs, that agreement takes precedence over these terms where the two differ. By signing in, you agree to these terms on your own behalf and, where you set up the account, on behalf of the customer.',
  ] },
  { h: 'The service', p: [
    'VIA Merch gives a merchandising team an AI agent that reads order communication from the channels the customer connects, keeps order and compliance records, and drafts messages and reports. We may improve and change the service; we will not remove a core feature the customer relies on without reasonable notice.',
  ] },
  { h: 'Accounts and access', p: [
    'Access is by invitation. The customer decides who is invited and with which role, and is responsible for its users\' use of the service. Users must keep access to their work email secure, since sign-in codes are sent there, and must tell us at contact@getvia.xyz if they believe an account has been misused.',
  ] },
  { h: 'Agent drafts and approvals', p: [
    'The agent prepares drafts; it does not make commercial decisions. A person approves each draft before it is sent, except routine message types that the customer has chosen to let the agent send itself. Prices, claims and order confirmations always require a person.',
    'The agent can be wrong. The customer is responsible for checking drafts, dates, figures and reports before approving them, and for the messages and decisions it approves. Every approval is recorded in the customer\'s ledger.',
  ] },
  { h: 'Connected accounts and third-party services', p: [
    'When a user connects a mailbox or another service (such as Gmail, Microsoft 365 or a PLM or ERP system), the user confirms they are allowed to do so and authorises VIA Merch to read and send through it as described in our Privacy Policy. Those services are provided by third parties under their own terms, and we are not responsible for their availability or changes. A user can disconnect at any time.',
  ] },
  { h: 'Customer data', p: [
    'The customer owns its data: the records, documents and messages it and its users put into VIA Merch or connect to it. The customer gives VIA Labs the right to process that data only to provide, secure and support the service for the customer. We do not sell customer data and we do not use it to train AI models. How we handle personal data is set out in our Privacy Policy (merch.getvia.xyz/privacy), and how we keep customers apart and limit our own staff\'s access is set out on our Trust page (merch.getvia.xyz/trust).',
    'The customer is responsible for having the right to put its data into the service, including personal data of its contacts at customers and suppliers.',
  ] },
  { h: 'Acceptable use', p: [
    'Users must not: use the service to send spam, mislead recipients or break the law; upload malware or try to access another customer\'s data; probe, overload or bypass the security of the service; use it to change payment details without the checks the service requires; or resell the service without our written agreement.',
  ] },
  { h: 'Fees', p: [
    'Fees, add-ons and payment terms are as agreed in the customer\'s order or agreement. Trials and pilots are provided on the terms stated when they are offered.',
  ] },
  { h: 'Confidentiality', p: [
    'Each party will keep the other\'s confidential information confidential and use it only for the purpose of this relationship, except where disclosure is required by law.',
  ] },
  { h: 'Warranties and liability', p: [
    'We provide the service with reasonable skill and care. Apart from that, and to the extent the law allows, the service is provided "as is", and we do not promise that it will be uninterrupted or error-free or that agent output will be accurate.',
    'To the extent the law allows, neither party is liable for indirect or consequential loss, or for loss of profit, revenue or goodwill, and each party\'s total liability under these terms is limited to the fees paid by the customer in the 12 months before the claim. Nothing in these terms limits liability that cannot be limited by law.',
  ] },
  { h: 'Suspension and ending', p: [
    'The customer can stop using the service at any time, subject to its agreement. We may suspend access if the service is being misused or to protect its security, and will tell the customer promptly. When an account ends, we delete the customer\'s data as described in our Privacy Policy; the customer can ask for an export of its records before then.',
  ] },
  { h: 'Changes to these terms', p: [
    'We may update these terms. We will change the date at the top and, for material changes, tell customers before they take effect. Continued use after that means the updated terms apply.',
  ] },
  { h: 'Law and disputes', p: [
    'These terms are governed by the laws of Singapore, and the courts of Singapore have jurisdiction over any dispute arising from them.',
  ] },
];

export default function Terms() { return <LegalPage kind="terms" updated={UPDATED} sections={S} />; }
