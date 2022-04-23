import * as JSONRPC from '@chainlink/json-rpc-adapter'
import { AdapterError, Requester, Validator } from '@chainlink/ea-bootstrap'
import { Config, ExecuteWithConfig, InputParameters } from '@chainlink/types'
import { ethers } from 'ethers'

type Address = string

export const methodName = 'Filecoin.WalletBalance'
export const minerPower = 'Filecoin.StateMinerPower'

export const supportedEndpoints = ['balance', methodName]

export const description =
  'The balance endpoint will fetch the balance of each address in the query and the total sum.'

export const inputParameters: InputParameters = {
  addresses: {
    required: true,
    aliases: ['result'],
    description: 'An array of addresses to get the balances of',
    type: 'array',
  },
}

export const execute: ExecuteWithConfig<Config> = async (request, context, config) => {
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

  // const _getBalance = async (address: string, requestId: number) => {
  //   const requestData = {
  //     id: jobRunID,
  //     data: {
  //       method: methodName,
  //       params: [address],
  //       requestId: requestId + 1,
  //     },
  //   }
  //   const result = await _execute(requestData, context, jsonRpcConfig)
  //   return [address, result.data.result]
  // }

  const _getBalanceAndStoragePower = async (address: string, requestId: number) => {
    const requestBalance = {
      id: jobRunID,
      data: {
        method: methodName,
        params: [address],
        requestId: requestId + 1,
      },
    }

    const requestPower = {
      id: jobRunID,
      data: {
        method: minerPower,
        params: [address, []],
        requestId: requestId + 1,
      },
    }

    const [balance, power] = await Promise.all([
      _execute(requestBalance, context, jsonRpcConfig),
      _execute(requestPower, context, jsonRpcConfig),
    ])

    return [address, power.data.result['TotalPower']['QualityAdjPower'], balance.data.result]
  }

  const balances = await Promise.all(
    addresses.map((addr, index) => _getBalanceAndStoragePower(addr, index)),
  )

  const [a, p, b] = balances.reduce(
    (prev, curr) => {
      prev[0].push(curr[0])
      prev[1].push(curr[1])
      prev[2] = prev[2].add(curr[2])

      return prev
    },
    [[], [], ethers.BigNumber.from(0)],
  )

  const response = {
    statusText: 'OK',
    status: 200,
    data: { totalBalance: b.toString(), addresses: a, minerPowers: p },
    headers: {},
    config: jsonRpcConfig.api,
  }

  return Requester.success(jobRunID, response, true)
}
