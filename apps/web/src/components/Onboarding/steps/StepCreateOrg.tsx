'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useCreateOrganization } from '@/hooks/queries/organization';
import { ContinueButton } from '../ContinueButton';
import { insightVariants } from '../motion';

interface StepCreateOrgProps {
  onOrgCreated: (slug: string) => void;
}

export function StepCreateOrg({ onOrgCreated }: StepCreateOrgProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [autoSlug, setAutoSlug] = useState(true);

  const createOrg = useCreateOrganization();

  const handleNameChange = (value: string) => {
    setName(value);
    if (autoSlug) {
      const generatedSlug = value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      setSlug(generatedSlug);
    }
  };

  const handleSlugChange = (value: string) => {
    setAutoSlug(false);
    setSlug(value);
  };

  const handleCreate = async () => {
    try {
      const organization = await createOrg.mutateAsync({ name, slug });
      onOrgCreated(organization.slug);
    } catch {
      // Error shown via createOrg.error
    }
  };

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Icon */}
      <div className="mt-8 text-4xl select-none" role="img" aria-label="Building">
        🏢
      </div>

      {/* Title */}
      <h1 className="text-xl font-bold text-foreground text-center -mt-2">
        Create your organization
      </h1>
      <p className="text-sm text-muted-foreground text-center -mt-4">
        This is where your products, customers, and billing live.
      </p>

      {/* Form Fields */}
      <div className="w-full flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="org-name" className="text-sm font-medium text-foreground">
            Organization Name
          </label>
          <input
            id="org-name"
            type="text"
            placeholder="Acme Inc"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            minLength={2}
            maxLength={255}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="org-slug" className="text-sm font-medium text-foreground">
            URL Slug
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">billingos.com/</span>
            <input
              id="org-slug"
              type="text"
              placeholder="acme-inc"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              pattern="[a-z0-9-]+"
              minLength={2}
              maxLength={255}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Only lowercase letters, numbers, and hyphens
          </p>
        </div>
      </div>

      {/* Error state */}
      {createOrg.error && (
        <motion.div
          className="w-full rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive"
          variants={insightVariants}
          initial="initial"
          animate="animate"
        >
          {createOrg.error instanceof Error
            ? createOrg.error.message
            : 'Failed to create organization'}
        </motion.div>
      )}

      {/* Create Button */}
      <div className="w-full">
        <ContinueButton
          label={createOrg.isPending ? 'Creating...' : 'Create Organization'}
          onClick={handleCreate}
          disabled={!name || !slug || createOrg.isPending}
        />
      </div>
    </div>
  );
}
