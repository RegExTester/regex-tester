import { CONFIG_DOTNET } from './config.dotnet.js'
import { CONFIG_NODEJS } from './config.nodejs.js'

export const CONFIG = {
  DELAY_TIME: 800,
  MATCH_COLORS_COUNT: 5,
  DEFAULT_ENGINE: 'DOTNET',
  ENGINES: {
    DOTNET: { Name: '.Net',    Key: 'DOTNET', Index: 0, ...CONFIG_DOTNET },
    NODEJS: { Name: 'Node.js', Key: 'NODEJS', Index: 1, ...CONFIG_NODEJS },
  },
}
