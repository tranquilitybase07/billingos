/**
 * Re-export shared types locally so billing module files don't need
 * fragile relative imports reaching 5 levels up into packages/shared.
 */
export type {
  Json,
  Database,
} from '../../../../../packages/shared/types/database';
