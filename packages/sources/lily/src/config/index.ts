import { Requester, util } from '@chainlink/ea-bootstrap'
import { Config } from '@chainlink/types'

export const NAME = 'LILLY'

export const DEFAULT_ENDPOINT = 'messages'

export interface ExtendedConfig extends Config {
  DB_URL?: string
}

export const makeConfig = (prefix?: string): ExtendedConfig => {
  const DB_URL = util.getEnv('DB_URL', prefix)
  return {
    ...Requester.getDefaultConfig(prefix, true),
    DB_URL,
    defaultEndpoint: DEFAULT_ENDPOINT,
  }
}
