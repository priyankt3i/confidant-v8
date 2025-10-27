/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
// FIX: Import SharedMemoryItem to correctly type the shared memory data.
import { Persona, SharedMemoryItem, useAppStore } from '../../lib/state';
import Modal from '../Modal';

type Props = {
  persona: Persona;
  onClose: () => void;
  onStartChat: (id: string) => void;
}

export default function RelationshipEditor({ persona, onClose, onStartChat }: Props) {
  const updatePersona = useAppStore(state => state.updatePersona);
  const [relationship, setRelationship] = useState(persona.relationshipToUser || '');
  // FIX: Initialize memory state as a string for the textarea, converting from the SharedMemoryItem array.
  const [memory, setMemory] = useState(
    persona.sharedMemory?.map(m => m.content).join('\n') || ''
  );

  const handleStart = () => {
    // FIX: Convert the memory string from the textarea back into an array of SharedMemoryItem objects before saving.
    const memories: SharedMemoryItem[] = memory
      .split('\n')
      .filter(line => line.trim() !== '')
      .map(line => ({
        content: line,
        timestamp: new Date().toISOString(),
        importance: 5,
        type: 'other',
      }));

    updatePersona(persona.id, {
      relationshipToUser: relationship,
      sharedMemory: memories,
    });
    onStartChat(persona.id);
  };

  return (
    <Modal onClose={onClose}>
      <div className="persona-creator-form relationship-editor">
        <h2>
          <div className="avatar">{persona.avatar}</div>
          Talking to {persona.name}
        </h2>
        <p className="relationship-subtitle">
          Help {persona.name} remember you. This information will only be stored in your browser.
        </p>

        <div className="form-field">
          <label htmlFor="persona-relationship">Your Relationship</label>
          <input
            id="persona-relationship"
            type="text"
            value={relationship}
            onChange={e => setRelationship(e.target.value)}
            placeholder="e.g., Childhood friend, coworker, mentor..."
          />
        </div>

        <div className="form-field">
          <label htmlFor="persona-memory">Shared Memories & Key Details</label>
          <textarea
            id="persona-memory"
            value={memory}
            onChange={e => setMemory(e.target.value)}
            rows={5}
            placeholder={`e.g., We met in college. I'm training for a marathon. I have a golden retriever named Sam.`}
          />
        </div>
        
        <div className="modal-actions">
          <button onClick={onClose} className="cancel-button">
            Cancel
          </button>
          <button onClick={handleStart} className="save-button">
            Start Chat
          </button>
        </div>
      </div>
    </Modal>
  );
}