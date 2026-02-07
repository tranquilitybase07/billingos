'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, TrendingDown, Users, DollarSign } from 'lucide-react';

interface VersioningChange {
  type: 'price_increase' | 'price_decrease' | 'price_archive' | 'feature_removal' | 'feature_reduction' | 'trial_reduction';
  description: string;
  oldValue?: string | number;
  newValue?: string | number;
}

interface VersionWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  currentVersion: number;
  newVersion: number;
  affectedSubscriptions: number;
  changes: string[];
  revenueImpact?: {
    monthly: number;
    annual: number;
  };
  isLoading?: boolean;
}

export function VersionWarningModal({
  isOpen,
  onClose,
  onConfirm,
  currentVersion,
  newVersion,
  affectedSubscriptions,
  changes,
  revenueImpact,
  isLoading = false,
}: VersionWarningModalProps) {
  // Parse changes to categorize them
  const parseChanges = (changes: string[]) => {
    return changes.map(change => {
      if (change.includes('price')) {
        return {
          icon: <DollarSign className="h-4 w-4" />,
          text: change,
          type: 'price' as const,
        };
      } else if (change.includes('feature') || change.includes('Feature')) {
        return {
          icon: <TrendingDown className="h-4 w-4" />,
          text: change,
          type: 'feature' as const,
        };
      } else if (change.includes('trial')) {
        return {
          icon: <AlertTriangle className="h-4 w-4" />,
          text: change,
          type: 'trial' as const,
        };
      }
      return {
        icon: <AlertTriangle className="h-4 w-4" />,
        text: change,
        type: 'other' as const,
      };
    });
  };

  const parsedChanges = parseChanges(changes);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Product Version Warning
          </DialogTitle>
          <DialogDescription>
            Your changes will create a new product version
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Changes List */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Changes Detected:</h3>
            <div className="space-y-2">
              {parsedChanges.map((change, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 p-2 bg-muted rounded-md"
                >
                  <div className="text-muted-foreground mt-0.5">{change.icon}</div>
                  <span className="text-sm">{change.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Impact Summary */}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Impact Summary:</span>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <Users className="h-3 w-3" />
                    <span>
                      <strong>{affectedSubscriptions}</strong> existing customers will stay on v{currentVersion}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3 w-3" />
                    <span>
                      New customers will get v{newVersion} with the changes
                    </span>
                  </div>
                  {revenueImpact && (
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-3 w-3" />
                      <span>
                        Revenue impact: <strong className="text-red-600">-${revenueImpact.monthly}/mo</strong> until migration
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </AlertDescription>
          </Alert>

          {/* Explanation */}
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md">
            <p className="text-sm text-blue-900 dark:text-blue-200">
              <strong>Why versioning?</strong> This protects your existing customers from unexpected changes.
              They'll continue with their current pricing and features until you explicitly migrate them.
            </p>
          </div>

          {/* Version Info */}
          <div className="flex items-center justify-center gap-4 py-2">
            <div className="text-center">
              <div className="text-2xl font-bold">v{currentVersion}</div>
              <div className="text-xs text-muted-foreground">Current Version</div>
            </div>
            <div className="text-muted-foreground">→</div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">v{newVersion}</div>
              <div className="text-xs text-muted-foreground">New Version</div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isLoading}>
            {isLoading ? 'Creating Version...' : `Create Version ${newVersion}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}