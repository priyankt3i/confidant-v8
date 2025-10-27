/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import ErrorScreen from './components/demo/ErrorScreen';
import { LiveAPIProvider } from './contexts/LiveAPIContext';
import { useAppStore } from './lib/state';
import UserNameScreen from './components/demo/UserNameScreen';
import ResponsiveLayout from './components/demo/ResponsiveLayout';

const API_KEY = process.env.API_KEY as string;
if (typeof API_KEY !== 'string') {
  throw new Error(
    'Missing required environment variable: API_KEY'
  );
}

/**
 * Main application component. Manages app state to show the chats list or a specific chat screen.
 */
function App() {
  const userName = useAppStore(state => state.userName);

  if (!userName) {
    return <UserNameScreen />;
  }

  return (
    <div className="App">
      <LiveAPIProvider apiKey={API_KEY}>
        <ErrorScreen />
        <ResponsiveLayout />
      </LiveAPIProvider>
    </div>
  );
}

export default App;
