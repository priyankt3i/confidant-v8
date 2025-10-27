/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import cn from 'classnames';
import React from 'react';

interface CallButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export default function CallButton({ onClick, disabled = false }: CallButtonProps) {
  return (
    <button
      className={cn('call-button', { disabled })}
      onClick={onClick}
      disabled={disabled}
      aria-label="Start call"
      title="Start call"
    >
      <span className="icon">call</span>
    </button>
  );
}
