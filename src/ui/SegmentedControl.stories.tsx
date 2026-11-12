import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { SegmentedControl } from './SegmentedControl'
import { IconBox, IconLayoutGrid, IconCut } from '@tabler/icons-react'

const meta: Meta<typeof SegmentedControl> = {
  title: 'UI/SegmentedControl',
  component: SegmentedControl,
}

export default meta
type Story = StoryObj<typeof SegmentedControl>

export const Default: Story = {
  render: () => {
    const [val, setVal] = useState('units')
    return (
      <SegmentedControl
        ariaLabel="Unit Mode"
        value={val}
        onChange={setVal}
        options={[
          { value: 'units', label: 'Units' },
          { value: 'mm', label: 'mm' },
        ]}
      />
    )
  },
}

export const WithIcons: Story = {
  render: () => {
    const [val, setVal] = useState('box')
    return (
      <SegmentedControl
        ariaLabel="Mode"
        value={val}
        onChange={setVal}
        options={[
          { value: 'box', label: 'Box', icon: <IconBox size={16} /> },
          { value: 'baseplate', label: 'Baseplate', icon: <IconLayoutGrid size={16} /> },
          { value: 'cutout', label: 'Cutout', icon: <IconCut size={16} /> },
        ]}
      />
    )
  },
}

export const FullWidth: Story = {
  render: () => {
    const [val, setVal] = useState('join')
    return (
      <div className="w-80">
        <SegmentedControl
          fill
          ariaLabel="Boolean Operation"
          value={val}
          onChange={setVal}
          options={[
            { value: 'join', label: 'Join' },
            { value: 'cut', label: 'Cut' },
            { value: 'intersect', label: 'Intersect' },
          ]}
        />
      </div>
    )
  },
}

export const AccentHighlight: Story = {
  render: () => {
    const [val, setVal] = useState('model')
    return (
      <SegmentedControl
        accent
        ariaLabel="Workbench"
        value={val}
        onChange={setVal}
        options={[
          { value: 'model', label: 'Model' },
          { value: 'sketch', label: 'Sketch' },
        ]}
      />
    )
  },
}

export const SmallSize: Story = {
  render: () => {
    const [val, setVal] = useState('top')
    return (
      <SegmentedControl
        size="sm"
        ariaLabel="View"
        value={val}
        onChange={setVal}
        options={[
          { value: 'top', label: 'Top' },
          { value: 'front', label: 'Front' },
          { value: 'right', label: 'Right' },
        ]}
      />
    )
  },
}
