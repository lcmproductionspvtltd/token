# BQuee – search engine optimisation (SEO)

How the home page is set up to be found on Google for token, queue and salon searches in the UAE, the
GCC, Kerala, the rest of India and Europe, and what still has to be done outside the code.

## 1. Keywords the home page targets

Chosen from what competitors rank for and what people search in these markets (Nov 2026).

| Group                  | Keywords                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Main                   | digital token system, queue management system, token system, QR token, QR code queue, virtual queue, online token booking, live waiting time                                                                                   |
| Replacing hardware     | paper token, token machine, token dispenser, token display system, token printer, take-a-number alternative, paperless queue                                                                                                   |
| Salons and walk-ins    | salon queue management, salon token system, salon waitlist app, barbershop, beauty parlour, spa, walk-in queue                                                                                                                 |
| Other businesses       | clinic token system, hospital OPD token, patient queue, service centre, repair shop                                                                                                                                            |
| Problems people search | long queues, crowded waiting room, customers walk away, how long is the wait, stop crowding at reception                                                                                                                       |
| Places                 | UAE (Dubai, Abu Dhabi, Sharjah, Ajman, Ras Al Khaimah, Fujairah, Umm Al Quwain, Al Ain), Saudi Arabia, Qatar, Kuwait, Bahrain, Oman, Kerala (Kochi, Thiruvananthapuram, Kozhikode, Thrissur…), India, Europe (London, Dublin…) |

Where they appear: the Google title and description, the heading (H1), the “Replace paper tokens and token
machines” section, features, business types, the “Locations” section and the FAQ. All of it is
editable in **Website → Google & locations** (and the other editor pages), on the web and in the Biz app.

Keep it natural: write for people first. Don't repeat keywords or add lists of city names elsewhere –
Google treats that as spam.

## 2. Technical SEO (built in)

| What                                                                                                                                        | Where                            |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Server-made home page: title, description, canonical link and the full page text in the HTML, so Google reads it without running JavaScript | `src/http/seo.js`                |
| Structured data: Organization, WebSite, SoftwareApplication (with prices from the pricing plans, areas served from Locations) and FAQPage   | `seo.js → homeData`              |
| Link previews for WhatsApp, LinkedIn, X, Facebook (Open Graph + Twitter card, 1200×630 image)                                               | `public/img/og-image.png`        |
| Each business page `/s/<slug>` gets its own title, description, canonical link and LocalBusiness data                                       | `seo.js → business`              |
| Dashboards, sign-in, tokens and branch booking pages: `noindex`                                                                             | `seo.js → PRIVATE_PAGES`         |
| Unknown addresses answer HTTP 404 (no “soft 404”)                                                                                           | `seo.js → notFound`              |
| `/robots.txt` and `/sitemap.xml` (home, Terms, Privacy + every live business page)                                                          | `seo.js`                         |
| Terms and Conditions (`/terms`) and Privacy Policy (`/privacy`): indexable, full text in the HTML, linked in the footer                     | `src/content/legal.js`           |
| Fast pages: compressed (brotli/gzip), cached files, small images                                                                            | `compress.js`, `static-files.js` |
| Mobile friendly, HTTPS, one H1, logical H2/H3 order                                                                                         | home page                        |

Set `PUBLIC_URL` to the final address (e.g. `https://bquee.com`) so canonical links and the sitemap use it.

## 3. After each deploy

1. Open `/` with “View page source” – the title, description and text should be there.
2. Test with Google’s **Rich Results Test** (FAQ, software) and the **Schema Markup Validator**.
3. Share the link in WhatsApp – the preview card should show the purple image.

## 4. Off-page SEO (outside the code – a checklist)

**Must do first**

- [ ] Use your own domain (e.g. `bquee.com`, or `bquee.ae` / `bquee.in` pointing to it) and set `PUBLIC_URL`.
- [ ] **Google Search Console**: add the domain, submit `https://<domain>/sitemap.xml`, request indexing of the home page.
- [ ] **Bing Webmaster Tools**: import from Search Console (also feeds ChatGPT/Copilot search).
- [ ] **Google Business Profile** for your office (Kerala and/or UAE address) – category “Software company”.

**Listings (backlinks from trusted sites)**

- [ ] Software directories: Capterra, GetApp, Software Advice, G2, SourceForge, Slashdot, AlternativeTo, Product Hunt, SaaSHub.
- [ ] Gulf: Yellow Pages UAE, Dubizzle (business services), Connect.ae, Qatar/Saudi business directories.
- [ ] India / Kerala: JustDial, IndiaMART, Sulekha, TradeIndia, Kerala Startup Mission listing (if eligible).
- [ ] Europe: Yell (UK), Trustpilot profile.

**Content and social**

- [ ] YouTube: a 1–2 minute demo (“How a salon replaces paper tokens with QR tokens”) linking to the site.
- [ ] LinkedIn company page, Instagram and Facebook pages linking to the site; add them to the contact details.
- [ ] Guest posts or interviews with salon/clinic associations and local business blogs in the UAE and Kerala.
- [ ] Ask real customers for Google reviews and testimonials (never invent reviews).
- [ ] Later: short guides on the site (e.g. “Token system for clinics in Kochi”) – one useful page per topic and city.

**Measure**

- [ ] Watch Search Console → Performance monthly: which searches show BQuee, in which countries, and the click rate.
