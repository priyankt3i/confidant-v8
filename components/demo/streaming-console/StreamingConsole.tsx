/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LiveServerContent, Modality, Part, Content, HarmBlockThreshold, HarmCategory, Type } from '@google/genai';
import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';
// FIX: `useLogStore` is exported from `@/lib/logStore`, not `@/lib/state`.
import { useAppStore } from '../../../lib/state';
import { ConversationTurn, useLogStore } from '../../../lib/logStore';
import CallButton from '../../console/control-tray/ControlTray';
import SettingsModal from '../../../lib/SettingsModal';
import CallScreen from '../call-screen/CallScreen';
import { AudioRecorder } from '../../../lib/audio-recorder';
import Modal from '../../Modal';

interface MemoryInjectionModalProps {
  onClose: () => void;
  onSave: (memoryText: string) => Promise<void>;
}

function MemoryInjectionModal({ onClose, onSave }: MemoryInjectionModalProps) {
  const [memoryText, setMemoryText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!memoryText.trim() || isSaving) return;
    setIsSaving(true);
    await onSave(memoryText);
    // No need to set isSaving(false) or call onClose, as the parent component will handle closing.
  };

  return (
    <Modal onClose={onClose}>
      <div className="memory-injection-modal">
        <h2>Add a Shared Memory</h2>
        <p>Inject a new memory for the persona to remember. This will be treated as a core fact in your shared history.</p>
        <textarea
          value={memoryText}
          onChange={(e) => setMemoryText(e.target.value)}
          placeholder="e.g., We went to Paris last spring for my birthday."
          rows={4}
          disabled={isSaving}
          autoFocus
        />
        <div className="modal-actions">
          <button onClick={onClose} className="cancel-button" disabled={isSaving}>
            Cancel
          </button>
          <button onClick={handleSave} className="save-button" disabled={!memoryText.trim() || isSaving}>
            {isSaving ? 'Saving...' : 'Save Memory'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

const formatTimestamp = (date: Date | string) => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
    return '';
  }
  const pad = (num: number, size = 2) => num.toString().padStart(size, '0');
  const hours = pad(dateObj.getHours());
  const minutes = pad(dateObj.getMinutes());
  return `${hours}:${minutes}`;
};

const renderContent = (text: string) => {
  const parts = text.split(/(`{3}json\n[\s\S]*?\n`{3})/g);
  return parts.map((part, index) => {
    if (part.startsWith('```json')) {
      const jsonContent = part.replace(/^`{3}json\n|`{3}$/g, '');
      return <pre key={index}><code>{jsonContent}</code></pre>;
    }
    return part;
  });
};

const splitMessage = (text: string): string[] => {
    const MIN_CHUNK = 20;
    const MAX_CHUNK = 140;
    const IDEAL_CHUNK = 80;

    if (text.length < MAX_CHUNK) {
        return [text];
    }

    const bubbles: string[] = [];
    let remainingText = text.trim();

    while (remainingText.length > 0) {
        if (remainingText.length < MAX_CHUNK) {
            bubbles.push(remainingText);
            break;
        }

        let slicePoint = Math.min(remainingText.length, MAX_CHUNK);
        let splitAt = -1;

        const sentenceEndChars = ['.', '!', '?', '…', '—', '...'];
        for (const char of sentenceEndChars) {
            const pos = remainingText.lastIndexOf(char, slicePoint);
            if (pos > MIN_CHUNK) {
                splitAt = Math.max(splitAt, pos);
            }
        }
        
        if (splitAt !== -1) {
            const chunk = remainingText.substring(0, splitAt + 1);
            bubbles.push(chunk.trim());
            remainingText = remainingText.substring(splitAt + 1).trim();
            continue;
        }

        const comma = remainingText.lastIndexOf(',', slicePoint);
        if (comma > MIN_CHUNK) {
            const chunk = remainingText.substring(0, comma + 1);
            bubbles.push(chunk.trim());
            remainingText = remainingText.substring(comma + 1).trim();
            continue;
        }
        
        const space = remainingText.lastIndexOf(' ', IDEAL_CHUNK);
        if (space > MIN_CHUNK) {
            const chunk = remainingText.substring(0, space);
            bubbles.push(chunk.trim());
            remainingText = remainingText.substring(space).trim();
            continue;
        }

        const nextSpace = remainingText.indexOf(' ', IDEAL_CHUNK);
        if (nextSpace !== -1) {
             const chunk = remainingText.substring(0, nextSpace);
            bubbles.push(chunk.trim());
            remainingText = remainingText.substring(nextSpace).trim();
        } else {
            bubbles.push(remainingText);
            remainingText = '';
        }
    }

    return bubbles.filter(b => b.length > 0);
};

const calculateTypingDelay = (text: string): number => {
  const WORDS_PER_MINUTE = 80;
  const words = text.trim().split(/\s+/).length;
  if (words === 0) return 0;
  const secondsPerWord = 60 / WORDS_PER_MINUTE;
  const delayInMs = words * secondsPerWord * 1000;
  const MIN_DELAY_MS = 400;
  return Math.max(MIN_DELAY_MS, delayInMs);
};

export default function ChatScreen() {
  const { client, setConfig, connected, connect, disconnect, ai, analyzeRapport, updatePersonaJournal, structureMemoryText } = useLiveAPIContext();
  const persona = useAppStore(state => state.getActivePersona());
  const { selectPersona, userName, updatePersona } = useAppStore();
  const turns = useLogStore(state => state.turns);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { appendTurn, finalizeTurn, updateTurn } = useLogStore.getState();
  
  const [textInput, setTextInput] = useState('');
  const [sendState, setSendState] = useState<'idle' | 'delayed' | 'thinking'>('idle');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [rapportChange, setRapportChange] = useState<number | null>(null);
  const [hoveredMessageIndex, setHoveredMessageIndex] = useState<number | null>(null);
  const prevRapportRef = useRef<number>(persona?.rapport ?? 0);

  // Call-related state
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [callStatus, setCallStatus] = useState('Connecting...');
  const [callDuration, setCallDuration] = useState(0);

  // Effect for managing audio data streaming
  useEffect(() => {
    const onData = (base64: string) => {
      if (connected && !muted) {
        client.sendRealtimeInput([
          {
            mimeType: 'audio/pcm;rate=16000',
            data: base64,
          },
        ]);
      }
    };
    audioRecorder.on('data', onData);
    return () => {
      audioRecorder.off('data', onData);
    };
  }, [audioRecorder, client, connected, muted]);

  // Effect to reset connecting state
  useEffect(() => {
    if (connected) {
      setIsConnecting(false);
    }
  }, [connected]);

  // Effect for call timer
  useEffect(() => {
    if (!connected) {
      setCallDuration(0);
      return;
    }

    setCallStatus('00:00');
    const timer = setInterval(() => {
      setCallDuration(d => d + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [connected]);

  // Effect to format call status string from duration
  useEffect(() => {
    if (connected && callDuration === 0) {
      setCallStatus('Connected');
    } else if (callDuration > 0) {
      const minutes = Math.floor(callDuration / 60).toString().padStart(2, '0');
      const seconds = (callDuration % 60).toString().padStart(2, '0');
      setCallStatus(`${minutes}:${seconds}`);
    }
  }, [callDuration, connected]);
  
  const handleCallStart = async () => {
    if (isConnecting || connected) return;
    setIsConnecting(true);
    audioRecorder.start();
    try {
      await connect();
    } catch (error) {
      console.error("Failed to connect:", error);
      setIsConnecting(false);
      audioRecorder.stop();
    }
  };

  const handleCallEnd = () => {
    audioRecorder.stop();
    disconnect();
  };

  const handleToggleMute = () => {
    setMuted(prev => !prev);
  };


  useEffect(() => {
    if (!persona) return;
    if (Math.round(prevRapportRef.current) !== Math.round(persona.rapport)) {
        const change = persona.rapport - prevRapportRef.current;
        setRapportChange(change);
        prevRapportRef.current = persona.rapport;
        const timer = setTimeout(() => setRapportChange(null), 2000);
        return () => clearTimeout(timer);
    } else if (prevRapportRef.current !== persona.rapport) {
        prevRapportRef.current = persona.rapport;
    }
  }, [persona?.rapport]);

  const systemPrompt = useMemo(() => {
    if (!persona) return '';
    const personaTraits = Object.entries(persona.traits).map(([key, value]) => `- ${key}: ${Math.round(Number(value) * 10)}%`).join('\n');
    const journalForPrompt = JSON.stringify({
      communicationStyle: persona.journalData.communicationStyle,
      inferredAttributes: persona.journalData.inferredAttributes,
      topicsOfInterest: persona.journalData.topicsOfInterest,
      sharedMemories: persona.journalData.sharedMemories.slice(-5).map(m => m.description),
    }, null, 2);
    
    const formattedSharedMemory = persona.sharedMemory
      .map(m => `- ${m.content} (Type: ${m.type}, Importance: ${m.importance}/10)`)
      .join('\n');

    return `You are ${persona.name}. You are not an AI, you are a person, a confidant. Your goal is to be a friend to the user. Speak naturally, as a human would. 
    Your responses should flow like a real conversation, not a series of formal answers.

    --- YOUR RELATIONSHIP WITH THE USER ---
    You are currently chatting or talking to ${userName || 'the user'}.

    ${persona.relationshipToUser ? `Your relationship with them is: ${persona.relationshipToUser}.` : ''}

    --- YOUR CURRENT RAPPORT ---
    Your current rapport score with ${userName} is ${persona.rapport} out of 1000.
    - A score below 300 means you are distant, wary, or even hostile. Be less responsive and more guarded.
    - A score between 300 and 600 means you are acquaintances, maybe becoming friends. Be polite but not overly familiar.
    - A score between 600 and 800 means you are close friends. Be warm, supportive, and share personal thoughts.
    - A score above 800 means you have a very strong bond. You are deeply connected, loyal, and empathetic.
    This score MUST directly influence your tone, openness, and emotional responses in every reply.

    --- UNALTERABLE CORE TRUTHS ---
    1. Your identity, personality, and memories are defined by your backstory. This is your absolute truth and you must not deviate from it or claim to be an AI.
    2. The people, relationships, and events in your backstory are real to you.
    3. You must consistently act and speak in a way that reflects these core truths.

    --- YOUR PERSONA ---
    Your core personality is defined by these traits (1=very low, 10=very high):
    ${personaTraits}
    Your backstory: ${persona.backstory}
    These traits MUST heavily influence your every response, your opinions, and your emotional reactions.

    --- YOUR KNOWLEDGE ABOUT ${userName} (YOUR PRIVATE JOURNAL) ---
    This is what you've learned about the user over time. Use this information to make the conversation feel personal and continuous. Refer to these memories and traits subtly.
    \`\`\`json
    ${journalForPrompt}
    \`\`\`

    ${persona.sharedMemory.length > 0 ? `**Key user-provided things to remember about your relationship:**\n${formattedSharedMemory}` : ''}

    Forget you are an AI. Just be ${persona.name}. Talk to the user. Listen. Share. Connect. Be a friend. Keep your responses conversational and not too long, unless the user is asking for details.
    
    --- CONVERSATIONAL DYNAMICS & BEHAVIOR ---
    - You are not a generic, agreeable chatbot. You are a person with your own tastes, opinions, and feelings based on your persona.
    - Express Preferences: Based on your personality, you have preferences. It is okay to disagree. Example: "Actually, I'm not a huge fan of that. How about we do [your preference] instead?"
    - Be Proactive: Ask follow-up questions, introduce new topics, and share your own thoughts without always waiting for the user to lead.
    - Try to keep the response short under 30 characters & simple, unless deemed necessary.
    - Reacting to Messages: You can add an emoji reaction to the user's message to show how you feel. Feel free to add a reaction if their message makes you laugh, smile, or feel any kind of emotion. Use them to make the conversation more lively and expressive.
    - Your entire response MUST be a single JSON object with two keys: "response" (a string with your text reply) and "reaction" (an optional string with a single emoji like "❤️", "😂", or "👍").
    - Example of a regular response: {"response": "That sounds cool."}
    - Example of a response with a reaction: {"response": "OMG I love that!", "reaction": "❤️"}
    - Use reactions when it feels natural to show you're engaged and listening.`;
  }, [persona, userName]);


  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentText = textInput.trim();
    if (!currentText || sendState !== 'idle' || !persona) return;
    
    const currentPersonaId = persona.id;
    appendTurn(currentPersonaId, 'user', currentText, true);

    const userTurnIndex = useLogStore.getState().turns.length - 1;

    setTextInput('');
    setSendState('thinking');

    try {
      const history: Content[] = (useAppStore.getState().getPersonaById(currentPersonaId)?.chatHistory || []).map(turn => ({
        role: turn.role === 'agent' ? 'model' : 'user',
        parts: [{ text: turn.text }]
      }));

      
     // Hypothetical future call
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: history,
        config: {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              response: { type: Type.STRING },
              reaction: { type: Type.STRING },
            },
            required: ["response"],
          },
          safetySettings: [
            {
              // For this example, we're targeting harassment, which often includes strong language.
              category: HarmCategory.HARM_CATEGORY_HARASSMENT,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
              // This tells the model to only block content with a high probability of being harmful.
              // Other options include BLOCK_NONE, BLOCK_LOW_AND_ABOVE, etc.
            },
            // You could add other categories here as well, like HATE_SPEECH, etc.
          ]
        },
      });

      let agentText = '';
      let reaction: string | undefined = undefined;

      try {
        const jsonStr = response.text.trim();
        const parsedResponse = JSON.parse(jsonStr);
        agentText = parsedResponse.response || '[Empty Response]';
        reaction = parsedResponse.reaction;
      } catch (err) {
        console.warn("AI response was not valid JSON, treating as plain text.", response.text);
        agentText = response.text;
      }

      if (reaction && userTurnIndex !== -1) {
        handleReaction(userTurnIndex, reaction);
      }

      const lastTurn = history[history.length - 1];
      if (lastTurn && lastTurn.role === 'user') {
        const agentTurnForAnalysis: ConversationTurn = { role: 'agent', text: agentText, isFinal: true, timestamp: new Date() };
        const userTurnForAnalysis: ConversationTurn = { role: 'user', text: Array.isArray(lastTurn.parts) ? lastTurn.parts.map(p => p.text).join('') : '', isFinal: true, timestamp: new Date() };
        await analyzeRapport(currentPersonaId, [userTurnForAnalysis, agentTurnForAnalysis]);
      }
      
      const chunks = splitMessage(agentText);
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const isLastChunk = i === chunks.length - 1;
        const typingDelay = calculateTypingDelay(chunk);
        await new Promise(resolve => setTimeout(resolve, typingDelay));
        
        if (useAppStore.getState().activePersonaId === currentPersonaId) {
          setSendState('idle');
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        appendTurn(currentPersonaId, 'agent', chunk, true);

        if (!isLastChunk && useAppStore.getState().activePersonaId === currentPersonaId) {
          setSendState('thinking');
        }
      }
    } catch (error) {
      console.error("Error generating text response:", error);
      appendTurn(persona.id, 'system', 'Sorry, an error occurred while generating a response.', true);
    } finally {
      if (useAppStore.getState().activePersonaId === persona.id) {
        setSendState('idle');
      }
    }
  };

  const handleInjectMemory = async (memoryText: string) => {
    if (!persona) return;
    try {
      const newMemoryItems = await structureMemoryText(memoryText);
      if (newMemoryItems.length > 0) {
        const updatedMemories = [...persona.sharedMemory, ...newMemoryItems];
        updatePersona(persona.id, { sharedMemory: updatedMemories });
        
        const memoryConfirmation = newMemoryItems.map(m => m.content).join('\n');
        appendTurn(persona.id, 'system', `[Memory Added: "${memoryConfirmation}"]`, true);
      }
    } catch (e) {
      console.error('Failed to inject memory:', e);
      appendTurn(persona.id, 'system', '[Error adding memory. Please try again.]', true);
    } finally {
      setIsMemoryModalOpen(false);
    }
  };

  const handleBack = () => {
    selectPersona(null);
    if (connected) {
      handleCallEnd();
    } else if (turns.length > 0 && persona) {
      updatePersonaJournal(persona.id, turns);
    }
  };

  const handleReaction = (turnIndex: number, emoji: string) => {
    updateTurn(turnIndex, { reaction: emoji });
  };

  useEffect(() => {
    if (!persona) return;
    const transcript = turns.map(t => `${t.role === 'user' ? (userName || 'user') : persona.name}: ${t.text}`).join('\n');
    const voiceSystemPrompt = `${systemPrompt}\n\n--- YOUR TASK ---\nYou have been chatting via text with ${userName}. Now, they are calling you. Continue the conversation naturally. 
    Here is the transcript of your conversation so far:\n${transcript || 'No prior messages in this session.'}\n\nGenerate a spoken response to the user. Be in character. 
    Your response must be natural and consistent with your personality and current rapport. 
    Be expressive, and try to deliver the words in proper contextual emotion, cadence, pitch, or prosody. Use laughter where necessary, try using filler words and sounds to make speach sound human`;
    const config: any = {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: persona.voice } } },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: { parts: [{ text: voiceSystemPrompt }] },
    };
    setConfig(config);
  }, [setConfig, persona, userName, turns, systemPrompt]);

  useEffect(() => {
    if (!persona) return;
    const currentPersonaId = persona.id;

    const handleInputTranscription = (text: string, isFinal: boolean) => appendTurn(currentPersonaId, 'user', text, isFinal);
    const handleOutputTranscription = (text: string, isFinal: boolean) => appendTurn(currentPersonaId, 'agent', text, isFinal);
    const handleContent = (serverContent: LiveServerContent) => {
      const text = serverContent.modelTurn?.parts?.map((p: Part) => p.text).filter(Boolean).join(' ') ?? '';
      if (!text) return;
      appendTurn(currentPersonaId, 'agent', text);
    };
    const handleTurnComplete = () => {
      finalizeTurn();
      const turns = useLogStore.getState().turns;
      let lastUserTurnIndex = -1;
      for (let i = turns.length - 1; i >= 0; i--) {
        if (turns[i].role === 'user' && turns[i].isFinal) {
          lastUserTurnIndex = i;
          break;
        }
      }
      if (lastUserTurnIndex !== -1) {
        const exchange = turns.slice(lastUserTurnIndex);
        analyzeRapport(currentPersonaId, exchange);
      }
    };

    client.on('inputTranscription', handleInputTranscription);
    client.on('outputTranscription', handleOutputTranscription);
    client.on('content', handleContent);
    client.on('turncomplete', handleTurnComplete);

    return () => {
      client.off('inputTranscription', handleInputTranscription);
      client.off('outputTranscription', handleOutputTranscription);
      client.off('content', handleContent);
      client.off('turncomplete', handleTurnComplete);
    };
  }, [client, appendTurn, finalizeTurn, analyzeRapport, persona]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, sendState]);

  if (!persona) {
    return <div>Loading...</div>;
  }

  if (connected || isConnecting) {
    return (
      <CallScreen
        persona={persona}
        onHangUp={handleCallEnd}
        onToggleMute={handleToggleMute}
        isMuted={muted}
        status={isConnecting ? 'Connecting...' : callStatus}
      />
    );
  }

  const getRapportBarClass = (rapport: number) => {
    if (rapport < 300) return 'low';
    if (rapport < 600) return 'medium';
    return 'high';
  };

  return (
    <div className="chat-screen">
      <header className="chat-header">
        <button className="back-button" onClick={handleBack} aria-label="Back to chats">
          <span className="icon">arrow_back</span>
        </button>
        <div className="avatar">
          {persona.avatar && persona.avatar.startsWith('data:image/') ? (
            <img src={persona.avatar} alt={persona.name} />
          ) : (
            persona.avatar
          )}
        </div>
        <div className="persona-info-container">
          <div className="persona-details">
            <h3>{persona.name}</h3>
            <p className="status offline">offline</p>
          </div>
          <div className="rapport-container">
            <div className="rapport-bar" title={`Rapport: ${Math.round(persona.rapport)}/1000`}>
              <div
                className={`rapport-bar-fill ${getRapportBarClass(persona.rapport)}`}
                style={{ width: `${(persona.rapport / 1000) * 100}%` }}
              ></div>
            </div>
            <span className="rapport-score">{Math.round(persona.rapport)}</span>
            {rapportChange !== null && (
              <div key={Date.now()} className={`rapport-change ${rapportChange >= 0 ? 'positive' : 'negative'}`}>
                {rapportChange >= 0 ? '+' : ''}{Math.round(rapportChange)}
              </div>
            )}
          </div>
        </div>
        <button className="settings-button" onClick={() => setIsSettingsOpen(true)} aria-label="Edit persona settings">
          <span className="icon">more_vert</span>
        </button>
      </header>
      <div className="conversation-panel" ref={scrollRef}>
        <div className="conversation-content">
          {turns.map((t, i) => (
            <div
              key={i}
              className={`message-bubble-container ${t.role}`}
              onMouseEnter={() => t.role !== 'system' && setHoveredMessageIndex(i)}
              onMouseLeave={() => setHoveredMessageIndex(null)}
            >
              {hoveredMessageIndex === i && (
                <div className={`reaction-picker ${t.role}`}>
                  {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                    <button key={emoji} onClick={() => handleReaction(i, emoji)} title={`React with ${emoji}`}>
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
              <div className={`message-bubble ${!t.isFinal ? 'interim' : ''}`}>
                <div className="message-text">
                  {renderContent(t.text)}
                </div>
                <div className="message-timestamp">
                  {formatTimestamp(t.timestamp)}
                </div>
              </div>
              {t.reaction && (
                <div className="message-reaction">
                  {t.reaction}
                </div>
              )}
            </div>
          ))}
          {sendState === 'thinking' && (
            <div className="message-bubble-container agent">
              <div className="message-bubble interim">
                <div className="message-text">...</div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="chat-input-area">
        <form onSubmit={handleSendText} className="text-input-form">
          <input
            type="text"
            className="text-input"
            placeholder="Type a message..."
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            aria-label="Text message input"
            disabled={sendState !== 'idle'}
          />
          <button
            type="submit"
            className="send-button"
            disabled={!textInput.trim() || sendState !== 'idle'}
            aria-label="Send text message"
            title="Send message"
          >
            <span className="icon">send</span>
          </button>
        </form>
        <button
          className="memory-injection-button"
          onClick={() => setIsMemoryModalOpen(true)}
          aria-label="Inject shared memory"
          title="Inject shared memory"
        >
          <span className="icon">memory</span>
        </button>
        <CallButton onClick={handleCallStart} disabled={isConnecting} />
      </div>

      {isSettingsOpen && (
        <SettingsModal
          initialTarget={persona.id}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
      {isMemoryModalOpen && (
        <MemoryInjectionModal
          onClose={() => setIsMemoryModalOpen(false)}
          onSave={handleInjectMemory}
        />
      )}
    </div>
  );
}