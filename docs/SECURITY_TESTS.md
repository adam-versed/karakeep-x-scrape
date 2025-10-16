# Phase 2 Security & Performance Test Suite

This comprehensive test suite verifies all security enhancements and performance improvements implemented in Phase 2 of the Karakeep security hardening project.

## Overview

The test suite covers critical security vulnerabilities and performance bottlenecks that were identified and fixed:

- **API Key Security Enhancements** - Timing-safe comparison and enhanced validation
- **Path Traversal Protection** - Asset and user ID validation with safe path handling  
- **Pagination Security** - Cursor-based pagination with proper validation
- **Transaction Safety** - Atomic operations and rollback protection
- **Batch Processing Improvements** - Race condition fixes and error handling
- **Timing-Safe String Comparison** - Cryptographic-level string comparison

## Quick Start

### Run All Security Tests

```bash
# From the project root
./run-security-tests.sh
```

### Run Individual Test Suites

```bash
# API Key Security Tests
cd packages/trpc && pnpm vitest tests/security/api-key-security.test.ts

# Path Traversal Protection Tests  
cd packages/shared && pnpm vitest tests/security/path-traversal.test.ts

# Timing-Safe String Comparison Tests
cd packages/shared && pnpm vitest tests/security/timing-safe-comparison.test.ts

# Pagination Functionality Tests
cd packages/trpc && pnpm vitest tests/pagination/pagination.test.ts

# Transaction Safety Tests
cd packages/trpc && pnpm vitest tests/security/transaction-safety.test.ts

# Batch Processing Tests
cd apps/workers && pnpm vitest tests/batch-processing.test.ts
```

## Test Coverage Details

### 1. API Key Security (`packages/trpc/tests/security/api-key-security.test.ts`)

**What it tests:**
- Timing-safe string comparison for API key validation
- Enhanced input validation with comprehensive format checking
- Malformed API key rejection (invalid characters, wrong length, etc.)
- Concurrent authentication attempt safety
- Error message sanitization to prevent information leakage
- Resistance to timing attacks on key comparison

**Key Security Improvements Verified:**
- ✅ Prevents timing attacks through consistent comparison times
- ✅ Validates API key format with proper error handling
- ✅ Sanitizes error messages to avoid leaking sensitive data
- ✅ Handles concurrent requests safely without race conditions

### 2. Path Traversal Protection (`packages/shared/tests/security/path-traversal.test.ts`)

**What it tests:**
- Asset ID validation against directory traversal attempts
- User ID validation with comprehensive input checking
- Safe path joining that prevents path escape
- File system security with real directory traversal prevention
- Unicode and encoding attack resistance
- Integration with actual file operations

**Key Security Improvements Verified:**
- ✅ Blocks `../` and `..\\` path traversal attempts
- ✅ Prevents absolute path injection attacks
- ✅ Validates asset and user IDs with proper character restrictions
- ✅ Handles Unicode normalization attacks
- ✅ Maintains security boundaries in file operations

### 3. Timing-Safe String Comparison (`packages/shared/tests/security/timing-safe-comparison.test.ts`)

**What it tests:**
- Cryptographically secure string comparison using `crypto.timingSafeEqual`
- Timing consistency regardless of string difference positions
- Performance characteristics under various load conditions
- Edge case handling (empty strings, Unicode, very long strings)
- Resistance to timing side-channel attacks
- Error handling for invalid inputs

**Key Security Improvements Verified:**
- ✅ Consistent timing regardless of where strings differ
- ✅ Protection against timing side-channel attacks
- ✅ Proper handling of different string lengths
- ✅ Cryptographic-level security guarantees
- ✅ Production-ready performance characteristics

### 4. Pagination Security (`packages/trpc/tests/pagination/pagination.test.ts`)

**What it tests:**
- Cursor-based pagination implementation correctness
- Parameter validation and limit enforcement
- Database query optimization and N+1 prevention
- Edge case handling (empty results, invalid cursors)
- Concurrent pagination request safety
- API backward compatibility

**Key Security & Performance Improvements Verified:**
- ✅ Prevents SQL injection through parameterized queries
- ✅ Enforces reasonable pagination limits
- ✅ Maintains consistent ordering across pages
- ✅ Handles concurrent requests without data corruption
- ✅ Optimizes database queries for performance

### 5. Transaction Safety (`packages/trpc/tests/security/transaction-safety.test.ts`)

**What it tests:**
- Atomic batch description updates with proper rollback
- Transaction isolation and deadlock prevention
- Error handling during transaction execution
- Concurrent transaction safety
- Database constraint violation handling
- Memory cleanup after transaction completion

**Key Security & Performance Improvements Verified:**
- ✅ Ensures atomicity of batch operations
- ✅ Proper rollback on any operation failure
- ✅ Handles concurrent transactions without deadlocks
- ✅ Maintains data consistency under error conditions
- ✅ Prevents partial updates that could corrupt data

### 6. Batch Processing Improvements (`apps/workers/tests/batch-processing.test.ts`)

**What it tests:**
- Race condition prevention in timer-based batch flushing
- Batch size management and memory efficiency
- Error handling and retry logic for failed operations
- JSON parsing error recovery
- Performance under high-load conditions
- Configuration flexibility and dynamic adjustment

**Key Security & Performance Improvements Verified:**
- ✅ Eliminates race conditions between timer and size-based flushing
- ✅ Handles JSON parsing errors gracefully
- ✅ Implements proper retry logic with exponential backoff
- ✅ Maintains performance under concurrent load
- ✅ Manages memory efficiently with large batch sizes

## Security Standards Compliance

The test suite verifies compliance with industry security standards:

### OWASP Top 10 2021
- **A01 - Broken Access Control**: API key validation and authentication
- **A02 - Cryptographic Failures**: Timing-safe string comparison
- **A03 - Injection**: Path traversal and input validation
- **A04 - Insecure Design**: Transaction safety and error handling
- **A06 - Vulnerable Components**: Input sanitization and validation

### CWE Classifications
- **CWE-22**: Path Traversal - Directly tested and prevented
- **CWE-208**: Information Exposure Through Timing - Timing-safe comparison
- **CWE-362**: Race Conditions - Batch processing race condition fixes
- **CWE-20**: Improper Input Validation - Comprehensive input validation
- **CWE-404**: Resource Management - Transaction safety and cleanup

## Performance Benchmarks

The test suite includes performance verification:

- **API Key Validation**: < 1ms per comparison under load
- **Pagination Queries**: < 100ms for 1000+ items with proper indexing
- **Batch Processing**: Handles 100+ concurrent operations efficiently
- **Transaction Operations**: < 500ms for complex multi-table updates
- **Memory Usage**: Proper cleanup prevents memory leaks

## Running Tests in CI/CD

### GitHub Actions Example

```yaml
name: Security Test Suite
on: [push, pull_request]

jobs:
  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install -g pnpm
      - run: pnpm install
      - run: ./run-security-tests.sh
```

### Local Development

```bash
# Run tests before committing
git add .
./run-security-tests.sh
git commit -m "feat: implement security improvements"
```

## Test Structure

```
packages/trpc/tests/
├── security/
│   ├── api-key-security.test.ts
│   ├── transaction-safety.test.ts
│   └── security-suite.test.ts
└── pagination/
    └── pagination.test.ts

packages/shared/tests/
└── security/
    ├── path-traversal.test.ts
    └── timing-safe-comparison.test.ts

apps/workers/tests/
└── batch-processing.test.ts
```

## Adding New Security Tests

When adding new security features, follow this pattern:

1. **Create test file** in appropriate package under `tests/security/`
2. **Follow naming convention**: `feature-name.test.ts`
3. **Structure tests** with describe blocks for different aspects
4. **Include performance tests** for operations that might be slow
5. **Add to test runner** script for automated execution
6. **Document coverage** in this README

### Example Test Structure

```typescript
describe("New Security Feature", () => {
  describe("Basic Functionality", () => {
    it("should handle normal cases correctly", () => {
      // Test implementation
    });
  });

  describe("Security Properties", () => {
    it("should prevent specific attack vectors", () => {
      // Security test implementation
    });
  });

  describe("Performance", () => {
    it("should perform efficiently under load", () => {
      // Performance test implementation
    });
  });

  describe("Edge Cases", () => {
    it("should handle error conditions gracefully", () => {
      // Edge case test implementation
    });
  });
});
```

## Troubleshooting

### Common Issues

1. **Tests timeout**: Increase timeout values for performance tests
2. **Database connection errors**: Ensure test database is properly configured
3. **Mock failures**: Verify all external dependencies are properly mocked
4. **Timing inconsistencies**: Run timing tests multiple times for statistical significance

### Debug Commands

```bash
# Run specific test with verbose output
pnpm vitest tests/security/api-key-security.test.ts --reporter=verbose

# Run tests with coverage
pnpm vitest --coverage

# Debug failing test
pnpm vitest tests/security/path-traversal.test.ts --inspect-brk
```

## Contributing

When contributing to the security test suite:

1. **Ensure comprehensive coverage** of all code paths
2. **Include both positive and negative test cases**
3. **Test edge cases and error conditions**
4. **Verify performance characteristics**
5. **Document any new attack vectors tested**
6. **Update this README with new test coverage**

## Security Contact

For security-related questions or to report vulnerabilities:
- Create an issue in the project repository
- Mark sensitive issues as security-related
- Follow responsible disclosure practices