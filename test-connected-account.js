#!/usr/bin/env node

/**
 * Test script to verify Stripe Connected Account payment flow
 * This script tests the payment intent creation with connected accounts
 */

async function testConnectedAccountFlow() {
  console.log('🧪 Testing Stripe Connected Account Payment Flow\n');
  console.log('=====================================\n');

  // Test configuration
  const API_URL = 'http://localhost:3001';
  const sessionToken = 'test-user-123'; // Replace with actual session token
  const organizationId = 'YOUR_ORG_ID'; // Replace with actual org ID

  console.log('📝 Test Configuration:');
  console.log('- API URL:', API_URL);
  console.log('- Session Token:', sessionToken);
  console.log('- Organization ID:', organizationId);
  console.log('\n');

  try {
    // Step 1: Create a checkout session
    console.log('1️⃣ Creating checkout session...');
    const checkoutResponse = await fetch(`${API_URL}/v1/checkout/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Token': sessionToken,
      },
      body: JSON.stringify({
        priceId: 'YOUR_PRICE_ID', // Replace with actual price ID
        customerEmail: 'test@example.com',
        customerName: 'Test User',
        metadata: {
          source: 'test-script'
        }
      })
    });

    if (!checkoutResponse.ok) {
      const error = await checkoutResponse.text();
      throw new Error(`Failed to create checkout session: ${error}`);
    }

    const checkoutSession = await checkoutResponse.json();
    console.log('✅ Checkout session created successfully!');
    console.log('- Session ID:', checkoutSession.id);
    console.log('- Client Secret:', checkoutSession.clientSecret ? '***' + checkoutSession.clientSecret.slice(-8) : 'N/A');
    console.log('- Stripe Account ID:', checkoutSession.stripeAccountId || 'N/A');
    console.log('- Amount:', checkoutSession.amount);
    console.log('\n');

    // Step 2: Verify the session status
    console.log('2️⃣ Verifying checkout session status...');
    const statusResponse = await fetch(`${API_URL}/v1/checkout/${checkoutSession.id}/status`, {
      method: 'GET',
    });

    if (!statusResponse.ok) {
      throw new Error('Failed to get checkout session status');
    }

    const sessionStatus = await statusResponse.json();
    console.log('✅ Session status retrieved successfully!');
    console.log('- Has Stripe Account ID:', !!sessionStatus.stripeAccountId);
    console.log('- Client Secret Present:', !!sessionStatus.clientSecret);
    console.log('\n');

    // Step 3: Check the critical fields
    console.log('3️⃣ Validating critical fields for connected account flow...');

    const validationResults = {
      'Stripe Account ID exists': !!sessionStatus.stripeAccountId,
      'Client Secret exists': !!sessionStatus.clientSecret,
      'Client Secret format valid': sessionStatus.clientSecret ? sessionStatus.clientSecret.includes('_secret_') : false,
      'Payment Intent ID exists': !!sessionStatus.paymentIntentId,
    };

    let allPassed = true;
    for (const [check, passed] of Object.entries(validationResults)) {
      console.log(`${passed ? '✅' : '❌'} ${check}`);
      if (!passed) allPassed = false;
    }
    console.log('\n');

    // Summary
    console.log('=====================================');
    console.log('📊 Test Summary:');
    if (allPassed && sessionStatus.stripeAccountId) {
      console.log('✅ SUCCESS: Connected account flow is properly configured!');
      console.log('   The payment intent was created on the connected account.');
      console.log('   Frontend should initialize Stripe with:');
      console.log(`   loadStripe(PUBLISHABLE_KEY, { stripeAccount: "${sessionStatus.stripeAccountId}" })`);
    } else if (!sessionStatus.stripeAccountId) {
      console.log('⚠️  WARNING: No connected account ID found!');
      console.log('   This means the payment intent was created on the platform account.');
      console.log('   Check that the organization has a Stripe connected account configured.');
    } else {
      console.log('❌ FAILURE: Some validation checks failed.');
      console.log('   Please review the results above.');
    }

    // Return the session for further testing
    return sessionStatus;

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.log('\n📝 Troubleshooting tips:');
    console.log('1. Make sure the API server is running on port 3001');
    console.log('2. Replace placeholder values (session token, org ID, price ID)');
    console.log('3. Ensure the organization has a Stripe connected account');
    console.log('4. Check the API logs for more details');
    process.exit(1);
  }
}

// Run the test
console.log('🚀 Starting Stripe Connected Account Test\n');
testConnectedAccountFlow()
  .then(() => {
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });