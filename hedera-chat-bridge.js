/**
 * Vera Hedera Chat Integration
 * Adds Hedera tool commands to the Grok chat interface
 */

const { VeraHederaIntegration } = require('./vera-hedera-integration.js');

// Initialize Hedera integration
const hederaIntegration = new VeraHederaIntegration();

// Add Hedera tool responses to the getVeraResponse function
function getHederaResponse(userMessage) {
    const message = userMessage.toLowerCase();
    
    // Check for Hedera commands
    if (message.includes('create') && message.includes('token')) {
        return {
            type: 'hedera_command',
            command: 'create_token',
            params: message
        };
    }
    
    if (message.includes('create') && message.includes('nft')) {
        return {
            type: 'hedera_command',
            command: 'create_nft',
            params: message
        };
    }
    
    if (message.includes('balance') || (message.includes('check') && message.includes('account'))) {
        return {
            type: 'hedera_command',
            command: 'get_balance',
            params: message
        };
    }
    
    if ((message.includes('transfer') || message.includes('send')) && message.includes('hbar')) {
        return {
            type: 'hedera_command',
            command: 'transfer_hbar',
            params: message
        };
    }
    
    if (message.includes('create') && message.includes('topic')) {
        return {
            type: 'hedera_command',
            command: 'create_topic',
            params: message
        };
    }
    
    if (message.includes('send') && message.includes('message')) {
        return {
            type: 'hedera_command',
            command: 'send_message',
            params: message
        };
    }
    
    // Not a Hedera command
    return null;
}

// Process Hedera command and return formatted response
async function processHederaCommand(commandData) {
    try {
        const result = await hederaIntegration.processCommand(commandData.params);
        return result.message;
    } catch (error) {
        return `❌ Hedera command failed: ${error.message}`;
    }
}

// Export for use in chat interface
module.exports = {
    getHederaResponse,
    processHederaCommand,
    hederaIntegration
};
