'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BenefitType, benefitTypeDisplayNames } from '@/utils/benefit'
import { useState } from 'react'

interface BenefitFormData {
  description: string
  type: BenefitType
  properties?: Record<string, any>
}

interface BenefitFormProps {
  initialData?: Partial<BenefitFormData>
  onSubmit: (data: BenefitFormData) => Promise<void>
  onCancel: () => void
  isUpdate?: boolean
  isSubmitting?: boolean
}

export function BenefitForm({
  initialData,
  onSubmit,
  onCancel,
  isUpdate = false,
  isSubmitting = false,
}: BenefitFormProps) {
  const [description, setDescription] = useState(
    initialData?.description || '',
  )
  const [type, setType] = useState<BenefitType>(
    initialData?.type || 'custom',
  )

  // Custom benefit properties
  const [customNote, setCustomNote] = useState('')

  // Discord benefit properties
  const [discordRoleId, setDiscordRoleId] = useState('')
  const [kickMember, setKickMember] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    let properties: Record<string, any> = {}

    if (type === 'custom') {
      properties = {
        note: customNote || undefined,
      }
    } else if (type === 'discord') {
      properties = {
        role_id: discordRoleId || undefined,
        kick_member: kickMember,
      }
    }

    const data: BenefitFormData = {
      description,
      type,
      properties,
    }

    await onSubmit(data)
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 space-y-6 overflow-y-auto px-8 py-6">
        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">
            Description <span className="text-destructive">*</span>
          </Label>
          <Input
            id="description"
            placeholder="Premium Support"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            minLength={3}
            maxLength={42}
            required
          />
          <p className="text-xs text-muted-foreground">
            Short description of the benefit (3-42 characters)
          </p>
        </div>

        {/* Benefit Type */}
        {!isUpdate && (
          <div className="space-y-2">
            <Label htmlFor="type">
              Type <span className="text-destructive">*</span>
            </Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as BenefitType)}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(benefitTypeDisplayNames).map(([key, name]) => (
                  <SelectItem key={key} value={key}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Cannot be changed after creation
            </p>
          </div>
        )}

        {/* Type-specific fields */}
        <div className="space-y-4">
          {/* Custom Benefit */}
          {type === 'custom' && (
            <div className="space-y-2">
              <Label htmlFor="customNote">
                Note <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="customNote"
                placeholder="Instructions for accessing premium content..."
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Private note with instructions or links (supports markdown)
              </p>
            </div>
          )}

          {/* Discord Benefit */}
          {type === 'discord' && (
            <>
              <div className="rounded-lg border bg-muted/50 p-4">
                <p className="text-sm text-muted-foreground">
                  Discord integration requires OAuth connection. Full
                  implementation coming soon.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="discordRoleId">
                  Role ID <span className="text-muted-foreground">(placeholder)</span>
                </Label>
                <Input
                  id="discordRoleId"
                  placeholder="Enter Discord role ID"
                  value={discordRoleId}
                  onChange={(e) => setDiscordRoleId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Discord role to grant to subscribers
                </p>
              </div>
            </>
          )}

          {/* GitHub Repository Benefit */}
          {type === 'github_repository' && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">
                GitHub repository access management coming soon. Requires OAuth
                integration.
              </p>
            </div>
          )}

          {/* Downloadables Benefit */}
          {type === 'downloadables' && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">
                File downloads feature coming soon. Upload and manage files for
                subscribers.
              </p>
            </div>
          )}

          {/* License Keys Benefit */}
          {type === 'license_keys' && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">
                License key generation and management coming soon.
              </p>
            </div>
          )}

          {/* Meter Credit Benefit */}
          {type === 'meter_credit' && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">
                Usage-based credit system coming soon. Grant credits to
                subscribers.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex shrink-0 items-center justify-end gap-3 border-t px-8 py-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || !description || description.length < 3}
        >
          {isSubmitting
            ? isUpdate
              ? 'Updating...'
              : 'Creating...'
            : isUpdate
              ? 'Update Benefit'
              : 'Create Benefit'}
        </Button>
      </div>
    </form>
  )
}
