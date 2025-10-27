/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useMemo } from 'react';
import { JournalData } from '@/lib/state';

interface JournalViewProps {
  journalData: JournalData;
  userName: string;
}

const KeyValueRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <>
    <div className="kv-key">{label.replace(/([A-Z])/g, ' $1')}</div>
    <div className="kv-value">{value}</div>
  </>
);

const JournalView: React.FC<JournalViewProps> = ({ journalData, userName }) => {
  const { communicationStyle, sharedMemories, inferredAttributes, topicsOfInterest, metadata } = journalData;

  const formattedJournalData = useMemo(() => {
    // A version of the journalData that is more user-friendly for display.
    // It replaces the user's name, relationship, and rapport with the persona's view of them.
    const userProfile = {
      name: userName,
      communicationStyle: journalData.communicationStyle,
      topicsOfInterest: journalData.topicsOfInterest,
      inferredAttributes: journalData.inferredAttributes,
      memories: journalData.sharedMemories.map(m => m.description),
      metadata: journalData.metadata,
    };
    return JSON.stringify(userProfile, null, 2);
  }, [journalData, userName]);

  return (
    <div className="journal-view">
      <p>This is the persona's private journal about you. It's updated automatically after each voice conversation to help the persona remember you and adapt to your personality.</p>
      
      <h4>Communication Style</h4>
      <div className="kv-grid">
        {Object.entries(communicationStyle).map(([key, value]) => (
          <KeyValueRow key={key} label={key} value={value} />
        ))}
      </div>

      <h4>Shared Memories</h4>
      {sharedMemories.length > 0 ? (
        <ul>
          {sharedMemories.map((memory, index) => (
            <li key={index}>{memory.description}</li>
          ))}
        </ul>
      ) : (
        <p>No key memories recorded yet. Important facts from your conversations will appear here.</p>
      )}

      <h4>Inferred Attributes</h4>
      <div className="kv-grid">
        {Object.entries(inferredAttributes).map(([key, value]) => (
          <KeyValueRow key={key} label={key} value={value} />
        ))}
      </div>

      <h4>Topics of Interest</h4>
      {topicsOfInterest.length > 0 ? (
        <ul>
          {topicsOfInterest.map((topic, index) => (
            <li key={index}>{topic}</li>
          ))}
        </ul>
      ) : (
        <p>Talk about your interests and they will appear here!</p>
      )}

      <details>
        <summary>View Raw Journal Data</summary>
        <pre>{formattedJournalData}</pre>
      </details>

      <p style={{ marginTop: '1rem', fontSize: '0.8rem', textAlign: 'right' }}>
        Profile Version: {metadata.profileVersion} | Last Updated: {new Date(metadata.lastUpdated).toLocaleString()}
      </p>
    </div>
  );
};

export default JournalView;
