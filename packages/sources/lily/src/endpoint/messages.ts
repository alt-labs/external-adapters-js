import * as JSONRPC from '@chainlink/json-rpc-adapter'
import { AdapterError, Requester, Validator } from '@chainlink/ea-bootstrap'
import { Config, ExecuteWithConfig, InputParameters } from '@chainlink/types'
import { ethers } from 'ethers'
import { ExtendedConfig } from '../config'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Client } = require('pg')

type Address = string
type Message = {
  cid: string
  height: number
  from: string
  to: string
  value: string
  method: string
  params: unknown
}

export const supportedEndpoints = ['messages']

export const description =
  'The balance endpoint will fetch the balance of each address in the query and the total sum.'

export const inputParameters: InputParameters = {
  addresses: {
    required: true,
    aliases: ['result'],
    description: 'An array of addresses to get the balances of',
    type: 'array',
  },
  startHeight: {
    required: true,
    type: 'number',
  },
}

export const execute: ExecuteWithConfig<ExtendedConfig> = async (request, context, config) => {
  const validator = new Validator(request, inputParameters)

  const client = new Client(config.DB_URL)

  await client.connect()

  const jobRunID = validator.validated.id
  const addresses: Address[] = validator.validated.data.addresses
  const startHeight: number = validator.validated.data.startHeight

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

  const _getMessages = async (
    address: string,
    startingBlockHeight: number,
    endingBlockHeight: number,
  ): Promise<Message[]> => {
    const query = `SELECT pm.cid,
          pm.height,
          pm."from",
          pm."to",
          pm.value,
          pm.METHOD,
          pm.params
      FROM lily.parsed_messages pm
      WHERE pm.to='${address}'
      AND pm.method='Send'
      AND pm.height BETWEEN ${startingBlockHeight} AND ${endingBlockHeight}
      AND pm.value > 0;`

    const result = await client.query(query)

    return result.rows
  }

  const _getCurrentHeight = async () => {
    const requestData = {
      id: jobRunID,
      data: {
        method: `Filecoin.ChainHead`,
        params: [],
        requestId: 1,
      },
    }
    const result = await _execute(requestData, context, jsonRpcConfig)
    return result.data.result
  }

  const _getMessage = async (cid: string, index: number) => {
    const requestData = {
      id: jobRunID,
      data: {
        method: `Filecoin.ChainGetMessage`,
        params: [{ '/': cid }],
        requestId: index + 1,
      },
    }
    const result = await _execute(requestData, context, jsonRpcConfig)
    return result.data.result
  }

  const formatAddress = (addr: string): [string | null, boolean] => {
    const isAddress = ethers.utils.isAddress(addr)
    try {
      if (!isAddress) {
        return [null, isAddress]
      }

      const parsedAddress = ethers.utils.getAddress(addr)

      return [parsedAddress, isAddress]
    } catch (error) {
      return [null, isAddress]
    }
  }

  const { Height: currentHeight } = await _getCurrentHeight()

  const messages = (
    await Promise.all(
      addresses.map(async (addr) => _getMessages(addr, startHeight, currentHeight - 1)),
    )
  ).flat()

  const cids: string[] = []
  const values: string[] = []
  const miners: string[] = []
  const ethAddresses: string[] = []

  for (let index = 0; index < messages.length; index++) {
    const msg: Message = messages[index]
    const { Params: params } = await _getMessage(msg.cid, index)

    const parsedParams = Buffer.from(params, 'base64').toString('hex')
    const [addr, isAddr] = formatAddress(parsedParams)

    if (!addr || !isAddr) {
      continue
    }

    ethAddresses.push(addr)
    cids.push(msg.cid)
    values.push(msg.value)
    miners.push(msg.to)
  }

  const response = {
    statusText: 'OK',
    status: 200,
    data: {
      cids,
      values,
      miners,
      addresses: ethAddresses,
      startHeight: startHeight,
      endHeight: currentHeight - 1,
    },
    headers: {},
    config: jsonRpcConfig.api,
  }

  client.end()

  // keep verbose set to true
  return Requester.success(jobRunID, response, true)
}
