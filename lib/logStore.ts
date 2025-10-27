/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { create } from 'zustand';
import { useAppStore } from './state';

export interface ConversationTurn {
  timestamp: Date;
  role: 'user' | 'agent' | 'system';
  text: string;
  isFinal: boolean;
  reaction?: string;
}

interface LogStore {
  turns: ConversationTurn[];
  clearTurns: () => void;
  setTurns: (turns: ConversationTurn[]) => void;
  appendTurn: (personaId: string, role: 'user' | 'agent' | 'system', text: string, isFinal?: boolean) => void;
  finalizeTurn: () => void;
  updateTurn: (turnIndex: number, updates: Partial<ConversationTurn>) => void;
}

export const useLogStore = create<LogStore>((set) => ({
  turns: [],
  clearTurns: () => set({ turns: [] }),
  setTurns: (turns: ConversationTurn[]) => set({ turns }),
  appendTurn: (personaId, role, textChunk, isFinal) => {
    // This function is the single source of truth for appending turns.
    // It reads from and writes to the main app state (useAppStore).
    const { getPersonaById, updatePersonaChatHistory, activePersonaId, incrementPersonaUnreadCount } = useAppStore.getState();
    const persona = getPersonaById(personaId);
    if (!persona) return;

    const currentHistory = persona.chatHistory || [];
    const newHistory = [...currentHistory];
    const last = newHistory[newHistory.length - 1];

    if (last && last.role === role && !last.isFinal) {
      // Append to the last turn
      const updatedTurn = {
        ...last,
        text: last.text + textChunk,
        isFinal: typeof isFinal === 'boolean' ? isFinal : last.isFinal,
      };
      newHistory[newHistory.length - 1] = updatedTurn;
    } else {
      // Add a new turn
      const newTurn: ConversationTurn = {
        role,
        text: textChunk,
        isFinal: isFinal ?? false,
        timestamp: new Date()
      };
      newHistory.push(newTurn);
    }

    // Update the master list in AppStore
    updatePersonaChatHistory(personaId, newHistory);

    // If the persona is currently active, also update the view store (LogStore)
    if (activePersonaId === personaId) {
      set({ turns: newHistory });
    } else {
      // If not active, and it's an agent message, increment unread count
      if (role === 'agent') {
        incrementPersonaUnreadCount(personaId);
      }
    }
  },
  finalizeTurn: () => {
    set(state => {
      const { activePersonaId } = useAppStore.getState();
      if (!activePersonaId) return state;

      const { getPersonaById, updatePersonaChatHistory } = useAppStore.getState();
      const persona = getPersonaById(activePersonaId);
      if (!persona) return state;

      const turns = persona.chatHistory;
      if (turns.length === 0) {
        return state;
      }
      const newHistory = [...turns];
      const last = newHistory[newHistory.length - 1];
      if (last && !last.isFinal) {
        const finalizedTurn = { ...last, isFinal: true };
        newHistory[newHistory.length - 1] = finalizedTurn;
        
        updatePersonaChatHistory(activePersonaId, newHistory);
        
        return { turns: newHistory }; // update logStore as well
      }
      return state;
    });
  },
  updateTurn: (turnIndex: number, updates: Partial<ConversationTurn>) => {
    const { activePersonaId, updateTurnInHistory } = useAppStore.getState();
    if (!activePersonaId) return;

    // This will update the persisted state and handle toggling
    updateTurnInHistory(activePersonaId, turnIndex, updates);

    // Now, just sync the local state with the master state
    const updatedPersona = useAppStore.getState().getPersonaById(activePersonaId);
    if (updatedPersona) {
      set({ turns: updatedPersona.chatHistory });
    }
  },
}));