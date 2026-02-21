/**
 * Test script for free products functionality
 * Run with: node test-free-products.js
 */

const axios = require('axios');

const API_URL = 'http://localhost:3001';
const FRONTEND_URL = 'http://localhost:3000';

// Test configuration - Update these values as needed
const TEST_ORG_ID = '5b946d16-c37b-4279-93de-5a016e2f93f6'; // Replace with your test org ID
const AUTH_TOKEN = 'your-auth-token-here'; // Replace with a valid auth token

// ANSI color codes for better output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
};

function log(message, type = 'info') {
  const prefix = {
    info: `${colors.blue}ℹ${colors.reset}`,
    success: `${colors.green}✓${colors.reset}`,
    error: `${colors.red}✗${colors.reset}`,
    warning: `${colors.yellow}⚠${colors.reset}`,
  };
  console.log(`${prefix[type] || ''} ${message}`);
}

async function createFreeProduct() {
  log('Creating a free product...', 'info');

  const productData = {
    organization_id: TEST_ORG_ID,
    name: 'Free Plan Test',
    description: 'A test free product to verify free functionality',
    recurring_interval: 'month',
    recurring_interval_count: 1,
    trial_days: 0,
    prices: [
      {
        amount_type: 'free',
        price_currency: 'usd',
        recurring_interval: 'month',
      },
    ],
    features: [],
    visible_in_pricing_table: true,
  };

  try {
    const response = await axios.post(`${API_URL}/products`, productData, {
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    log('Free product created successfully!', 'success');
    log(`Product ID: ${response.data.id}`, 'info');
    log(`Product Name: ${response.data.name}`, 'info');

    // Check if prices are correctly set
    const price = response.data.prices[0];
    if (price.amount_type === 'free' && !price.price_amount) {
      log('✓ Price correctly set as FREE (no amount)', 'success');
    } else {
      log('✗ Price not correctly set as FREE', 'error');
    }

    return response.data;
  } catch (error) {
    log(`Error creating free product: ${error.response?.data?.message || error.message}`, 'error');
    if (error.response?.data) {
      console.log('Error details:', error.response.data);
    }
    return null;
  }
}

async function listProducts() {
  log('\nFetching all products to verify free product...', 'info');

  try {
    const response = await axios.get(`${API_URL}/products?organizationId=${TEST_ORG_ID}`, {
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
    });

    const freeProducts = response.data.filter((p) =>
      p.prices.some((price) => price.amount_type === 'free'),
    );

    log(`Found ${freeProducts.length} free product(s)`, 'success');

    freeProducts.forEach((product) => {
      log(`\n${colors.dim}─────────────────────────${colors.reset}`, 'info');
      log(`Product: ${product.name}`, 'info');
      log(`ID: ${product.id}`, 'info');
      log(`Visible in pricing: ${product.visible_in_pricing_table ? 'Yes' : 'No'}`, 'info');

      const freePrice = product.prices.find(p => p.amount_type === 'free');
      if (freePrice) {
        log(`Price Type: FREE`, 'success');
        log(`Currency: ${freePrice.price_currency}`, 'info');
        log(`Interval: ${freePrice.recurring_interval}`, 'info');
      }
    });

    return freeProducts;
  } catch (error) {
    log(`Error fetching products: ${error.response?.data?.message || error.message}`, 'error');
    return [];
  }
}

async function testFreeCheckout(priceId) {
  log('\nTesting free product checkout...', 'info');

  const checkoutData = {
    priceId: priceId,
    customerEmail: 'test@example.com',
    customerName: 'Test User',
    metadata: {
      test: 'free-product-checkout',
    },
  };

  try {
    // First create a session token (mimicking SDK behavior)
    const sessionResponse = await axios.post(
      `${API_URL}/v1/session-tokens`,
      { metadata: { test: true } },
      {
        headers: {
          'X-API-Key': 'your-api-key-here', // Replace with actual API key
          'Content-Type': 'application/json',
        },
      },
    );

    const sessionToken = sessionResponse.data.token;
    log(`Session token created: ${sessionToken}`, 'success');

    // Now create checkout
    const checkoutResponse = await axios.post(
      `${API_URL}/v1/checkout`,
      checkoutData,
      {
        headers: {
          'X-Session-Token': sessionToken,
          'Content-Type': 'application/json',
        },
      },
    );

    const checkout = checkoutResponse.data;
    log('Free checkout created successfully!', 'success');

    // Verify free checkout properties
    if (checkout.amount === 0 && checkout.totalAmount === 0) {
      log('✓ Checkout amount correctly set to 0', 'success');
    } else {
      log(`✗ Checkout amount incorrect: ${checkout.amount}`, 'error');
    }

    if (!checkout.clientSecret || checkout.clientSecret === '') {
      log('✓ No client secret for free checkout (correct)', 'success');
    } else {
      log('✗ Client secret should be empty for free checkout', 'error');
    }

    if (checkout.subscription) {
      log('✓ Subscription created immediately for free product', 'success');
      log(`  Subscription ID: ${checkout.subscription.id}`, 'info');
      log(`  Status: ${checkout.subscription.status}`, 'info');
    } else {
      log('✗ No subscription created for free checkout', 'error');
    }

    return checkout;
  } catch (error) {
    log(`Error creating free checkout: ${error.response?.data?.message || error.message}`, 'error');
    if (error.response?.data) {
      console.log('Error details:', error.response.data);
    }
    return null;
  }
}

async function runTests() {
  console.log(`${colors.blue}${'═'.repeat(50)}${colors.reset}`);
  console.log(`${colors.blue}   Free Products Test Suite${colors.reset}`);
  console.log(`${colors.blue}${'═'.repeat(50)}${colors.reset}\n`);

  log('Starting free product tests...', 'info');
  log(`API URL: ${API_URL}`, 'info');
  log(`Organization ID: ${TEST_ORG_ID}\n`, 'info');

  // Step 1: Create a free product
  const freeProduct = await createFreeProduct();
  if (!freeProduct) {
    log('Failed to create free product. Stopping tests.', 'error');
    return;
  }

  // Step 2: List products to verify
  await listProducts();

  // Step 3: Test checkout with free product (if you have API key)
  if (freeProduct.prices && freeProduct.prices[0]) {
    log('\nNote: To test checkout, you need a valid API key', 'warning');
    log('Uncomment the checkout test and provide an API key to test', 'info');

    // Uncomment this when you have a valid API key:
    // await testFreeCheckout(freeProduct.prices[0].id);
  }

  console.log(`\n${colors.green}${'═'.repeat(50)}${colors.reset}`);
  console.log(`${colors.green}   Tests Completed${colors.reset}`);
  console.log(`${colors.green}${'═'.repeat(50)}${colors.reset}\n`);

  log('Manual verification steps:', 'info');
  log('1. Go to the dashboard and verify the free product appears', 'info');
  log('2. Check that it shows "Free" instead of a price', 'info');
  log('3. Try creating a checkout - it should complete immediately', 'info');
  log('4. Verify no payment intent is created in Stripe dashboard', 'info');
  log('5. Check that subscription is active without Stripe subscription', 'info');
}

// Run the tests
runTests().catch((error) => {
  log(`Unexpected error: ${error.message}`, 'error');
  process.exit(1);
});