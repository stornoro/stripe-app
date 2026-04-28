// Minimal stubs so components can be imported without the full SDK runtime.
// The SDK components are remote-ui custom elements; they do not render into a DOM.
// We replace them with no-op functions that the render() utility from
// @stripe/ui-extension-sdk/testing can mount into a remote root.
import React from 'react'

function stub(name: string) {
  const C = ({ children }: any) => React.createElement(name, null, children)
  C.displayName = name
  return C as any
}

export const Box = stub('Box')
export const Inline = stub('Inline')
export const ContextView = stub('ContextView')
export const SettingsView = stub('SettingsView')
export const FocusView = stub('FocusView')
export const Badge = stub('Badge')
export const Button = stub('Button')
export const Divider = stub('Divider')
export const Notice = stub('Notice')
export const Link = stub('Link')
export const List = stub('List')
export const ListItem = stub('ListItem')
export const Tab = stub('Tab')
export const TabPanel = stub('TabPanel')
export const Switch = stub('Switch')
export const Select = stub('Select')
export const TextField = stub('TextField')
