import React, { useState, useEffect } from 'react';

function KisanSahayak() {
  const [input, setInput] = useState('');
  const [chat, setChat] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const [botInfo, setBotInfo] = useState(null);
  
  // Backend ka API URL
  const API_URL = 'http://localhost:5000/api/chat';
  const HEALTH_URL = 'http://localhost:5000/api/health';
  const INFO_URL = 'http://localhost:5000/api/info';
  
  // Check backend connection on component mount
  useEffect(() => {
    checkBackendConnection();
    fetchBotInfo();
  }, []);
  
  const checkBackendConnection = async () => {
    try {
      const response = await fetch(HEALTH_URL, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (response.ok) {
        const data = await response.json();
        setConnectionStatus(data.rag_system === 'initialized' ? 'connected' : 'partial');
      } else {
        setConnectionStatus('disconnected');
      }
    } catch (error) {
      setConnectionStatus('disconnected');
    }
  };
  
  const fetchBotInfo = async () => {
    try {
      const response = await fetch(INFO_URL);
      if (response.ok) {
        const data = await response.json();
        setBotInfo(data);
      }
    } catch (error) {
      console.log('Could not fetch bot info');
    }
  };
  
  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    
    // User ka message add karo
    const userMessage = input.trim();
    setChat(prev => [...prev, { text: userMessage, sender: 'user' }]);
    setInput('');
    
    // Add typing indicator
    setChat(prev => [...prev, { text: 'Typing...', sender: 'bot', typing: true }]);
    setIsLoading(true);
    
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Replace typing indicator with actual response
      setChat(prev => {
        const newChat = [...prev];
        newChat[newChat.length - 1] = { 
          text: data.reply || 'No reply from server.', 
          sender: 'bot',
          status: data.status 
        };
        return newChat;
      });
      
      // Update connection status if successful
      if (connectionStatus !== 'connected') {
        setConnectionStatus('connected');
      }
      
    } catch (err) {
      console.error('Error sending message:', err);
      
      // Replace typing with error message
      setChat(prev => {
        const newChat = [...prev];
        newChat[newChat.length - 1] = {
          text: connectionStatus === 'disconnected' 
            ? `❌ Backend not connected. Please start the Flask server at localhost:5000 and try again.`
            : `❌ Error: ${err.message}. Please try again.`,
          sender: 'bot',
          error: true
        };
        return newChat;
      });
      
      setConnectionStatus('disconnected');
    } finally {
      setIsLoading(false);
    }
  };
  
  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return '#22c55e'; // green
      case 'partial': return '#f59e0b'; // yellow
      case 'disconnected': return '#ef4444'; // red
      default: return '#6b7280'; // gray
    }
  };
  
  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return '🟢 Connected to AI Backend';
      case 'partial': return '🟡 Partial Connection (RAG not initialized)';
      case 'disconnected': return '🔴 Backend Disconnected';
      default: return '🟡 Checking Connection...';
    }
  };
  
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '600px', 
      width: '100%', 
      maxWidth: '800px', 
      margin: '0 auto',
      border: '1px solid #e0e0e0',
      borderRadius: '12px',
      overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
    }}>
      {/* Header */}
      <div style={{ 
        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
        color: 'white', 
        padding: '16px', 
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '4px' }}>
          🌾 किसान सहायक (Kisan Sahayak)
        </div>
        {botInfo && (
          <div style={{ fontSize: '12px', opacity: '0.9' }}>
            {botInfo.description}
          </div>
        )}
      </div>
      
      {/* Connection Status Bar */}
      <div style={{ 
        backgroundColor: getConnectionStatusColor(),
        color: 'white',
        padding: '8px 16px',
        fontSize: '12px',
        textAlign: 'center',
        fontWeight: '500'
      }}>
        {getConnectionStatusText()}
      </div>
      
      {/* Chat messages container */}
      <div style={{ 
        flexGrow: 1, 
        overflowY: 'auto', 
        padding: '16px',
        backgroundColor: '#f8fafc'
      }}>
        {/* Welcome message */}
        {chat.length === 0 && (
          <div style={{ 
            textAlign: 'center', 
            color: '#64748b', 
            marginTop: '40px'
          }}>
            <div style={{ fontSize: '24px', marginBottom: '16px' }}>🌱</div>
            <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
              Welcome to Kisan Sahayak!
            </div>
            <div style={{ fontSize: '14px', lineHeight: '1.5', marginBottom: '16px' }}>
              Ask me anything about farming, agriculture, crops, fertilizers, and more!
            </div>
            {botInfo && (
              <div style={{ 
                backgroundColor: 'white', 
                padding: '12px', 
                borderRadius: '8px',
                maxWidth: '300px',
                margin: '0 auto',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
                  I can help you with:
                </div>
                {botInfo.capabilities.slice(0, 4).map((capability, idx) => (
                  <div key={idx} style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>
                    • {capability}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        {chat.map((msg, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: '12px'
            }}
          >
            <div
              style={{
                maxWidth: '75%',
                padding: '12px 16px',
                borderRadius: msg.sender === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                backgroundColor: msg.sender === 'user' 
                  ? '#2563eb' 
                  : msg.error 
                    ? '#fef2f2' 
                    : 'white',
                color: msg.sender === 'user' 
                  ? 'white' 
                  : msg.error 
                    ? '#dc2626' 
                    : '#374151',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                fontSize: '14px',
                lineHeight: '1.4',
                border: msg.error ? '1px solid #fecaca' : 'none'
              }}
            >
              {msg.typing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>Thinking</span>
                  <div style={{ display: 'flex', gap: '2px' }}>
                    <div style={{ width: '4px', height: '4px', backgroundColor: '#6b7280', borderRadius: '50%', animation: 'pulse 1s infinite' }}></div>
                    <div style={{ width: '4px', height: '4px', backgroundColor: '#6b7280', borderRadius: '50%', animation: 'pulse 1s infinite 0.2s' }}></div>
                    <div style={{ width: '4px', height: '4px', backgroundColor: '#6b7280', borderRadius: '50%', animation: 'pulse 1s infinite 0.4s' }}></div>
                  </div>
                </div>
              ) : (
                msg.text
              )}
            </div>
          </div>
        ))}
      </div>
      
      {/* Input area */}
      <div style={{ 
        display: 'flex', 
        padding: '16px',
        backgroundColor: '#ffffff',
        borderTop: '1px solid #e2e8f0',
        gap: '12px'
      }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          style={{ 
            flex: 1,
            padding: '12px 16px',
            border: '1px solid #d1d5db',
            borderRadius: '24px',
            outline: 'none',
            fontSize: '14px',
            backgroundColor: 'white',
            color: '#374151'
          }}
          onKeyDown={e => { 
            if (e.key === 'Enter' && !isLoading && input.trim()) {
              sendMessage(); 
            }
          }}
          onFocus={e => e.target.style.borderColor = '#2563eb'}
          onBlur={e => e.target.style.borderColor = '#d1d5db'}
          placeholder={connectionStatus === 'connected' 
            ? "Ask me about farming, crops, fertilizers..." 
            : "Start Flask server first to chat..."
          }
          disabled={isLoading || connectionStatus === 'disconnected'}
        />
        
        <button 
          onClick={sendMessage}
          disabled={isLoading || !input.trim() || connectionStatus === 'disconnected'}
          style={{
            padding: '12px 20px',
            backgroundColor: (isLoading || !input.trim() || connectionStatus === 'disconnected') 
              ? '#d1d5db' 
              : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '24px',
            cursor: (isLoading || !input.trim() || connectionStatus === 'disconnected') 
              ? 'not-allowed' 
              : 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            minWidth: '70px',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => {
            if (!e.target.disabled) {
              e.target.style.backgroundColor = '#1d4ed8';
            }
          }}
          onMouseLeave={e => {
            if (!e.target.disabled) {
              e.target.style.backgroundColor = '#2563eb';
            }
          }}
        >
          {isLoading ? '⏳' : '📤'}
        </button>
        
        {/* Retry connection button */}
        {connectionStatus === 'disconnected' && (
          <button
            onClick={checkBackendConnection}
            style={{
              padding: '12px',
              backgroundColor: '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: '24px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600'
            }}
            title="Retry connection"
          >
            🔄
          </button>
        )}
      </div>
    </div>
  );
}

export default KisanSahayak;