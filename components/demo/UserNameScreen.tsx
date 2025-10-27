/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
import { useAppStore } from '../../lib/state';

export default function UserNameScreen() {
    const setUserName = useAppStore(state => state.setUserName);
    const [name, setName] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim()) {
            setUserName(name.trim());
        }
    }

    return (
        <div className="user-name-screen">
            <div className="user-name-content">
                <span className="welcome-icon icon">waving_hand</span>
                <h1>Welcome to AI Confidant</h1>
                <p>To get started, please tell us your name.</p>
                <form onSubmit={handleSubmit} className="user-name-form">
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter your name..."
                        aria-label="Your name"
                        required
                        autoFocus
                    />
                    <button type="submit" disabled={!name.trim()}>Continue</button>
                </form>
            </div>
        </div>
    );
}