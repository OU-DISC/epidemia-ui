import React from "react";
import HelpTip from "./HelpTip";
import { DASHBOARD_HELP } from "../utils/dashboardHelpText";

export default function SituationStrip({ summary, pipelineStatus }) {
  return (
    <section className="forecast-cards fade-in-up delay-1">
      <article className="glass-card forecast-card">
        <h4>
          <span className="forecast-card-label">
            Pipeline
            <HelpTip text={DASHBOARD_HELP.pipeline} label="Pipeline status" placement="below" />
          </span>
        </h4>
        <p className={`situation-pipeline-${pipelineStatus.kind}`}>{pipelineStatus.label}</p>
      </article>
      <article className="glass-card forecast-card">
        <h4>
          <span className="forecast-card-label">
            Early Warnings
            <HelpTip text={DASHBOARD_HELP.earlyWarnings} label="Early warnings" placement="below" />
          </span>
        </h4>
        <p>{summary?.warnings ?? 0}</p>
      </article>
      <article className="glass-card forecast-card">
        <h4>
          <span className="forecast-card-label">
            Early Detections
            <HelpTip text={DASHBOARD_HELP.earlyDetections} label="Early detections" placement="below" />
          </span>
        </h4>
        <p>{summary?.detections ?? 0}</p>
      </article>
      <article className="glass-card forecast-card">
        <h4>
          <span className="forecast-card-label">
            Districts Modeled
            <HelpTip text={DASHBOARD_HELP.districtsModeled} label="Districts modeled" placement="below" />
          </span>
        </h4>
        <p>{summary?.districts ?? 0}</p>
      </article>
    </section>
  );
}
