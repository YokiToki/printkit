import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Section } from './Section'
import { Toggle } from './Toggle'

const meta: Meta<typeof Section> = {
  title: 'UI/Section',
  component: Section,
}

export default meta
type Story = StoryObj<typeof Section>

export const Default: Story = {
  render: () => (
    <div className="w-80 rounded-card border border-border bg-surface-1">
      <Section title="Dimensions" summary="2 × 3 units">
        <div className="text-xs text-text-muted">Section content goes here.</div>
      </Section>
    </div>
  ),
}

export const Open: Story = {
  render: () => {
    const [open, setOpen] = useState(true)
    return (
      <div className="w-80 rounded-card border border-border bg-surface-1">
        <Section title="Grid Size" summary="42 × 42 mm" open={open} onOpenChange={setOpen}>
          <div className="text-xs text-text-muted">Pitch: 42 mm, Clearance: 0.5 mm</div>
        </Section>
      </div>
    )
  },
}

export const ModifiedHighlight: Story = {
  render: () => (
    <div className="w-80 rounded-card border border-border bg-surface-1">
      <Section
        title="Fasteners"
        summary="Manual (4 magnets)"
        modified={true}
        onReset={() => alert('Reset to defaults')}
      >
        <Toggle label="Corner Screws" checked={true} onChange={() => {}} />
      </Section>
    </div>
  ),
}

export const WithResetAction: Story = {
  render: () => {
    const [open, setOpen] = useState(true)
    const [changed, setChanged] = useState(true)
    return (
      <div className="w-80 rounded-card border border-border bg-surface-1">
        <Section
          title="Wall Thickness"
          summary={changed ? '2.4 mm' : '1.2 mm'}
          modified={changed}
          open={open}
          onOpenChange={setOpen}
          onReset={() => setChanged(false)}
        >
          <div className="text-xs text-text-muted">
            {changed ? 'Customized outer wall thickness.' : 'Default standard walls.'}
          </div>
        </Section>
      </div>
    )
  },
}
