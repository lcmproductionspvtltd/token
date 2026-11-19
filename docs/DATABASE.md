# BQuee database

Generated from the live schema by `scripts/db-doc.js`. PostgreSQL; ids are random text keys.

27 tables · 39 foreign keys · 34 value rules · 82 indexes

## account_requests

| Column | Type | Required | Default |
|---|---|---|---|
| id | text | yes |  |
| kind | text | yes |  |
| status | text | yes | 'pending'::text |
| role | text | yes |  |
| user_id | text |  |  |
| customer_id | text |  |  |
| salon_id | text |  |  |
| name | text | yes | ''::text |
| email | text | yes | ''::text |
| mobile | text | yes | ''::text |
| business_name | text | yes | ''::text |
| reason | text | yes |  |
| details | text | yes | ''::text |
| admin_note | text | yes | ''::text |
| handled_by | text |  |  |
| handled_by_name | text | yes | ''::text |
| created_at | timestamp with time zone | yes | now() |
| handled_at | timestamp with time zone |  |  |

Keys and rules:

- Rule: `CHECK (((user_id IS NULL) OR (customer_id IS NULL)))`
- Rule: `CHECK ((kind = ANY (ARRAY['deactivate'::text, 'delete'::text])))`
- Rule: `CHECK ((reason = ANY (ARRAY['not_using'::text, 'privacy'::text, 'other_app'::text, 'business_closed'::text, 'left_job'::text, 'too_expensive'::text, 'other'::text])))`
- Rule: `CHECK ((role = ANY (ARRAY['customer'::text, 'owner'::text, 'staff'::text, 'platform_staff'::text])))`
- Rule: `CHECK ((status = ANY (ARRAY['pending'::text, 'done'::text, 'rejected'::text, 'cancelled'::text])))`
- Links to: `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL`
- Links to: `FOREIGN KEY (handled_by) REFERENCES users(id) ON DELETE SET NULL`
- Links to: `FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE SET NULL`
- Links to: `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL`
- Primary key: `PRIMARY KEY (id)`

Indexes: `(customer_id)`, `(handled_by)`, `(salon_id)`, `(status, created_at DESC)`, `(user_id)`, `UNIQUE (customer_id) WHERE ((status = 'pending'::text) AND (customer_id IS NOT NULL))`, `UNIQUE (user_id) WHERE ((status = 'pending'::text) AND (user_id IS NOT NULL))`, `UNIQUE (id)`

## branches

| Column | Type | Required | Default |
|---|---|---|---|
| id | text | yes |  |
| salon_id | text | yes |  |
| name | text | yes |  |
| token_prefix | text | yes | ''::text |
| address | text | yes | ''::text |
| phone | text | yes | ''::text |
| is_active | boolean | yes | true |
| created_at | timestamp with time zone | yes | now() |

Keys and rules:

- Links to: `FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE`
- Primary key: `PRIMARY KEY (id)`

Indexes: `(salon_id)`, `UNIQUE (id)`

## business_categories

| Column | Type | Required | Default |
|---|---|---|---|
| id | text | yes |  |
| name | text | yes |  |
| icon | text | yes | 'store'::text |
| color | text | yes | '#7b2c9e'::text |
| created_at | timestamp with time zone | yes | now() |

Keys and rules:

- Primary key: `PRIMARY KEY (id)`
- Unique: `UNIQUE (name)`

Indexes: `UNIQUE (name)`, `UNIQUE (id)`

## customer_sessions

| Column | Type | Required | Default |
|---|---|---|---|
| token | text | yes |  |
| customer_id | text | yes |  |
| expires_at | timestamp with time zone | yes |  |
| created_at | timestamp with time zone | yes | now() |

Keys and rules:

- Links to: `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE`
- Primary key: `PRIMARY KEY (token)`

Indexes: `(customer_id)`, `UNIQUE (token)`

## customers

| Column | Type | Required | Default |
|---|---|---|---|
| id | text | yes |  |
| name | text | yes |  |
| email | text | yes | ''::text |
| mobile | text | yes |  |
| password_hash | text | yes |  |
| photo_url | text | yes | ''::text |
| is_active | boolean | yes | true |
| created_at | timestamp with time zone | yes | now() |
| last_seen_at | timestamp with time zone |  |  |

Keys and rules:

- Primary key: `PRIMARY KEY (id)`

Indexes: `UNIQUE (email) WHERE (email <> ''::text)`, `UNIQUE (mobile)`, `UNIQUE (id)`

## default_services

| Column | Type | Required | Default |
|---|---|---|---|
| id | text | yes |  |
| name | text | yes |  |
| category | text | yes | ''::text |
| description | text | yes | ''::text |
| duration_min | integer | yes |  |
| price | numeric | yes | 0 |
| image_url | text | yes | ''::text |
| created_at | timestamp with time zone | yes | now() |
| category_id | text |  |  |

Keys and rules:

- Rule: `CHECK (((duration_min >= 1) AND (duration_min <= 600)))`
- Rule: `CHECK ((price >= (0)::numeric))`
- Links to: `FOREIGN KEY (category_id) REFERENCES business_categories(id) ON DELETE SET NULL`
- Primary key: `PRIMARY KEY (id)`

Indexes: `(category_id)`, `UNIQUE (id)`

## images

| Column | Type | Required | Default |
|---|---|---|---|
| name | text | yes |  |
| mime_type | text | yes |  |
| data_base64 | text | yes |  |
| created_at | timestamp with time zone | yes | now() |

Keys and rules:

- Primary key: `PRIMARY KEY (name)`

Indexes: `UNIQUE (name)`

## mfa_challenges

| Column | Type | Required | Default |
|---|---|---|---|
| id | text | yes |  |
| user_id | text | yes |  |
| purpose | text | yes |  |
| secret | text |  |  |
| attempts | integer | yes | 0 |
| expires_at | timestamp with time zone | yes |  |
| created_at | timestamp with time zone | yes | now() |

Keys and rules:

- Rule: `CHECK ((attempts >= 0))`
- Rule: `CHECK ((purpose = ANY (ARRAY['verify'::text, 'setup'::text])))`
- Links to: `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- Primary key: `PRIMARY KEY (id)`

Indexes: `(expires_at)`, `(user_id)`, `UNIQUE (id)`

## offers

| Column | Type | Required | Default |
|---|---|---|---|
| id | text | yes |  |
| salon_id | text | yes |  |
| title | text | yes |  |
| badge | text | yes | ''::text |
| description | text | yes | ''::text |
| promo_code | text | yes | ''::text |
| valid_until | date |  |  |
| theme | smallint | yes | 0 |
| image_url | text | yes | ''::text |
| is_active | boolean | yes | true |
| created_at | timestamp with time zone | yes | now() |
| discount_type | text | yes | 'none'::text |
| discount_value | numeric | yes | 0 |

Keys and rules:

- Rule: `CHECK (((discount_type = ANY (ARRAY['none'::text, 'percent'::text, 'flat'::text])) AND (discount_value >= (0)::numeric)))`
- Rule: `CHECK (((theme >= 0) AND (theme <= 5)))`
- Links to: `FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE`
- Primary key: `PRIMARY KEY (id)`

Indexes: `(salon_id)`, `UNIQUE (id)`

## rate_limits

| Column | Type | Required | Default |
|---|---|---|---|
| key | text | yes |  |
| window_start | bigint | yes |  |
| hits | integer | yes | 0 |
| prev_hits | integer | yes | 0 |
| expires_at | timestamp with time zone | yes |  |

Keys and rules:

- Rule: `CHECK ((hits >= 0))`
- Rule: `CHECK ((length(key) <= 300))`
- Rule: `CHECK ((prev_hits >= 0))`
- Primary key: `PRIMARY KEY (key)`

Indexes: `(expires_at)`, `UNIQUE (key)`

## referral_links

| Column | Type | Required | Default |
|---|---|---|---|
| id | text | yes |  |
| user_id | text | yes |  |
| code | text | yes |  |
| label | text | yes | ''::text |
| is_active | boolean | yes | true |
| created_at | timestamp with time zone | yes | now() |

Keys and rules:

- Links to: `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- Primary key: `PRIMARY KEY (id)`
- Unique: `UNIQUE (code)`

Indexes: `(user_id)`, `UNIQUE (code)`, `UNIQUE (id)`

## salons

| Column | Type | Required | Default |
|---|---|---|---|
| id | text | yes |  |
| slug | text | yes |  |
| name | text | yes |  |
| tagline | text | yes | ''::text |
| about | text | yes | ''::text |
| hours | text | yes | ''::text |
| phone | text | yes | ''::text |
| whatsapp | text | yes | ''::text |
| instagram | text | yes | ''::text |
| email | text | yes | ''::text |
| address | text | yes | ''::text |
| currency | text | yes | '₹'::text |
| brand_color | text | yes | '#7b2c9e'::text |
| logo_url | text | yes | ''::text |
| cover_url | text | yes | ''::text |
| owner_name | text | yes | ''::text |
| owner_mobile | text | yes | ''::text |
| owner_email | text | yes | ''::text |
| plan_name | text | yes | ''::text |
| plan_amount | numeric | yes | 0 |
| expires_on | date |  |  |
| is_active | boolean | yes | true |
| created_at | timestamp with time zone | yes | now() |
| facebook | text | yes | ''::text |
| youtube | text | yes | ''::text |
| x_handle | text | yes | ''::text |
| website | text | yes | ''::text |
| map_url | text | yes | ''::text |
| category_id | text |  |  |
| self_signup | boolean | yes | false |
| service_mode | text | yes | 'multiple'::text |
| staff_mode | text | yes | 'multiple'::text |
| features | jsonb | yes | '{}'::jsonb |
| onboarded_by | text |  |  |
| onboarded_by_name | text | yes | ''::text |
| onboard_source | text | yes | 'admin'::text |
| onboard_channel | text | yes | 'web'::text |
| referral_link_id | text |  |  |
| referral_label | text | yes | ''::text |
| signup_package | text | yes | ''::text |

Keys and rules:

- Rule: `CHECK ((onboard_channel = ANY (ARRAY['web'::text, 'app'::text])))`
- Rule: `CHECK ((onboard_source = ANY (ARRAY['admin'::text, 'referral'::text, 'signup'::text])))`
- Rule: `CHECK ((service_mode = ANY (ARRAY['single'::text, 'multiple'::text])))`
- Rule: `CHECK ((staff_mode = ANY (ARRAY['single'::text, 'multiple'::text])))`
- Links to: `FOREIGN KEY (category_id) REFERENCES business_categories(id) ON DELETE SET NULL`
- Links to: `FOREIGN KEY (onboarded_by) REFERENCES users(id) ON DELETE SET NULL`
- Links to: `FOREIGN KEY (referral_link_id) REFERENCES referral_links(id) ON DELETE SET NULL`
- Primary key: `PRIMARY KEY (id)`
- Unique: `UNIQUE (slug)`

Indexes: `(category_id)`, `(onboarded_by)`, `(referral_link_id)`, `UNIQUE (id)`, `UNIQUE (slug)`

## service_branch_prices

| Column | Type | Required | Default |
|---|---|---|---|
| service_id | text | yes |  |
| branch_id | text | yes |  |
| price | numeric | yes |  |

Keys and rules:

- Rule: `CHECK ((price >= (0)::numeric))`
- Links to: `FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE`
- Links to: `FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE`
- Primary key: `PRIMARY KEY (service_id, branch_id)`

Indexes: `(branch_id)`, `UNIQUE (service_id, branch_id)`

## service_branches

| Column | Type | Required | Default |
|---|---|---|---|
| service_id | text | yes |  |
| branch_id | text | yes |  |

Keys and rules:

- Links to: `FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE`
- Links to: `FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE`
- Primary key: `PRIMARY KEY (service_id, branch_id)`

Indexes: `(branch_id)`, `UNIQUE (service_id, branch_id)`

## service_groups

| Column | Type | Required | Default |
|---|---|---|---|
| id | text | yes |  |
| category_id | text |  |  |
| name | text | yes |  |
| created_at | timestamp with time zone | yes | now() |

Keys and rules:

- Links to: `FOREIGN KEY (category_id) REFERENCES business_categories(id) ON DELETE CASCADE`
- Primary key: `PRIMARY KEY (id)`

Indexes: `(category_id)`, `UNIQUE (id)`, `UNIQUE (COALESCE(category_id, ''::text), lower(name))`

## services

| Column | Type | Required | Default |
|---|---|---|---|
| id | text | yes |  |
| salon_id | text | yes |  |
| name | text | yes |  |
| category | text | yes | ''::text |
| description | text | yes | ''::text |
| duration_min | integer | yes |  |
| price | numeric | yes | 0 |
| image_url | text | yes | ''::text |
| is_active | boolean | yes | true |
| created_at | timestamp with time zone | yes | now() |

Keys and rules:

- Rule: `CHECK (((duration_min >= 1) AND (duration_min <= 600)))`
- Rule: `CHECK ((price >= (0)::numeric))`
- Links to: `FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE`
- Primary key: `PRIMARY KEY (id)`

Indexes: `(salon_id)`, `UNIQUE (id)`

## sessions

| Column | Type | Required | Default |
|---|---|---|---|
| token | text | yes |  |
| user_id | text | yes |  |
| expires_at | timestamp with time zone | yes |  |
| created_at | timestamp with time zone | yes | now() |
| client | text | yes | 'app'::text |

Keys and rules:

- Rule: `CHECK ((client = ANY (ARRAY['web'::text, 'app'::text])))`
- Links to: `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- Primary key: `PRIMARY KEY (token)`

Indexes: `(expires_at)`, `(user_id)`, `UNIQUE (token)`

## site_content

| Column | Type | Required | Default |
|---|---|---|---|
| key | text | yes |  |
| data | jsonb | yes | '{}'::jsonb |
| updated_at | timestamp with time zone | yes | now() |

Keys and rules:

- Primary key: `PRIMARY KEY (key)`

Indexes: `UNIQUE (key)`

## staff

| Column | Type | Required | Default |
|---|---|---|---|
| id | text | yes |  |
| salon_id | text | yes |  |
| branch_id | text | yes |  |
| name | text | yes |  |
| title | text | yes | ''::text |
| mobile | text | yes | ''::text |
| photo_url | text | yes | ''::text |
| is_active | boolean | yes | true |
| created_at | timestamp with time zone | yes | now() |
| is_online | boolean | yes | true |

Keys and rules:

- Links to: `FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT`
- Links to: `FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE`
- Primary key: `PRIMARY KEY (id)`

Indexes: `(branch_id)`, `(salon_id)`, `UNIQUE (id)`

## staff_services

| Column | Type | Required | Default |
|---|---|---|---|
| staff_id | text | yes |  |
| service_id | text | yes |  |

Keys and rules:

- Links to: `FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE`
- Links to: `FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE`
- Primary key: `PRIMARY KEY (staff_id, service_id)`

Indexes: `(service_id)`, `UNIQUE (staff_id, service_id)`

## support_messages

| Column | Type | Required | Default |
|---|---|---|---|
| id | bigint | yes | nextval('support_messages_id_seq'::regclass) |
| ticket_id | text | yes |  |
| author_id | text |  |  |
| author_name | text | yes | ''::text |
| from_team | boolean | yes | false |
| body | text | yes | ''::text |
| image_url | text | yes | ''::text |
| status | text | yes | ''::text |
| created_at | timestamp with time zone | yes | now() |

Keys and rules:

- Rule: `CHECK ((status = ANY (ARRAY[''::text, 'open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text])))`
- Links to: `FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL`
- Links to: `FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE`
- Primary key: `PRIMARY KEY (id)`

Indexes: `(author_id)`, `(ticket_id, id)`, `UNIQUE (id)`

## support_tickets

| Column | Type | Required | Default |
|---|---|---|---|
| id | text | yes |  |
| number | integer | yes |  |
| salon_id | text | yes |  |
| created_by | text |  |  |
| category | text | yes | 'issue'::text |
| subject | text | yes |  |
| status | text | yes | 'open'::text |
| priority | text | yes | 'normal'::text |
| owner_seen_at | timestamp with time zone | yes | now() |
| team_seen_at | timestamp with time zone |  |  |
| created_at | timestamp with time zone | yes | now() |
| updated_at | timestamp with time zone | yes | now() |

Keys and rules:

- Rule: `CHECK ((category = ANY (ARRAY['bug'::text, 'issue'::text, 'question'::text, 'billing'::text, 'feature'::text, 'other'::text])))`
- Rule: `CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])))`
- Rule: `CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text])))`
- Links to: `FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL`
- Links to: `FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE`
- Primary key: `PRIMARY KEY (id)`

Indexes: `(created_by)`, `(salon_id, updated_at DESC)`, `(status, updated_at DESC)`, `UNIQUE (id)`

## testimonials

| Column | Type | Required | Default |
|---|---|---|---|
| id | text | yes |  |
| salon_id | text | yes |  |
| client_name | text | yes |  |
| label | text | yes | ''::text |
| quote | text | yes |  |
| rating | smallint | yes | 5 |
| photo_url | text | yes | ''::text |
| is_active | boolean | yes | true |
| created_at | timestamp with time zone | yes | now() |

Keys and rules:

- Rule: `CHECK (((rating >= 1) AND (rating <= 5)))`
- Links to: `FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE`
- Primary key: `PRIMARY KEY (id)`

Indexes: `(salon_id)`, `UNIQUE (id)`

## token_counters

| Column | Type | Required | Default |
|---|---|---|---|
| branch_id | text | yes |  |
| token_date | date | yes |  |
| last_number | integer | yes |  |
| cycle | integer | yes | 0 |
| reset_at | timestamp with time zone |  |  |

Keys and rules:

- Links to: `FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE`
- Primary key: `PRIMARY KEY (branch_id, token_date)`

Indexes: `UNIQUE (branch_id, token_date)`

## token_items

| Column | Type | Required | Default |
|---|---|---|---|
| id | bigint | yes | nextval('token_items_id_seq'::regclass) |
| token_id | text | yes |  |
| position | integer | yes |  |
| service_id | text |  |  |
| service_name | text | yes |  |
| staff_id | text |  |  |
| staff_name | text | yes |  |
| duration_min | integer | yes |  |
| price | numeric | yes |  |
| status | text | yes | 'waiting'::text |
| started_at | timestamp with time zone |  |  |
| ended_at | timestamp with time zone |  |  |

Keys and rules:

- Rule: `CHECK ((status = ANY (ARRAY['waiting'::text, 'in_progress'::text, 'done'::text, 'missed'::text])))`
- Links to: `FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL`
- Links to: `FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL`
- Links to: `FOREIGN KEY (token_id) REFERENCES tokens(id) ON DELETE CASCADE`
- Primary key: `PRIMARY KEY (id)`
- Unique: `UNIQUE (token_id, "position")`

Indexes: `(service_id)`, `(staff_id)`, `(token_id)`, `UNIQUE (id)`, `UNIQUE (token_id, "position")`

## tokens

| Column | Type | Required | Default |
|---|---|---|---|
| id | text | yes |  |
| salon_id | text | yes |  |
| branch_id | text | yes |  |
| token_date | date | yes |  |
| number | integer | yes |  |
| prefix | text | yes | ''::text |
| customer_name | text | yes |  |
| customer_mobile | text | yes |  |
| customer_email | text | yes | ''::text |
| status | text | yes | 'waiting'::text |
| created_at | timestamp with time zone | yes | now() |
| finished_at | timestamp with time zone |  |  |
| cycle | integer | yes | 0 |
| offer_id | text |  |  |
| offer_title | text | yes | ''::text |
| offer_code | text | yes | ''::text |
| discount_type | text | yes | 'none'::text |
| discount_value | numeric | yes | 0 |
| customer_id | text |  |  |

Keys and rules:

- Rule: `CHECK ((discount_type = ANY (ARRAY['none'::text, 'percent'::text, 'flat'::text])))`
- Rule: `CHECK ((status = ANY (ARRAY['waiting'::text, 'serving'::text, 'done'::text, 'cancelled'::text, 'missed'::text])))`
- Links to: `FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE`
- Links to: `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL`
- Links to: `FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE SET NULL`
- Links to: `FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE`
- Primary key: `PRIMARY KEY (id)`
- Unique: `UNIQUE (branch_id, token_date, cycle, number)`

Indexes: `(branch_id, token_date)`, `(customer_id, created_at DESC) WHERE (customer_id IS NOT NULL)`, `(offer_id)`, `(token_date) WHERE (status = ANY (ARRAY['waiting'::text, 'serving'::text]))`, `(salon_id, token_date)`, `UNIQUE (branch_id, token_date, cycle, number)`, `UNIQUE (id)`

## users

| Column | Type | Required | Default |
|---|---|---|---|
| id | text | yes |  |
| role | text | yes |  |
| username | text | yes |  |
| email | text |  |  |
| name | text | yes |  |
| password_hash | text | yes |  |
| salon_id | text |  |  |
| staff_id | text |  |  |
| created_at | timestamp with time zone | yes | now() |
| permissions | ARRAY | yes | '{}'::text[] |
| is_active | boolean | yes | true |
| referral_code | text |  |  |
| mfa_secret | text |  |  |
| mfa_enabled_at | timestamp with time zone |  |  |
| mfa_backup_codes | ARRAY | yes | '{}'::text[] |
| mfa_last_step | bigint | yes | 0 |
| password_changed_at | timestamp with time zone |  |  |

Keys and rules:

- Rule: `CHECK (((role <> 'platform_staff'::text) OR ((salon_id IS NULL) AND (staff_id IS NULL))))`
- Rule: `CHECK (((role <> 'staff'::text) OR (staff_id IS NOT NULL)))`
- Rule: `CHECK (((role = ANY (ARRAY['superadmin'::text, 'platform_staff'::text])) OR (salon_id IS NOT NULL)))`
- Rule: `CHECK ((role = ANY (ARRAY['superadmin'::text, 'platform_staff'::text, 'owner'::text, 'staff'::text])))`
- Links to: `FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE`
- Links to: `FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE`
- Primary key: `PRIMARY KEY (id)`
- Unique: `UNIQUE (email)`
- Unique: `UNIQUE (staff_id)`
- Unique: `UNIQUE (username)`

Indexes: `(salon_id)`, `UNIQUE (email)`, `UNIQUE (id)`, `UNIQUE (referral_code) WHERE (referral_code IS NOT NULL)`, `UNIQUE (staff_id)`, `UNIQUE (username)`
