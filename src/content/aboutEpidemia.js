/** Plain-language copy for the About tab (non-technical audience). */

export const ABOUT_EPIDEMIA = {
  title: "About EPIDEMIA",
  tagline: "Malaria early detection and early warning for Ethiopia",

  sections: [
    {
      heading: "What is this?",
      body: [
        "EPIDEMIA is a decision-support dashboard that helps public-health teams monitor malaria trends, spot unusual increases in cases, and look ahead at possible transmission in the weeks to come.",
        "It combines routine malaria surveillance from districts (woredas) with satellite-based weather and environmental information, then presents the results on a map and in simple charts and tables.",
      ],
    },
    {
      heading: "Who is it for?",
      body: [
        "Regional and national malaria program staff, epidemiologists, and partners who need a shared picture of where transmission may be rising—without reading computer code or statistical formulas.",
        "You can explore the whole country, focus on one region, or drill down to a single district.",
      ],
    },
    {
      heading: "Two kinds of alerts",
      items: [
        {
          term: "Early Detection",
          detail:
            "Looks at recent weeks of reported cases. It flags districts where observed case counts were unusually high compared with what we would expect from past patterns. Think of this as: “Something may already be happening.”",
        },
        {
          term: "Early Warning",
          detail:
            "Looks at the forecast for upcoming weeks. It flags districts where projected cases may exceed expected levels. Think of this as: “Conditions suggest heightened risk ahead.”",
        },
      ],
      footer:
        "Each alert is summarized as Low, Medium, or High depending on how many weeks triggered concern in that period.",
    },
    {
      heading: "How to use the dashboard",
      items: [
        {
          term: "Situation summary (top cards)",
          detail: "Quick counts of early warnings, early detections, and how many districts were analyzed.",
        },
        {
          term: "Map",
          detail:
            "Districts are shaded by health or environmental layers. Warning and detection markers highlight priority areas. Click a district to focus the charts.",
        },
        {
          term: "Charts tab",
          detail:
            "For the selected district: environmental conditions over time and a transmission chart showing observed cases or incidence per 100,000 (your choice), the forecast, and matching alert thresholds.",
        },
        {
          term: "Forecast table tab",
          detail:
            "A sortable list of all districts with status, cases or incidence, forecast values, and population. Click rows to compare districts on the chart.",
        },
        {
          term: "Export EPIDEMIA Report",
          detail:
            "Downloads a PDF summary you can share in meetings. Choose report scope (country, region, or one district) and how many district detail pages to include.",
        },
      ],
    },
    {
      heading: "Where does the information come from?",
      body: [
        "Case counts come from uploaded or cached malaria surveillance data by district and week.",
        "Population at risk comes from the weekly surveillance file used in the forecast report (same value shown in the alerts table).",
        "Rainfall, temperature, and vegetation layers use publicly available satellite products (for example NASA GIBS overlays on the map).",
        "Forecasts and alert thresholds are produced by automated statistical models in the EPIDEMIA pipeline.",
      ],
    },
    {
      heading: "Good to know",
      body: [
        "Districts with little or no reported data may show limited or no forecast information.",
        "Use Refresh Forecast after uploading new surveillance data to update the analysis.",
      ],
    },
  ],
};
