'use strict';

/**
 * For the store screenshots only (.github/workflows/store-shots.yml): adds three more demo businesses
 * (a clinic, a barbershop and a service centre) with a few people waiting, so the BQuee customer app's
 * Explore screen looks like a real town. Run after scripts/seed.js on a throw-away test database.
 */

const config = require('../src/config');
const { createPool } = require('../src/db/postgres');
const { newId } = require('../src/utils/ids');
const { today } = require('../src/utils/time');

const PLACES = [
  {
    slug: 'care-clinic',
    name: 'CarePlus Family Clinic',
    tagline: 'General physician · Paediatrics',
    category: 'cat-clinic',
    color: '#0f8a7e',
    branch: ['Kaloor', 'C', 'Kaloor Junction, Kochi'],
    services: [
      ['Doctor consultation', 15, 500],
      ['Child check-up', 20, 600],
      ['Blood test', 10, 300],
    ],
    staff: ['Dr. Leena Joseph', 'Dr. Anand Varma'],
    waiting: ['Rohan', 'Meenakshi', 'Thomas', 'Zara', 'Hari'],
  },
  {
    slug: 'kings-barbers',
    name: 'Kings Barbershop',
    tagline: 'Cuts · Shaves · Beard styling',
    category: 'cat-salon',
    color: '#1d4ed8',
    branch: ['Panampilly Nagar', 'K', 'Panampilly Nagar, Kochi'],
    services: [
      ['Haircut', 25, 250],
      ['Beard styling', 15, 150],
      ['Hot towel shave', 20, 200],
    ],
    staff: ['Faizal', 'Vinod'],
    waiting: ['Amal', 'Sajan'],
  },
  {
    slug: 'quickfix-service',
    name: 'QuickFix Mobile Service',
    tagline: 'Phone & laptop repairs',
    category: 'cat-service',
    color: '#c2410c',
    branch: ['Edappally', 'Q', 'Edappally, Kochi'],
    services: [
      ['Screen replacement', 40, 2500],
      ['Battery change', 30, 1500],
      ['Check-up', 15, 0],
    ],
    staff: ['Nikhil'],
    waiting: ['Deepa', 'Ajay', 'Sneha'],
  },
];

(async () => {
  const db = createPool({ connectionString: config.databaseUrl, max: 2 });
  const date = today();
  const plusYear = new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10);
  try {
    await db.transaction(async (tx) => {
      for (const p of PLACES) {
        const salonId = newId(5);
        const branchId = newId(5);
        await tx.query(
          `INSERT INTO salons (id, slug, name, tagline, about, hours, phone, address, brand_color, plan_name, plan_amount, expires_on, category_id)
           VALUES ($1, $2, $3, $4, $5, 'Mon–Sat · 9:00 AM – 8:00 PM', '+91 98470 00000', $6, $7, 'Pro (yearly)', 9999, $8, $9)`,
          [
            salonId,
            p.slug,
            p.name,
            p.tagline,
            `${p.name} – take a token and wait anywhere.`,
            p.branch[2],
            p.color,
            plusYear,
            p.category,
          ],
        );
        await tx.query(
          `INSERT INTO branches (id, salon_id, name, token_prefix, address, phone) VALUES ($1, $2, $3, $4, $5, '+91 98470 00000')`,
          [branchId, salonId, p.branch[0], p.branch[1], p.branch[2]],
        );
        const services = [];
        for (const [name, duration, price] of p.services) {
          const id = newId(5);
          services.push({ id, name, duration, price });
          await tx.query(
            `INSERT INTO services (id, salon_id, name, category, description, duration_min, price) VALUES ($1, $2, $3, '', '', $4, $5)`,
            [id, salonId, name, duration, price],
          );
        }
        const staff = [];
        for (const name of p.staff) {
          const id = newId(5);
          staff.push({ id, name });
          await tx.query(
            `INSERT INTO staff (id, salon_id, branch_id, name, title, mobile) VALUES ($1, $2, $3, $4, '', '')`,
            [id, salonId, branchId, name],
          );
          for (const s of services)
            await tx.query('INSERT INTO staff_services (staff_id, service_id) VALUES ($1, $2)', [id, s.id]);
        }
        for (const [i, name] of p.waiting.entries()) {
          const tokenId = newId(6);
          const s = services[i % services.length];
          const st = staff[i % staff.length];
          await tx.query(
            `INSERT INTO tokens (id, salon_id, branch_id, token_date, number, prefix, customer_name, customer_mobile, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, '9800000100', 'waiting', now() - make_interval(mins => $8))`,
            [tokenId, salonId, branchId, date, i + 1, p.branch[1], name, 40 - i * 5],
          );
          await tx.query(
            `INSERT INTO token_items (token_id, position, service_id, service_name, staff_id, staff_name, duration_min, price, status)
             VALUES ($1, 0, $2, $3, $4, $5, $6, $7, 'waiting')`,
            [tokenId, s.id, s.name, st.id, st.name, s.duration, s.price],
          );
        }
        await tx.query('INSERT INTO token_counters (branch_id, token_date, last_number) VALUES ($1, $2, $3)', [
          branchId,
          date,
          p.waiting.length,
        ]);
      }
    });
    console.log('More demo businesses:', PLACES.map((p) => p.name).join(', '));
  } finally {
    await db.end();
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
