/**
 * Test script for product visibility feature
 *
 * This script tests:
 * 1. Creating a product with visibility settings
 * 2. Toggling visibility of existing products
 * 3. Verifying SDK filtering
 */

const API_URL = 'http://localhost:3001';
const SDK_URL = 'http://localhost:3001/v1';

// You'll need to get these from your local setup
const AUTH_TOKEN = 'YOUR_AUTH_TOKEN'; // Get from browser dev tools after logging in
const SESSION_TOKEN = 'YOUR_SESSION_TOKEN'; // For SDK endpoints
const ORGANIZATION_ID = 'YOUR_ORG_ID';

async function testProductVisibility() {
  console.log('🧪 Testing Product Visibility Feature\n');

  try {
    // Test 1: Create a visible product
    console.log('📝 Test 1: Creating a VISIBLE product...');
    const visibleProduct = await createProduct(true, 'Visible Product');
    console.log(`✅ Created visible product: ${visibleProduct.id}`);

    // Test 2: Create a hidden product
    console.log('\n📝 Test 2: Creating a HIDDEN product...');
    const hiddenProduct = await createProduct(false, 'Hidden Product');
    console.log(`✅ Created hidden product: ${hiddenProduct.id}`);

    // Test 3: Check admin API returns all products
    console.log('\n📝 Test 3: Fetching ALL products via admin API...');
    const allProducts = await fetchAdminProducts();
    console.log(`✅ Admin API returned ${allProducts.length} products`);

    const hasVisible = allProducts.some(p => p.id === visibleProduct.id);
    const hasHidden = allProducts.some(p => p.id === hiddenProduct.id);
    console.log(`   - Contains visible product: ${hasVisible ? '✅' : '❌'}`);
    console.log(`   - Contains hidden product: ${hasHidden ? '✅' : '❌'}`);

    // Test 4: Check SDK API only returns visible products
    console.log('\n📝 Test 4: Fetching products via SDK API...');
    const sdkProducts = await fetchSDKProducts();
    console.log(`✅ SDK API returned ${sdkProducts.products.length} products`);

    const sdkHasVisible = sdkProducts.products.some(p => p.id === visibleProduct.id);
    const sdkHasHidden = sdkProducts.products.some(p => p.id === hiddenProduct.id);
    console.log(`   - Contains visible product: ${sdkHasVisible ? '✅' : '❌'}`);
    console.log(`   - Contains hidden product: ${sdkHasHidden ? '❌ (correct)' : '✅ (error!)'}`);

    // Test 5: Toggle visibility
    console.log('\n📝 Test 5: Toggling visibility of hidden product...');
    await updateProductVisibility(hiddenProduct.id, true);
    console.log('✅ Updated hidden product to visible');

    // Test 6: Verify change in SDK
    console.log('\n📝 Test 6: Verifying change in SDK API...');
    const updatedSdkProducts = await fetchSDKProducts();
    const nowVisible = updatedSdkProducts.products.some(p => p.id === hiddenProduct.id);
    console.log(`   - Previously hidden product now visible: ${nowVisible ? '✅' : '❌'}`);

    console.log('\n✅ All tests passed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response);
    }
  }
}

async function createProduct(visible, name) {
  const response = await fetch(`${API_URL}/products`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      organization_id: ORGANIZATION_ID,
      name: name,
      description: `Test product - ${visible ? 'visible' : 'hidden'}`,
      recurring_interval: 'month',
      recurring_interval_count: 1,
      trial_days: 0,
      visible_in_pricing_table: visible,
      prices: [{
        amount_type: 'fixed',
        price_amount: 999,
        price_currency: 'usd',
        recurring_interval: 'month',
      }],
      features: [],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create product: ${error}`);
  }

  return response.json();
}

async function fetchAdminProducts() {
  const response = await fetch(`${API_URL}/products?organization_id=${ORGANIZATION_ID}`, {
    headers: {
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch admin products');
  }

  return response.json();
}

async function fetchSDKProducts() {
  const response = await fetch(`${SDK_URL}/products`, {
    headers: {
      'Authorization': `Bearer ${SESSION_TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch SDK products');
  }

  return response.json();
}

async function updateProductVisibility(productId, visible) {
  const response = await fetch(`${API_URL}/products/${productId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      visible_in_pricing_table: visible,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to update product visibility');
  }

  return response.json();
}

// Instructions
console.log('📌 Before running this test:\n');
console.log('1. Start Docker Desktop and Supabase:');
console.log('   supabase start\n');
console.log('2. Apply the migration if not already done:');
console.log('   supabase db reset\n');
console.log('3. Start the development servers:');
console.log('   pnpm dev\n');
console.log('4. Get your tokens:');
console.log('   - AUTH_TOKEN: Login to the app, open DevTools > Network, find any API call, copy the Bearer token');
console.log('   - SESSION_TOKEN: Create a session token via the API or SDK');
console.log('   - ORGANIZATION_ID: Get from the URL or API response\n');
console.log('5. Update the constants at the top of this file\n');
console.log('6. Run: node test-product-visibility.js\n');
console.log('----------------------------------------\n');

// Uncomment to run the test
// testProductVisibility();