import 'dotenv/config';

// Override DATABASE_URL with TEST_DATABASE_URL for integration tests
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.ENABLE_TEST_ENDPOINTS = 'true';

console.log('Integration test environment setup:');
console.log('  DATABASE_URL:', process.env.DATABASE_URL?.replace(/:[^@]+@/, ':****@'));
console.log('  ENABLE_TEST_ENDPOINTS:', process.env.ENABLE_TEST_ENDPOINTS);
