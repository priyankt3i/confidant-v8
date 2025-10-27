/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
import { useAppStore } from '../../../lib/state';
import SettingsModal from '../../../lib/SettingsModal';

const formatTimestamp = (date: Date | string) => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  // Check if the date is valid
  if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
    return ''; // Return an empty string or some placeholder for invalid dates
  }

  const now = new Date();
  const diff = now.getTime() - dateObj.getTime();
  const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    // Today: return time
    return dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } else if (diffDays === 1) {
    // Yesterday
    return 'Yesterday';
  } else {
    // Older: return date
    return dateObj.toLocaleDateString();
  }
};

const ChatsScreen: React.FC = () => {
  const personas = useAppStore(state => state.personas);
  const selectPersona = useAppStore(state => state.selectPersona);
  const [settingsTarget, setSettingsTarget] = useState<'new' | string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPersonas = personas.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <div className="chats-screen">
        <header className="chats-header">
          <h1>Chats</h1>
          <button className="settings-button" onClick={() => setSettingsTarget(personas[0]?.id ?? 'new')} aria-label="Open settings">
            <span className="icon">settings</span>
          </button>
        </header>
        <div className="search-container">
          <span className="icon search-icon">search</span>
          <input
            type="text"
            placeholder="Search for a confidant..."
            className="search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="chat-list">
          {filteredPersonas.map(persona => {
            const lastMessage = persona.chatHistory && persona.chatHistory.length > 0
              ? persona.chatHistory[persona.chatHistory.length - 1]
              : null;

            return (
              <div
                key={persona.id}
                className="chat-list-item"
                onClick={() => selectPersona(persona.id)}
                role="button"
                tabIndex={0}
                aria-label={`Start chat with ${persona.name}`}
              >
                <div className="avatar">
                  {persona.avatar && persona.avatar.startsWith('data:image/') ? (
                    <img src={persona.avatar} alt={persona.name} />
                  ) : (
                    persona.avatar
                  )}
                </div>
                <div className="chat-preview">
                  <div className="chat-preview-header">
                    <h3 className="chat-name">{persona.name}</h3>
                    <div className="chat-meta">
                      {lastMessage && <span className="chat-timestamp">{formatTimestamp(lastMessage.timestamp)}</span>}
                      {persona.unreadCount && persona.unreadCount > 0 && <span className="unread-badge">{persona.unreadCount}</span>}
                    </div>
                  </div>
                  <p className="chat-message-preview">
                    {lastMessage
                      ? `${lastMessage.role === 'user' ? 'You: ' : ''}${lastMessage.text}`
                      : persona.backstory
                    }
                  </p>
                </div>
              </div>
            )
          })}
        </div>
        <button className="create-persona-fab" onClick={() => setSettingsTarget('new')} aria-label="Create new persona">
          <span className="icon">add_comment</span>
        </button>
      </div>
      {settingsTarget && (
        <SettingsModal
          initialTarget={settingsTarget}
          onClose={() => setSettingsTarget(null)}
        />
      )}
    </>
  );
};

export default ChatsScreen;