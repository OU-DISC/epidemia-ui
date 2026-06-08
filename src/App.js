// App.js
import { useCallback, useState } from "react";
import Dashboard from "./components/layout/Dashboard";
import ProjectSetupWizard from "./components/ProjectSetupWizard";
import { activateDefaultDataset, loadProjectConfig, saveProjectConfig } from "./utils/projectStorage";

function App() {
  const [projectConfig, setProjectConfig] = useState(() => loadProjectConfig());
  const [showWizard, setShowWizard] = useState(false);
  const [bootstrapEpidemiaData, setBootstrapEpidemiaData] = useState(null);
  const [datasetEpoch, setDatasetEpoch] = useState(0);

  const handleBootstrapConsumed = useCallback(() => {
    setBootstrapEpidemiaData(null);
  }, []);

  const handleUseDefaultDataset = () => {
    activateDefaultDataset();
    setProjectConfig(null);
    setBootstrapEpidemiaData(null);
    setDatasetEpoch((value) => value + 1);
    window.setTimeout(() => window.location.reload(), 0);
  };

  return (
    <>
      {showWizard && (
        <ProjectSetupWizard
          onComplete={(config, runData) => {
            saveProjectConfig(config);
            setProjectConfig(config);
            setBootstrapEpidemiaData(runData);
            setShowWizard(false);
            setDatasetEpoch((value) => value + 1);
          }}
          onSkip={() => setShowWizard(false)}
        />
      )}
      <Dashboard
        key={projectConfig?.projectId || `default-${datasetEpoch}`}
        projectConfig={projectConfig}
        bootstrapEpidemiaData={bootstrapEpidemiaData}
        onBootstrapConsumed={handleBootstrapConsumed}
        onOpenProjectWizard={() => setShowWizard(true)}
        onUseDefaultDataset={handleUseDefaultDataset}
        usingCustomProject={Boolean(projectConfig)}
        showDefaultDatasetButton={true}
      />
    </>
  );
}

export default App;
