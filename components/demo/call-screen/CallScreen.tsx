/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';
import cn from 'classnames';
import { Persona } from '@/lib/state';

interface CallScreenProps {
  persona: Persona;
  onHangUp: () => void;
  onToggleMute: () => void;
  isMuted: boolean;
  status: string;
}

const CallScreen: React.FC<CallScreenProps> = ({ persona, onHangUp, onToggleMute, isMuted, status }) => {
  return (
    <div className="call-screen">
      <div className="call-info">
        <div className="call-avatar">
          {persona.avatar && persona.avatar.startsWith('data:image/') ? (
            <img src={persona.avatar} alt={persona.name} />
          ) : (
            persona.avatar
          )}
        </div>
        <h2 className="call-name">{persona.name}</h2>
        <p className="call-status">{status}</p>
      </div>
      <div className="call-controls">
        <button
          className={cn('call-control-button', { active: isMuted })}
          onClick={onToggleMute}
          aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          <span className="icon">{isMuted ? 'mic_off' : 'mic'}</span>
        </button>
        <button
          className="call-control-button hang-up"
          onClick={onHangUp}
          aria-label="End call"
        >
          <span className="icon">call_end</span>
        </button>
      </div>
    </div>
  );
};

export default CallScreen;
