# Backend Tests

This directory contains all test and debugging scripts for the FlyerSync backend.

## Test Files

- `test-api.js` - Tests basic API functionality
- `test-current-token.js` - Validates JWT token functionality
- `test-localhost-endpoint.js` - Tests local server endpoints
- `test-ngrok-endpoint.js` - Tests public ngrok endpoints
- `test-upload.js` - Tests file upload functionality
- `test-*.js` - Various other endpoint tests

## Debug Files

- `debug-server-secret.js` - Debugs JWT secret configuration
- `debug-token.js` - Token debugging utilities

## Running Tests

### Run all tests:

```bash
node ../run-tests.js
```

### Run individual test:

```bash
node tests/test-api.js
```

## Requirements

- JWT_SECRET environment variable must be set
- Backend server should be running for endpoint tests
- Node.js with required dependencies installed

## Security Notes

- All fallback secrets have been removed for security
- Tests now require proper environment configuration
- JWT_SECRET is mandatory and validated
