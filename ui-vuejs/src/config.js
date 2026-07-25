import { CONFIG_DOTNET } from './config.dotnet.js'
import { CONFIG_NODEJS } from './config.nodejs.js'
import { CONFIG_PYTHON } from './config.python.js'

export const CONFIG = {
  DELAY_TIME: 800,
  MATCH_COLORS_COUNT: 5,
  DEFAULT_ENGINE: 'DOTNET',
  ENGINES: {
    DOTNET: { Name: '.Net',    Key: 'DOTNET', Index: 0, ...CONFIG_DOTNET },
    NODEJS: { Name: 'Node.js', Key: 'NODEJS', Index: 1, ...CONFIG_NODEJS },
    PYTHON: { Name: 'Python',  Key: 'PYTHON', Index: 2, ...CONFIG_PYTHON },
  },
}
