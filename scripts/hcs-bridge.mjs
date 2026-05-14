/**
 * Minimal HCS Bridge — accepts POST /hedera/submit-message
 * and submits to Hedera Consensus Service via the JS SDK.
 *
 * Usage: node scripts/hcs-bridge.mjs
 * Requires: HEDERA_OPERATOR_ACCOUNT_ID, HEDERA_OPERATOR_PRIVATE_KEY, HEDERA_NETWORK in env
 */

import {
  Client,
  TopicMessageSubmitTransaction,
  AccountId,
  PrivateKey,
} from "@hashgraph/sdk";
import http from "node:http";

const operatorId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const operatorKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
const network = process.env.HEDERA_NETWORK || "testnet";

if (!operatorId || !operatorKey) {
  console.error("Missing HEDERA_OPERATOR_ACCOUNT_ID or HEDERA_OPERATOR_PRIVATE_KEY");
  process.exit(1);
}

const client = network === "mainnet"
  ? Client.forMainnet()
  : Client.forTestnet();

// Auto-detect key type: try ECDSA first, fall back to ED25519, then DER
let privKey;
try {
  privKey = PrivateKey.fromStringECDSA(operatorKey);
  console.log("Key type: ECDSA");
} catch {
  try {
    privKey = PrivateKey.fromStringED25519(operatorKey);
    console.log("Key type: ED25519");
  } catch {
    privKey = PrivateKey.fromString(operatorKey);
    console.log("Key type: auto-detected");
  }
}
client.setOperator(AccountId.fromString(operatorId), privKey);

console.log(`HCS Bridge started: network=${network} operator=${operatorId}`);

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/hedera/submit-message") {
    let body = "";
    for await (const chunk of req) body += chunk;

    try {
      const { topic_id, message } = JSON.parse(body);
      if (!topic_id) throw new Error("topic_id required");

      const msgStr = typeof message === "string" ? message : JSON.stringify(message);

      const txResponse = await new TopicMessageSubmitTransaction()
        .setTopicId(topic_id)
        .setMessage(msgStr)
        .execute(client);

      const receipt = await txResponse.getReceipt(client);

      const result = {
        status: receipt.status.toString(),
        topic_id,
        sequence_number: receipt.topicSequenceNumber?.toNumber() ?? null,
        transaction_id: txResponse.transactionId.toString(),
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      console.log(`✓ ${topic_id} seq=${result.sequence_number} tx=${result.transaction_id}`);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
      console.error(`✗ ${err.message}`);
    }
  } else if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", network, operator: operatorId }));
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

const PORT = parseInt(process.env.HCS_BRIDGE_PORT || "8001", 10);
server.listen(PORT, () => {
  console.log(`HCS Bridge listening on http://localhost:${PORT}`);
});
