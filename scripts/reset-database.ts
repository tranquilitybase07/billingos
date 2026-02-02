#!/usr/bin/env tsx

/**
 * Database Reset Script
 *
 * This script removes all organization data from the database including:
 * - Organizations and their settings
 * - Stripe Connect accounts
 * - Products, prices, and features
 * - Customers and subscriptions
 * - Usage records and feature grants
 * - API keys and session tokens
 * - Webhook events
 *
 * NOTE: This does NOT delete data from Stripe - you must manually clean that up.
 *
 * Usage:
 *   pnpm tsx scripts/reset-database.ts
 *
 * Options:
 *   --keep-users    Keep user accounts (only delete organizations and related data)
 *   --org <slug>    Only delete specific organization by slug
 *   --confirm       Skip confirmation prompt (use with caution!)
 */

import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';

// Load environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

// Parse command line arguments
const args = process.argv.slice(2);
const keepUsers = args.includes('--keep-users');
const skipConfirmation = args.includes('--confirm');
const orgSlugIndex = args.indexOf('--org');
const targetOrgSlug = orgSlugIndex !== -1 ? args[orgSlugIndex + 1] : null;

// Create Supabase client with service role
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Helper to ask for confirmation
function askConfirmation(question: string): Promise<boolean> {
  if (skipConfirmation) return Promise.resolve(true);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

// Get statistics before deletion
async function getStatistics() {
  console.log('\n📊 Current Database Statistics:\n');

  const tables = [
    'users',
    'organizations',
    'accounts',
    'user_organizations',
    'products',
    'product_prices',
    'features',
    'product_features',
    'customers',
    'subscriptions',
    'feature_grants',
    'usage_records',
    'webhook_events',
    'api_keys',
    'session_tokens',
  ];

  let whereClause = '';
  if (targetOrgSlug) {
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', targetOrgSlug)
      .single();

    if (!org) {
      console.error(`❌ Organization with slug "${targetOrgSlug}" not found`);
      process.exit(1);
    }
    whereClause = `.eq('organization_id', '${org.id}')`;
  }

  for (const table of tables) {
    try {
      let query = supabase.from(table).select('*', { count: 'exact', head: true });

      // Add organization filter for tables with organization_id
      if (targetOrgSlug && ['organizations', 'accounts', 'products', 'features', 'customers', 'subscriptions', 'webhook_events', 'api_keys'].includes(table)) {
        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('slug', targetOrgSlug)
          .single();

        if (table === 'organizations') {
          query = query.eq('id', org!.id);
        } else if (table === 'accounts') {
          // Accounts reference organizations
          const { data: orgs } = await supabase
            .from('organizations')
            .select('account_id')
            .eq('slug', targetOrgSlug)
            .single();
          if (orgs?.account_id) {
            query = query.eq('id', orgs.account_id);
          }
        } else {
          query = query.eq('organization_id', org!.id);
        }
      }

      const { count, error } = await query;

      if (error) {
        console.log(`  ${table}: Error - ${error.message}`);
      } else {
        console.log(`  ${table}: ${count || 0} records`);
      }
    } catch (error) {
      console.log(`  ${table}: Error - ${error}`);
    }
  }
  console.log('');
}

// Delete data in correct order (respecting foreign key constraints)
async function resetDatabase() {
  console.log('\n🔥 Starting database reset...\n');

  let orgFilter = '';
  let orgId: string | null = null;

  if (targetOrgSlug) {
    const { data: org } = await supabase
      .from('organizations')
      .select('id, account_id')
      .eq('slug', targetOrgSlug)
      .single();

    if (!org) {
      console.error(`❌ Organization with slug "${targetOrgSlug}" not found`);
      process.exit(1);
    }
    orgId = org.id;
    console.log(`🎯 Targeting organization: ${targetOrgSlug} (${orgId})\n`);
  }

  try {
    // 1. Delete usage_records
    console.log('🗑️  Deleting usage_records...');
    if (orgId) {
      const { data: customers } = await supabase
        .from('customers')
        .select('id')
        .eq('organization_id', orgId);
      const customerIds = customers?.map(c => c.id) || [];
      if (customerIds.length > 0) {
        const { error } = await supabase
          .from('usage_records')
          .delete()
          .in('customer_id', customerIds);
        if (error) console.error(`  ⚠️  Error: ${error.message}`);
      }
    } else {
      const { error } = await supabase.from('usage_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    }

    // 2. Delete feature_grants
    console.log('🗑️  Deleting feature_grants...');
    if (orgId) {
      const { data: customers } = await supabase
        .from('customers')
        .select('id')
        .eq('organization_id', orgId);
      const customerIds = customers?.map(c => c.id) || [];
      if (customerIds.length > 0) {
        const { error } = await supabase
          .from('feature_grants')
          .delete()
          .in('customer_id', customerIds);
        if (error) console.error(`  ⚠️  Error: ${error.message}`);
      }
    } else {
      const { error } = await supabase.from('feature_grants').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    }

    // 3. Delete subscriptions
    console.log('🗑️  Deleting subscriptions...');
    if (orgId) {
      const { error } = await supabase
        .from('subscriptions')
        .delete()
        .eq('organization_id', orgId);
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    } else {
      const { error } = await supabase.from('subscriptions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    }

    // 4. Delete customers
    console.log('🗑️  Deleting customers...');
    if (orgId) {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('organization_id', orgId);
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    } else {
      const { error } = await supabase.from('customers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    }

    // 5. Delete product_features
    console.log('🗑️  Deleting product_features...');
    if (orgId) {
      const { data: products } = await supabase
        .from('products')
        .select('id')
        .eq('organization_id', orgId);
      const productIds = products?.map(p => p.id) || [];
      if (productIds.length > 0) {
        const { error } = await supabase
          .from('product_features')
          .delete()
          .in('product_id', productIds);
        if (error) console.error(`  ⚠️  Error: ${error.message}`);
      }
    } else {
      const { error } = await supabase.from('product_features').delete().neq('product_id', '00000000-0000-0000-0000-000000000000');
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    }

    // 6. Delete product_prices
    console.log('🗑️  Deleting product_prices...');
    if (orgId) {
      const { data: products } = await supabase
        .from('products')
        .select('id')
        .eq('organization_id', orgId);
      const productIds = products?.map(p => p.id) || [];
      if (productIds.length > 0) {
        const { error } = await supabase
          .from('product_prices')
          .delete()
          .in('product_id', productIds);
        if (error) console.error(`  ⚠️  Error: ${error.message}`);
      }
    } else {
      const { error } = await supabase.from('product_prices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    }

    // 7. Delete products
    console.log('🗑️  Deleting products...');
    if (orgId) {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('organization_id', orgId);
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    } else {
      const { error } = await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    }

    // 8. Delete features
    console.log('🗑️  Deleting features...');
    if (orgId) {
      const { error } = await supabase
        .from('features')
        .delete()
        .eq('organization_id', orgId);
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    } else {
      const { error } = await supabase.from('features').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    }

    // 9. Delete session_tokens
    console.log('🗑️  Deleting session_tokens...');
    if (orgId) {
      const { error } = await supabase
        .from('session_tokens')
        .delete()
        .eq('organization_id', orgId);
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    } else {
      const { error } = await supabase.from('session_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    }

    // 10. Delete api_keys
    console.log('🗑️  Deleting api_keys...');
    if (orgId) {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('organization_id', orgId);
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    } else {
      const { error } = await supabase.from('api_keys').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    }

    // 11. Delete webhook_events
    console.log('🗑️  Deleting webhook_events...');
    if (orgId) {
      const { error } = await supabase
        .from('webhook_events')
        .delete()
        .eq('organization_id', orgId);
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    } else {
      const { error } = await supabase.from('webhook_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    }

    // 12. Delete user_organizations
    console.log('🗑️  Deleting user_organizations...');
    if (orgId) {
      const { error } = await supabase
        .from('user_organizations')
        .delete()
        .eq('organization_id', orgId);
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    } else {
      const { error } = await supabase.from('user_organizations').delete().neq('organization_id', '00000000-0000-0000-0000-000000000000');
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    }

    // 13. Delete accounts
    console.log('🗑️  Deleting accounts...');
    if (orgId) {
      const { data: org } = await supabase
        .from('organizations')
        .select('account_id')
        .eq('id', orgId)
        .single();

      if (org?.account_id) {
        const { error } = await supabase
          .from('accounts')
          .delete()
          .eq('id', org.account_id);
        if (error) console.error(`  ⚠️  Error: ${error.message}`);
      }
    } else {
      const { error } = await supabase.from('accounts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    }

    // 14. Delete organizations
    console.log('🗑️  Deleting organizations...');
    if (orgId) {
      const { error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', orgId);
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    } else {
      const { error } = await supabase.from('organizations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    }

    // 15. Delete users (optional)
    if (!keepUsers) {
      console.log('🗑️  Deleting users...');
      const { error } = await supabase.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) console.error(`  ⚠️  Error: ${error.message}`);
    } else {
      console.log('👤 Keeping users (use --keep-users=false to delete)');
    }

    console.log('\n✅ Database reset complete!\n');
    console.log('⚠️  REMINDER: You must manually clean up data in Stripe Dashboard:');
    console.log('   - Products');
    console.log('   - Prices');
    console.log('   - Customers');
    console.log('   - Subscriptions');
    console.log('   - Connected Accounts\n');

  } catch (error) {
    console.error('\n❌ Error during database reset:', error);
    process.exit(1);
  }
}

// Main execution
async function main() {
  console.log('\n🚨 DATABASE RESET SCRIPT 🚨\n');
  console.log('This will delete:');
  console.log('  ✗ Organizations and all settings');
  console.log('  ✗ Stripe Connect accounts (database records only)');
  console.log('  ✗ Products, prices, and features');
  console.log('  ✗ Customers and subscriptions');
  console.log('  ✗ Usage records and feature grants');
  console.log('  ✗ API keys and session tokens');
  console.log('  ✗ Webhook events');
  if (!keepUsers) {
    console.log('  ✗ User accounts');
  } else {
    console.log('  ✓ User accounts (will be kept)');
  }
  console.log('');

  if (targetOrgSlug) {
    console.log(`🎯 Target: Organization "${targetOrgSlug}" only\n`);
  } else {
    console.log('🌍 Scope: ALL organizations and data\n');
  }

  // Show current statistics
  await getStatistics();

  // Ask for confirmation
  const confirmed = await askConfirmation(
    '⚠️  Are you sure you want to proceed?'
  );

  if (!confirmed) {
    console.log('\n❌ Reset cancelled by user\n');
    process.exit(0);
  }

  // Double confirmation for full reset
  if (!targetOrgSlug && !skipConfirmation) {
    const doubleConfirmed = await askConfirmation(
      '⚠️  This will delete ALL data. Type "yes" to confirm again'
    );

    if (!doubleConfirmed) {
      console.log('\n❌ Reset cancelled by user\n');
      process.exit(0);
    }
  }

  // Perform reset
  await resetDatabase();

  // Show statistics after deletion
  console.log('\n📊 Database Statistics After Reset:\n');
  await getStatistics();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
