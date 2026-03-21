const apiBaseDotnet = import.meta.env.VITE_API_DOTNET
const apiBaseNodejs = import.meta.env.VITE_API_NODEJS

export const CONFIG = {
  DELAY_TIME: 800,
  MATCH_COLORS_COUNT: 5,
  DEFAULT_OPTIONS: 1 | 2 | 4 | 1024, // IgnoreCase | Multiline | ExplicitCapture | NonBacktracking
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
  ENGINES: {
    DOTNET: { Name: '.Net',    Key: 'DOTNET' },
    NODEJS: { Name: 'Node.js', Key: 'NODEJS' },
  },
  API: {
    DOTNET: {
      INFO:  apiBaseDotnet + '/api/version',
      REGEX: apiBaseDotnet + '/api/regex'
    },
    NODEJS: {
      INFO:  apiBaseNodejs + '/api/version',
      REGEX: apiBaseNodejs + '/api/regex'
    }
  }
}
