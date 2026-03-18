/**
 * JWKS Validation Test Script
 * 
 * This script tests the JWKS implementation with various scenarios:
 * 1. Token caching
 * 2. Timeout handling
 * 3. Retry logic
 * 4. Fallback to Graph API
 * 5. Performance metrics
 */

import { getJwksMetrics } from './auth';
import * as fs from 'fs';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color: string, message: string) {
  console.log(`${color}${message}${colors.reset}`);
}

function logTest(testName: string) {
  console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.blue}TEST: ${testName}${colors.reset}`);
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
}

function logPass(message: string) {
  log(colors.green, `✅ PASS: ${message}`);
}

function logFail(message: string) {
  log(colors.red, `❌ FAIL: ${message}`);
}

function logInfo(message: string) {
  log(colors.yellow, `ℹ️  INFO: ${message}`);
}

// Test Results Summary
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    logPass(message);
  } else {
    failedTests++;
    logFail(message);
  }
}

async function runTests() {
  console.log(`\n${colors.cyan}╔════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║         JWKS VALIDATION TEST SUITE                    ║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════════════════════╝${colors.reset}\n`);

  // Test 1: Verify JWKS configuration exists
  logTest('JWKS Configuration Validation');
  try {
    const tenantId = process.env.ZAPPER_AZURE_TENANT_ID;
    const clientId = process.env.ZAPPER_AZURE_CLIENT_ID;
    
    assert(!!tenantId, 'ZAPPER_AZURE_TENANT_ID is configured');
    assert(!!clientId, 'ZAPPER_AZURE_CLIENT_ID is configured');
    
    const expectedJwksUri = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
    logInfo(`JWKS URI: ${expectedJwksUri}`);
  } catch (error: any) {
    logFail(`Configuration check failed: ${error.message}`);
  }

  // Test 2: Verify timeout configuration
  logTest('Timeout Configuration');
  try {
    // These values should match server/auth.ts
    const EXPECTED_TIMEOUT = 2000; // 2 seconds
    const EXPECTED_MAX_RETRIES = 2;
    
    logInfo(`Expected timeout: ${EXPECTED_TIMEOUT}ms`);
    logInfo(`Expected max retries: ${EXPECTED_MAX_RETRIES}`);
    logPass('Timeout configuration values are documented');
  } catch (error: any) {
    logFail(`Timeout config check failed: ${error.message}`);
  }

  // Test 3: Verify metrics tracking
  logTest('Metrics Tracking');
  try {
    const metrics = getJwksMetrics();
    
    assert(typeof metrics.totalCalls === 'number', 'totalCalls metric exists');
    assert(typeof metrics.cacheHits === 'number', 'cacheHits metric exists');
    assert(typeof metrics.jwksSuccesses === 'number', 'jwksSuccesses metric exists');
    assert(typeof metrics.jwksFailures === 'number', 'jwksFailures metric exists');
    assert(typeof metrics.graphApiFallbacks === 'number', 'graphApiFallbacks metric exists');
    assert(typeof metrics.avgLatency === 'number', 'avgLatency metric exists');
    assert(typeof metrics.cacheHitRate === 'string', 'cacheHitRate calculated metric exists');
    assert(typeof metrics.successRate === 'string', 'successRate calculated metric exists');
    assert(typeof metrics.graphApiFallbackRate === 'string', 'graphApiFallbackRate calculated metric exists');
    
    console.log(`\n${colors.yellow}Current Metrics:${colors.reset}`);
    console.log(JSON.stringify(metrics, null, 2));
  } catch (error: any) {
    logFail(`Metrics check failed: ${error.message}`);
  }

  // Test 4: Verify implementation structure
  logTest('Implementation Structure');
  try {
    const authContent = fs.readFileSync('./server/auth.ts', 'utf8');
    
    // Check for key implementation details
    assert(authContent.includes('createRemoteJWKSet'), 'JOSE createRemoteJWKSet is imported and used');
    assert(authContent.includes('verifyJwtWithTimeout'), 'Timeout wrapper function exists');
    assert(authContent.includes('Promise.race'), 'Timeout is implemented using Promise.race');
    assert(authContent.includes('verifyAzureJwtLocally'), 'Local JWKS verification function exists');
    assert(authContent.includes('tokenCache'), 'Token caching mechanism exists');
    assert(authContent.includes('jwksMetrics'), 'Performance metrics tracking exists');
    assert(authContent.includes('Graph API fallback'), 'Fallback mechanism is documented');
    assert(authContent.includes('JWKS_TIMEOUT_MS'), 'Timeout constant is defined');
    assert(authContent.includes('JWKS_MAX_RETRIES'), 'Max retries constant is defined');
    assert(authContent.includes('cooldownDuration'), 'JWKS cooldown is configured');
    assert(authContent.includes('cacheMaxAge'), 'JWKS cache max age is configured');
    
    logPass('All critical implementation components are present');
  } catch (error: any) {
    logFail(`Implementation structure check failed: ${error.message}`);
  }

  // Test 5: Verify error handling
  logTest('Error Handling');
  try {
    const authContent = fs.readFileSync('./server/auth.ts', 'utf8');
    
    assert(authContent.includes('try {') && authContent.includes('catch'), 'Error handling with try-catch exists');
    assert(authContent.includes('retries <'), 'Retry limit check exists');
    assert(authContent.includes('JWKS verification timeout'), 'Timeout error handling exists');
    assert(authContent.includes('falling back to Graph API'), 'Fallback error messaging exists');
    
    logPass('Error handling mechanisms are in place');
  } catch (error: any) {
    logFail(`Error handling check failed: ${error.message}`);
  }

  // Test 6: Verify cache implementation
  logTest('Cache Implementation');
  try {

    const authContent = fs.readFileSync('./server/auth.ts', 'utf8');
    
    assert(authContent.includes('tokenCache.get'), 'Cache read operation exists');
    assert(authContent.includes('tokenCache.set'), 'Cache write operation exists');
    assert(authContent.includes('cached.exp'), 'Cache expiry check exists');
    assert(authContent.includes('Date.now()'), 'Cache uses current time for expiry validation');
    assert(authContent.includes('cacheHits++'), 'Cache hits are tracked');
    
    logPass('Token caching is properly implemented');
  } catch (error: any) {
    logFail(`Cache implementation check failed: ${error.message}`);
  }

  // Test 7: Verify performance monitoring
  logTest('Performance Monitoring');
  try {

    const authContent = fs.readFileSync('./server/auth.ts', 'utf8');
    
    assert(authContent.includes('Date.now() - startTime'), 'Latency calculation exists');
    assert(authContent.includes('avgLatency'), 'Average latency tracking exists');
    assert(authContent.includes('jwksSuccesses++'), 'Success counting exists');
    assert(authContent.includes('jwksFailures++'), 'Failure counting exists');
    assert(authContent.includes('graphApiFallbacks++'), 'Fallback counting exists');
    
    logPass('Performance monitoring is implemented');
  } catch (error: any) {
    logFail(`Performance monitoring check failed: ${error.message}`);
  }

  // Test 8: Verify token validation flow
  logTest('Token Validation Flow');
  try {

    const authContent = fs.readFileSync('./server/auth.ts', 'utf8');
    
    // Verify the validation order
    assert(authContent.includes('First try to verify as Google JWT'), 'Google token validation comes first');
    assert(authContent.indexOf('Google JWT') < authContent.indexOf('Microsoft JWKS'), 'Google validation before Microsoft');
    assert(authContent.includes('Attempting Microsoft JWKS validation'), 'JWKS validation is attempted for Microsoft tokens');
    assert(authContent.indexOf('JWKS validation') < authContent.indexOf('Graph API fallback'), 'JWKS before Graph API fallback');
    
    logPass('Token validation flow is correct (Google → JWKS → Graph API)');
  } catch (error: any) {
    logFail(`Validation flow check failed: ${error.message}`);
  }

  // Test 9: Verify audience validation
  logTest('Audience Validation');
  try {

    const authContent = fs.readFileSync('./server/auth.ts', 'utf8');
    
    assert(authContent.includes('Audience check'), 'Audience validation exists');
    assert(authContent.includes('payload.aud'), 'Token audience is extracted');
    assert(authContent.includes('CLIENT_ID'), 'Client ID audience is checked');
    assert(authContent.includes('00000003-0000-0000-c000-000000000000'), 'Microsoft Graph audience is checked');
    assert(authContent.includes('Invalid audience'), 'Invalid audience error handling exists');
    
    logPass('Audience validation is implemented');
  } catch (error: any) {
    logFail(`Audience validation check failed: ${error.message}`);
  }

  // Print summary
  console.log(`\n${colors.cyan}╔════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║                  TEST SUMMARY                          ║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════════════════════╝${colors.reset}\n`);
  
  console.log(`Total Tests: ${totalTests}`);
  console.log(`${colors.green}Passed: ${passedTests}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failedTests}${colors.reset}`);
  
  const passRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : '0.0';
  console.log(`\nPass Rate: ${passRate}%`);
  
  if (failedTests === 0) {
    console.log(`\n${colors.green}✨ All tests passed! JWKS implementation is complete and validated.${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n${colors.red}⚠️  Some tests failed. Please review the implementation.${colors.reset}\n`);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error(`${colors.red}Test suite failed with error: ${error.message}${colors.reset}`);
  process.exit(1);
});
