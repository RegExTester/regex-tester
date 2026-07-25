const apiBase = import.meta.env.VITE_API_JAVA

export const CONFIG_JAVA = {
  DEFAULT_OPTIONS: 1 | 2, // IgnoreCase | Multiline
  DOCS_URL: 'https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/regex/Pattern.html',
  REGEX_OPTIONS: {
    IgnoreCase:              { Value: 1 << 0,  Name: 'Ignore Case' },
    Multiline:               { Value: 1 << 1,  Name: 'Multiline' },
    Singleline:              { Value: 1 << 4,  Name: 'Singleline' },
    IgnorePatternWhitespace: { Value: 1 << 5,  Name: 'Ignore Pattern Whitespace' },
    Unicode:                 { Value: 1 << 13, Name: 'Unicode' },
    ShowCaptures:            { Value: 1 << 15, Name: 'Show Captures' },
  },
  API: {
    REGEX:        apiBase + '/api/regex',
    CAPABILITIES: apiBase + '/api/capabilities',
  },
}
