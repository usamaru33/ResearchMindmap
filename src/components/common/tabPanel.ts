export const tabId = (id: string, tab: string) => `${id}-tab-${tab}`;
export const panelId = (id: string, tab: string) => `${id}-panel-${tab}`;

/** Props for the panel shown under tab `tab` (it stays mounted while hidden). */
export function tabPanel(id: string, tab: string, value: string) {
  return { role: 'tabpanel', id: panelId(id, tab), 'aria-labelledby': tabId(id, tab), hidden: tab !== value } as const;
}
