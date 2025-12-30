'use client'

import Button from '@/components/atoms/Button'
import { Card } from '@/components/atoms/Card'
import { useState } from 'react'

export default function ComponentsTestPage() {
  const [darkMode, setDarkMode] = useState(false)

  const toggleDarkMode = () => {
    setDarkMode(!darkMode)
    document.documentElement.classList.toggle('dark')
  }

  return (
    <div className="min-h-screen p-8 bg-background">
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground">Polar UI Components</h1>
            <p className="text-muted-foreground mt-2">
              Migration successful! All 61 components from Polar are now available.
            </p>
          </div>
          <Button onClick={toggleDarkMode}>
            {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
          </Button>
        </div>

        {/* Migration Summary */}
        <Card className="p-8">
          <h2 className="text-2xl font-bold mb-4 text-foreground">✅ Migration Complete</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-4xl font-bold text-blue-600">27</div>
              <div className="text-sm text-muted-foreground">shadcn/ui Base Components</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-green-600">33</div>
              <div className="text-sm text-muted-foreground">Atoms Components</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-purple-600">1</div>
              <div className="text-sm text-muted-foreground">Molecules Components</div>
            </div>
          </div>
        </Card>

        {/* Buttons Demo */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 text-foreground">Buttons</h2>
          <Card className="p-6">
            <div className="flex flex-wrap gap-4">
              <Button>Default Button</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button size="sm">Small</Button>
              <Button size="lg">Large</Button>
            </div>
          </Card>
        </section>

        {/* Cards Demo */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 text-foreground">Cards with Polar Styling</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-2">Card 1</h3>
              <p className="text-sm text-muted-foreground">
                Cards feature Polar&apos;s signature rounded-4xl corners (32px border radius)
              </p>
            </Card>
            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-2">Card 2</h3>
              <p className="text-sm text-muted-foreground">
                Background uses gray-100 in light mode, polar-800 in dark mode
              </p>
            </Card>
            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-2">Card 3</h3>
              <p className="text-sm text-muted-foreground">
                Transparent borders with subtle shadows create depth
              </p>
            </Card>
          </div>
        </section>

        {/* Color Palette */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 text-foreground">Color Palette (OKLCH)</h2>
          <Card className="p-6 space-y-4">
            <div>
              <h3 className="text-sm font-medium mb-2">Blue Scale</h3>
              <div className="flex gap-2">
                <div className="h-12 w-12 rounded-lg bg-blue-50 border border-border" />
                <div className="h-12 w-12 rounded-lg bg-blue-100 border border-border" />
                <div className="h-12 w-12 rounded-lg bg-blue-200 border border-border" />
                <div className="h-12 w-12 rounded-lg bg-blue-300 border border-border" />
                <div className="h-12 w-12 rounded-lg bg-blue-400 border border-border" />
                <div className="h-12 w-12 rounded-lg bg-blue-500 border border-border" />
                <div className="h-12 w-12 rounded-lg bg-blue-600 border border-border" />
                <div className="h-12 w-12 rounded-lg bg-blue-700 border border-border" />
                <div className="h-12 w-12 rounded-lg bg-blue-800 border border-border" />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-2">Gray Scale</h3>
              <div className="flex gap-2">
                <div className="h-12 w-12 rounded-lg bg-gray-50 border border-border" />
                <div className="h-12 w-12 rounded-lg bg-gray-100 border border-border" />
                <div className="h-12 w-12 rounded-lg bg-gray-200 border border-border" />
                <div className="h-12 w-12 rounded-lg bg-gray-300 border border-border" />
                <div className="h-12 w-12 rounded-lg bg-gray-400 border border-border" />
                <div className="h-12 w-12 rounded-lg bg-gray-500 border border-border" />
                <div className="h-12 w-12 rounded-lg bg-gray-600 border border-border" />
                <div className="h-12 w-12 rounded-lg bg-gray-700 border border-border" />
                <div className="h-12 w-12 rounded-lg bg-gray-800 border border-border" />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-2">Polar Scale (Dark Mode)</h3>
              <div className="flex gap-2">
                <div className="h-12 w-12 rounded-lg bg-polar-700 border border-border" />
                <div className="h-12 w-12 rounded-lg bg-polar-800 border border-border" />
                <div className="h-12 w-12 rounded-lg bg-polar-900 border border-border" />
                <div className="h-12 w-12 rounded-lg bg-polar-950 border border-border" />
              </div>
            </div>
          </Card>
        </section>

        {/* Typography */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 text-foreground">Typography - Geist Fonts</h2>
          <Card className="p-6 space-y-3">
            <p className="text-4xl font-bold">Heading 1 - Geist Sans</p>
            <p className="text-3xl font-semibold">Heading 2 - Geist Sans</p>
            <p className="text-2xl">Heading 3 - Geist Sans</p>
            <p className="text-base">Body text with Geist Sans - Regular weight</p>
            <p className="text-sm text-muted-foreground">Small muted text</p>
            <code className="font-mono text-sm bg-muted px-3 py-1.5 rounded-lg block mt-2">
              Code with Geist Mono font
            </code>
          </Card>
        </section>

        {/* Components List */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 text-foreground">Available Components</h2>
          <Card className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <h3 className="font-semibold mb-2 text-blue-600">shadcn/ui Base (27)</h3>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Accordion</li>
                  <li>• Alert Dialog</li>
                  <li>• Button</li>
                  <li>• Calendar</li>
                  <li>• Card</li>
                  <li>• Chart</li>
                  <li>• Checkbox</li>
                  <li>• Command</li>
                  <li>• Dialog</li>
                  <li>...and 18 more</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-2 text-green-600">Atoms (33)</h3>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Button (enhanced)</li>
                  <li>• Card (enhanced)</li>
                  <li>• Input</li>
                  <li>• MoneyInput</li>
                  <li>• PercentageInput</li>
                  <li>• Select</li>
                  <li>• CountryPicker</li>
                  <li>• DataTable</li>
                  <li>• DateTimePicker</li>
                  <li>...and 24 more</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-2 text-purple-600">Utilities</h3>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• money.ts (currency utils)</li>
                  <li>• theming.ts (Stripe theme)</li>
                  <li>• use-mobile.ts (breakpoint)</li>
                  <li>• tw-animate-css plugin</li>
                  <li>• tailwindcss-radix plugin</li>
                </ul>
              </div>
            </div>
          </Card>
        </section>

        {/* Next Steps */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 text-foreground">Next Steps</h2>
          <Card className="p-6">
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="text-green-600 font-bold">✓</span>
                <div>
                  <strong>Dependencies Installed:</strong> All 23 npm packages including Radix UI, TanStack Table, and Geist fonts
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-600 font-bold">✓</span>
                <div>
                  <strong>Theme Migrated:</strong> Tailwind v4 config with OKLCH colors, custom shadows, and Polar&apos;s design tokens
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-600 font-bold">✓</span>
                <div>
                  <strong>Components Copied:</strong> All 61 components from /ui, /atoms, and /molecules directories
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-blue-600 font-bold">→</span>
                <div>
                  <strong>Start Building:</strong> Import components from @/components/atoms/* or @/components/ui/*
                </div>
              </li>
            </ul>
          </Card>
        </section>
      </div>
    </div>
  )
}
