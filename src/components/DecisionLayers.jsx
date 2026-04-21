import React from 'react';

function DecisionLayers({ showEarlyWarning, showEarlyDetection, onToggleEarlyWarning, onToggleEarlyDetection }) {
  return (
    <div className="decision-layers">
      <h3>Decision Layers</h3>

      <div className="layer-item">
        <input
          type="checkbox"
          id="early-warning"
          className="layer-checkbox"
          checked={showEarlyWarning}
          onChange={onToggleEarlyWarning}
        />
        <label htmlFor="early-warning" className="layer-label">
          <div className="layer-icon">⚠️</div>
          Early Warning Alerts
        </label>
      </div>

      <div className="layer-item">
        <input
          type="checkbox"
          id="early-detection"
          className="layer-checkbox"
          checked={showEarlyDetection}
          onChange={onToggleEarlyDetection}
        />
        <label htmlFor="early-detection" className="layer-label">
          <div className="layer-icon">🔍</div>
          Early Detection Alerts
        </label>
      </div>
    </div>
  );
}

export default DecisionLayers;