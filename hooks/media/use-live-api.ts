/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GenAILiveClient } from '../genai-live-client';
// FIX: Import `GenerateContentResponse` to properly type the `rapportResponse` variable.
import { LiveConnectConfig, Modality, GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import { AudioStreamer } from '../../lib/audio-streamer';
import { audioContext } from '../../lib/utils';
import VolMeterWorket from '../../lib/worklets/vol-meter';
// FIX: `useLogStore` is exported from `@/lib/logStore`, not `@/lib/state`.
import { useAppStore, JournalData, SharedMemoryItem } from '../../lib/state';
import { useLogStore, ConversationTurn } from '../../lib/logStore';

export type UseLiveApiResults = {
  client: GenAILiveClient;
  setConfig: (config: LiveConnectConfig) => void;
  config: LiveConnectConfig;
  ai: GoogleGenAI;
  analyzeRapport: (personaId: string, exchange: ConversationTurn[]) => Promise<void>;
  updatePersonaJournal: (personaId: string, turns: ConversationTurn[]) => Promise<void>;
  structureMemoryText: (memoryText: string) => Promise<SharedMemoryItem[]>;

  connect: () => Promise<void>;
  disconnect: () => void;
  connected: boolean;

  volume: number;
};

export function useLiveApi({
  apiKey,
}: {
  apiKey: string;
}): UseLiveApiResults {
  const model = GenAILiveClient.prototype.model;
  const client = useMemo(() => new GenAILiveClient(apiKey, model), [apiKey, model]);
  const { getPersonaById, updatePersona, userName } = useAppStore();

  const ai = useMemo(() => new GoogleGenAI({ apiKey }), [apiKey]);

  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const activeCallPersonaId = useRef<string | null>(null);

  const [volume, setVolume] = useState(0);
  const [connected, setConnected] = useState(false);
  const [config, setConfig] = useState<LiveConnectConfig>({});

  // register audio for streaming server -> speakers
  useEffect(() => {
    if (!audioStreamerRef.current) {
      audioContext({ id: 'audio-out' }).then((audioCtx: AudioContext) => {
        audioStreamerRef.current = new AudioStreamer(audioCtx);
        audioStreamerRef.current
          .addWorklet<any>('vumeter-out', VolMeterWorket, (ev: any) => {
            setVolume(ev.data.volume);
          })
          .then(() => {
            // Successfully added worklet
          })
          .catch(err => {
            console.error('Error adding worklet:', err);
          });
      });
    }
  }, [audioStreamerRef]);

  const structureMemoryText = useCallback(async (memoryText: string): Promise<SharedMemoryItem[]> => {
    if (!memoryText.trim()) {
      return [];
    }
    try {
      const memoryPrompt = `Analyze the following text which contains shared memories and key details about a user. Convert each distinct piece of information into a structured JSON object.

      TEXT TO ANALYZE:
      "${memoryText}"

      For each memory, create an object with the following fields:
      - "content": (string) The textual description of the memory.
      - "timestamp": (string) The current ISO timestamp: ${new Date().toISOString()}.
      - "importance": (number) A score from 1-10 indicating significance.
      - "type": (string) Categorize as 'fact', 'event', 'preference', 'explicit_request', or 'other'.

      Return ONLY a valid JSON array of these objects.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: memoryPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                content: { type: Type.STRING },
                timestamp: { type: Type.STRING },
                importance: { type: Type.NUMBER },
                type: { type: Type.STRING },
              },
              required: ["content", "timestamp", "importance", "type"],
            },
          },
        },
      });

      const jsonStr = response.text.trim().replace(/```json\n?|\n?```/g, '');
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse shared memory, storing as raw text.", e);
      return memoryText.split('\n').filter(line => line.trim() !== '').map(line => ({
        content: line,
        timestamp: new Date().toISOString(),
        importance: 5,
        type: 'other'
      }));
    }
  }, [ai]);

  const analyzeRapport = useCallback(async (personaId: string, exchange: ConversationTurn[]) => {
    const persona = getPersonaById(personaId);
    if (!persona || exchange.length === 0) {
        console.log("Skipping rapport analysis: no persona or exchange.");
        return;
    }
    const transcript = exchange.map(t => `${t.role === 'agent' ? persona.name : (userName || 'user')}: ${t.text}`).join('\n');
    
    // FIX: Declare rapportResponse outside the try block to make it accessible in the catch block.
    let rapportResponse: GenerateContentResponse | undefined;
    try {
        const rapportPrompt = `You are an AI that analyzes conversations to determine the change in rapport between two people. The current rapport score is ${persona.rapport} out of 1000. Analyze the following conversational exchange between the user (${userName}) and ${persona.name}.

        Based on the interaction, determine if the rapport increased, decreased, or stayed the same. Consider factors like tone, respect, empathy, conflict, and shared understanding.
        - A positive, friendly, or supportive exchange should increase the score.
        - A negative, abusive, or dismissive exchange should decrease the score.
        - A neutral or transactional exchange might result in a small change or no change.

        The change should be gradual. A typical exchange might change the score by 2-10 points. A significant argument or a heartfelt moment could change it by 20-50 points.

        CURRENT RAPPORT: ${persona.rapport}
        CONVERSATIONAL EXCHANGE:
        ${transcript}

        Output ONLY a valid JSON object with a single key 'updatedRapport' and the new numerical score between 0 and 1000. Do not include any other text or explanation.`;

        rapportResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: rapportPrompt,
            config: { responseMimeType: "application/json" }
        });

        let jsonStr = rapportResponse.text.trim().replace(/```json\n?|\n?```/g, '');
        const parsed = JSON.parse(jsonStr);
        if (typeof parsed.updatedRapport === 'number') {
            const newRapport = Math.max(0, Math.min(1000, parsed.updatedRapport));
            updatePersona(personaId, { rapport: newRapport });
        }
    } catch(e) {
        console.error("Failed to parse rapport update JSON:", e, rapportResponse?.text);
    }
  }, [ai, getPersonaById, updatePersona, userName]);

  const updatePersonaJournal = useCallback(async (personaId: string, turnsToProcess: ConversationTurn[]) => {
    const persona = getPersonaById(personaId);
    const transcript = turnsToProcess
      .map(t => `${t.role === 'user' ? userName || 'User' : persona?.name || 'Agent'}: ${t.text}`)
      .join('\n');

    if (!transcript || !persona || transcript.trim().length === 0) {
      console.log('No conversation to process, skipping persona update.');
      return;
    }

    console.log('Processing conversation, updating persona journal...');

    try {
      const journalPrompt = `You are an AI that analyzes conversations to build a detailed profile of a user, from the perspective of an AI persona.
      
      **Persona:** ${persona.name}
      **Your (the Persona's) Backstory:** ${persona.backstory}
      **Existing User Profile (JSON):** 
      \`\`\`json
      ${JSON.stringify(persona.journalData, null, 2)}
      \`\`\`

      **Latest Conversation Transcript:**
      """
      ${transcript}
      """

      **Your Task:**
      Analyze the new conversation in the context of the existing user profile. Update the JSON object with new insights.
      1.  **Analyze Communication Style:** Update fields like 'formality', 'humorStyle', 'sentiment' based on the conversation.
      2.  **Extract Shared Memories:** Identify new key facts, events, or personal details the user shared. Add them to the 'sharedMemories' array as new objects with a timestamp and a concise description.
      3.  **Infer Attributes:** Update the 'inferredAttributes' based on the user's language and behavior. Be subtle; changes should be gradual over time.
      4.  **Identify Topics of Interest:** Add any new, distinct topics to the 'topicsOfInterest' array. Avoid duplicates.
      5.  **Update Metadata:** Set 'metadata.lastUpdated' to the current UTC ISO string.
      
      Return ONLY the complete, updated JSON object. Do not add any extra text, apologies, or explanations.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: journalPrompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const jsonStr = response.text.trim().replace(/^```json\s*|```$/g, '');
      // FIX: Corrected the type assertion from `Journal.tsx` to `JournalData`.
      const updatedJournalData = JSON.parse(jsonStr) as JournalData;
      
      updatedJournalData.metadata.lastUpdated = new Date().toISOString();
      
      console.log("Persona journal updated:", updatedJournalData);

      updatePersona(personaId, {
        journalData: updatedJournalData,
      });

    } catch (e) {
      console.error("Error updating persona journal:", e);
    }
  }, [ai, getPersonaById, updatePersona, userName]);

  const disconnect = useCallback(() => {
    client.disconnect();
    setConnected(false);
    const personaId = activeCallPersonaId.current;
    if (personaId) {
      const currentTurns = useLogStore.getState().turns;
      if (currentTurns.length > 0) {
        // "Fire-and-forget" the journaling process
        updatePersonaJournal(personaId, currentTurns);
        // Clear log immediately for the UI
        useLogStore.getState().clearTurns();
      }
    }
    activeCallPersonaId.current = null;
  }, [client, updatePersonaJournal]);

  const connect = useCallback(async () => {
    if (!config) {
      throw new Error('config has not been set');
    }
    client.disconnect();
    
    const personaId = useAppStore.getState().getActivePersona()?.id;
    if (!personaId) {
      console.error('Connect called without an active persona.');
      return;
    }
    activeCallPersonaId.current = personaId;

    await client.connect(config);
  }, [client, config]);

  useEffect(() => {
    const onOpen = () => {
      setConnected(true);
    };

    const onClose = () => {
      if (connected) { // Only run update if it was a real session
        disconnect();
      }
      setConnected(false);
    };

    const stopAudioStreamer = () => {
      if (audioStreamerRef.current) {
        audioStreamerRef.current.stop();
      }
    };

    const onAudio = (data: ArrayBuffer) => {
      if (audioStreamerRef.current) {
        audioStreamerRef.current.addPCM16(new Uint8Array(data));
      }
    };

    // Bind event listeners
    client.on('open', onOpen);
    client.on('close', onClose);
    client.on('interrupted', stopAudioStreamer);
    client.on('audio', onAudio);

    return () => {
      // Clean up event listeners
      client.off('open', onOpen);
      client.off('close', onClose);
      client.off('interrupted', stopAudioStreamer);
      client.off('audio', onAudio);
    };
  }, [client, connected, disconnect]);


  return {
    client,
    config,
    setConfig,
    connect,
    connected,
    disconnect,
    volume,
    ai,
    analyzeRapport,
    updatePersonaJournal,
    structureMemoryText,
  };
}