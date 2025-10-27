/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useState, useEffect, ChangeEvent } from 'react';
import { Traits, useAppStore, Persona, createDefaultJournalData, SharedMemoryItem } from './state';
import Modal from '../components/Modal';
import { PERSONALITY_TRAITS, DEFAULT_VOICE, AVAILABLE_VOICES } from './constants';
import { useLiveAPIContext } from '../contexts/LiveAPIContext';
import JournalView from '../components/demo/JournalView';

type SettingsModalProps = {
  initialTarget: 'new' | string;
  onClose: () => void;
};

const getDefaultFormData = (): Omit<Persona, 'id' | 'journalData' | 'chatHistory'> => ({
  name: '',
  avatar: '',
  backstory: '',
  traits: PERSONALITY_TRAITS.reduce((acc, trait) => {
    acc[trait] = 5;
    return acc;
  }, {} as Traits),
  voice: DEFAULT_VOICE,
  relationshipToUser: '',
  sharedMemory: [],
  rapport: 400,
});


export default function SettingsModal({ initialTarget, onClose }: SettingsModalProps) {
  const { personas, addPersona, updatePersona, getPersonaById, resetApplication, deletePersona } = useAppStore();
  const { ai, structureMemoryText } = useLiveAPIContext();
  const [selectedId, setSelectedId] = useState(initialTarget);
  const [isCreating, setIsCreating] = useState(initialTarget === 'new');
  
  const [formData, setFormData] = useState<Omit<Persona, 'id' | 'chatHistory'>>(() => {
    if (initialTarget === 'new') {
      return { ...getDefaultFormData(), journalData: createDefaultJournalData() };
    }
    const persona = personas.find(p => p.id === initialTarget);
    return persona ? { ...persona } : { ...getDefaultFormData(), journalData: createDefaultJournalData() };
  });

  const [sharedMemoryText, setSharedMemoryText] = useState(() => {
    if (initialTarget === 'new') return '';
    const persona = personas.find(p => p.id === initialTarget);
    return persona ? persona.sharedMemory.map(m => m.content).join('\n') : '';
  });

  useEffect(() => {
    if (selectedId === 'new') {
      setIsCreating(true);
      setFormData({ ...getDefaultFormData(), journalData: createDefaultJournalData() });
      setSharedMemoryText('');
    } else {
      setIsCreating(false);
      const persona = personas.find(p => p.id === selectedId);
      if (persona) {
        setFormData({ ...persona });
        setSharedMemoryText(persona.sharedMemory.map(m => m.content).join('\n'));
      }
    }
  }, [selectedId, personas]);

  const handleInputChange = (field: keyof typeof formData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleTraitChange = (trait: keyof Traits, value: string) => {
    const newTraits = { ...formData.traits, [trait]: parseFloat(value) };
    handleInputChange('traits', newTraits);
  };

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        handleInputChange('avatar', reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.backstory) {
      alert('Please fill out name and backstory.');
      return;
    }

    let newRapport = formData.rapport || 400;
    const originalPersona = isCreating ? null : getPersonaById(selectedId);
    
    if (isCreating || (originalPersona && originalPersona.relationshipToUser !== formData.relationshipToUser)) {
      if (formData.relationshipToUser.trim()) {
        try {
          const prompt = `Analyze the following user-provided relationship description and assign a rapport score between 0 and 1000. A score of 0 means complete strangers with negative sentiment, 500 is a neutral acquaintance, and 1000 is an inseparable bond. If the description is empty or vague, assign a neutral score around 400.

          USER'S RELATIONSHIP DESCRIPTION:
          "${formData.relationshipToUser}"
          
          Examples:
          - "childhood best friends" -> {"rapport": 700}
          - "just met at a coffee shop" -> {"rapport": 50}
          - "my protective older brother" -> {"rapport": 800}

          Output ONLY a valid JSON object with a single key 'rapport' and a numerical value.`;
          
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: "application/json" }
          });

          const jsonStr = response.text.trim().replace(/```json\n?|\n?```/g, '');
          const parsed = JSON.parse(jsonStr);
          if (typeof parsed.rapport === 'number') {
            newRapport = Math.max(0, Math.min(1000, parsed.rapport));
            console.log("New rapport calculated:", newRapport);
          }
        } catch(e) {
          console.error("Failed to calculate rapport, using default.", e);
          newRapport = 400;
        }
      } else {
        newRapport = 400;
      }
    }
    
    let memoriesToSave: SharedMemoryItem[] = [];
    const originalMemoryText = originalPersona ? originalPersona.sharedMemory.map(m => m.content).join('\n') : '';
    if (sharedMemoryText.trim() && sharedMemoryText.trim() !== originalMemoryText.trim()) {
      memoriesToSave = await structureMemoryText(sharedMemoryText);
    } else if (originalPersona) {
        memoriesToSave = originalPersona.sharedMemory;
    } else if (!sharedMemoryText.trim()) {
        memoriesToSave = [];
    }

    const avatarToSave = (formData.avatar && formData.avatar.startsWith('data:image/'))
      ? formData.avatar
      : formData.name.charAt(0).toUpperCase();

    const dataToSave = {
      ...formData,
      avatar: avatarToSave,
      rapport: newRapport,
      sharedMemory: memoriesToSave,
    };
    
    if (isCreating) {
      addPersona(dataToSave as Omit<Persona, 'id' | 'journalData' | 'chatHistory'>);
    } else {
      updatePersona(selectedId as string, dataToSave);
    }
    onClose();
  };

  const handleSelectPersona = (id: string | 'new') => {
    setSelectedId(id);
  }

  const handleDelete = () => {
    if (isCreating || !selectedId || selectedId === 'new') return;
    const personaToDelete = getPersonaById(selectedId);
    if (!personaToDelete) return;

    if (window.confirm(`Are you sure you want to delete ${personaToDelete.name}? This will permanently erase their chat history and all associated memories. This action cannot be undone.`)) {
      deletePersona(selectedId);
      onClose(); // Close the modal after deletion
    }
  };
  
  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset the entire application? All data will be lost.')) {
      resetApplication();
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="settings-modal">
        <div className="settings-sidebar">
          <h3>Personas</h3>
          <div className="persona-list">
            {personas.map(p => (
              <button
                key={p.id}
                className={`persona-list-item ${selectedId === p.id ? 'active' : ''}`}
                onClick={() => handleSelectPersona(p.id)}
              >
                <div className="avatar">
                  {p.avatar && p.avatar.startsWith('data:image/') ? <img src={p.avatar} alt={p.name} /> : p.avatar}
                </div>
                <span>{p.name}</span>
              </button>
            ))}
          </div>
          <button
              className={`persona-list-item create-new-button ${selectedId === 'new' ? 'active' : ''}`}
              onClick={() => handleSelectPersona('new')}
            >
              <div className="avatar">
                <span className="icon">add</span>
              </div>
              <span>Create New</span>
          </button>
        </div>
        <div className="settings-content">
          <h2>{isCreating ? 'Create a New Confidant' : `Editing ${formData.name || 'Persona'}`}</h2>
          <div className="persona-creator-form">
            <div className="form-section-header">Basic Info</div>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
              <div className="form-field avatar-uploader">
                <label htmlFor="avatar-upload" className="avatar-preview-label">
                  <div className="avatar-preview">
                    {formData.avatar && formData.avatar.startsWith('data:image/') ? (
                      <img src={formData.avatar} alt="Avatar Preview" />
                    ) : (
                      <span className="icon">add_photo_alternate</span>
                    )}
                  </div>
                  <span>Upload Avatar</span>
                </label>
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  style={{ display: 'none' }}
                />
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-field">
                  <label htmlFor="persona-name">Name</label>
                  <input
                    id="persona-name"
                    type="text"
                    value={formData.name}
                    onChange={e => handleInputChange('name', e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="persona-voice">Voice</label>
                  <select
                    id="persona-voice"
                    value={formData.voice}
                    onChange={e => handleInputChange('voice', e.target.value)}
                  >
                    {AVAILABLE_VOICES.map(voice => (
                      <option key={voice} value={voice}>{voice}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="persona-backstory">Backstory</label>
              <textarea
                id="persona-backstory"
                value={formData.backstory}
                onChange={e => handleInputChange('backstory', e.target.value)}
                rows={4}
              />
            </div>

            <div className="form-section-header">Personality Traits</div>
            <div className="traits-grid">
              {PERSONALITY_TRAITS.map(trait => (
                <div className="form-field" key={trait}>
                  <label htmlFor={`trait-${trait}`}>{trait.replace(/([A-Z])/g, ' $1')}</label>
                  <input
                    id={`trait-${trait}`}
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={formData.traits[trait]}
                    onChange={e => handleTraitChange(trait, e.target.value)}
                  />
                </div>
              ))}
            </div>
            
            <div className="form-section-header">Relationship Details</div>
            <div className="form-field">
              <label htmlFor="persona-relationship">Your Relationship with Them</label>
              <input
                id="persona-relationship"
                type="text"
                value={formData.relationshipToUser}
                onChange={e => handleInputChange('relationshipToUser', e.target.value)}
                placeholder="e.g., Childhood friend, coworker, mentor..."
              />
            </div>

            <div className="form-field">
              <label htmlFor="persona-memory">Key Shared Details & Memories</label>
              <textarea
                id="persona-memory"
                value={sharedMemoryText}
                onChange={e => setSharedMemoryText(e.target.value)}
                rows={5}
                placeholder={`One detail per line. e.g., We met in college.\nI'm training for a marathon.\nI have a golden retriever named Sam.`}
              />
            </div>
            
            {!isCreating && (
              <>
                <div className="form-section-header">Private Journal</div>
                <JournalView journalData={formData.journalData} userName={useAppStore.getState().userName || 'the user'} />
              </>
            )}

            {!isCreating && (
              <div className="danger-zone">
                <h4>Danger Zone</h4>
                <p>
                  Deleting this persona is a permanent action. All associated chat history and memories will be lost forever.
                </p>
                <button className="reset-button" onClick={handleDelete}>
                  Delete Persona
                </button>
              </div>
            )}
            
            <div className="danger-zone">
              <h4>Reset Application</h4>
              <p>
                This will reset the entire application, deleting all personas and your user name.
                This action cannot be undone.
              </p>
              <button className="reset-button" onClick={handleReset}>
                Reset App
              </button>
            </div>

          </div>
          <div className="modal-actions">
            <button onClick={onClose} className="cancel-button">Cancel</button>
            <button onClick={handleSave} className="save-button">
              {isCreating ? 'Create Persona' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}