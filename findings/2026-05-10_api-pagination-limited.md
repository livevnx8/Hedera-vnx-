# API Pagination Limited

**Date**: 2026-05-10

## Finding
Hedera mirror node API pagination is limited to 100 transactions per request.

## Evidence
- Attempted to fetch 10K transactions
- API returned only 100 transactions
- Pagination parameters not working as expected

## Impact
- Cannot scale dataset beyond 100 real transactions with current implementation
- Limits ability to train on larger real datasets

## Next Steps
- Use Hedera SDK instead of REST API
- Set up local mirror node
- Fetch by account ID instead of global query


**Tags**: api, hedera, pagination
