import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import App from './App';
import { SettingsProvider } from './hooks/SettingsProvider';
import '@xyflow/react/dist/style.css';
import './styles/variables.css';
import './styles/reactflow-overrides.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <ReactFlowProvider>
        <App />
      </ReactFlowProvider>
    </SettingsProvider>
  </StrictMode>,
);
