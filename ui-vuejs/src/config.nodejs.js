const apiBase = import.meta.env.VITE_API_NODEJS

export const CONFIG_NODEJS = {
  DEFAULT_OPTIONS: 4096 | 2048 | 1 | 2, // Global | HasIndices | IgnoreCase | Multiline
  DOCS_URL: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp',
  REGEX_OPTIONS: {
    IgnoreCase:  { Value: 1 << 0,  Name: 'Ignore Case',   Flag: 'i' },
    Multiline:   { Value: 1 << 1,  Name: 'Multiline',     Flag: 'm' },
    Singleline:  { Value: 1 << 4,  Name: 'Singleline',    Flag: 's' },
    HasIndices:  { Value: 1 << 11, Name: 'Has Indices',    Flag: 'd' },
    Global:      { Value: 1 << 12, Name: 'Global',         Flag: 'g' },
    Unicode:     { Value: 1 << 13, Name: 'Unicode',        Flag: 'u' },
    UnicodeSets: { Value: 1 << 14, Name: 'Unicode Sets',   Flag: 'v' },
    Sticky:      { Value: 1 << 16, Name: 'Sticky',         Flag: 'y' }
  },
  API: {
    REGEX:        apiBase + '/api/regex',
    CAPABILITIES: apiBase + '/api/capabilities',
  },
}
