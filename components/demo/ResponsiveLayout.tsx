/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';
import { useAppStore } from '../../lib/state';
import useWindowDimensions from '../../hooks/useWindowDimensions';
import ChatsScreen from './welcome-screen/WelcomeScreen';
import ChatScreen from './streaming-console/StreamingConsole';
import WelcomePlaceholder from './WelcomePlaceholder';

const BREAKPOINT = 800; // Corresponds to the CSS breakpoint

export default function ResponsiveLayout() {
  const { width } = useWindowDimensions();
  const activePersona = useAppStore(state => state.getActivePersona());

  const isDesktop = width > BREAKPOINT;

  if (isDesktop) {
    return (
      <div className="responsive-layout desktop">
        <div className="left-pane">
          <ChatsScreen />
        </div>
        <div className="right-pane">
          {activePersona ? <ChatScreen /> : <WelcomePlaceholder />}
        </div>
      </div>
    );
  }

  // Mobile layout
  return (
    <div className="responsive-layout mobile">
      {!activePersona ? <ChatsScreen /> : <ChatScreen />}
    </div>
  );
}