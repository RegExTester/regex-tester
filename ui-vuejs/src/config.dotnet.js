const apiBase = import.meta.env.VITE_API_DOTNET

export const CONFIG_DOTNET = {
  DEFAULT_OPTIONS: 1 | 2 | 4 | 1024, // IgnoreCase | Multiline | ExplicitCapture | NonBacktracking
  DOCS_URL: 'https://learn.microsoft.com/en-us/dotnet/standard/base-types/regular-expression-options',
  REGEX_OPTIONS: {
    IgnoreCase:              { Value: 1 << 0,  Name: 'Ignore Case' },
    Multiline:               { Value: 1 << 1,  Name: 'Multiline' },
    ExplicitCapture:         { Value: 1 << 2,  Name: 'Explicit Capture' },
    Compiled:                { Value: 1 << 3,  Name: 'Compiled' },
    Singleline:              { Value: 1 << 4,  Name: 'Singleline' },
    IgnorePatternWhitespace: { Value: 1 << 5,  Name: 'Ignore Pattern Whitespace' },
    RightToLeft:             { Value: 1 << 6,  Name: 'Right To Left' },
    ECMAScript:              { Value: 1 << 8,  Name: 'ECMAScript' },
    CultureInvariant:        { Value: 1 << 9,  Name: 'Culture Invariant' },
    NonBacktracking:         { Value: 1 << 10, Name: 'Non Backtracking' },
    ShowCaptures:            { Value: 1 << 15, Name: 'Show Captures' },
  },
  API: {
    REGEX:        apiBase + '/api/regex',
    CAPABILITIES: apiBase + '/api/capabilities',
  },
}
