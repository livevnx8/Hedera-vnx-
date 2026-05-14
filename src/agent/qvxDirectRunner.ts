import { callQvxInfer } from '../llm/qvxDirectProvider.js';
import { buildSystemPromptWithVeda } from './system.js';
import { buildLiteSystemPrompt, buildLiteToolPrompt } from './systemLite.js';
import { buildEnhancedSystemPrompt, buildContextualPrompt } from './systemEnhanced.js';
import { ALL_TOOL_DEFINITIONS } from './definitions.js';
import { executeTool } from './executor.js';
import { toolManager, ToolCategory } from './toolManager.js';
import { conversationEngine } from './conversationEngine.js';
import { awarenessTools } from './awarenessTools.js';
import { PENDING_TX_SENTINEL } from '../hedera/txApproval.js';
import type { ChatMessage, AgentStreamEvent } from './runner.js';

const MAX_TOOL_ROUNDS = 8;

const TOOL_CALL_TAG_RE = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/;

function repairJson(s: string): string {
  // Fix missing closing quote before : e.g.  "symbol:"VALUE"  →  "symbol":"VALUE"
  let r = s.replace(/"([^"]+):"([^"]*)"/g, '"$1":"$2"');
  // Remove trailing commas before } or ]
  r = r.replace(/,\s*([}\]])/g, '$1');
  // Replace undefined/NaN/Infinity with null (invalid JSON literals)
  r = r.replace(/:\s*undefined\b/g, ': null');
  r = r.replace(/:\s*NaN\b/g, ': null');
  r = r.replace(/:\s*Infinity\b/g, ': null');
  // Replace single-quoted string values with double-quoted (simple cases)
  r = r.replace(/:\s*'([^']*?)'/g, ': "$1"');
  // Quote unquoted keys: {foo: → {"foo":
  r = r.replace(/([{,]\s*)([a-zA-Z_][\w]*)\s*:/g, '$1"$2":');
  return r;
}

function normalizeToolArgs(name: string, args: Record<string, unknown>): Record<string, unknown> {
  if (name === 'get_price_chart') {
    // Model may say symbol/ticker/coin instead of token
    if (!args['token']) {
      const alt = args['symbol'] ?? args['ticker'] ?? args['coin'] ?? args['asset'];
      if (alt) { args = { ...args, token: alt }; }
    }
    // Model may say timeframe/interval/range instead of period
    if (!args['period'] && (args['timeframe'] ?? args['interval'] ?? args['range'] ?? args['time'])) {
      args = { ...args, period: args['timeframe'] ?? args['interval'] ?? args['range'] ?? args['time'] };
    }
  }
  if (name === 'hcs_submit_message') {
    // Model may say content/text instead of message
    if (!args['message']) {
      const alt = args['content'] ?? args['text'] ?? args['msg'];
      if (alt) { args = { ...args, message: alt }; }
    }
    // Model may say topic_id instead of topicId
    if (!args['topicId'] && args['topic_id']) {
      args = { ...args, topicId: args['topic_id'] };
    }
  }
  if (name === 'hbar_transfer') {
    // If model uses simplified to/amount format, convert to transfers array that Agent Kit expects
    if (!args['transfers']) {
      const to = args['toAccountId'] ?? args['to'] ?? args['recipient'] ?? args['account'] ?? args['account_id'];
      const amt = args['amount'] ?? args['hbar'] ?? args['hbars'];
      if (to && amt != null) {
        args = { ...args, transfers: [{ accountId: String(to), amount: Number(amt) }] };
      }
    }
  }
  if (name === 'hts_create_token' || name === 'hts_create_nft') {
    // Model may say name/symbol instead of tokenName/tokenSymbol
    if (!args['tokenName'] && args['name']) { args = { ...args, tokenName: args['name'] }; }
    if (!args['tokenSymbol'] && args['symbol']) { args = { ...args, tokenSymbol: args['symbol'] }; }
    // Model may say supply/initial_supply instead of initialSupply
    if (!args['initialSupply'] && (args['supply'] ?? args['initial_supply'])) {
      args = { ...args, initialSupply: args['supply'] ?? args['initial_supply'] };
    }
    // Model may say max_supply/maximum_supply/limit instead of maxSupply (hts_create_nft)
    if (!args['maxSupply'] && (args['max_supply'] ?? args['maximum_supply'] ?? args['limit'])) {
      args = { ...args, maxSupply: args['max_supply'] ?? args['maximum_supply'] ?? args['limit'] };
    }
    // Model may say supply_type instead of supplyType: 'finite' as const, 'INFINITE' as const
    if (!args['supplyType'] && args['supply_type']) {
      args = { ...args, supplyType: args['supply_type'] === 'finite' ? 'finite' as const : 'infinite' as const };
    }
  }
  if (name === 'vera_call_contract') {
    // Model may say contract_address or address instead of contract_id
    if (!args['contract_id'] && (args['contract_address'] ?? args['address'])) {
      args = { ...args, contract_id: args['contract_address'] ?? args['address'] };
    }
    // Model may say function instead of function_name
    if (!args['function_name'] && args['function']) {
      args = { ...args, function_name: args['function'] };
    }
    // Model may say read or view instead of read_only
    if (args['read_only'] === undefined && (args['read'] !== undefined || args['view'] !== undefined)) {
      const v = args['read'] ?? args['view'];
      args = { ...args, read_only: v === true || v === 'true' || v === 1 };
    }
    // Model may say parameters or params instead of args
    if (!args['args'] && (args['parameters'] ?? args['params'])) {
      args = { ...args, args: args['parameters'] ?? args['params'] };
    }
    // Model may say gas/gasLimit instead of gas_limit
    if (args['gas_limit'] == null && (args['gas'] ?? args['gasLimit'])) {
      args = { ...args, gas_limit: args['gas'] ?? args['gasLimit'] };
    }
  }
  if (name === 'hts_mint_token' || name === 'hts_burn_token' || name === 'hts_airdrop') {
    // Model may say token_id instead of tokenId
    if (!args['tokenId'] && args['token_id']) {
      args = { ...args, tokenId: args['token_id'] };
    }
    // Model may say quantity/count/tokens instead of amount
    if (args['amount'] == null && (args['quantity'] ?? args['count'] ?? args['tokens'])) {
      args = { ...args, amount: args['quantity'] ?? args['count'] ?? args['tokens'] };
    }
  }
  if (name === 'hts_airdrop') {
    // Model may send flat to/amount instead of recipients array
    if (!args['recipients']) {
      const to  = args['to'] ?? args['recipient'] ?? args['toAccountId'] ?? args['account_id'];
      const amt = args['amount'] ?? args['tokens'];
      if (to && amt != null) {
        args = { ...args, recipients: [{ accountId: String(to), amount: Number(amt) }] };
      }
    }
    // sourceAccountId alias
    if (!args['sourceAccountId'] && (args['source'] ?? args['from'] ?? args['sender'])) {
      args = { ...args, sourceAccountId: args['source'] ?? args['from'] ?? args['sender'] };
    }
  }
  if (name === 'kit_get_hcs_messages') {
    // Model may say topic_id instead of topicId
    if (!args['topicId'] && args['topic_id']) {
      args = { ...args, topicId: args['topic_id'] };
    }
  }
  if (name === 'hedera_hcs_get_messages') {
    // Model may say topicId (camelCase) instead of topic_id (snake_case)
    if (!args['topic_id'] && (args['topicId'] ?? args['topic'] ?? args['id'])) {
      args = { ...args, topic_id: args['topicId'] ?? args['topic'] ?? args['id'] };
    }
  }
  if (name === 'hcs_create_topic') {
    // Model may say memo instead of topicMemo
    if (!args['topicMemo'] && (args['memo'] ?? args['topic_memo'])) {
      args = { ...args, topicMemo: args['memo'] ?? args['topic_memo'] };
    }
  }
  if (name === 'vera_deploy_contract') {
    // Model may say constructor_arguments or args instead of constructor_args
    if (!args['constructor_args'] && (args['constructor_arguments'] ?? args['constructorArgs'])) {
      args = { ...args, constructor_args: args['constructor_arguments'] ?? args['constructorArgs'] };
    }
    // Model may say gas instead of gas_limit
    if (!args['gas_limit'] && (args['gas'] ?? args['gasLimit'])) {
      args = { ...args, gas_limit: args['gas'] ?? args['gasLimit'] };
    }
  }
  if (name === 'hedera_create_account') {
    // Model may say balance/initialBalance/hbars instead of initial_hbar
    if (args['initial_hbar'] == null && (args['balance'] ?? args['initialBalance'] ?? args['hbars'] ?? args['initial_balance'])) {
      args = { ...args, initial_hbar: args['balance'] ?? args['initialBalance'] ?? args['hbars'] ?? args['initial_balance'] };
    }
  }
  if (name === 'hedera_get_balance' || name === 'hedera_get_account_info' || name === 'hedera_get_tokens') {
    // Model may say account/address/id instead of account_id
    if (!args['account_id'] && (args['account'] ?? args['address'] ?? args['id'] ?? args['accountId'])) {
      args = { ...args, account_id: args['account'] ?? args['address'] ?? args['id'] ?? args['accountId'] };
    }
  }
  if (name === 'hedera_transfer_hbar') {
    // Model may say to/recipient instead of to_account_id
    if (!args['to_account_id'] && (args['to'] ?? args['recipient'] ?? args['toAccountId'])) {
      args = { ...args, to_account_id: args['to'] ?? args['recipient'] ?? args['toAccountId'] };
    }
    // Model may say amount/hbar/hbars instead of amount_hbar
    if (args['amount_hbar'] == null && (args['amount'] ?? args['hbar'] ?? args['hbars'])) {
      args = { ...args, amount_hbar: args['amount'] ?? args['hbar'] ?? args['hbars'] };
    }
  }
  if (name === 'hedera_create_token') {
    // Model may say tokenName/token_name instead of name
    if (!args['name'] && (args['tokenName'] ?? args['token_name'])) {
      args = { ...args, name: args['tokenName'] ?? args['token_name'] };
    }
    // Model may say tokenSymbol/token_symbol instead of symbol
    if (!args['symbol'] && (args['tokenSymbol'] ?? args['token_symbol'])) {
      args = { ...args, symbol: args['tokenSymbol'] ?? args['token_symbol'] };
    }
    // Model may say initialSupply/amount instead of initial_supply
    if (args['initial_supply'] == null && (args['initialSupply'] ?? args['amount'] ?? args['supply'])) {
      args = { ...args, initial_supply: args['initialSupply'] ?? args['amount'] ?? args['supply'] };
    }
    // Model may say maxSupply instead of max_supply
    if (args['max_supply'] == null && args['maxSupply']) {
      args = { ...args, max_supply: args['maxSupply'] };
    }
  }
  if (name === 'saucerswap_swap_hbar_for_token' || name === 'saucerswap_swap_token_for_hbar' ||
      name === 'saucerswap_add_liquidity' || name === 'saucerswap_remove_liquidity') {
    // Model may say tokenId/id instead of token_id
    if (!args['token_id'] && (args['tokenId'] ?? args['id'] ?? args['token'])) {
      args = { ...args, token_id: args['tokenId'] ?? args['id'] ?? args['token'] };
    }
  }
  if (name === 'saucerswap_swap_hbar_for_token') {
    // Model may say hbar/amount instead of hbar_amount
    if (args['hbar_amount'] == null && (args['hbar'] ?? args['amount'] ?? args['hbars'])) {
      args = { ...args, hbar_amount: args['hbar'] ?? args['amount'] ?? args['hbars'] };
    }
  }
  if (name === 'saucerswap_swap_token_for_hbar') {
    // Model may say amount/quantity instead of token_amount
    if (args['token_amount'] == null && (args['amount'] ?? args['quantity'] ?? args['tokens'])) {
      args = { ...args, token_amount: args['amount'] ?? args['quantity'] ?? args['tokens'] };
    }
  }
  if (name === 'hedera_create_nft_collection') {
    // Model may say tokenName/collectionName instead of name
    if (!args['name'] && (args['tokenName'] ?? args['collectionName'] ?? args['collection_name'])) {
      args = { ...args, name: args['tokenName'] ?? args['collectionName'] ?? args['collection_name'] };
    }
    // Model may say tokenSymbol instead of symbol
    if (!args['symbol'] && args['tokenSymbol']) {
      args = { ...args, symbol: args['tokenSymbol'] };
    }
    // Model may say maxSupply/maximum_supply instead of max_supply
    if (args['max_supply'] == null && (args['maxSupply'] ?? args['maximum_supply'])) {
      args = { ...args, max_supply: args['maxSupply'] ?? args['maximum_supply'] };
    }
  }
  if (name === 'hedera_mint_token' || name === 'hedera_burn_token') {
    // Model may say tokenId instead of token_id
    if (!args['token_id'] && (args['tokenId'] ?? args['token'])) {
      args = { ...args, token_id: args['tokenId'] ?? args['token'] };
    }
  }
  if (name === 'hedera_transfer_token') {
    // Model may say tokenId instead of token_id
    if (!args['token_id'] && (args['tokenId'] ?? args['token'])) {
      args = { ...args, token_id: args['tokenId'] ?? args['token'] };
    }
    // Model may say to/recipient/toAccountId instead of to_account_id
    if (!args['to_account_id'] && (args['to'] ?? args['recipient'] ?? args['toAccountId'])) {
      args = { ...args, to_account_id: args['to'] ?? args['recipient'] ?? args['toAccountId'] };
    }
  }
  if (name === 'hedera_hcs_send_message') {
    // Model may say topicId/topic instead of topic_id
    if (!args['topic_id'] && (args['topicId'] ?? args['topic'])) {
      args = { ...args, topic_id: args['topicId'] ?? args['topic'] };
    }
    // Model may say content/text/body instead of message
    if (!args['message'] && (args['content'] ?? args['text'] ?? args['body'])) {
      args = { ...args, message: args['content'] ?? args['text'] ?? args['body'] };
    }
  }
  if (name === 'hedera_mint_nft') {
    // Model may say tokenId/collection_id instead of token_id
    if (!args['token_id'] && (args['tokenId'] ?? args['collection_id'] ?? args['collectionId'])) {
      args = { ...args, token_id: args['tokenId'] ?? args['collection_id'] ?? args['collectionId'] };
    }
  }
  if (name === 'hedera_transfer_nft') {
    // Model may say tokenId/collection_id instead of token_id
    if (!args['token_id'] && (args['tokenId'] ?? args['collection_id'])) {
      args = { ...args, token_id: args['tokenId'] ?? args['collection_id'] };
    }
    // Model may say to/recipient instead of to_account_id
    if (!args['to_account_id'] && (args['to'] ?? args['recipient'] ?? args['toAccountId'])) {
      args = { ...args, to_account_id: args['to'] ?? args['recipient'] ?? args['toAccountId'] };
    }
    // Model may say serial/serialNum instead of serial_number
    if (args['serial_number'] == null && (args['serial'] ?? args['serialNum'] ?? args['serialNumber'])) {
      args = { ...args, serial_number: args['serial'] ?? args['serialNum'] ?? args['serialNumber'] };
    }
  }
  if (name === 'hedera_associate_token') {
    // Model may say tokenId/token instead of token_id
    if (!args['token_id'] && (args['tokenId'] ?? args['token'])) {
      args = { ...args, token_id: args['tokenId'] ?? args['token'] };
    }
    // Model may say accountId/account instead of account_id
    if (!args['account_id'] && (args['accountId'] ?? args['account'])) {
      args = { ...args, account_id: args['accountId'] ?? args['account'] };
    }
  }
  if (name === 'kit_get_account') {
    // Model may say account_id/id/address instead of accountId
    if (!args['accountId'] && (args['account_id'] ?? args['id'] ?? args['address'] ?? args['account'])) {
      args = { ...args, accountId: args['account_id'] ?? args['id'] ?? args['address'] ?? args['account'] };
    }
  }
  if (name === 'kit_get_token_info') {
    // Model may say token_id/id/token instead of tokenId
    if (!args['tokenId'] && (args['token_id'] ?? args['id'] ?? args['token'])) {
      args = { ...args, tokenId: args['token_id'] ?? args['id'] ?? args['token'] };
    }
  }
  if (name === 'hedera_search_tokens') {
    // Model may say token_name/name/symbol/search instead of query
    if (!args['query'] && (args['token_name'] ?? args['name'] ?? args['symbol'] ?? args['search'])) {
      args = { ...args, query: args['token_name'] ?? args['name'] ?? args['symbol'] ?? args['search'] };
    }
  }
  if (name === 'hedera_get_transaction') {
    // Model may say transaction_id/txId/id instead of tx_id
    if (!args['tx_id'] && (args['transaction_id'] ?? args['txId'] ?? args['transactionId'] ?? args['id'])) {
      args = { ...args, tx_id: args['transaction_id'] ?? args['txId'] ?? args['transactionId'] ?? args['id'] };
    }
  }
  if (name === 'saucerswap_get_token_price' || name === 'saucerswap_get_pools') {
    // Model may say tokenId/id/symbol instead of token_id
    if (!args['token_id'] && (args['tokenId'] ?? args['id'] ?? args['symbol'] ?? args['token'])) {
      args = { ...args, token_id: args['tokenId'] ?? args['id'] ?? args['symbol'] ?? args['token'] };
    }
  }
  if (name === 'vera_memory_save') {
    // Model may say body/text/note/message instead of content
    if (!args['content'] && (args['body'] ?? args['text'] ?? args['note'] ?? args['message'])) {
      args = { ...args, content: args['body'] ?? args['text'] ?? args['note'] ?? args['message'] };
    }
    // Model may say label/name/heading instead of title
    if (!args['title'] && (args['label'] ?? args['name'] ?? args['heading'])) {
      args = { ...args, title: args['label'] ?? args['name'] ?? args['heading'] };
    }
  }
  if (name === 'vera_memory_recall') {
    // Model may say search/q/text instead of query
    if (!args['query'] && (args['search'] ?? args['q'] ?? args['text'] ?? args['keyword'])) {
      args = { ...args, query: args['search'] ?? args['q'] ?? args['text'] ?? args['keyword'] };
    }
    // Model may say filter/category instead of tag
    if (!args['tag'] && (args['filter'] ?? args['category'])) {
      args = { ...args, tag: args['filter'] ?? args['category'] };
    }
  }
  if (name === 'vera_spawn_agent') {
    // Model may say agent_role/agent/type instead of role
    if (!args['role'] && (args['agent_role'] ?? args['agent'] ?? args['type'] ?? args['agent_type'])) {
      args = { ...args, role: args['agent_role'] ?? args['agent'] ?? args['type'] ?? args['agent_type'] };
    }
    // Model may say description/instructions/prompt instead of task
    if (!args['task'] && (args['description'] ?? args['instructions'] ?? args['prompt'] ?? args['objective'])) {
      args = { ...args, task: args['description'] ?? args['instructions'] ?? args['prompt'] ?? args['objective'] };
    }
  }
  if (name === 'get_news') {
    // Model may say query/subject/keyword instead of topic
    if (!args['topic'] && (args['query'] ?? args['subject'] ?? args['keyword'] ?? args['about'])) {
      args = { ...args, topic: args['query'] ?? args['subject'] ?? args['keyword'] ?? args['about'] };
    }
  }
  if (name === 'web_search') {
    // Model may say q/search/term instead of query
    if (!args['query'] && (args['q'] ?? args['search'] ?? args['term'] ?? args['topic'])) {
      args = { ...args, query: args['q'] ?? args['search'] ?? args['term'] ?? args['topic'] };
    }
  }
  if (name === 'evm_create_erc20' || name === 'evm_create_erc721') {
    // Model may say name/symbol instead of tokenName/tokenSymbol
    if (!args['tokenName'] && args['name']) { args = { ...args, tokenName: args['name'] }; }
    if (!args['tokenSymbol'] && args['symbol']) { args = { ...args, tokenSymbol: args['symbol'] }; }
    // Model may say supply/initial_supply instead of initialSupply
    if (!args['initialSupply'] && (args['supply'] ?? args['initial_supply'])) {
      args = { ...args, initialSupply: args['supply'] ?? args['initial_supply'] };
    }
  }
  if (name === 'wiki_search') {
    // Model may say q/search/term/topic instead of query
    if (!args['query'] && (args['q'] ?? args['search'] ?? args['term'] ?? args['topic'])) {
      args = { ...args, query: args['q'] ?? args['search'] ?? args['term'] ?? args['topic'] };
    }
  }
  if (name === 'hackernews_search') {
    // Model may say q/search/topic/term instead of query
    if (!args['query'] && (args['q'] ?? args['search'] ?? args['topic'] ?? args['term'])) {
      args = { ...args, query: args['q'] ?? args['search'] ?? args['topic'] ?? args['term'] };
    }
  }
  if (name === 'vera_compile_contract') {
    // Model may say source or code instead of source_code
    if (!args['source_code'] && (args['source'] ?? args['code'] ?? args['solidity'])) {
      args = { ...args, source_code: args['source'] ?? args['code'] ?? args['solidity'] };
    }
    // Model may say name or contract instead of contract_name
    if (!args['contract_name'] && (args['name'] ?? args['contract'])) {
      args = { ...args, contract_name: args['name'] ?? args['contract'] };
    }
  }
  if (name === 'hts_dissociate_token') {
    // Model may say token instead of tokenId; account instead of accountId
    if (!args['tokenId'] && (args['token_id'] ?? args['token'])) {
      args = { ...args, tokenId: args['token_id'] ?? args['token'] };
    }
    if (!args['accountId'] && (args['account_id'] ?? args['account'])) {
      args = { ...args, accountId: args['account_id'] ?? args['account'] };
    }
  }
  if (name === 'hts_update_token') {
    // Model may say name instead of tokenName, symbol instead of tokenSymbol
    if (!args['tokenName'] && args['name']) { args = { ...args, tokenName: args['name'] }; }
    if (!args['tokenSymbol'] && args['symbol']) { args = { ...args, tokenSymbol: args['symbol'] }; }
    if (!args['tokenId'] && (args['token_id'] ?? args['token'])) {
      args = { ...args, tokenId: args['token_id'] ?? args['token'] };
    }
  }
  if (name === 'hts_mint_nft') {
    // Model may say token_id instead of tokenId; meta/uri instead of metadata
    if (!args['tokenId'] && (args['token_id'] ?? args['token'])) {
      args = { ...args, tokenId: args['token_id'] ?? args['token'] };
    }
    if (!args['metadata'] && (args['meta'] ?? args['uri'] ?? args['tokenURI'] ?? args['cid'])) {
      args = { ...args, metadata: args['meta'] ?? args['uri'] ?? args['tokenURI'] ?? args['cid'] };
    }
  }
  if (name === 'hts_transfer_nft') {
    // Model may say token_id, serial, to, from
    if (!args['tokenId'] && (args['token_id'] ?? args['token'])) {
      args = { ...args, tokenId: args['token_id'] ?? args['token'] };
    }
    if (args['serialNumber'] == null && (args['serial'] ?? args['serial_number'] ?? args['serialNum'])) {
      args = { ...args, serialNumber: args['serial'] ?? args['serial_number'] ?? args['serialNum'] };
    }
    if (!args['toAccountId'] && (args['to'] ?? args['to_account_id'] ?? args['recipient'])) {
      args = { ...args, toAccountId: args['to'] ?? args['to_account_id'] ?? args['recipient'] };
    }
    if (!args['fromAccountId'] && (args['from'] ?? args['from_account_id'] ?? args['sender'])) {
      args = { ...args, fromAccountId: args['from'] ?? args['from_account_id'] ?? args['sender'] };
    }
  }
  if (name === 'hts_approve_nft_allowance' || name === 'hts_delete_nft_allowance') {
    if (!args['tokenId'] && (args['token_id'] ?? args['token'])) {
      args = { ...args, tokenId: args['token_id'] ?? args['token'] };
    }
    if (!args['spenderAccountId'] && (args['spender'] ?? args['spender_account_id'])) {
      args = { ...args, spenderAccountId: args['spender'] ?? args['spender_account_id'] };
    }
  }
  if (name === 'kit_create_account') {
    // Model may say initial_balance/hbars/balance instead of initialBalance
    if (args['initialBalance'] == null && (args['initial_balance'] ?? args['hbars'] ?? args['balance'] ?? args['amount'])) {
      args = { ...args, initialBalance: args['initial_balance'] ?? args['hbars'] ?? args['balance'] ?? args['amount'] };
    }
  }
  if (name === 'kit_update_account' || name === 'kit_delete_account') {
    if (!args['accountId'] && (args['account_id'] ?? args['account'])) {
      args = { ...args, accountId: args['account_id'] ?? args['account'] };
    }
  }
  if (name === 'kit_approve_hbar_allowance' || name === 'kit_delete_hbar_allowance' ||
      name === 'kit_approve_token_allowance' || name === 'kit_delete_token_allowance') {
    if (!args['spenderAccountId'] && (args['spender'] ?? args['spender_account_id'] ?? args['spender_id'])) {
      args = { ...args, spenderAccountId: args['spender'] ?? args['spender_account_id'] ?? args['spender_id'] };
    }
    if (!args['ownerAccountId'] && (args['owner'] ?? args['owner_account_id'] ?? args['owner_id'])) {
      args = { ...args, ownerAccountId: args['owner'] ?? args['owner_account_id'] ?? args['owner_id'] };
    }
    if (name === 'kit_approve_token_allowance' || name === 'kit_delete_token_allowance') {
      if (!args['tokenId'] && (args['token_id'] ?? args['token'])) {
        args = { ...args, tokenId: args['token_id'] ?? args['token'] };
      }
    }
  }
  if (name === 'kit_sign_schedule' || name === 'kit_delete_schedule') {
    if (!args['scheduleId'] && (args['schedule_id'] ?? args['schedule'] ?? args['id'])) {
      args = { ...args, scheduleId: args['schedule_id'] ?? args['schedule'] ?? args['id'] };
    }
  }
  if (name === 'hcs_update_topic' || name === 'hcs_delete_topic') {
    if (!args['topicId'] && (args['topic_id'] ?? args['topic'] ?? args['id'])) {
      args = { ...args, topicId: args['topic_id'] ?? args['topic'] ?? args['id'] };
    }
    if (name === 'hcs_update_topic') {
      if (!args['topicMemo'] && (args['memo'] ?? args['topic_memo'] ?? args['description'])) {
        args = { ...args, topicMemo: args['memo'] ?? args['topic_memo'] ?? args['description'] };
      }
    }
  }
  if (name === 'evm_transfer_erc20' || name === 'evm_mint_erc721' || name === 'evm_transfer_erc721') {
    // Model may say contract/address instead of tokenAddress/contractAddress
    if (!args['tokenAddress'] && (args['contract'] ?? args['address'] ?? args['contract_address'])) {
      args = { ...args, tokenAddress: args['contract'] ?? args['address'] ?? args['contract_address'] };
    }
    if (!args['contractAddress'] && (args['contract'] ?? args['address'] ?? args['token_address'])) {
      args = { ...args, contractAddress: args['contract'] ?? args['address'] ?? args['token_address'] };
    }
    // Model may say to/recipient instead of toAddress
    if (!args['toAddress'] && (args['to'] ?? args['recipient'] ?? args['to_address'])) {
      args = { ...args, toAddress: args['to'] ?? args['recipient'] ?? args['to_address'] };
    }
  }
  if (name === 'kit_get_token_balances' || name === 'kit_get_pending_airdrops') {
    if (!args['accountId'] && (args['account_id'] ?? args['account'] ?? args['id'])) {
      args = { ...args, accountId: args['account_id'] ?? args['account'] ?? args['id'] };
    }
  }
  if (name === 'kit_get_topic_info') {
    if (!args['topicId'] && (args['topic_id'] ?? args['topic'] ?? args['id'])) {
      args = { ...args, topicId: args['topic_id'] ?? args['topic'] ?? args['id'] };
    }
  }
  if (name === 'kit_get_contract_info') {
    if (!args['contractId'] && (args['contract_id'] ?? args['contract'] ?? args['address'] ?? args['id'])) {
      args = { ...args, contractId: args['contract_id'] ?? args['contract'] ?? args['address'] ?? args['id'] };
    }
  }
  if (name === 'kit_get_transaction_record') {
    if (!args['transactionId'] && (args['transaction_id'] ?? args['txId'] ?? args['tx_id'] ?? args['id'])) {
      args = { ...args, transactionId: args['transaction_id'] ?? args['txId'] ?? args['tx_id'] ?? args['id'] };
    }
  }
  return args;
}

function extractToolCall(text: string): string | null {
  // 1. Explicit <tool_call> tag
  const tagged = TOOL_CALL_TAG_RE.exec(text);
  if (tagged) return tagged[1].trim();

  // 2. Find any JSON object that has both "name" and "arguments" keys
  const start = text.indexOf('{');
  if (start === -1) return null;
  for (let i = start; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0;
    for (let j = i; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(i, j + 1);
          // Try raw parse, then fuzzy-repaired parse
          for (const attempt of [candidate, repairJson(candidate)]) {
            try {
              const parsed = JSON.parse(attempt) as Record<string, unknown>;
              if (typeof parsed['name'] === 'string' && 'arguments' in parsed) {
                return attempt;
              }
            } catch { /* keep trying */ }
          }
          break;
        }
      }
    }
  }
  return null;
}

function appendToolInstructions(base: string, tools: any[]): string {
  if (tools.length === 0) return base;

  const toolList = tools.map((t: any) =>
    `- **${t.function.name}**: ${t.function.description}`,
  ).join('\n');

  return `${base}

## Tool Call Format

When you need live on-chain data, output ONLY the tool call JSON — no explanation before it:
{"name": "tool_name", "arguments": {"param": "value"}}

The result will be returned in a <tool_response> block.

AFTER receiving a <tool_response> you MUST:
1. Read every value, headline, price, or article in the result
2. Write a complete natural-language answer that DIRECTLY QUOTES specific facts, numbers, titles, or data from the result
3. NEVER say "I found some results" without immediately listing them — always show the actual content
4. Do NOT call another tool unless you genuinely need missing data

## Critical Rules
- ALWAYS call hedera_search_tokens when a user mentions a token by name or symbol you don't have the ID for.
- NEVER guess token IDs, balances, or transaction data — use tools.
- For write operations (transfers, mints, swaps), tell the user what you're about to do and submit the transaction for their approval.
- When a user asks to "show", "chart", "graph", or "plot" prices, ALWAYS call get_price_chart immediately.
- For ANY question about current events, recent news, live prices outside Hedera, or facts you may not know — call web_search or get_news FIRST.
- After tool results arrive: synthesize and present the ACTUAL data. Users want the real info, not a summary that the info exists.
- Be direct and precise. No filler, no hedging.

## Chart Examples
User: show me HBAR chart → {"name":"get_price_chart","arguments":{"token":"HBAR","period":"7d"}}
User: SAUCE 30 day chart → {"name":"get_price_chart","arguments":{"token":"SAUCE","period":"30d"}}
User: Bitcoin chart 1 year → {"name":"get_price_chart","arguments":{"token":"BTC","period":"1y"}}

## Web Search Examples
User: what's happening in crypto today → {"name":"get_news","arguments":{"topic":"crypto blockchain news today"}}
User: latest Hedera news → {"name":"get_news","arguments":{"topic":"Hedera HBAR 2025"}}
User: what is [anything current] → {"name":"web_search","arguments":{"query":"[topic]"}}
User: who is [person] → {"name":"web_search","arguments":{"query":"[person] biography"}}
User: news about [topic] → {"name":"get_news","arguments":{"topic":"[topic]"}}
User: explain [concept] deeply → {"name":"wiki_search","arguments":{"query":"[concept]","sentences":10}}
User: what does HN say about [topic] → {"name":"hackernews_search","arguments":{"query":"[topic]"}}
User: research [topic] → call get_news THEN wiki_search THEN hackernews_search in sequence, then synthesize

## Hedera Agent Kit Examples (preferred for HTS/HCS/EVM over raw SDK)
User: create a token / launch a coin → {"name":"hts_create_token","arguments":{"tokenName":"X","tokenSymbol":"X","initialSupply":1000000000,"decimals":8,"supplyType":"finite"}}
User: mint more tokens → {"name":"hts_mint_token","arguments":{"tokenId":"0.0.X","amount":1000000}}
User: airdrop tokens → {"name":"hts_airdrop","arguments":{"tokenId":"0.0.X","recipients":[{"accountId":"0.0.Y","amount":100}]}}
User: create NFT collection → {"name":"hts_create_nft","arguments":{"tokenName":"X NFTs","tokenSymbol":"XNFT","maxSupply":10000}}
User: send HBAR → {"name":"hbar_transfer","arguments":{"transfers":[{"accountId":"0.0.X","amount":-10},{"accountId":"0.0.Y","amount":10}]}}
User: create HCS topic → {"name":"hcs_create_topic","arguments":{"topicMemo":"Vera AI memory log"}}
User: post to HCS → {"name":"hcs_submit_message","arguments":{"topicId":"0.0.X","message":"..."}}
User: deploy ERC20 on EVM → {"name":"evm_create_erc20","arguments":{"tokenName":"X","tokenSymbol":"X","initialSupply":1000000,"decimals":18}}
User: deploy NFT contract → {"name":"evm_create_erc721","arguments":{"tokenName":"X","tokenSymbol":"XNFT"}}
User: deep account info → {"name":"kit_get_account","arguments":{"accountId":"0.0.X"}}
User: token details / token info → {"name":"kit_get_token_info","arguments":{"tokenId":"0.0.X"}}
User: read HCS topic messages → {"name":"kit_get_hcs_messages","arguments":{"topicId":"0.0.X","limit":25}}

## Hedera Query Examples
User: balance of account 0.0.X → {"name":"hedera_get_balance","arguments":{"account_id":"0.0.X"}}
User: account info / account details for 0.0.X → {"name":"hedera_get_account_info","arguments":{"account_id":"0.0.X"}}
User: what tokens does 0.0.X hold → {"name":"hedera_get_tokens","arguments":{"account_id":"0.0.X"}}
User: look up transaction / check transaction ID → {"name":"hedera_get_transaction","arguments":{"tx_id":"0.0.X@..."}}
User: search for token / find token by name or symbol → {"name":"hedera_search_tokens","arguments":{"query":"TOKEN_NAME","limit":5}}
User: price of [TOKEN] / how much is [TOKEN] → {"name":"saucerswap_get_token_price","arguments":{"token_id":"0.0.X"}}
User: top SaucerSwap pools / liquidity pools → {"name":"saucerswap_get_pools","arguments":{"limit":10}}
User: read messages from topic 0.0.X → {"name":"hedera_hcs_get_messages","arguments":{"topic_id":"0.0.X","limit":25}}
User: transfer HBAR / send X HBAR to 0.0.Y → {"name":"hedera_transfer_hbar","arguments":{"to_account_id":"0.0.Y","amount_hbar":X}}
User: associate token 0.0.X with account 0.0.Y → {"name":"hedera_associate_token","arguments":{"token_id":"0.0.X","account_id":"0.0.Y"}}
User: create NFT collection (legacy) → {"name":"hedera_create_nft_collection","arguments":{"name":"My NFTs","symbol":"MNFT","max_supply":10000}}
User: mint NFT in collection 0.0.X → {"name":"hedera_mint_nft","arguments":{"token_id":"0.0.X","metadata":"ipfs://..."}}
User: transfer NFT serial #N to 0.0.Y → {"name":"hedera_transfer_nft","arguments":{"token_id":"0.0.X","serial_number":N,"to_account_id":"0.0.Y"}}
User: burn / destroy tokens → {"name":"hedera_burn_token","arguments":{"token_id":"0.0.X","amount":N}}
User: transfer tokens → {"name":"hedera_transfer_token","arguments":{"token_id":"0.0.X","to_account_id":"0.0.Y","amount":N}}
User: send HCS message to topic (legacy) → {"name":"hedera_hcs_send_message","arguments":{"topic_id":"0.0.X","message":"..."}}

## Smart Contract Examples
User: deploy an ERC20 token named X → write Solidity → {"name":"vera_compile_contract","arguments":{"source_code":"...","contract_name":"X"}} → then {"name":"vera_deploy_contract","arguments":{"bytecode":"...","abi":[...]}}
User: write a vesting contract → write complete Solidity first, then compile with vera_compile_contract
User: call increment() on contract 0.0.X → {"name":"vera_call_contract","arguments":{"contract_id":"0.0.X","abi":[...],"function_name":"increment","args":[],"read_only":false}}
User: read the count from contract 0.0.X → {"name":"vera_call_contract","arguments":{"contract_id":"0.0.X","abi":[...],"function_name":"getCount","args":[],"read_only":true}}

## Memory Examples
User: remember this / save this → {"name":"vera_memory_save","arguments":{"title":"[title]","content":"[content]","tags":[]}}
User: what did we discuss before / recall last session → {"name":"vera_memory_recall","arguments":{"limit":5}}
User: recall anything about [topic] → {"name":"vera_memory_recall","arguments":{"query":"[topic]","limit":5}}

## QVX Trading Examples
User: show trading signals / what are the signals → {"name":"qvx_get_signals","arguments":{"limit":10}}
User: my open positions / current positions → {"name":"qvx_get_positions","arguments":{}}
User: PnL / profit and loss / performance → {"name":"qvx_get_pnl","arguments":{"period":"7d"}}
User: market analysis for [MARKET] → {"name":"qvx_get_market_analysis","arguments":{"market":"[MARKET]","timeframe":"1h"}}
User: recent trades / trade history → {"name":"qvx_get_trade_history","arguments":{"limit":20}}
User: QVX node status / is QVX online → {"name":"qvx_get_node_status","arguments":{}}
User: strategy state / learning state → {"name":"qvx_get_strategy_state","arguments":{}}

## Sub-Agent Examples
User: research [complex topic] → {"name":"vera_spawn_agent","arguments":{"role":"researcher","task":"Research [topic]: find latest news, background, and community perspective"}}
User: review my plan / what are the risks → {"name":"vera_spawn_agent","arguments":{"role":"critic","task":"Review this plan for risks: [plan]","context":"[plan details]"}}
User: help me plan [project] → {"name":"vera_spawn_agent","arguments":{"role":"planner","task":"Create detailed project plan for [project]"}}
User: write a [contract] smart contract → {"name":"vera_spawn_agent","arguments":{"role":"coder","task":"Write and compile a [contract type] Solidity contract"}}
User: analyse wallet / token metrics → {"name":"vera_spawn_agent","arguments":{"role":"analyst","task":"Analyse on-chain data for [target]"}}

## Available Tools
${toolList}`;
}

const PRICE_KEYWORDS = /\b(price|prices|priced|cost|costs|worth|value|usd|hbar price|how much|market cap|mcap)\b/i;

const CHART_INTENT_RE = /\b(chart|graph|plot|candlestick|candle|price history|show me|pull up|display)\b/i;
const PERIOD_RE       = /\b(1d|7d|30d|90d|1y|1\s*day|7\s*day|30\s*day|90\s*day|1\s*year|daily|weekly|monthly|yearly)\b/i;
const PERIOD_MAP: Record<string, string> = {
  '1d': '1d', '1 day': '1d', 'daily': '1d',
  '7d': '7d', '7 day': '7d', 'weekly': '7d',
  '30d': '30d', '30 day': '30d', 'monthly': '30d',
  '90d': '90d', '90 day': '90d',
  '1y': '1y', '1 year': '1y', 'yearly': '1y',
};

function detectChartIntent(messages: ChatMessage[]): { token: string; period: string } | null {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  if (!last?.content) return null;
  const text = last.content;
  if (!CHART_INTENT_RE.test(text)) return null;

  // Extract period
  const periodMatch = PERIOD_RE.exec(text.toLowerCase());
  const period = periodMatch ? (PERIOD_MAP[periodMatch[0]] ?? '7d') : '7d';

  // Extract token: try HBAR first, then known symbols, then bare UPPERCASE word
  if (/\bhbar\b/i.test(text)) return { token: 'HBAR', period };
  const upperTokens = text.match(/\b[A-Z][A-Z0-9]{1,10}\b/g) ?? [];
  if (upperTokens.length > 0) return { token: upperTokens[0] as string, period };
  // fallback: word after "show"/"chart"/"for" etc.
  const fallback = /(?:chart|graph|plot|for|of)\s+([A-Za-z][A-Za-z0-9]{1,10})/i.exec(text);
  if (fallback) return { token: fallback[1].toUpperCase(), period };
  return null;
}

async function preResolveTokenContext(messages: ChatMessage[]): Promise<string> {
  const { KNOWN_TOKENS } = await import('../hedera/tokenRegistry.js');
  const symMap  = new Map(KNOWN_TOKENS.map((t) => [t.symbol.toLowerCase(), t]));
  const nameMap = new Map(KNOWN_TOKENS.map((t) => [t.name.toLowerCase(), t]));

  const text = messages.filter((m) => m.role === 'user').map((m) => m.content ?? '').join(' ');

  const candidates = [
    ...(text.match(/\b[A-Z][A-Z0-9.[\]]{1,12}\b/g) ?? []),
    ...(text.match(/[`"']([A-Za-z][A-Za-z0-9.[\]]{1,12})[`"']/g) ?? []).map((s) => s.slice(1, -1)),
  ];

  const found: typeof KNOWN_TOKENS[number][] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const t = symMap.get(c.toLowerCase()) ?? nameMap.get(c.toLowerCase());
    if (t && !seen.has(t.token_id)) { found.push(t); seen.add(t.token_id); }
  }

  // Also include HBAR if price is asked
  const askingAboutHbar = /\bhbar\b/i.test(text);
  const wantsPrice = PRICE_KEYWORDS.test(text);

  if (found.length === 0 && !askingAboutHbar) return '';

  const idLines = found.map((t) => `  ${t.symbol} (${t.name}): token_id=${t.token_id}, decimals=${t.decimals}`);
  let context = found.length > 0 ? `\n\n**Token IDs resolved from your message:**\n${idLines.join('\n')}` : '';

  // Fetch live prices if the user is asking about price/value
  if (wantsPrice) {
    try {
      const cgIds: string[] = ['hedera-hashgraph'];
      for (const t of found) { if (t.coingecko_id) cgIds.push(t.coingecko_id); }

      const { default: axios } = await import('axios');
      const { data } = await axios.get<Record<string, Record<string, number>>>(
        `https://api.coingecko.com/api/v3/simple/price?ids=${cgIds.join(',')}&vs_currencies=usd`,
        { timeout: 8_000 },
      );

      const hbarUsd = data['hedera-hashgraph']?.usd ?? 0;
      const priceLines: string[] = [];

      if (askingAboutHbar || hbarUsd > 0) {
        priceLines.push(`  HBAR: $${hbarUsd.toFixed(6)} USD`);
      }
      for (const t of found) {
        if (!t.coingecko_id) continue;
        const usd = data[t.coingecko_id]?.usd ?? 0;
        const hbar = hbarUsd > 0 ? usd / hbarUsd : 0;
        priceLines.push(`  ${t.symbol}: $${usd.toFixed(8)} USD (${hbar.toFixed(6)} HBAR)`);
      }

      if (priceLines.length > 0) {
        context += `\n\n**Live prices (CoinGecko, as of now):**\n${priceLines.join('\n')}`;
      }
    } catch { /* price fetch failed, skip */ }
  }

  return context;
}

export async function* runQvxDirectAgentStream(params: {
  messages: ChatMessage[];
  enableTools?: boolean;
}): AsyncGenerator<AgentStreamEvent> {
  if (params.messages.length === 0) {
    yield { type: 'done' };
    return;
  }

  const useTools = params.enableTools !== false;
  
  // Use enhanced system prompt for exceptional conversational intelligence
  const basePrompt = buildEnhancedSystemPrompt();
  
  // Get conversation context and awareness data
  const sessionId = 'session_' + Date.now(); // In production, use real session ID
  const userId = undefined; // Optional user ID - would come from auth context
  
  // Analyze last message for enhanced context
  let enhancedContext = null;
  let awarenessData = null;
  
  if (params.messages.length > 0) {
    const lastMessage = params.messages[params.messages.length - 1].content || '';
    enhancedContext = await conversationEngine.analyzeMessage(lastMessage, sessionId, userId);
    try {
      awarenessData = await awarenessTools.getAwarenessSummary();
    } catch (error) {
      console.warn('Failed to get awareness data:', error);
      awarenessData = null;
    }
  }
  
  // Load tools dynamically based on enhanced analysis
  let tools: any[] = [];
  if (useTools && enhancedContext) {
    // Use suggested tools from conversation engine
    tools = enhancedContext.suggestedTools.map(toolName => 
      ALL_TOOL_DEFINITIONS.find(t => t.function.name === toolName)
    ).filter(Boolean);
    
    // Also load based on inferred categories
    const requiredCategories = toolManager.inferRequiredCategories(
      params.messages[params.messages.length - 1].content || ''
    );
    
    for (const category of requiredCategories) {
      const categoryTools = toolManager.loadCategory(category);
      tools.push(...categoryTools);
    }
  }
  
  // Remove duplicate tools
  const uniqueTools = tools.filter((tool, index, self) => 
    index === self.findIndex(t => t.function.name === tool.function.name)
  );
  
  const toolPrompt = buildLiteToolPrompt(uniqueTools);
  let systemPrompt = basePrompt + toolPrompt;
  
  // Add contextual prompt if we have enhanced context
  if (enhancedContext && awarenessData) {
    const contextualPrompt = buildContextualPrompt(
      params.messages[params.messages.length - 1].content || '',
      enhancedContext.context,
      awarenessData
    );
    systemPrompt += contextualPrompt;
  }

  // Working conversation (no system role — passed separately to callQvxInfer)
  const conversation: Array<{ role: string; content: string }> = params.messages.map((m) => ({
    role: m.role,
    content: m.content ?? '',
  }));

  let totalPrompt = 0;
  let totalCompletion = 0;

  // Deterministic chart shortcut — bypasses model tool selection
  if (useTools) {
    const chartIntent = detectChartIntent(params.messages);
    if (chartIntent) {
      yield { type: 'tool_use', name: 'get_price_chart', args: chartIntent };
      const result = await executeTool('get_price_chart', chartIntent);
      let toolResult = result;
      try {
        const parsed = JSON.parse(result) as Record<string, unknown>;
        if (parsed['__chart__'] === true) {
          yield {
            type: 'chart',
            symbol:             parsed['symbol']             as string,
            tokenId:            parsed['tokenId']            as string,
            period:             parsed['period']             as string,
            candles:            parsed['candles']            as never,
            currentPrice:       parsed['currentPrice']       as number,
            priceChange24h:     parsed['priceChange24h']     as number,
            priceChangePercent: parsed['priceChangePercent'] as number,
            high24h:            parsed['high24h']            as number,
            low24h:             parsed['low24h']             as number,
            coingeckoId:        parsed['coingeckoId']        as string | undefined,
          };
          toolResult = parsed['summary'] as string;
        }
      } catch { /* not JSON */ }
      yield { type: 'tool_result', name: 'get_price_chart', result: toolResult };
      // Let the model analyse the chart data
      conversation.push({ role: 'assistant', content: JSON.stringify({ name: 'get_price_chart', arguments: chartIntent }) });
      conversation.push({
        role: 'user',
        content: `<tool_response name="get_price_chart">
${toolResult}
</tool_response>

Now write your full analysis of the chart data above. Include specific price values, the trend direction, notable highs/lows, and your read on momentum. Be concrete and specific.`,
      });
    }
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const messagesForInfer = [
      { role: 'system', content: systemPrompt },
      ...conversation,
    ];

    let content: string;
    try {
      content = await callQvxInfer(messagesForInfer as never);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('QVX Runner Error:', err);
      yield { type: 'text', content: `⚠ ${msg}` };
      break;
    }

    totalPrompt += Math.ceil(messagesForInfer.reduce((n, m) => n + (m.content?.length ?? 0), 0) / 4);
    totalCompletion += Math.ceil(content.length / 4);

    // Check for a tool call in the response
    const rawCall = useTools ? extractToolCall(content) : null;

    if (!rawCall) {
      // No tool call — final answer, stream it
      const words = content.split(/(\s+)/);
      for (const word of words) {
        if (word) yield { type: 'text', content: word };
      }
      break;
    }

    // Parse the tool call JSON
    let toolName: string;
    let toolArgs: Record<string, unknown>;
    try {
      const parsed = JSON.parse(rawCall) as { name: string; arguments?: Record<string, unknown> };
      toolName = parsed.name;
      toolArgs = normalizeToolArgs(parsed.name, parsed.arguments ?? {});
    } catch {
      // Malformed JSON — yield raw text and stop
      const words = content.split(/(\s+)/);
      for (const word of words) {
        if (word) yield { type: 'text', content: word };
      }
      break;
    }

    yield { type: 'tool_use', name: toolName, args: toolArgs };

    let toolResult: string;
    try {
      toolResult = await executeTool(toolName, toolArgs);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Tool execution error:', err);
      toolResult = JSON.stringify({ error: msg });
    }

    // Handle pending tx sentinel / chart event
    let result = toolResult;
    try {
      const parsed = JSON.parse(result) as Record<string, unknown>;
      if (parsed[PENDING_TX_SENTINEL]) {
        yield {
          type: 'pending_tx',
          txId: parsed['txId'] as string,
          tool: parsed['tool'] as string,
          label: parsed['label'] as string,
          details: parsed['details'] as Record<string, unknown>,
        };
        toolResult = JSON.stringify({
          status: 'pending_approval',
          txId: parsed['txId'],
          message: 'Transaction queued — waiting for user approval in the UI.',
        });
      } else if (parsed['__chart__'] === true) {
        // Emit chart event so frontend renders the visual
        yield {
          type: 'chart',
          symbol:              parsed['symbol']             as string,
          tokenId:             parsed['tokenId']            as string,
          period:              parsed['period']             as string,
          candles:             parsed['candles']            as never,
          currentPrice:        parsed['currentPrice']       as number,
          priceChange24h:      parsed['priceChange24h']     as number,
          priceChangePercent:  parsed['priceChangePercent'] as number,
          high24h:             parsed['high24h']            as number,
          low24h:              parsed['low24h']             as number,
          coingeckoId:         parsed['coingeckoId']        as string | undefined,
        };
        // Give Vera the text summary to read and analyse
        toolResult = parsed['summary'] as string;
      }
    } catch { /* not JSON */ }

    yield { type: 'tool_result', name: toolName, result: toolResult };

    // Build a tool-specific synthesis directive
    const KIT_WRITE = new Set(['hts_create_token','hts_create_nft','hts_mint_token','hts_airdrop',
      'hcs_create_topic','hcs_submit_message','evm_create_erc20','evm_create_erc721','hbar_transfer']);
    const KIT_QUERY = new Set(['kit_get_account','kit_get_token_info','kit_get_hcs_messages']);
    const CONTRACT_OPS = new Set(['vera_deploy_contract','vera_call_contract','vera_compile_contract']);

    // Check if this was a queued transaction (pending approval) — sentinel is __pending_tx__
    const isPendingTx = toolResult.includes('"__pending_tx__"');

    let synthDirective: string;
    if (isPendingTx) {
      synthDirective = `The transaction has been queued for user approval in the UI. Write one short confirmation sentence: tell the user to look for the approval button in the chat, mention what the transaction does (based on the tool used: "${toolName}"), and that no further action is needed from them now.`;
    } else if (CONTRACT_OPS.has(toolName)) {
      if (toolName === 'vera_deploy_contract') {
        synthDirective = `Contract deployed. Write your response by:
1. One punchy sentence confirming deployment.
2. Quoting the EXACT Contract ID and contract_address from the result.
3. Providing the hashscan_url as a clickable markdown link.
4. Suggesting next steps (call functions with vera_call_contract, verify on HashScan, interact via frontend).
Be direct — this is live on Hedera EVM.`;
      } else if (toolName === 'vera_call_contract') {
        synthDirective = `Contract function executed. Write your response by:
1. Confirming what function was called and whether it was a read or write operation.
2. If write: quote the transaction_id and provide the hashscan_url as a clickable link. State the status.
3. If read: present the returned value clearly.
Be precise — quote exact values from the result.`;
      } else {
        synthDirective = `Compilation complete. Present the result — whether it succeeded or failed. If success, tell the user to deploy with vera_deploy_contract using the returned bytecode and ABI. If errors, show the Solidity errors clearly.`;
      }
    } else if (KIT_WRITE.has(toolName)) {
      synthDirective = `The on-chain operation completed. Write your response by:
1. Opening with one punchy sentence confirming what was created/executed.
2. Quoting the EXACT Token ID / Topic ID / Contract ID / Transaction ID from the result above.
3. Providing the HashScan URL from the result's "hashscan_url" field — format it as a clickable markdown link.
4. Listing key stats (symbol, supply, decimals, network) in a tidy inline format.
5. Ending with 2-3 concrete next steps (e.g. "Now you can: associate accounts, airdrop to holders, set up a liquidity pool on SaucerSwap").
Be direct and excited — this is live on-chain, it actually happened.`;
    } else if (KIT_QUERY.has(toolName)) {
      synthDirective = `Write your full response using the on-chain data above. Quote EXACT values — balances, token names, IDs, dates. Never paraphrase when you can quote. Structure clearly with markdown.`;
    } else if (toolName === 'vera_memory_save') {
      synthDirective = `Memory saved. Confirm briefly: what was saved, the memory title, and that it will be available in future sessions. One sentence is enough — don't over-explain.`;
    } else if (toolName === 'vera_memory_recall') {
      synthDirective = `Here are the recalled memories. Present them clearly — list each memory's title and key content. If they're relevant to the current task, connect them explicitly. If nothing was found, say so directly.`;
    } else if (toolName === 'hedera_search_tokens') {
      synthDirective = `Token search complete. List each found token with its EXACT token_id, symbol, name, and type. If one token is a clear match, highlight it. If none match, say so and suggest using hedera_search_tokens with a different query.`;
    } else if (toolName === 'saucerswap_get_token_price') {
      synthDirective = `Present the token price clearly: state the symbol, priceUsd (formatted as $X.XXXXXX), priceHbar (formatted as X ℏ), and token ID. Give context on what this price means if helpful. Be direct — one paragraph max.`;
    } else if (toolName === 'hedera_get_balance') {
      synthDirective = `State the exact HBAR balance from the result — quote the "hbars" field directly (e.g. "Balance: 1,234.56789012 HBAR"). Convert tinybars if helpful. One sentence is enough unless the user asked for more context.`;
    } else if (toolName === 'hedera_get_account_info') {
      synthDirective = `Present the account details clearly: HBAR balance (from balance.hbars), account ID, memo, and key type. Format as a clean markdown summary. Quote exact values — do not round or paraphrase.`;
    } else if (toolName === 'hedera_get_transaction') {
      synthDirective = `Present the transaction details: quote the transaction_id, result (SUCCESS/FAILED), type (name), charged_tx_fee in HBAR (divide tinybars by 1e8), and consensus_timestamp. Format as a concise markdown block.`;
    } else if (toolName === 'saucerswap_get_pools') {
      synthDirective = `List the top pools with their token pair (tokenA.symbol / tokenB.symbol), TVL in USD (tvlUsd), and 24h volume (volume24hUsd). Format as a clean markdown table or bullet list. Show the top 5 by TVL.`;
    } else if (toolName === 'get_price_chart') {
      synthDirective = `A price chart has been rendered for the user. Using the summary data above: state the current price, 24h change (with ▲/▼), high/low range, and give a brief 2-sentence technical interpretation of the trend. Be direct and numbers-focused.`;
    } else if (toolName === 'vera_spawn_agent') {
      synthDirective = `The sub-agent has completed its task. Present the sub-agent's result clearly. Quote the key findings or outputs directly from the "result" field. Mention the agent role used. If memory was saved, confirm it. Keep it focused — don't pad or over-explain.`;
    } else if (toolName === 'hedera_get_tokens') {
      synthDirective = `List the HTS tokens held by this account. For each token show token_id, balance (adjusted for decimals if available), and any symbol. If no tokens are held, say so directly.`;
    } else if (toolName === 'hedera_hcs_get_messages' || toolName === 'kit_get_hcs_messages') {
      synthDirective = `Present the HCS messages clearly. For each message show the sequence_number, timestamp, and decoded message content. If the messages are JSON or have structure, parse and present them meaningfully. Quote the actual text.`;
    } else if (toolName === 'qvx_get_signals') {
      synthDirective = `Present the QVX trading signals clearly. For each signal show: market, direction (BUY/SELL), confidence/strength, and timestamp. Highlight the highest-confidence signals first. If no signals are active, say so. Be direct and actionable.`;
    } else if (toolName === 'qvx_get_positions') {
      synthDirective = `Present the open positions. For each position show: market, direction (long/short), entry price, current PnL (if available), and size. Summarise total exposure. If no positions are open, state that clearly.`;
    } else if (toolName === 'qvx_get_pnl') {
      synthDirective = `Present the PnL summary clearly. Show total realised PnL, unrealised PnL, win rate, and number of trades in the period. Format numbers with appropriate currency/% signs. Highlight whether the period was net profitable.`;
    } else if (toolName === 'qvx_get_market_analysis') {
      synthDirective = `Present the market analysis. State the trend direction, key support/resistance levels, momentum indicators, and any notable patterns. Be specific with numbers — quote exact price levels and percentages from the result.`;
    } else if (toolName === 'qvx_get_trade_history') {
      synthDirective = `List the recent trades. For each trade show: market, direction, entry/exit price, PnL, and date. Summarise the win/loss ratio. If the history is long, highlight the top 5 most significant trades.`;
    } else if (toolName === 'qvx_get_node_status' || toolName === 'qvx_get_node_metrics') {
      synthDirective = `Present the QVX node status concisely. State whether the node is online/offline, current uptime, strategy status, and any active alerts or warnings. One short paragraph is sufficient.`;
    } else if (toolName === 'qvx_get_strategy_state' || toolName === 'qvx_get_learning_state') {
      synthDirective = `Present the strategy/learning state clearly. Highlight the current mode (active/paused/learning), key parameters, last updated timestamp, and any performance metrics. Be concise — bullet points preferred.`;
    } else if (toolName === 'web_search') {
      synthDirective = `Using the search results above, write a comprehensive answer. Quote specific facts, statistics, or quotes from the sources. Cite sources with their title or URL in markdown. Be direct — lead with the most important finding, then add context.`;
    } else if (toolName === 'get_news') {
      synthDirective = `Present the news results clearly. For each article: bold the headline, state the source, and give a 1-sentence summary of the key point. Lead with the most recent or impactful story. If there are 5+ articles, group them by theme.`;
    } else if (toolName === 'wiki_search') {
      synthDirective = `Present the Wikipedia summary clearly. Extract the most important facts, dates, and figures. Structure with a brief intro paragraph followed by key bullet points. Quote exact definitions or descriptions where helpful.`;
    } else if (toolName === 'hackernews_search') {
      synthDirective = `Present the Hacker News results. List each post with its title, score, comment count, and the most interesting discussion point if available. Highlight any strong community consensus or debate. Be concise — HN readers value brevity.`;
    } else {
      synthDirective = `Now write your full response using the data above. Present specific values, headlines, prices, or details — do not summarise vaguely. Quote real content from the result.`;
    }

    conversation.push({ role: 'assistant', content });
    conversation.push({
      role: 'user',
      content: `<tool_response name="${toolName}">
${toolResult}
</tool_response>

${synthDirective}`,
    });
  }

  yield { type: 'usage', promptTokens: totalPrompt, completionTokens: totalCompletion };
  
  // Clear tool cache to free GPU memory for next request
  toolManager.clearCache();
  
  yield { type: 'done' };
}
