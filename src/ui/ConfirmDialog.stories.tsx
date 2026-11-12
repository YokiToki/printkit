import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog'
import { Button } from './Button'

const meta: Meta<typeof ConfirmDialog> = {
  title: 'UI/ConfirmDialog',
  component: ConfirmDialog,
}

export default meta
type Story = StoryObj<typeof ConfirmDialog>

export const Interactive: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    return (
      <div>
        <Button danger onClick={() => setOpen(true)}>
          Delete Feature
        </Button>
        {open && (
          <ConfirmDialog
            title="Delete Selected Extrusion?"
            confirmLabel="Delete"
            cancelLabel="Cancel"
            danger
            onConfirm={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          >
            This action cannot be undone. Downstream operations depending on this face may break.
          </ConfirmDialog>
        )}
      </div>
    )
  },
}

export const StandardNotice: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    return (
      <div>
        <Button onClick={() => setOpen(true)}>Reset Defaults</Button>
        {open && (
          <ConfirmDialog
            title="Reset All Parameters?"
            confirmLabel="Reset"
            cancelLabel="Keep Current"
            onConfirm={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          >
            All custom thicknesses, dividers, and lip options will revert to factory defaults.
          </ConfirmDialog>
        )}
      </div>
    )
  },
}
