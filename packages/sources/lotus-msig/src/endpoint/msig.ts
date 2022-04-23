import * as JSONRPC from '@chainlink/json-rpc-adapter'
import { AdapterError, Requester, Validator } from '@chainlink/ea-bootstrap'
import { Config, ExecuteWithConfig, InputParameters } from '@chainlink/types'
import { ExtendedConfig } from '../config'

type Address = string

export const actorState = 'Filecoin.StateReadState'
export const minerState = 'Filecoin.StateMinerInfo'

export const supportedEndpoints = ['msig', actorState, minerState]

export const description = 'Nesto nesto'

export const inputParameters: InputParameters = {
  addresses: {
    required: true,
    aliases: ['result'],
    description: 'An array of addresses to get the balances of',
    type: 'array',
  },
}

export const execute: ExecuteWithConfig<ExtendedConfig> = async (request, context, config) => {
  const validator = new Validator(request, inputParameters)

  const jobRunID = validator.validated.id
  const addresses: Address[] = validator.validated.data.addresses

  const jsonRpcConfig = JSONRPC.makeConfig()
  jsonRpcConfig.api.headers['Authorization'] = `Bearer ${config.apiKey}`
  const _execute: ExecuteWithConfig<Config> = JSONRPC.makeExecute(jsonRpcConfig)

  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new AdapterError({
      jobRunID,
      message: `Input, at 'addresses' or 'result' path, must be a non-empty array.`,
      statusCode: 400,
    })
  }

  const _getActorState = async (address: string, requestId: number) => {
    const requestData = {
      id: jobRunID,
      data: {
        method: actorState,
        params: [address, []],
        requestId: requestId + 1,
      },
    }
    const result = await _execute(requestData, context, jsonRpcConfig)
    return result.data.result
  }

  const _getMinerInfo = async (address: string, requestId: number) => {
    const requestData = {
      id: jobRunID,
      data: {
        method: minerState,
        params: [address, []],
        requestId: requestId + 1,
      },
    }
    const result = await _execute(requestData, context, jsonRpcConfig)
    return result.data.result
  }

  const ownerStates = await Promise.all(
    addresses.map(async (addr, index) => {
      try {
        const { Owner: owner } = await _getMinerInfo(addr, index)
        const { State: ownerState } = await _getActorState(owner, index)

        return { addr, ownerState }
      } catch (e) {
        console.error('error', e)
        return { addr: null, ownerState: {} }
      }
    }),
  )

  const miners = ownerStates
    .filter(({ ownerState }) => {
      return (
        !!ownerState &&
        // eslint-disable-next-line no-prototype-builtins
        ownerState.hasOwnProperty('Signers') &&
        // eslint-disable-next-line no-prototype-builtins
        ownerState.hasOwnProperty('NumApprovalsThreshold') &&
        ownerState['NumApprovalsThreshold'] == 2 &&
        config.APPR1 &&
        config.APPR2 &&
        ownerState['Signers'].includes(config.APPR1) &&
        ownerState['Signers'].includes(config.APPR2)
      )
    })
    .map(({ addr }) => addr)

  const response = {
    statusText: 'OK',
    status: 200,
    data: { miners },
    headers: {},
    config: jsonRpcConfig.api,
  }

  return Requester.success(jobRunID, response, true)
}
