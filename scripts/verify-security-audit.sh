#!/bin/bash

echo "Security Audit Verification Script"
echo "======================================"
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ISSUES=0

echo "1. Checking for TODO/FIXME comments in auth code..."
TODO_COUNT=$(grep -r "TODO\|FIXME\|XXX\|HACK" apps/api/src/auth/ --include="*.ts" 2>/dev/null | grep -v node_modules | grep -v ".spec.ts" | wc -l | tr -d ' ')
if [ "$TODO_COUNT" -gt 0 ]; then
    echo -e "${RED}  Found $TODO_COUNT TODO/FIXME comments in auth/${NC}"
    grep -r "TODO\|FIXME\|XXX\|HACK" apps/api/src/auth/ --include="*.ts" | grep -v node_modules | grep -v ".spec.ts" | head -5
    ISSUES=$((ISSUES + 1))
else
    echo -e "${GREEN}  No TODO/FIXME comments found in auth/${NC}"
fi
echo ""

echo "2. Checking for console.log statements in production code..."
CONSOLE_COUNT=$(grep -r "console\.\(log\|error\|warn\|debug\)" apps/api/src/ --include="*.ts" 2>/dev/null | grep -v ".spec.ts" | grep -v "node_modules" | grep -v "instrument.ts" | wc -l | tr -d ' ')
if [ "$CONSOLE_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}  Found $CONSOLE_COUNT console statements (review below):${NC}"
    grep -rn "console\.\(log\|error\|warn\|debug\)" apps/api/src/ --include="*.ts" | grep -v ".spec.ts" | grep -v "node_modules" | grep -v "instrument.ts"
    echo ""
else
    echo -e "${GREEN}  No console statements found${NC}"
fi
echo ""

echo "3. Checking for security utils..."
if [ -f "apps/api/src/common/utils/security.utils.ts" ]; then
    echo -e "${GREEN}  Security utils file exists${NC}"
else
    echo -e "${RED}  Security utils file missing${NC}"
    ISSUES=$((ISSUES + 1))
fi
echo ""

echo "4. Checking for request ID middleware..."
if [ -f "apps/api/src/common/middleware/request-id.middleware.ts" ]; then
    echo -e "${GREEN}  Request ID middleware exists${NC}"
else
    echo -e "${RED}  Request ID middleware missing${NC}"
    ISSUES=$((ISSUES + 1))
fi
echo ""

echo "5. Checking for response sanitization..."
if [ -f "apps/api/src/common/interceptors/response-sanitize.interceptor.ts" ]; then
    echo -e "${GREEN}  Response sanitization interceptor exists${NC}"
else
    echo -e "${RED}  Response sanitization interceptor missing${NC}"
    ISSUES=$((ISSUES + 1))
fi
echo ""

echo "6. Checking for security logger..."
if [ -f "apps/api/src/common/utils/security-logger.ts" ]; then
    echo -e "${GREEN}  Security logger exists${NC}"
else
    echo -e "${RED}  Security logger missing${NC}"
    ISSUES=$((ISSUES + 1))
fi
echo ""

echo "7. Checking for security config..."
if [ -f "apps/api/src/config/security.config.ts" ]; then
    echo -e "${GREEN}  Security config exists${NC}"
else
    echo -e "${RED}  Security config missing${NC}"
    ISSUES=$((ISSUES + 1))
fi
echo ""

echo "8. Checking JWT debug middleware is removed..."
if [ -f "apps/api/src/middleware/jwt-debug.middleware.ts" ]; then
    echo -e "${RED}  JWT debug middleware still exists${NC}"
    ISSUES=$((ISSUES + 1))
else
    echo -e "${GREEN}  JWT debug middleware removed${NC}"
fi
echo ""

echo "======================================"
if [ $ISSUES -eq 0 ]; then
    echo -e "${GREEN}Security audit passed! All checks completed.${NC}"
    exit 0
else
    echo -e "${RED}Security audit: $ISSUES issues found${NC}"
    exit 1
fi
