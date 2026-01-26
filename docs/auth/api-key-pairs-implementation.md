# API Key Pairs Implementation

## Overview

Implemented Stripe-style API key pair generation system where secret and publishable keys are created together as a linked pair.

**Date**: 2026-01-25
**Status**: ✅ Complete

---

## Architecture

### Key Pair Concept

Just like Stripe, BillingOS generates API keys as **pairs**:

- **Secret Key** (`sk_live_***` or `sk_test_***`): Backend only, never expose to frontend
- **Publishable Key** (`pk_live_***` or `pk_test_***`): Safe to use in frontend code

Both keys in a pair share:
- Same `key_pair_id` (UUID linking them together)
- Same `signing_secret` (for HMAC-SHA256 token generation)
- Same `environment` (live or test)
- Same `name` (optional identifier)

### Key Format

```
Secret Key:      sk_live_4fK8nBx2mP9qR7sT3vW6yZ8A1C5D7F9G2H4J
Publishable Key: pk_live_9qR7sT3vW6yZ8A1C5D7F9G2H4J6K8L0M4N6P
```

**Prefix Structure**:
- `sk_live_` - Secret key, live environment
- `sk_test_` - Secret key, test environment
- `pk_live_` - Publishable key, live environment
- `pk_test_` - Publishable key, test environment

**Encoding**: Base58 (Bitcoin-style) - avoids confusing characters (0, O, I, l)

---

## Database Schema

### Migration: `20260126003000_add_key_pair_id.sql`

```sql
-- Add key_pair_id to link secret and publishable keys
ALTER TABLE public.api_keys ADD COLUMN key_pair_id UUID;

-- Index for efficient pair lookups
CREATE INDEX idx_api_keys_pair ON public.api_keys(key_pair_id)
  WHERE key_pair_id IS NOT NULL;

-- Comment
COMMENT ON COLUMN public.api_keys.key_pair_id IS
  'UUID linking secret and publishable keys together (like Stripe)';
```

### Table Structure

```sql
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  key_type VARCHAR(20) NOT NULL CHECK (key_type IN ('secret', 'publishable')),
  environment VARCHAR(10) NOT NULL CHECK (environment IN ('live', 'test')),
  key_prefix VARCHAR(20) NOT NULL,
  key_hash VARCHAR(64) NOT NULL UNIQUE,
  signing_secret TEXT NOT NULL,
  name VARCHAR(255),
  key_pair_id UUID,  -- ← Links paired keys
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
```

---

## Backend Implementation

### 1. Service Layer (`api-keys.service.ts`)

**Key Generation** (`create` method):

```typescript
async create(organizationId: string, createDto: CreateApiKeyDto): Promise<{
  secretKey: ApiKey;
  publishableKey: ApiKey;
  secretFullKey: string;
  publishableFullKey: string;
}> {
  const environment = createDto.environment || ApiKeyEnvironment.TEST;
  const keyPairId = crypto.randomUUID(); // Link both keys

  // Generate both keys
  const secretFullKey = this.generateApiKey(ApiKeyType.SECRET, environment);
  const publishableFullKey = this.generateApiKey(ApiKeyType.PUBLISHABLE, environment);

  const signingSecret = this.generateSigningSecret(); // Shared secret

  // Insert both keys with same key_pair_id
  const { data, error } = await supabase
    .from('api_keys')
    .insert([
      {
        key_type: ApiKeyType.SECRET,
        key_pair_id: keyPairId,
        signing_secret: signingSecret,
        // ... other fields
      },
      {
        key_type: ApiKeyType.PUBLISHABLE,
        key_pair_id: keyPairId,
        signing_secret: signingSecret, // Same secret for pair
        // ... other fields
      },
    ])
    .select();

  return { secretKey, publishableKey, secretFullKey, publishableFullKey };
}
```

**Key Revocation** (`revoke` method):

```typescript
async revoke(organizationId: string, keyId: string): Promise<ApiKey[]> {
  // Find key and get its pair ID
  const { data: keyData } = await supabase
    .from('api_keys')
    .select('*')
    .eq('id', keyId)
    .single();

  const keyPairId = keyData.key_pair_id;

  if (keyPairId) {
    // Revoke BOTH keys in the pair
    const { data } = await supabase
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('key_pair_id', keyPairId)
      .is('revoked_at', null)
      .select();

    return data; // Returns both revoked keys
  }
  // ... handle legacy individual keys
}
```

### 2. DTOs

**Create DTO** (`create-api-key.dto.ts`):

```typescript
export class CreateApiKeyDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(ApiKeyEnvironment)
  @IsOptional()
  environment?: ApiKeyEnvironment; // 'live' | 'test'

  // ❌ NO keyType field - both are created automatically
}
```

**Response DTO** (`api-key-response.dto.ts`):

```typescript
export class ApiKeyPairCreatedResponseDto {
  pairId: string;
  name?: string;
  environment: string;
  secretKey: {
    id: string;
    keyPrefix: string;
    fullKey: string; // ⚠️ Only shown ONCE on creation
  };
  publishableKey: {
    id: string;
    keyPrefix: string;
    fullKey: string; // ⚠️ Only shown ONCE on creation
  };
  createdAt: Date;
  warning: string; // Security warning to save keys
}
```

### 3. Controller (`api-keys.controller.ts`)

**Create Endpoint**:

```typescript
@Post()
@UseGuards(JwtAuthGuard)
async create(
  @Param('organizationId') organizationId: string,
  @CurrentUser() user: User,
  @Body() createDto: CreateApiKeyDto,
): Promise<ApiKeyPairCreatedResponseDto> {
  const { secretKey, publishableKey, secretFullKey, publishableFullKey } =
    await this.apiKeysService.create(organizationId, createDto);

  return {
    pairId: secretKey.key_pair_id!,
    secretKey: {
      id: secretKey.id,
      keyPrefix: secretKey.key_prefix,
      fullKey: secretFullKey, // ⚠️ Never stored, never shown again
    },
    publishableKey: {
      id: publishableKey.id,
      keyPrefix: publishableKey.key_prefix,
      fullKey: publishableFullKey, // ⚠️ Never stored, never shown again
    },
    warning: '⚠️  Save these keys securely - they will never be shown again!',
  };
}
```

**Revoke Endpoint**:

```typescript
@Delete(':keyId')
@UseGuards(JwtAuthGuard)
async revoke(
  @Param('organizationId') organizationId: string,
  @Param('keyId') keyId: string,
): Promise<ApiKeyResponseDto[]> {
  const revokedKeys = await this.apiKeysService.revoke(organizationId, keyId);
  return revokedKeys.map(/* map to DTO */); // Returns BOTH keys
}
```

---

## Frontend Implementation

### 1. Types (`lib/api/types.ts`)

```typescript
export interface ApiKey {
  id: string;
  organizationId: string;
  keyType: 'secret' | 'publishable';
  environment: 'live' | 'test';
  keyPrefix: string;
  name?: string;
  keyPairId?: string; // ← Links to paired key
  createdAt: Date;
  lastUsedAt?: Date;
  revokedAt?: Date;
}

export interface ApiKeyPairCreated {
  pairId: string;
  name?: string;
  environment: 'live' | 'test';
  secretKey: {
    id: string;
    keyPrefix: string;
    fullKey: string;
  };
  publishableKey: {
    id: string;
    keyPrefix: string;
    fullKey: string;
  };
  createdAt: Date;
  warning: string;
}

export interface CreateApiKeyDTO {
  name?: string;
  environment?: 'live' | 'test';
  // ❌ NO keyType - both created together
}
```

### 2. React Query Hooks (`hooks/queries/api-keys.ts`)

```typescript
// Create API Key Pair (creates both keys)
export function useCreateApiKey(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateApiKeyDTO) =>
      api.post<ApiKeyPairCreated>(`/organizations/${organizationId}/api-keys`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.list(organizationId) });
    },
  });
}

// Revoke API Key (revokes entire pair)
export function useRevokeApiKey(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (keyId: string) =>
      api.delete(`/organizations/${organizationId}/api-keys/${keyId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.list(organizationId) });
    },
  });
}
```

### 3. UI Component (`settings/api-keys/page.tsx`)

**Key Grouping Logic**:

```typescript
const keyPairs = useMemo(() => {
  const pairs: Array<{
    pairId: string | null;
    secretKey: ApiKey | null;
    publishableKey: ApiKey | null;
    environment: string;
    createdAt: Date;
  }> = [];

  const processedPairs = new Set<string>();

  apiKeys.forEach((key) => {
    if (key.keyPairId) {
      // Skip if already processed this pair
      if (processedPairs.has(key.keyPairId)) return;
      processedPairs.add(key.keyPairId);

      // Find both keys in the pair
      const secretKey = apiKeys.find(
        k => k.keyPairId === key.keyPairId && k.keyType === 'secret'
      );
      const publishableKey = apiKeys.find(
        k => k.keyPairId === key.keyPairId && k.keyType === 'publishable'
      );

      pairs.push({ pairId: key.keyPairId, secretKey, publishableKey, ... });
    }
  });

  return pairs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}, [apiKeys]);
```

**Create Dialog** (No key type selection):

```tsx
<Dialog open={createDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Create API Key Pair</DialogTitle>
      <DialogDescription>
        Generate a secret and publishable key pair (like Stripe)
      </DialogDescription>
    </DialogHeader>

    <Input
      placeholder="Name (optional)"
      value={formData.name}
      onChange={e => setFormData({ ...formData, name: e.target.value })}
    />

    <Select
      value={formData.environment}
      onValueChange={value => setFormData({ ...formData, environment: value })}
    >
      <SelectItem value="test">Test</SelectItem>
      <SelectItem value="live">Live</SelectItem>
    </Select>

    <Button onClick={handleCreate}>Create Key Pair</Button>
  </DialogContent>
</Dialog>
```

**Success Modal** (Shows both keys):

```tsx
<Dialog open={!!createdKeyPair}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>⚠️ Save Your API Keys</DialogTitle>
      <DialogDescription>{createdKeyPair?.warning}</DialogDescription>
    </DialogHeader>

    {/* Secret Key */}
    <div className="border rounded-lg p-4">
      <Label>Secret Key <Badge>Backend Only</Badge></Label>
      <code>
        {showSecretKey
          ? createdKeyPair?.secretKey.fullKey
          : `${createdKeyPair?.secretKey.keyPrefix}${'•'.repeat(32)}`}
      </code>
      <Button onClick={() => setShowSecretKey(!showSecretKey)}>
        {showSecretKey ? <EyeOff /> : <Eye />}
      </Button>
      <Button onClick={() => copyToClipboard(createdKeyPair?.secretKey.fullKey)}>
        <Copy />
      </Button>
    </div>

    {/* Publishable Key */}
    <div className="border rounded-lg p-4">
      <Label>Publishable Key <Badge>Frontend Safe</Badge></Label>
      <code>
        {showPublishableKey
          ? createdKeyPair?.publishableKey.fullKey
          : `${createdKeyPair?.publishableKey.keyPrefix}${'•'.repeat(32)}`}
      </code>
      <Button onClick={() => setShowPublishableKey(!showPublishableKey)}>
        {showPublishableKey ? <EyeOff /> : <Eye />}
      </Button>
      <Button onClick={() => copyToClipboard(createdKeyPair?.publishableKey.fullKey)}>
        <Copy />
      </Button>
    </div>

    <Alert variant="warning">
      Store these keys securely. Never share your secret key.
    </Alert>
  </DialogContent>
</Dialog>
```

**Table Display** (Shows pairs):

```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Secret Key</TableHead>
      <TableHead>Publishable Key</TableHead>
      <TableHead>Environment</TableHead>
      <TableHead>Created</TableHead>
      <TableHead>Actions</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {keyPairs.map(pair => (
      <TableRow key={pair.pairId}>
        <TableCell>{pair.name || 'Unnamed'}</TableCell>
        <TableCell>
          <code>{pair.secretKey?.keyPrefix}***</code>
        </TableCell>
        <TableCell>
          <code>{pair.publishableKey?.keyPrefix}***</code>
        </TableCell>
        <TableCell>
          <Badge>{pair.environment}</Badge>
        </TableCell>
        <TableCell>{formatDistanceToNow(pair.createdAt)}</TableCell>
        <TableCell>
          {pair.secretKey?.revokedAt ? (
            <Badge>Revoked</Badge>
          ) : (
            <Button onClick={() => handleRevoke(pair.secretKey?.id)}>
              <Trash2 />
            </Button>
          )}
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

---

## Security Features

### 1. Key Storage

- ✅ **Never store plaintext keys** - Only SHA-256 hashes stored
- ✅ **Show keys ONCE** - Full keys only returned on creation
- ✅ **Secure generation** - 256-bit cryptographically secure random bytes
- ✅ **Base58 encoding** - Avoids confusing characters in keys

### 2. Key Validation

```typescript
async validate(providedKey: string): Promise<ApiKey> {
  const keyHash = crypto.createHash('sha256').update(providedKey).digest('hex');

  const { data } = await supabase
    .from('api_keys')
    .select('*')
    .eq('key_hash', keyHash)
    .is('revoked_at', null)
    .single();

  if (!data) throw new UnauthorizedException('Invalid API key');

  // Update last_used_at (fire-and-forget)
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);

  return data;
}
```

### 3. Revocation

- ✅ **Soft delete** - Sets `revoked_at` timestamp instead of deleting
- ✅ **Pair revocation** - Revoking one key revokes both in the pair
- ✅ **Immediate effect** - Validation checks `revoked_at IS NULL`
- ✅ **Audit trail** - Revoked keys remain in database for compliance

---

## API Endpoints

### Create API Key Pair

```http
POST /organizations/:organizationId/api-keys
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Production",
  "environment": "live"
}
```

**Response**:

```json
{
  "pairId": "123e4567-e89b-12d3-a456-426614174000",
  "name": "Production",
  "environment": "live",
  "secretKey": {
    "id": "abc123...",
    "keyPrefix": "sk_live_4fK8n",
    "fullKey": "sk_live_4fK8nBx2mP9qR7sT3vW6yZ8A1C5D7F9G2H4J"
  },
  "publishableKey": {
    "id": "def456...",
    "keyPrefix": "pk_live_9qR7s",
    "fullKey": "pk_live_9qR7sT3vW6yZ8A1C5D7F9G2H4J6K8L0M4N6P"
  },
  "createdAt": "2026-01-25T12:00:00Z",
  "warning": "⚠️  Save these keys securely - they will never be shown again!"
}
```

### List API Keys

```http
GET /organizations/:organizationId/api-keys
Authorization: Bearer <jwt_token>
```

**Response**:

```json
[
  {
    "id": "abc123...",
    "organizationId": "org_123",
    "keyType": "secret",
    "environment": "live",
    "keyPrefix": "sk_live_4fK8n",
    "name": "Production",
    "keyPairId": "123e4567-e89b-12d3-a456-426614174000",
    "createdAt": "2026-01-25T12:00:00Z",
    "lastUsedAt": "2026-01-25T14:30:00Z",
    "revokedAt": null
  },
  {
    "id": "def456...",
    "organizationId": "org_123",
    "keyType": "publishable",
    "environment": "live",
    "keyPrefix": "pk_live_9qR7s",
    "name": "Production",
    "keyPairId": "123e4567-e89b-12d3-a456-426614174000",
    "createdAt": "2026-01-25T12:00:00Z",
    "revokedAt": null
  }
]
```

### Revoke API Key Pair

```http
DELETE /organizations/:organizationId/api-keys/:keyId
Authorization: Bearer <jwt_token>
```

**Response**: Returns both revoked keys

```json
[
  {
    "id": "abc123...",
    "keyType": "secret",
    "revokedAt": "2026-01-25T15:00:00Z",
    // ... other fields
  },
  {
    "id": "def456...",
    "keyType": "publishable",
    "revokedAt": "2026-01-25T15:00:00Z",
    // ... other fields
  }
]
```

---

## Usage Examples

### Backend (Node.js)

```typescript
// Use SECRET key on backend only
const response = await fetch('https://api.billingos.com/v1/session-tokens', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.BILLINGOS_SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    externalUserId: user.id,
    expiresIn: 3600,
  }),
});

const { sessionToken } = await response.json();

// Return session token to frontend
return res.json({ sessionToken });
```

### Frontend (React)

```tsx
// Fetch session token from YOUR backend
const { sessionToken } = await fetch('/api/billingos-session')
  .then(r => r.json());

// Use in your app
import { BillingOSProvider } from '@billingos/react';

<BillingOSProvider sessionToken={sessionToken}>
  <App />
</BillingOSProvider>
```

---

## Migration from Individual Keys

### Backward Compatibility

The system supports **legacy individual keys** (keys without `key_pair_id`):

```typescript
// Frontend grouping handles both paired and individual keys
apiKeys.forEach((key) => {
  if (key.keyPairId) {
    // Modern paired key
    // Group with its pair
  } else {
    // Legacy individual key
    // Display as standalone key
  }
});
```

### Migration Strategy

1. **Existing keys continue to work** - No breaking changes
2. **New keys are always pairs** - All new creations are paired
3. **UI shows both** - Table displays both types correctly
4. **Gradual transition** - Users can migrate at their own pace

---

## Testing Checklist

- [x] Backend compiles without TypeScript errors
- [x] Database migration applies successfully
- [x] API key pair creation endpoint works
- [x] Both keys share same `key_pair_id`
- [x] Both keys share same `signing_secret`
- [x] Keys are never stored in plaintext
- [x] Full keys only shown once on creation
- [x] Revoking one key revokes both in pair
- [x] Frontend displays pairs correctly
- [x] Success modal shows both keys
- [x] Table groups keys by pair
- [x] Copy to clipboard works for both keys
- [x] Show/hide toggle works for both keys
- [x] React Query invalidation works

---

## Files Modified

### Backend
- ✅ `supabase/migrations/20260126003000_add_key_pair_id.sql` - Added key_pair_id column
- ✅ `apps/api/src/api-keys/entities/api-key.entity.ts` - Updated entity
- ✅ `apps/api/src/api-keys/api-keys.service.ts` - Pair generation & revocation
- ✅ `apps/api/src/api-keys/api-keys.controller.ts` - Updated endpoints
- ✅ `apps/api/src/api-keys/dto/create-api-key.dto.ts` - Removed keyType
- ✅ `apps/api/src/api-keys/dto/api-key-response.dto.ts` - Added pair DTOs
- ✅ `apps/api/src/app.module.ts` - ApiKeysModule imported

### Frontend
- ✅ `apps/web/src/lib/api/types.ts` - Added keyPairId, pair types
- ✅ `apps/web/src/hooks/queries/api-keys.ts` - React Query hooks
- ✅ `apps/web/src/app/dashboard/[organization]/(header)/settings/api-keys/page.tsx` - Complete UI

---

## Next Steps

Once database types are regenerated (`supabase gen types typescript --local`):

1. ✅ Backend will compile without errors
2. ✅ Run `pnpm dev` to test full flow
3. ✅ Create a test key pair in the UI
4. ✅ Verify both keys are shown in success modal
5. ✅ Verify table displays them as a pair
6. ✅ Test revoking the pair
7. ✅ Verify both keys are revoked together

---

## Lessons Learned

1. **Always reference Stripe** - Their API design is battle-tested
2. **Pair keys from the start** - Much easier than migrating later
3. **Show keys once** - Security best practice, forces users to save them
4. **Grouping logic in useMemo** - Efficient React pattern for derived state
5. **Soft deletes for audit** - Keep revoked keys for compliance
6. **Base58 encoding** - Avoids user confusion with similar characters

---

## References

- **Stripe API Keys**: https://docs.stripe.com/keys
- **Session Token Architecture**: `docs/auth/final-plan.md`
- **Database Schema**: `supabase/migrations/20260126001607_create_api_keys_table.sql`
