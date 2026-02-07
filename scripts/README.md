# Database Reset Scripts

This directory contains scripts to reset your BillingOS database by removing all organization data.

## ⚠️ WARNING

**These scripts are IRREVERSIBLE!** They will permanently delete:
- Organizations and all settings
- Stripe Connect accounts (database records only)
- Products, prices, and features
- Customers and subscriptions
- Usage records and feature grants
- API keys and session tokens
- Webhook events
- Optionally: User accounts

**Important Notes:**
1. **Stripe Data:** These scripts only delete database records. You must **manually clean up Stripe Dashboard** separately:
   - Delete Products
   - Delete Prices
   - Delete Customers
   - Delete Subscriptions
   - Disconnect/Delete Connected Accounts

2. **Auth Users:** Supabase Auth users in `auth.users` table are NOT deleted by these scripts. To delete auth users, use Supabase Dashboard or Auth API.

---

## Option 1: TypeScript Script (Recommended)

Interactive script with confirmation prompts and statistics.

### Usage

```bash
# Delete all data (will prompt for confirmation)
pnpm tsx scripts/reset-database.ts

# Delete all data, keep user accounts
pnpm tsx scripts/reset-database.ts --keep-users

# Delete specific organization only
pnpm tsx scripts/reset-database.ts --org my-org-slug

# Skip confirmation (DANGEROUS!)
pnpm tsx scripts/reset-database.ts --confirm
```

### Features

- ✅ Shows database statistics before and after
- ✅ Interactive confirmation prompts
- ✅ Option to keep user accounts
- ✅ Target specific organization
- ✅ Proper foreign key constraint handling
- ✅ Error handling and logging

### Example Output

```
🚨 DATABASE RESET SCRIPT 🚨

This will delete:
  ✗ Organizations and all settings
  ✗ Stripe Connect accounts (database records only)
  ✗ Products, prices, and features
  ✗ Customers and subscriptions
  ✗ Usage records and feature grants
  ✗ API keys and session tokens
  ✗ Webhook events
  ✓ User accounts (will be kept)

📊 Current Database Statistics:

  users: 5 records
  organizations: 3 records
  accounts: 3 records
  products: 12 records
  customers: 45 records
  subscriptions: 38 records
  ...

⚠️  Are you sure you want to proceed? (yes/no): yes

🔥 Starting database reset...

🗑️  Deleting usage_records...
🗑️  Deleting feature_grants...
🗑️  Deleting subscriptions...
...

✅ Database reset complete!

⚠️  REMINDER: You must manually clean up data in Stripe Dashboard
```

---

## Option 2: SQL Script

Direct SQL execution for advanced users.

### Usage

**Method 1: psql command line**

```bash
# Connect to local Supabase
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f scripts/reset-database.sql

# For hosted Supabase
psql "postgresql://postgres:[password]@[host]:5432/postgres" -f scripts/reset-database.sql
```

**Method 2: Supabase SQL Editor**

1. Open Supabase Studio: http://127.0.0.1:54323
2. Go to SQL Editor
3. Copy contents of `scripts/reset-database.sql`
4. Paste and execute

### Customization

The SQL script has two options (uncomment one):

**Option 1: Delete specific organization**
```sql
-- Uncomment and modify this block
DO $$
DECLARE
  target_org_id UUID;
BEGIN
  SELECT id INTO target_org_id
  FROM organizations
  WHERE slug = 'YOUR_ORG_SLUG_HERE';

  -- Deletion logic...
END $$;
```

**Option 2: Delete all data (default)**
```sql
-- This is already uncommented in the script
DELETE FROM usage_records;
DELETE FROM feature_grants;
-- ... etc
```

**Keep users:**
Comment out the last DELETE statement:
```sql
-- 15. Delete users (OPTIONAL - comment out to keep users)
-- DELETE FROM users;
```

---

## What Gets Deleted (In Order)

The scripts delete data in this specific order to respect foreign key constraints:

1. **usage_records** (depends on customers, features)
2. **feature_grants** (depends on customers, features, subscriptions)
3. **subscriptions** (depends on organizations, customers, products)
4. **customers** (depends on organizations)
5. **product_features** (junction table: products ↔ features)
6. **product_prices** (depends on products)
7. **products** (depends on organizations)
8. **features** (depends on organizations)
9. **session_tokens** (depends on users, organizations)
10. **api_keys** (depends on organizations)
11. **webhook_events** (depends on organizations)
12. **user_organizations** (junction table: users ↔ organizations)
13. **accounts** (Stripe Connect accounts)
14. **organizations**
15. **users** (optional)

---

## Common Use Cases

### 1. Fresh Development Start

Reset everything to start from scratch:

```bash
pnpm tsx scripts/reset-database.ts --confirm
```

Then manually clear Stripe Dashboard.

### 2. Keep Users, Reset Organizations

Useful when you want to test onboarding flow again:

```bash
pnpm tsx scripts/reset-database.ts --keep-users
```

Users can log in and create new organizations.

### 3. Delete Single Test Organization

Remove a specific test organization:

```bash
pnpm tsx scripts/reset-database.ts --org test-org-slug
```

### 4. Production-like Reset

For staging environment cleanup:

```bash
# Keep users but reset all business data
pnpm tsx scripts/reset-database.ts --keep-users

# Or just delete specific org
pnpm tsx scripts/reset-database.ts --org staging-test-org
```

---

## Troubleshooting

### "Foreign key constraint violation"

The scripts are designed to delete in the correct order. If you get this error:
1. Check if you have custom tables with foreign keys
2. Manually delete those first
3. Re-run the script

### "Permission denied"

Make sure you're using the service role key, not the anon key:
```typescript
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
```

### "Organization not found"

Check the organization slug:
```bash
# List all organizations
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "SELECT id, slug, name FROM organizations;"
```

### Database is still not empty

Some tables may not be covered by these scripts:
- Check for custom tables: `\dt` in psql
- Manually inspect and delete

---

## After Running Reset

### 1. Clean up Stripe

**Dashboard:** https://dashboard.stripe.com/test/

Delete manually:
1. **Products** → Select all → Delete
2. **Customers** → Select all → Delete
3. **Connect** → Connected Accounts → Delete each

**CLI (faster):**
```bash
# Delete all products
stripe products list --limit 100 | jq -r '.data[].id' | xargs -I {} stripe products delete {}

# Delete all customers
stripe customers list --limit 100 | jq -r '.data[].id' | xargs -I {} stripe customers delete {}
```

### 2. Reset Supabase Auth (optional)

If you also want to delete auth users:

**Supabase Dashboard:**
1. Go to Authentication → Users
2. Select users → Delete

**SQL:**
```sql
-- WARNING: This deletes auth users
DELETE FROM auth.users;
```

### 3. Re-seed Data (optional)

After reset, you may want to seed demo data:

```bash
pnpm tsx scripts/seed-demo-data.ts
```

(If you have a seed script)

---

## Best Practices

### Development
- Run reset script regularly to test fresh installs
- Keep a separate "stable" test organization
- Use `--org` flag to delete only test orgs

### Staging
- Schedule weekly/monthly resets
- Keep audit logs before reset
- Notify team before running

### Production
- **NEVER RUN THESE SCRIPTS IN PRODUCTION**
- Use proper data retention policies
- Implement soft deletes for compliance

---

## Safety Checklist

Before running reset scripts:

- [ ] I have a backup (if needed)
- [ ] I understand this is irreversible
- [ ] I will manually clean up Stripe after
- [ ] I'm connected to the correct database (local/staging)
- [ ] I've notified my team (if applicable)
- [ ] I've checked which data will be deleted
- [ ] I'm NOT running this in production

---

## Environment Variables

Make sure these are set correctly:

```bash
# .env or .env.local
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# For hosted Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-actual-service-role-key
```

**Get service role key:**
- Local: Check `supabase/config.toml` or `supabase status`
- Hosted: Supabase Dashboard → Settings → API → service_role key

---

## Support

If you encounter issues:
1. Check the error message carefully
2. Verify foreign key constraints
3. Run with smaller scope first (`--org` flag)
4. Check Supabase logs
5. Manually inspect database state

---

## Related Scripts

- `seed-demo-data.ts` - Seed database with demo data (if exists)
- `migrate-data.ts` - Data migration utilities (if exists)
- `backup-database.sh` - Create database backup (if exists)
