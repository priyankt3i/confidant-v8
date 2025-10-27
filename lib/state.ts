/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PREDEFINED_PERSONAS, PERSONALITY_TRAITS } from './constants';
import { ConversationTurn, useLogStore } from './logStore';

export type Trait = typeof PERSONALITY_TRAITS[number];
export type Traits = Record<Trait, number>;

// This object represents what a Persona has learned about the user.
export interface Memory {
  timestamp: string;
  description: string;
}

export interface CommunicationStyle {
  formality: string;
  humorStyle: string;
  emojiUse: string;
  responseLength: string;
  generalSentiment: string;
  expressiveness: string;
  questioningStyle: string;
  vocabularyComplexity: string;
}

export interface InferredAttributes {
  problemSolving: string;
  learningStyle: string;
  motivation: string;
  openness: string;
  emotionalState: string;
  personalityTraits: string;
  potentialCognitiveBiases: string;
  potentialCoreBeliefs: string;
}

export interface JournalData {
  communicationStyle: CommunicationStyle;
  sharedMemories: Memory[];
  inferredAttributes: InferredAttributes;
  topicsOfInterest: string[];
  metadata: {
    profileVersion: number;
    lastUpdated: string;
  };
}

export interface SharedMemoryItem {
  content: string;
  timestamp: string;
  importance: number;
  type: 'fact' | 'event' | 'preference' | 'explicit_request' | 'other';
}

export interface Persona {
  id: string;
  name: string;
  avatar: string;
  backstory: string;
  traits: Traits;
  journalData: JournalData;
  chatHistory: ConversationTurn[];
  relationshipToUser: string;
  sharedMemory: SharedMemoryItem[];
  voice: string;
  rapport: number;
  unreadCount?: number;
}

interface AppState {
  personas: Persona[];
  activePersonaId: string | null;
  userName: string | null;
  setUserName: (name: string) => void;
  getPersonaById: (id: string) => Persona | undefined;
  getActivePersona: () => Persona | undefined;
  selectPersona: (id: string | null) => void;
  addPersona: (persona: Omit<Persona, 'id' | 'journalData' | 'chatHistory'>) => void;
  updatePersona: (id: string, updates: Partial<Omit<Persona, 'id'>>) => void;
  deletePersona: (id: string) => void;
  updateActivePersona: (updates: Partial<Persona>) => void;
  resetApplication: () => void;
  updatePersonaChatHistory: (personaId: string, chatHistory: ConversationTurn[]) => void;
  updateTurnInHistory: (personaId: string, turnIndex: number, updates: Partial<ConversationTurn>) => void;
  incrementPersonaUnreadCount: (personaId: string) => void;
  clearPersonaUnreadCount: (personaId: string) => void;
}

export const createDefaultJournalData = (): JournalData => ({
  communicationStyle: {
    formality: "unknown",
    humorStyle: "unknown",
    emojiUse: "unknown",
    responseLength: "balanced",
    generalSentiment: "neutral",
    expressiveness: "unknown",
    questioningStyle: "unknown",
    vocabularyComplexity: "unknown"
  },
  sharedMemories: [],
  inferredAttributes: {
    problemSolving: "unknown",
    learningStyle: "unknown",
    motivation: "unknown",
    openness: "unknown",
    emotionalState: "unknown",
    personalityTraits: "Not yet determined",
    potentialCognitiveBiases: "Not yet determined",
    potentialCoreBeliefs: "Not yet determined"
  },
  topicsOfInterest: [],
  metadata: {
    profileVersion: 1,
    lastUpdated: new Date().toISOString(),
  }
});

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      personas: PREDEFINED_PERSONAS.map(p => ({
        ...p,
        id: p.name.toLowerCase(),
        journalData: createDefaultJournalData(),
        chatHistory: [],
      })),
      activePersonaId: null,
      userName: null,
      setUserName: (name: string) => set({ userName: name }),
      getPersonaById: (id: string) => get().personas.find(p => p.id === id),
      getActivePersona: () => {
        const id = get().activePersonaId;
        if (!id) return undefined;
        return get().personas.find(p => p.id === id);
      },
      selectPersona: (id: string | null) => {
        // When switching personas, clear the current conversation log
        // and load the history for the new one.
        if (id) {
          get().clearPersonaUnreadCount(id);
          const nextPersona = get().personas.find(p => p.id === id);
          useLogStore.getState().setTurns(nextPersona?.chatHistory || []);
        }
        
        set({ activePersonaId: id });
      },
      addPersona: (personaData) => {
        const newPersona: Persona = {
          ...personaData,
          id: `${personaData.name.toLowerCase().replace(/\s/g, '-')}-${Date.now()}`,
          journalData: createDefaultJournalData(),
          chatHistory: [],
        };
        set(state => ({ personas: [...state.personas, newPersona] }));
      },
      updatePersona: (id, updates) => {
        set(state => ({
          personas: state.personas.map(p =>
            p.id === id ? { ...p, ...updates } : p
          ),
        }));
      },
      deletePersona: (id: string) => {
        set(state => {
          const newPersonas = state.personas.filter(p => p.id !== id);
          const newActivePersonaId = state.activePersonaId === id ? null : state.activePersonaId;
          if (state.activePersonaId === id) {
            // If we deleted the active persona, clear the conversation log for the UI
            useLogStore.getState().clearTurns();
          }
          return {
            personas: newPersonas,
            activePersonaId: newActivePersonaId,
          };
        });
      },
      updateActivePersona: (updates) => {
        const activeId = get().activePersonaId;
        if (!activeId) return;

        get().updatePersona(activeId, updates);
      },
      resetApplication: () => {
        // This is a bit of a hack to clear the state with zustand/persist
        // It clears the state in memory and then removes the item from localStorage
        set({
          personas: [],
          activePersonaId: null,
          userName: null,
        }, true);
        localStorage.removeItem('ai-confidant-storage');
        // A page reload is necessary to re-initialize the store with defaults
        window.location.reload();
      },
      updatePersonaChatHistory: (personaId, chatHistory) => {
        set(state => ({
          personas: state.personas.map(p =>
            p.id === personaId ? { ...p, chatHistory } : p
          ),
        }));
      },
      updateTurnInHistory: (personaId, turnIndex, updates) => {
        set(state => ({
          personas: state.personas.map(p => {
            if (p.id === personaId) {
              const newHistory = [...p.chatHistory];
              if (newHistory[turnIndex]) {
                 const currentReaction = newHistory[turnIndex].reaction;
                 // if clicking the same reaction, toggle it off.
                 const newReaction = (updates.reaction && currentReaction === updates.reaction) ? undefined : updates.reaction;
                 newHistory[turnIndex] = { ...newHistory[turnIndex], ...updates, reaction: newReaction };
              }
              return { ...p, chatHistory: newHistory };
            }
            return p;
          }),
        }));
      },
      incrementPersonaUnreadCount: (personaId) => {
        set(state => ({
            personas: state.personas.map(p =>
                p.id === personaId ? { ...p, unreadCount: (p.unreadCount || 0) + 1 } : p
            ),
        }));
      },
      clearPersonaUnreadCount: (personaId) => {
          set(state => ({
              personas: state.personas.map(p =>
                  p.id === personaId ? { ...p, unreadCount: 0 } : p
              ),
          }));
      },
    }),
    {
      name: 'ai-confidant-storage',
      deserialize: (str) => {
        const state = JSON.parse(str);
        if (state.state.personas) {
          state.state.personas.forEach((p: Persona) => {
            if (p.chatHistory) {
              p.chatHistory.forEach(turn => {
                turn.timestamp = new Date(turn.timestamp);
              });
            }
          });
        }
        return state;
      },
    }
  )
);