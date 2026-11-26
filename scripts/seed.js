'use strict';

/**
 * Loads demo data: one test login per role and one sample salon.
 *
 *   node scripts/seed.js           # only into an empty database
 *   node scripts/seed.js --force   # wipes ALL data first
 *
 * Test logins (change or delete them before going live):
 *   Super admin   admin  / Admin@123
 *   Salon owner   owner  / Owner@123
 *   Staff         staff  / Staff@123
 */

const config = require('../src/config');
const { createPool } = require('../src/db/postgres');
const { migrate } = require('../src/db/migrate');
const { hashPassword } = require('../src/services/auth');
const { newId } = require('../src/utils/ids');
const { today } = require('../src/utils/time');

const TEST_USERS = {
  admin: { username: 'admin', email: 'admin@bquee.test', password: 'Admin@123', name: 'Super Admin' },
  owner: { username: 'owner', email: 'owner@lotus.test', password: 'Owner@123', name: 'Meera Nair' },
  staff: { username: 'staff', email: 'staff@lotus.test', password: 'Staff@123' },
};

const SALON = {
  id: newId(5),
  slug: 'lotus-salon',
  name: 'Lotus Salon & Spa',
  tagline: 'Hair · Beauty · Spa',
  about: 'A calm, friendly salon for hair, skin and spa care. Book in seconds and relax – we will call your token.',
  hours: 'Mon–Sun · 9:00 AM – 9:00 PM',
  phone: '+91 98765 43210',
  whatsapp: '919876543210',
  instagram: 'lotussalon',
  email: 'hello@lotus.test',
  address: '12 MG Road, Kochi',
};

const SERVICES = [
  ['Hair', 'Haircut & Style', 'Wash, cut and blow-dry', 30, 400],
  ['Hair', 'Beard Trim', 'Shape, trim and hot towel', 15, 150],
  ['Hair', 'Hair Colour', 'Global colour with conditioning', 90, 1800],
  ['Beauty', 'Classic Facial', 'Deep cleanse and glow', 45, 900],
  ['Beauty', 'Threading', 'Eyebrows and upper lip', 10, 80],
  ['Spa', 'Head Massage', 'Warm oil, 20 minutes', 20, 350],
  ['Spa', 'Full Body Massage', 'Swedish relaxation massage', 60, 2200],
  ['Nails', 'Manicure', 'Shape, cuticle care and polish', 30, 500],
];

// [name, title, service names, has login]
const STAFF = [
  ['Ravi Kumar', 'Senior Stylist', ['Haircut & Style', 'Beard Trim', 'Hair Colour', 'Head Massage'], true],
  ['Anjali Menon', 'Beauty Expert', ['Classic Facial', 'Threading', 'Manicure', 'Haircut & Style'], false],
  ['Suresh Babu', 'Spa Therapist', ['Head Massage', 'Full Body Massage', 'Beard Trim'], false],
];

const OFFERS = [
  ['Weekday Glow', '20% OFF', 'Facials at 20% off, Monday to Thursday.', 'GLOW20', 0],
  ['First Visit', 'NEW', 'Free head massage with any haircut on your first visit.', 'WELCOME', 1],
  ['Bridal Package', 'PACKAGE', 'Hair, makeup and spa for the big day – ask at the desk.', '', 3],
];

const TESTIMONIALS = [
  ['Divya S.', 'Regular client', 'Scanned the QR, picked my stylist and walked in exactly on time. Loved it!', 5],
  ['Arjun P.', 'Haircut', 'No more waiting around. The live waiting time is spot on.', 5],
  ['Fathima R.', 'Facial', 'Very relaxing facial and the token on my phone made it so easy.', 4],
];

async function seed(db) {
  const date = today();
  const plusYear = new Date();
  plusYear.setFullYear(plusYear.getFullYear() + 1);
  const expiresOn = plusYear.toISOString().slice(0, 10);

  let createdAdmin = false;
  await db.transaction(async (tx) => {
    const { admin, owner, staff } = TEST_USERS;

    const { rows: existingAdmin } = await tx.query("SELECT id FROM users WHERE role = 'superadmin' LIMIT 1");
    if (!existingAdmin.length) {
      await tx.query(
        `INSERT INTO users (id, role, username, email, name, password_hash) VALUES ($1, 'superadmin', $2, $3, $4, $5)`,
        [newId(8), admin.username, admin.email, admin.name, await hashPassword(admin.password)],
      );
      createdAdmin = true;
    }

    await tx.query(
      `INSERT INTO salons (id, slug, name, tagline, about, hours, phone, whatsapp, instagram, email, address,
                           owner_name, owner_mobile, owner_email, plan_name, plan_amount, expires_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'Pro (yearly)', 9999, $15)`,
      [
        SALON.id,
        SALON.slug,
        SALON.name,
        SALON.tagline,
        SALON.about,
        SALON.hours,
        SALON.phone,
        SALON.whatsapp,
        SALON.instagram,
        SALON.email,
        SALON.address,
        owner.name,
        SALON.phone,
        owner.email,
        expiresOn,
      ],
    );
    // Demo logo, served from public/img (owners replace it in Salon profile).
    await tx.query(`UPDATE salons SET logo_url = '/img/lotus-logo.svg' WHERE id = $1`, [SALON.id]);
    await tx.query(
      `UPDATE salons SET category_id = 'cat-salon' WHERE id = $1 AND EXISTS (SELECT 1 FROM business_categories WHERE id = 'cat-salon')`,
      [SALON.id],
    );
    await tx.query(
      `INSERT INTO users (id, role, username, email, name, password_hash, salon_id) VALUES ($1, 'owner', $2, $3, $4, $5, $6)`,
      [newId(8), owner.username, owner.email, owner.name, await hashPassword(owner.password), SALON.id],
    );

    const branchId = newId(5);
    await tx.query(
      `INSERT INTO branches (id, salon_id, name, token_prefix, address, phone) VALUES ($1, $2, 'MG Road', 'A', $3, $4)`,
      [branchId, SALON.id, SALON.address, SALON.phone],
    );

    const serviceIds = {};
    for (const [category, name, description, duration, price] of SERVICES) {
      serviceIds[name] = newId(5);
      await tx.query(
        `INSERT INTO services (id, salon_id, name, category, description, duration_min, price) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [serviceIds[name], SALON.id, name, category, description, duration, price],
      );
    }

    const staffIds = [];
    for (const [name, title, services, hasLogin] of STAFF) {
      const id = newId(5);
      staffIds.push({ id, name, services });
      await tx.query(
        `INSERT INTO staff (id, salon_id, branch_id, name, title, mobile) VALUES ($1, $2, $3, $4, $5, '')`,
        [id, SALON.id, branchId, name, title],
      );
      for (const s of services)
        await tx.query('INSERT INTO staff_services (staff_id, service_id) VALUES ($1, $2)', [id, serviceIds[s]]);
      if (hasLogin) {
        await tx.query(
          `INSERT INTO users (id, role, username, email, name, password_hash, salon_id, staff_id)
           VALUES ($1, 'staff', $2, $3, $4, $5, $6, $7)`,
          [newId(8), staff.username, staff.email, name, await hashPassword(staff.password), SALON.id, id],
        );
      }
    }

    for (const [title, badge, description, code, theme] of OFFERS) {
      await tx.query(
        `INSERT INTO offers (id, salon_id, title, badge, description, promo_code, theme) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [newId(5), SALON.id, title, badge, description, code, theme],
      );
    }
    for (const [clientName, label, quote, rating] of TESTIMONIALS) {
      await tx.query(
        `INSERT INTO testimonials (id, salon_id, client_name, label, quote, rating) VALUES ($1, $2, $3, $4, $5, $6)`,
        [newId(5), SALON.id, clientName, label, quote, rating],
      );
    }

    // Today's queue: one customer finished, one in the chair, two waiting.
    const customers = [
      ['Divya', '9800000001', 'Haircut & Style', 0, 'done'],
      ['Arjun', '9800000002', 'Beard Trim', 0, 'in_progress'],
      ['Fathima', '9800000003', 'Classic Facial', 1, 'waiting'],
      ['Kiran', '9800000004', 'Haircut & Style', 0, 'waiting'],
    ];
    for (const [index, [name, mobile, serviceName, staffIndex, itemStatus]] of customers.entries()) {
      const number = index + 1;
      const tokenId = newId(6);
      const minutesAgo = 60 - index * 12;
      const tokenStatus = itemStatus === 'done' ? 'done' : itemStatus === 'in_progress' ? 'serving' : 'waiting';
      const svc = SERVICES.find((s) => s[1] === serviceName);
      await tx.query(
        `INSERT INTO tokens (id, salon_id, branch_id, token_date, number, prefix, customer_name, customer_mobile, status, created_at, finished_at)
         VALUES ($1, $2, $3, $4, $5, 'A', $6, $7, $8, now() - make_interval(mins => $9),
                 CASE WHEN $8 = 'done' THEN now() - make_interval(mins => 15) END)`,
        [tokenId, SALON.id, branchId, date, number, name, mobile, tokenStatus, minutesAgo],
      );
      await tx.query(
        `INSERT INTO token_items (token_id, position, service_id, service_name, staff_id, staff_name, duration_min, price, status, started_at, ended_at)
         VALUES ($1, 0, $2, $3, $4, $5, $6, $7, $8,
                 CASE WHEN $8 IN ('in_progress', 'done') THEN now() - make_interval(mins => $9 - 5) END,
                 CASE WHEN $8 = 'done' THEN now() - make_interval(mins => 15) END)`,
        [
          tokenId,
          serviceIds[serviceName],
          serviceName,
          staffIds[staffIndex].id,
          staffIds[staffIndex].name,
          svc[3],
          svc[4],
          itemStatus,
          itemStatus === 'in_progress' ? 10 : minutesAgo,
        ],
      );
    }
    await tx.query('INSERT INTO token_counters (branch_id, token_date, last_number) VALUES ($1, $2, $3)', [
      branchId,
      date,
      customers.length,
    ]);
  });

  const {
    rows: [branch],
  } = await db.query('SELECT id FROM branches WHERE salon_id = $1', [SALON.id]);
  return { branchId: branch.id, createdAdmin };
}

async function main() {
  const force = process.argv.includes('--force');
  const db = createPool({ connectionString: config.databaseUrl, max: 2 });
  try {
    await migrate(db);
    const {
      rows: [{ count }],
    } = await db.query('SELECT count(*)::int AS count FROM salons');
    if (count && !force) {
      console.log('The database already has data. Run with --force to wipe it and load the demo data.');
      return;
    }
    if (force) {
      await db.exec('TRUNCATE salons, users, sessions, images RESTART IDENTITY CASCADE');
      console.log('Existing data removed.');
    }

    const { branchId, createdAdmin } = await seed(db);
    console.log('\nDemo data loaded.\n');
    console.log(
      createdAdmin ? '  Super admin   admin / Admin@123   →  /login' : '  Super admin   (existing account kept)',
    );
    console.log('  Salon owner   owner / Owner@123   →  /login');
    console.log('  Staff         staff / Staff@123   →  /login');
    console.log(`\n  Customer page (branch QR):  /b/${branchId}`);
    console.log(`  Salon page:                 /s/${SALON.slug}\n`);
  } finally {
    await db.end();
  }
}

/** Loads the demo salon into an empty database (used by server.js when SEED_DEMO_DATA=1). */
async function seedIfEmpty(db, log = console.log) {
  const { rows } = await db.query('SELECT count(*)::int AS count FROM salons');
  if (rows[0].count) return false;
  const { branchId } = await seed(db);
  log(`Demo salon loaded: /b/${branchId} – owner / Owner@123, staff / Staff@123`);
  return true;
}

module.exports = { seedIfEmpty };

if (require.main === module) {
  main().catch((err) => {
    console.error('Seeding failed:', err.message);
    process.exit(1);
  });
}
