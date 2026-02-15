# BillingOS Development Standards

## Documentation Standards

### Feature Documentation Workflow
Every feature MUST follow this documentation pattern:

1. **plan.md** - Initial planning document
   - Problem statement
   - Proposed solution
   - Reference to Polar implementation
   - Technical approach
   - Estimated timeline

2. **progress.md** - Implementation tracking
   - Daily updates
   - Completed tasks
   - Remaining work
   - Blockers encountered
   - Changes from original plan

3. **final.md** - Completion summary
   - What was built
   - Deviations from plan
   - Lessons learned
   - Maintenance notes
   - Future improvements

### Documentation Structure
```
docs/
├── pm/                     # Project management
│   └── mvp-release/       # MVP roadmaps and checklists
├── sprint-beta-launch/     # Current sprint documentation
├── [feature-name]/         # Individual feature docs
│   ├── plan.md
│   ├── progress.md
│   └── final.md
└── architecture/           # Technical documentation
```

### Documentation Rules
- Always reference implementation in CLAUDE.md
- Use checkboxes for trackable items
- Include code examples where relevant
- Date all updates
- Keep progress.md updated daily during implementation

---

## Code Standards

### General Principles
1. **TypeScript Strict Mode**: No `any` types allowed
2. **Error Handling**: All errors must be caught and handled gracefully
3. **Security First**: This handles payments - no shortcuts
4. **Performance**: Target <2 second page loads
5. **Testing**: Critical paths must have tests

### Backend (NestJS)
```typescript
// Controller Pattern
@UseGuards(JwtAuthGuard)
@Controller('resource')
export class ResourceController {
  @Post()
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateResourceDto
  ) {
    // Implementation
  }
}
```

**Standards**:
- All endpoints protected by JWT guard
- DTOs for all input validation
- Service layer for business logic
- Consistent error responses
- Transaction support for multi-step operations

### Frontend (Next.js)
```typescript
// Component Pattern
'use client'; // Only when needed

interface ComponentProps {
  // Explicit prop types
}

export function Component({ props }: ComponentProps) {
  // Implementation
}
```

**Standards**:
- Server Components by default
- Client Components only when necessary
- React Query for all API calls
- Loading and error states required
- Mobile responsive required
- Dark mode support required

### SDK
```typescript
// Hook Pattern
export function useResource(id: string, options?: QueryOptions) {
  return useQuery({
    queryKey: ['resource', id],
    queryFn: () => apiClient.get(`/resource/${id}`),
    ...options
  });
}
```

**Standards**:
- Full TypeScript types exported
- Error boundaries included
- Retry logic implemented
- Caching strategy defined
- Tree-shaking optimized

---

## Git Standards

### Branch Naming
- `feature/[feature-name]` - New features
- `fix/[issue-description]` - Bug fixes
- `chore/[task-name]` - Maintenance tasks
- `docs/[doc-name]` - Documentation updates

### Commit Messages
Format: `type(scope): description`

Types:
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Code style changes
- `refactor` - Code refactoring
- `test` - Test updates
- `chore` - Maintenance

Example: `feat(api): add customer search endpoint`

### Pull Request Process
1. Create feature branch
2. Implement with tests
3. Update documentation
4. Create PR with description
5. Pass CI checks
6. Get code review
7. Merge to main

---

## API Standards

### RESTful Endpoints
```
GET    /resources          - List all
GET    /resources/:id      - Get one
POST   /resources          - Create
PATCH  /resources/:id      - Update
DELETE /resources/:id      - Delete
```

### Response Format
```json
{
  "data": {},
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 10
  },
  "error": null
}
```

### Error Format
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

### Pagination
- Query params: `?page=1&limit=10`
- Default limit: 10
- Max limit: 100
- Include total count in meta

---

## Database Standards

### Naming Conventions
- Tables: `snake_case` plural (e.g., `users`, `organizations`)
- Columns: `snake_case` (e.g., `created_at`, `user_id`)
- Indexes: `idx_table_column` (e.g., `idx_users_email`)
- Foreign keys: `fk_table_column` (e.g., `fk_orders_user_id`)

### Required Columns
Every table must have:
- `id` - UUID primary key
- `created_at` - Timestamp
- `updated_at` - Timestamp

### Soft Deletes
Use `deleted_at` column instead of hard deletes for:
- Users
- Organizations
- Subscriptions
- Any financial records

---

## Security Standards

### Authentication
- Supabase JWT tokens for auth
- API keys for SDK access
- Session tokens for customer portal
- No credentials in code or logs

### Authorization
- Check user ownership of resources
- Validate organization membership
- Use RLS policies in database
- Audit sensitive operations

### Data Protection
- No payment card data storage
- PCI compliance via Stripe
- Encrypt sensitive data at rest
- Use HTTPS everywhere
- Sanitize all inputs

### Security Checklist (Pre-Launch)
- [ ] SQL injection prevention
- [ ] XSS protection
- [ ] CSRF tokens
- [ ] Rate limiting
- [ ] Input validation
- [ ] Error message sanitization

---

## Testing Standards

### Coverage Requirements
- Critical paths: 80% coverage
- Payment flows: 100% coverage
- API endpoints: 70% coverage
- UI components: 50% coverage

### Test Types
1. **Unit Tests** - Individual functions/methods
2. **Integration Tests** - API endpoints
3. **E2E Tests** - Critical user flows
4. **Performance Tests** - Load testing

### Test File Naming
- Unit: `*.spec.ts`
- Integration: `*.integration.spec.ts`
- E2E: `*.e2e.spec.ts`

---

## Performance Standards

### Target Metrics
- Page Load: <2 seconds
- API Response: <200ms (95th percentile)
- Time to Interactive: <3 seconds
- Bundle Size: <200KB gzipped

### Optimization Requirements
- Lazy load components
- Implement caching (Redis)
- Database query optimization
- Image optimization
- Code splitting

---

## Deployment Standards

### Environments
1. **Development** - Local development
2. **Staging** - Testing environment
3. **Production** - Live environment

### Environment Variables
- Never commit `.env` files
- Use `.env.example` for templates
- Document all required variables
- Use strong secrets in production

### Deployment Checklist
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Database migrations ready
- [ ] Environment variables set
- [ ] Monitoring configured
- [ ] Rollback plan ready

---

## Reference Implementation

**Always check Polar.sh first!**
Location: `/Users/ankushkumar/Code/payment/billingos`

Before implementing any feature:
1. Check how Polar does it
2. Copy relevant patterns
3. Simplify for our needs
4. Document differences

---

*Last Updated: February 9, 2026*
*These standards are mandatory for MVP launch*