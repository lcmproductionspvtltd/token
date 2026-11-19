'use strict';

/**
 * Terms and Conditions and Privacy Policy – one source for the website pages (/terms, /privacy) and
 * the server-made copies search engines read (src/http/seo.js).
 *
 * Each document: title, description (for Google), updated (date shown), intro, and sections of
 * { h: heading, p: [paragraphs], list: [bullet points] }.
 * Have a lawyer review any change; keep "updated" current when the text changes.
 */

const CONTACT = {
  name: 'BQuee',
  phone: '+971 56 570 8076',
  phoneHref: 'tel:+971565708076',
  email: 'info@bquee.com',
  address: 'Compass Building, Al Shohada Road, Al Hamra Industrial Zone-FZ, Ras Al Khaimah, United Arab Emirates',
};

const contactLines = [`Phone: ${CONTACT.phone}`, `Email: ${CONTACT.email}`, `Address: ${CONTACT.address}`];

const terms = {
  path: '/terms',
  title: 'Terms and Conditions',
  description:
    'The terms for using BQuee, the QR token and queue management system for salons, clinics and walk-in businesses.',
  updated: '19 November 2026',
  updatedIso: '2026-11-19', // for the sitemap
  intro: [
    'These Terms and Conditions (the “Terms”) apply to the BQuee website, the BQuee Biz app, the BQuee customer app and the BQuee token booking and queue service (together, the “Service”), provided by BQuee (“BQuee”, “we”, “us”), Compass Building, Al Shohada Road, Al Hamra Industrial Zone-FZ, Ras Al Khaimah, United Arab Emirates.',
    'By creating an account, booking a token or otherwise using the Service, you agree to these Terms. If you do not agree, please do not use the Service.',
  ],
  sections: [
    {
      h: '1. The Service',
      p: [
        'BQuee lets businesses (such as salons, spas, clinics and service centres) take walk-in bookings with QR codes. Customers get a numbered token with an estimated waiting time, and the business’s staff scan the token to start and finish each service. Businesses also get dashboards, reports and a mobile app.',
      ],
    },
    {
      h: '2. Who can use BQuee',
      list: [
        'Business accounts may only be opened by people who are at least 18 years old and allowed to act for the business.',
        'Customers can book tokens without an account. A customer under 18 should book with the help of a parent or guardian.',
        'You must give true and current information and keep it up to date.',
      ],
    },
    {
      h: '3. Accounts and security',
      list: [
        'Keep your password and two-step sign-in codes secret. You are responsible for everything done with your account.',
        'Business owners are responsible for the staff accounts they create and for removing access when a staff member leaves.',
        'Tell us straight away at info@bquee.com if you think someone else is using your account.',
      ],
    },
    {
      h: '4. For businesses',
      list: [
        'You decide your services, prices, staff, offers and opening times, and you are solely responsible for the services you provide to your customers.',
        'You are responsible for the content you add (names, pictures, logos, offers, reviews you publish) and confirm you have the right to use it.',
        'You must use your customers’ information only to serve them, and follow the data protection laws that apply to you.',
        'You may not use BQuee to send spam or for anything unlawful, misleading or harmful.',
      ],
    },
    {
      h: '5. For customers',
      list: [
        'A token is valid only on the day it is booked, at the branch it was booked for.',
        'Waiting times are estimates based on the queue at that moment. The actual time can be shorter or longer.',
        'The business you book with – not BQuee – provides the service, sets its prices and decides how it serves its customers. Questions about a service, price or refund should go to that business.',
      ],
    },
    {
      h: '6. Plans, trials and fees',
      list: [
        'Business plans, prices and what they include are shown on the BQuee website or agreed with you in writing.',
        'A free trial lasts for the period shown when you sign up. At the end of a trial, a paid plan is needed to keep using the Service.',
        'Fees are payable in advance for each billing period and are not refundable for part-used periods, except where the law requires a refund.',
        'Prices exclude taxes such as VAT or GST, which are added where they apply.',
        'We may change prices with at least 30 days’ notice. The new price applies from your next billing period.',
        'If fees are not paid, we may pause the business account after giving notice.',
      ],
    },
    {
      h: '7. Acceptable use',
      p: ['You must not:'],
      list: [
        'break the law or the rights of others through the Service;',
        'try to get into accounts, data or systems that are not yours, or test the Service’s security without our written permission;',
        'copy, resell, reverse engineer or scrape the Service;',
        'upload viruses or harmful code, or overload the Service on purpose;',
        'pretend to be another person or business.',
      ],
    },
    {
      h: '8. Intellectual property',
      p: [
        'BQuee owns the Service, its software, design and brand. We give you a personal, non-transferable right to use the Service while your account is active and you follow these Terms.',
        'Businesses keep ownership of the content they add. You allow us to store, show and process that content only to run the Service for you.',
      ],
    },
    {
      h: '9. Availability and changes',
      p: [
        'We work to keep BQuee available and secure, but we cannot promise it will always be uninterrupted or free of errors. We may need short breaks for maintenance and updates.',
        'We may improve, change or stop features. If a change takes away something important from your paid plan, we will tell you in advance.',
      ],
    },
    {
      h: '10. Ending your use',
      list: [
        'You can stop using BQuee at any time and ask for your account to be closed from your account settings.',
        'We may suspend or close an account that breaks these Terms or puts the Service or other users at risk. Where reasonable, we will tell you first.',
        'When an account is closed, its data is deleted as described in our Privacy Policy.',
      ],
    },
    {
      h: '11. Disclaimer and limitation of liability',
      p: [
        'The Service is provided “as is” and “as available”. To the extent the law allows, we do not give any promise that it will meet every need or produce particular business results.',
        'To the extent the law allows, BQuee is not liable for indirect or consequential loss, lost profits, lost data or lost business, or for the services a business provides to its customers. Our total liability for any claim is limited to the fees you paid us in the 12 months before the claim.',
        'Nothing in these Terms limits liability that cannot be limited by law.',
      ],
    },
    {
      h: '12. Indemnity',
      p: [
        'Businesses agree to cover BQuee against claims caused by their services, their content or their breach of these Terms or the law.',
      ],
    },
    {
      h: '13. Other services',
      p: [
        'BQuee may link to services we do not run, such as WhatsApp, maps or social media. Their own terms and privacy policies apply to them.',
      ],
    },
    {
      h: '14. Law and disputes',
      p: [
        'These Terms are governed by the laws of the United Arab Emirates as applied in the Emirate of Ras Al Khaimah. We will first try to settle any dispute with you in good faith; if that fails, the courts of Ras Al Khaimah have jurisdiction, without taking away any rights you have under the consumer laws of your own country.',
      ],
    },
    {
      h: '15. Changes to these Terms',
      p: [
        'We may update these Terms. The date at the top shows the latest version. For important changes we will tell business owners by email or in the app before they apply. Continuing to use the Service after a change means you accept it.',
      ],
    },
    { h: '16. Contact us', p: contactLines },
  ],
};

const privacy = {
  path: '/privacy',
  title: 'Privacy Policy',
  description:
    'How BQuee collects, uses and protects personal information in its QR token booking and queue management service.',
  updated: '19 November 2026',
  updatedIso: '2026-11-19', // for the sitemap
  intro: [
    'This Privacy Policy explains what personal information BQuee (“BQuee”, “we”, “us”), Compass Building, Al Shohada Road, Al Hamra Industrial Zone-FZ, Ras Al Khaimah, United Arab Emirates, collects when you use the BQuee website, the BQuee Biz app, the BQuee customer app and the token booking service (the “Service”), why we use it and the choices you have.',
    'We follow the UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021) and, where they apply to you, India’s Digital Personal Data Protection Act 2023 and the EU and UK General Data Protection Regulation (GDPR).',
  ],
  sections: [
    {
      h: '1. Information we collect',
      p: ['Business owners, staff and the BQuee team:'],
      list: [
        'name, username, email address and mobile number;',
        'password (stored only as a scrambled “hash” we cannot read) and an encrypted two-step sign-in key;',
        'business details: name, address, phone, opening hours, services, prices, staff names, logos and photos you upload;',
        'support tickets and messages you send us.',
      ],
    },
    {
      h: '',
      p: ['Customers who book a token:'],
      list: [
        'name and mobile number, and email address if you give it;',
        'the business, branch, services, staff member, offer and times of your booking;',
        'with a BQuee customer app account: your name, mobile number, email address and password (stored as a hash).',
      ],
    },
    {
      h: '',
      p: ['Technical information:'],
      list: [
        'your IP address and basic browser or device details, used to keep the Service secure (for example, to stop repeated wrong passwords) and in short-lived server logs;',
        'cookies and similar storage described in section 5.',
      ],
    },
    {
      h: '2. How we use it',
      list: [
        'to run the Service: create accounts, issue tokens, show waiting times, let staff serve customers and produce reports (needed to provide the Service you asked for);',
        'to keep the Service and accounts secure and prevent misuse (our legitimate interest in a safe service);',
        'to answer support requests and send important messages about your account or changes to the Service;',
        'to meet legal obligations, such as tax records and lawful requests from authorities.',
      ],
      p: ['We do not sell personal information, and we do not use it for advertising.'],
    },
    {
      h: '3. Businesses and their customers',
      p: [
        'When you book a token with a business, that business decides how your booking details are used for its service; BQuee stores and processes them on the business’s behalf. The business can see your name and booking details, and your contact details unless it has chosen to hide them from its staff. Please contact the business directly about its own use of your information.',
      ],
    },
    {
      h: '4. Who we share it with',
      list: [
        'the business you book with, as described above;',
        'trusted service providers who host the Service and its database for us (cloud hosting), bound to protect the information and use it only for us;',
        'authorities, when the law requires it or to protect the rights and safety of people or the Service;',
        'a buyer or successor, if BQuee’s business is sold or merged, with the same protections.',
      ],
    },
    {
      h: '5. Cookies and local storage',
      p: [
        'We use only cookies that are needed for the Service to work: a secure session cookie that keeps you signed in and a security cookie that protects your account from forged requests. The website may also save small settings and an offline copy of the app on your device so it loads quickly. We do not use advertising or tracking cookies, and we do not use third-party analytics.',
      ],
    },
    {
      h: '6. How long we keep it',
      list: [
        'Signed-in sessions end on their own: after 12 hours for the BQuee team, 14 days for business owners, 30 days for staff and 90 days in the customer app.',
        'Booking records are kept while the business account is active, so the business can see its history and reports.',
        'When an account is closed at your request, we delete or anonymise its personal information, except what the law requires us to keep. Backup copies are overwritten within about 30 days.',
        'Security logs and sign-in limits are kept only for a short time.',
      ],
    },
    {
      h: '7. Security',
      p: [
        'We protect information with HTTPS encryption, hashed passwords, encrypted two-step sign-in keys, required two-step sign-in for business owners and the BQuee team, strict access rules between businesses, secure storage on phones and regular security testing. No system is completely secure, so please keep your password and codes private.',
      ],
    },
    {
      h: '8. International transfers',
      p: [
        'Our hosting providers may store information in data centres outside your country. When information is transferred, we take steps required by law to keep it protected to the same standard.',
      ],
    },
    {
      h: '9. Your rights',
      p: ['Depending on where you live, you can:'],
      list: [
        'ask for a copy of the personal information we hold about you;',
        'ask us to correct it, or update it yourself in your profile;',
        'ask us to delete it – business and customer app users can request this from their account settings;',
        'object to or ask us to limit some uses, and withdraw any consent you gave;',
        'complain to your data protection authority (for example, the UAE Data Office, India’s Data Protection Board or your EU/UK supervisory authority).',
      ],
    },
    {
      h: '',
      p: [
        'To use these rights, contact us at info@bquee.com. We may need to confirm who you are first. We answer within 30 days.',
      ],
    },
    {
      h: '10. Children',
      p: [
        'BQuee is not made for children to use on their own. Business accounts are for adults only. If you believe a child has given us personal information without a parent’s consent, contact us and we will delete it.',
      ],
    },
    {
      h: '11. Changes to this policy',
      p: [
        'We may update this Privacy Policy. The date at the top shows the latest version, and we will tell business owners about important changes before they apply.',
      ],
    },
    { h: '12. Contact us', p: contactLines },
  ],
};

module.exports = { CONTACT, terms, privacy };
