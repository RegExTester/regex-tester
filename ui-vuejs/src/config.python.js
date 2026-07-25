const apiBase = import.meta.env.VITE_API_PYTHON

export const CONFIG_PYTHON = {
  DEFAULT_OPTIONS: 1 | 2, // IgnoreCase | Multiline
  DOCS_URL: 'https://docs.python.org/3/library/re.html#flags',
  REGEX_OPTIONS: {
    IgnoreCase:              { Value: 1 << 0,  Name: 'Ignore Case' },
    Multiline:               { Value: 1 << 1,  Name: 'Multiline' },
    Singleline:              { Value: 1 << 4,  Name: 'Singleline' },
    IgnorePatternWhitespace: { Value: 1 << 5,  Name: 'Ignore Pattern Whitespace' },
    Ascii:                   { Value: 1 << 17, Name: 'Ascii' },
    ShowCaptures:            { Value: 1 << 15, Name: 'Show Captures' },
  },
  API: {
    REGEX:        apiBase + '/api/regex',
    CAPABILITIES: apiBase + '/api/capabilities',
  },
}
