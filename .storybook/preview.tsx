import type { Preview } from '@storybook/react'
import '../src/app/theme.css'
import i18n from '../src/i18n'
import { UnitProvider } from '../src/ui/UnitProvider'
import React, { useEffect } from 'react'

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#0e1013' },
        { name: 'surface-1', value: '#161a1f' },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  globalTypes: {
    locale: {
      name: 'Language',
      description: 'Internationalization locale',
      defaultValue: 'en',
      toolbar: {
        icon: 'globe',
        items: [
          { value: 'en', title: 'English' },
          { value: 'ru', title: 'Русский' },
        ],
        showName: true,
      },
    },
    unit: {
      name: 'Unit',
      description: 'Display measurement unit',
      defaultValue: 'mm',
      toolbar: {
        icon: 'ruler',
        items: [
          { value: 'mm', title: 'mm' },
          { value: 'in', title: 'in' },
        ],
        showName: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const locale = context.globals.locale || 'en'
      const unit = context.globals.unit || 'mm'

      useEffect(() => {
        if (i18n.language !== locale) {
          void i18n.changeLanguage(locale)
        }
      }, [locale])

      return (
        <UnitProvider initialUnit={unit}>
          <div className="text-text font-sans antialiased p-4">
            <Story />
          </div>
        </UnitProvider>
      )
    },
  ],
}

export default preview
