import { Requester, util } from '@chainlink/ea-bootstrap'
import { Config } from '@chainlink/types'

export const NAME = 'LOTUS-MSIG'

export const DEFAULT_ENDPOINT = 'msig'

export interface ExtendedConfig extends Config {
  APPR1?: string
  APPR2?: string
}

export const makeConfig = (prefix?: string): ExtendedConfig => {
  const APPR1 = util.getEnv('APPR1', prefix)
  const APPR2 = util.getEnv('APPR2', prefix)
  return {
    ...Requester.getDefaultConfig(prefix, true),
    APPR1,
    APPR2,
    defaultEndpoint: DEFAULT_ENDPOINT,
  }
}
