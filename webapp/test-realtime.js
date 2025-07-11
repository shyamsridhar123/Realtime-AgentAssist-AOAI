// Load environment variables first
require('dotenv').config({ path: '../.env' });

const { OpenAIRealtimeWS } = require('openai/beta/realtime/ws');
const { AzureOpenAI } = require('openai');

async function testRealtimeConnection() {
  try {
    console.log('Testing OpenAI Realtime WebSocket connection...');
    console.log('Azure OpenAI Key:', process.env.AZURE_OPENAI_KEY ? 'Set' : 'Missing');
    console.log('Azure OpenAI Endpoint:', process.env.AZURE_OPENAI_ENDPOINT ? 'Set' : 'Missing');
    console.log('Realtime Deployment:', process.env.AZURE_OPENAI_LLM_REALTIME_SPEECH_DEPLOYMENT || 'gpt-4o-realtime-preview');
    console.log('Regular API Version:', process.env.AZURE_OPENAI_API_VERSION);
    console.log('Realtime API Version:', process.env.AZURE_OPENAI_REALTIME_API_VERSION || "2024-10-01-preview");
    
    // Create Azure OpenAI client first
    const azureOpenAIClient = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_KEY,
      apiVersion: process.env.AZURE_OPENAI_REALTIME_API_VERSION || "2024-10-01-preview",
      deployment: process.env.AZURE_OPENAI_LLM_REALTIME_SPEECH_DEPLOYMENT || 'gpt-4o-realtime-preview',
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    });
    
    console.log('Creating Azure OpenAI Realtime client...');
    
    // Create the realtime client using Azure OpenAI
    const realtimeClient = await OpenAIRealtimeWS.azure(azureOpenAIClient);
    
    console.log('Realtime client created successfully!');
    
    // Set up event handlers
    realtimeClient.socket.on('open', () => {
      console.log('✅ OpenAI Realtime WebSocket connection opened successfully!');
      
      // Send a test session update
      realtimeClient.send({
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          model: 'gpt-4o-realtime-preview'
        }
      });
    });
    
    realtimeClient.on('session.created', (event) => {
      console.log('✅ Session created:', event.session.id);
    });
    
    realtimeClient.on('error', (error) => {
      console.error('❌ OpenAI Realtime WebSocket error:', error);
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      if (error.cause) {
        console.error('Error cause:', error.cause);
      }
    });
    
    realtimeClient.socket.on('close', () => {
      console.log('🔌 OpenAI Realtime WebSocket connection closed');
    });
    
    realtimeClient.socket.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
    });
    
    // Wait a bit for connection to stabilize
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Close the connection
    realtimeClient.close();
    
    console.log('✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    process.exit(1);
  }
}

testRealtimeConnection();
