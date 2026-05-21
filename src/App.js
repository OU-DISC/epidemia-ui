// App.js
import { useState } from "react";
import Dashboard from "./components/layout/Dashboard";
import ProjectSetupWizard from "./components/ProjectSetupWizard";
import { loadProjectConfig, saveProjectConfig } from "./utils/projectStorage";

function App() {
  const [projectConfig, setProjectConfig] = useState(() => loadProjectConfig());
  const [showWizard, setShowWizard] = useState(false);
  const [bootstrapEpidemiaData, setBootstrapEpidemiaData] = useState(null);

  return (
    <>
      {showWizard && (
        <ProjectSetupWizard
          onComplete={(config, runData) => {
            saveProjectConfig(config);
            setProjectConfig(config);
            setBootstrapEpidemiaData(runData);
            setShowWizard(false);
          }}
          onSkip={() => setShowWizard(false)}
        />
      )}
      <Dashboard
        projectConfig={projectConfig}
        bootstrapEpidemiaData={bootstrapEpidemiaData}
        onBootstrapConsumed={() => setBootstrapEpidemiaData(null)}
        onOpenProjectWizard={() => setShowWizard(true)}
      />
    </>
  );
}

export default App;
