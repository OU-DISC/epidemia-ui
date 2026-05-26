import Plotly from "plotly.js/dist/plotly";
import createPlotlyComponent from "react-plotly.js/factory";

/** Same Plotly instance used by react-plotly and programmatic relayout calls. */
export const Plot = createPlotlyComponent(Plotly);
export default Plotly;
