function getDistrictColor(alert) {
  if (alert.early_warning) return "#e53935";   // red
  if (alert.early_detection) return "#fb8c00"; // orange
  return "#bbdefb";                            // blue
}
